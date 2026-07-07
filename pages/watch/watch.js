// 自选股页面
const { api } = require('../../utils/api.js');

Page({
  data: {
    watchList: [],
    watchStocks: [],
    loading: true,
    // 排序方式
    sortBy: 'addTime',
    // 搜索关键词
    searchKey: ''
  },

  onLoad() {
    this.loadWatchList();
  },

  onShow() {
    if (this._shouldRefresh) {
      this.loadWatchList();
      this._shouldRefresh = false;
    }
  },

  // 加载自选股列表
  async loadWatchList() {
    this.setData({ loading: true });
    
    try {
      const app = getApp();
      const watchList = app.globalData.watchList;
      
      if (watchList.length === 0) {
        this.setData({ watchList: [], watchStocks: [], loading: false });
        return;
      }
      
      // 调用真实 API 获取行情
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
            : '--',
          volume: q.volume || 0,
          marketCap: q.totalMarketCap,
          addTime: w.addTime
        };
      });
      
      // 排序
      this.sortStocks(watchStocks);
      
      this.setData({ watchList, watchStocks, loading: false });
    } catch (err) {
      console.error('加载自选股失败:', err);
      this.setData({ loading: false });
    }
  },

  // 排序
  sortStocks(stocks) {
    const { sortBy } = this.data;
    stocks.sort((a, b) => {
      if (sortBy === 'addTime') return b.addTime - a.addTime;
      if (sortBy === 'changePct') return b.changePct - a.changePct;
      if (sortBy === 'marketCap') return b.marketCap - a.marketCap;
      return 0;
    });
  },

  onSortChange(e) {
    const sortBy = e.currentTarget.dataset.sort;
    this.setData({ sortBy });
    const watchStocks = [...this.data.watchStocks];
    this.sortStocks(watchStocks);
    this.setData({ watchStocks });
  },

  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value });
  },

  goToStockSearch() {
    wx.navigateTo({
      url: '/pages/stock/stock'
    });
  },

  onSearch() {
    const { searchKey, watchStocks } = this.data;
    if (!searchKey) {
      this.loadWatchList();
      return;
    }
    
    const filtered = watchStocks.filter(w => 
      (w.name && w.name.includes(searchKey)) || 
      (w.code && w.code.includes(searchKey))
    );
    this.setData({ watchStocks: filtered });
  },

  // 移除自选股
  onRemoveWatch(e) {
    const { code, name } = e.currentTarget.dataset;
    const app = getApp();
    
    wx.showModal({
      title: '确认移除',
      content: `确定要从自选股中移除${name}吗？`,
      success: (res) => {
        if (res.confirm) {
          app.removeWatchStock(code);
          this.loadWatchList();
          wx.showToast({ title: '已移除', icon: 'none' });
        }
      }
    });
  },

  // 跳转到股票详情
  onStockTap(e) {
    const { code, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/stock-detail/stock-detail?code=${code}&name=${encodeURIComponent(name || '')}`
    });
  },

  // 格式化添加时间
  formatAddTime(timestamp) {
    const date = new Date(timestamp);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}-${day}`;
  }
});