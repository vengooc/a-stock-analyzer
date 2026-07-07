// 首页 - 市场概览
const { api } = require('../../utils/api.js');

Page({
  data: {
    // 热点板块
    hotBoards: [],
    // 概念板块排行
    boardRank: [],
    // 自选股
    watchStocks: [],
    // 加载状态
    loading: true,
    // 当前时间
    currentTime: '',
    // 交易时间状态
    tradeStatus: '休市', // 交易中, 休市
    // 大盘指数
    indexData: []
  },

  onLoad() {
    this.setCurrentTime();
    this.checkTradeStatus();
    this.loadData();
  },

  onShow() {
    // 刷新自选股数据
    this.loadWatchStocks();
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 设置当前时间
  setCurrentTime() {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    this.setData({ currentTime: time });
  },

  // 检查交易状态
  checkTradeStatus() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const day = now.getDay();
    
    // 周末不交易
    if (day === 0 || day === 6) {
      this.setData({ tradeStatus: '休市' });
      return;
    }
    
    // 交易时间：9:30-11:30, 13:00-15:00
    const time = hour * 60 + minute;
    if ((time >= 570 && time <= 690) || (time >= 780 && time <= 900)) {
      this.setData({ tradeStatus: '交易中' });
    } else {
      this.setData({ tradeStatus: '休市' });
    }
  },

  async loadData() {
    console.log('[首页] 开始加载数据');
    
    try {
      console.log('[首页] 优先加载本地数据...');
      const [indices, boards] = await Promise.all([
        api.getMainIndices(),
        api.getConceptBoardsLocal(20)
      ]);
      
      console.log('[首页] 本地数据:', { indicesLen: indices.length, boardsLen: boards.length });
      
      this.processIndexData(indices);
      this.processBoardData(boards);
      await this.loadWatchStocks();
      
      const app = getApp();
      app.globalData.conceptBoards = boards;
      
      this.setData({ loading: false });
      console.log('[首页] 本地数据加载完成，页面显示');
      
      console.log('[首页] 后台刷新东方财富数据...');
      this.refreshRemoteData();
    } catch (err) {
      console.error('[首页] 加载数据失败:', err);
      wx.showToast({
        title: '数据加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },
  
  async refreshRemoteData() {
    try {
      const [boards] = await Promise.all([
        api.getConceptBoards(20),
        api.getLimitUpStocks(10)
      ]);
      
      if (boards && boards.length > 0) {
        console.log('[首页] 后台刷新成功:', boards.length, '条板块');
        this.processBoardData(boards);
        const app = getApp();
        app.globalData.conceptBoards = boards;
      }
    } catch (err) {
      console.warn('[首页] 后台刷新失败:', err);
    }
  },

  // 处理大盘指数数据
  processIndexData(indices) {
    const indexData = indices.map(idx => ({
      ...idx,
      changePctFmt: (idx.changePct > 0 ? '+' : '') + Number(idx.changePct || 0).toFixed(2) + '%',
      lastPriceFmt: idx.lastPrice ? Number(idx.lastPrice).toFixed(2) : '--',
      indexName: this.getIndexName(idx.code)
    }));
    this.setData({ indexData });
  },

  // 获取指数名称映射
  getIndexName(code) {
    const names = {
      '000001': '上证指数',
      '399001': '深证成指',
      '399006': '创业板指',
      '000688': '科创50'
    };
    return names[code] || code;
  },

  // 处理板块数据（合并热点板块和板块排行，减少API调用）
  processBoardData(boards) {
    const hotBoards = [...boards]
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 5)
      .map(b => ({
        ...b,
        changePctFmt: (b.changePct > 0 ? '+' : '') + Number(b.changePct || 0).toFixed(2) + '%',
        hotLevel: b.changePct > 2 ? 'high' : (b.changePct > 1 ? 'medium' : 'low')
      }));
    
    const boardRank = [...boards]
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 10)
      .map(b => ({
        ...b,
        changePctFmt: (b.changePct > 0 ? '+' : '') + Number(b.changePct || 0).toFixed(2) + '%',
        leaderStock: b.leaderName,
        leaderCap: b.leaderChangePct
      }));
    
    this.setData({ hotBoards, boardRank });
  },

  // 加载自选股
  async loadWatchStocks() {
    const app = getApp();
    const watchList = app.globalData.watchList;
    
    if (!watchList || watchList.length === 0) {
      this.setData({ watchStocks: [] });
      return;
    }
    
    try {
      const codes = watchList.map(w => w.code);
      const quotes = await api.getQuotes(codes);
      const quoteMap = {};
      quotes.forEach(q => { quoteMap[q.code] = q; });
      
      const watchStocks = watchList.map(w => {
        const q = quoteMap[w.code] || {};
        return {
          ...w,
          lastPrice: q.lastPrice ? Number(q.lastPrice).toFixed(2) : '--',
          changePct: q.changePct,
          changePctFmt: q.changePct != null 
            ? (q.changePct > 0 ? '+' : '') + Number(q.changePct).toFixed(2) + '%'
            : '--'
        };
      });
      
      this.setData({ watchStocks });
    } catch (err) {
      console.error('加载自选股行情失败:', err);
    }
  },

  // 跳转到板块详情
  goToBoardDetail(e) {
    const { code, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/board-detail/board-detail?code=${code}&name=${name}`
    });
  },

  // 跳转到指数详情
  goToIndexDetail(e) {
    const { code, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/index-detail/index-detail?code=${code}&name=${encodeURIComponent(name)}`
    });
  },

  // 跳转到概念板块列表
  goToBoardList() {
    wx.switchTab({
      url: '/pages/board/board'
    });
  },

  // 跳转到自选股页面
  goToWatch() {
    wx.switchTab({
      url: '/pages/watch/watch'
    });
  },

  // 刷新数据
  onRefresh() {
    this.loadData();
  }
});