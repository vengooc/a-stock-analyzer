// 板块详情页
const { api } = require('../../utils/api.js');
// 备用：直接调用 wx.request（用于绕过 api 实例）
function request(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      timeout: 10000,
      header: { 'Referer': 'https://quote.eastmoney.com/' },
      success: (res) => res.statusCode === 200 ? resolve(res.data) : reject({ code: res.statusCode }),
      fail: (err) => reject(err)
    });
  });
}

Page({
  data: {
    // 板块信息
    board: null,
    code: '',
    name: '',
    // 成分股列表
    stocks: [],
    // 加载状态
    loading: true,
    // 排序方式
    sortBy: 'changePct',
    // 自选状态映射 { code: true }
    watchedMap: {}
  },

  onLoad(options) {
    console.log('[board-detail] onLoad options:', options);
    const { code, name } = options;
    if (!code) {
      this.setData({ error: '未指定板块代码' });
      return;
    }
    this.setData({ code, name: decodeURIComponent(name || '') });
    wx.setNavigationBarTitle({ title: decodeURIComponent(name || '') || '板块详情' });
    this.loadBoardDetail(code);
    this.refreshWatchStatus();
  },

  retryLoad() {
    if (this.data.code) {
      this.loadBoardDetail(this.data.code);
    }
  },

  onShow() {
    // 刷新自选状态
    this.refreshWatchStatus();
  },

  async loadBoardDetail(boardCode) {
    console.log('[board-detail] loadBoardDetail:', boardCode);
    this.setData({ loading: true, error: null });
    
    try {
      console.log('[board-detail] 优先加载本地数据...');
      const result = await api.getBoardDetailLocal(boardCode, 50);
      console.log('[board-detail] 本地数据:', { stocksLen: (result.stocks || []).length });
      
      const stocks = (result.stocks || []).map((s, i) => ({
        ...s,
        isLeader: i === 0,
        changePctFmt: (s.changePct > 0 ? '+' : '') + Number(s.changePct || 0).toFixed(2) + '%',
        priceFmt: s.lastPrice ? Number(s.lastPrice).toFixed(2) : '--'
      }));
      stocks.sort((a, b) => (b.changePct || 0) - (a.changePct || 0));
      if (stocks.length > 0) stocks[0].isLeader = true;

      const boardInfo = result.board ? {
        ...result.board,
        leaderChangePctFmt: result.board.leaderChangePct != null
          ? ((result.board.leaderChangePct > 0 ? '+' : '') + Number(result.board.leaderChangePct).toFixed(2) + '%')
          : '--'
      } : {};
      this.setData({ board: boardInfo, stocks });
      if (boardInfo.name) {
        wx.setNavigationBarTitle({ title: boardInfo.name });
      }
      this.refreshWatchStatus();
      this.setData({ loading: false });
      
      console.log('[board-detail] 后台刷新远程数据...');
      this.refreshRemoteBoardDetail(boardCode);
    } catch (err) {
      console.error('[board-detail] 加载失败:', err);
      this.setData({ error: String(err.message || err), loading: false });
    }
  },
  
  async refreshRemoteBoardDetail(boardCode) {
    try {
      const result = await api.fetchBoardDetailFromEastmoney(boardCode, 50);
      if (result && result.stocks && result.stocks.length > 0) {
        console.log('[board-detail] 后台刷新成功:', result.stocks.length, '条');
        const stocks = result.stocks.map((s, i) => ({
          ...s,
          isLeader: i === 0,
          changePctFmt: (s.changePct > 0 ? '+' : '') + Number(s.changePct || 0).toFixed(2) + '%',
          priceFmt: s.lastPrice ? Number(s.lastPrice).toFixed(2) : '--'
        }));
        stocks.sort((a, b) => (b.changePct || 0) - (a.changePct || 0));
        if (stocks.length > 0) stocks[0].isLeader = true;

        const boardWithFmt = result.board ? {
          ...result.board,
          leaderChangePctFmt: result.board.leaderChangePct != null
            ? ((result.board.leaderChangePct > 0 ? '+' : '') + Number(result.board.leaderChangePct).toFixed(2) + '%')
            : '--'
        } : result.board;

        this.setData({ board: boardWithFmt, stocks });
        if (result.board && result.board.name) {
          wx.setNavigationBarTitle({ title: result.board.name });
        }
        this.refreshWatchStatus();
      }
    } catch (err) {
      console.warn('[board-detail] 后台刷新失败:', err);
    }
  },

  // 刷新自选状态（用 Map 对象，提高性能和可读性）
  refreshWatchStatus() {
    const app = getApp();
    const watchedMap = {};
    (app.globalData.watchList || []).forEach(s => {
      watchedMap[s.code] = true;
    });
    console.log('[board-detail] refreshWatchStatus, watchList:', app.globalData.watchList);
    this.setData({ watchedMap });
  },

  // 排序
  onSortChange(e) {
    const sortBy = e.currentTarget.dataset.sort;
    this.setData({ sortBy });
    
    const stocks = [...this.data.stocks];
    stocks.sort((a, b) => {
      if (sortBy === 'changePct') return b.changePct - a.changePct;
      if (sortBy === 'marketCap') return b.marketCap - a.marketCap;
      if (sortBy === 'volume') return b.volume - a.volume;
      return 0;
    });
    
    this.setData({ stocks });
  },

  // 添加自选股
  onAddWatch(e) {
    const { code, name } = e.currentTarget.dataset;
    const app = getApp();

    let success;
    if (app.isWatched(code)) {
      success = app.removeWatchStock(code);
      wx.showToast({ title: success ? '已移除自选' : '移除失败', icon: success ? 'none' : 'none' });
    } else {
      success = app.addWatchStock({ code, name });
      wx.showToast({ title: success ? '已加入自选 ⭐' : '添加失败', icon: success ? 'success' : 'none' });
    }

    this.refreshWatchStatus();
  },

  // 跳转到股票详情（预留）
  onStockTap(e) {
    const { code, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/stock-detail/stock-detail?code=${code}&name=${encodeURIComponent(name || '')}`
    });
  }
});