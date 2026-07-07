const { api } = require('../../utils/api.js');

Page({
  data: {
    searchKey: '',
    searchResults: [],
    hotStocks: [],
    loading: false,
    showSearch: false
  },

  onLoad() {
    this.loadHotStocks();
  },

  onShow() {
    this.refreshWatchStatus();
  },

  async loadHotStocks() {
    const codes = ['600519', '000858', '300750', '002594', '688981', '002230', '600036', '000001'];
    const quotes = await api.getQuotes(codes);
    const hotStocks = quotes.map(q => ({
      ...q,
      lastPrice: q.lastPrice ? Number(q.lastPrice).toFixed(2) : '--',
      changePctFmt: q.changePct != null
        ? (q.changePct > 0 ? '+' : '') + Number(q.changePct).toFixed(2) + '%'
        : '--',
      watched: getApp().isWatched(q.code)
    }));
    this.setData({ hotStocks });
  },

  onSearchInput(e) {
    const searchKey = e.detail.value;
    this.setData({ searchKey });
    if (searchKey.trim().length >= 1) {
      this.doSearch(searchKey);
    } else {
      this.setData({ searchResults: [], showSearch: false });
    }
  },

  async doSearch(keyword) {
    if (!keyword || keyword.trim().length < 1) return;

    this.setData({ loading: true });

    try {
      const results = await api.searchStock(keyword.trim());
      const searchResults = results.map(r => ({
        ...r,
        lastPrice: r.lastPrice ? Number(r.lastPrice).toFixed(2) : '--',
        changePctFmt: r.changePct != null
          ? (r.changePct > 0 ? '+' : '') + Number(r.changePct).toFixed(2) + '%'
          : '--',
        watched: getApp().isWatched(r.code)
      }));

      this.setData({ searchResults, loading: false, showSearch: true });
    } catch (err) {
      console.error('搜索失败:', err);
      this.setData({ searchResults: [], loading: false, showSearch: true });
    }
  },

  refreshWatchStatus() {
    const app = getApp();
    this.setData({
      hotStocks: this.data.hotStocks.map(s => ({
        ...s,
        watched: app.isWatched(s.code)
      })),
      searchResults: this.data.searchResults.map(s => ({
        ...s,
        watched: app.isWatched(s.code)
      }))
    });
  },

  onToggleWatch(e) {
    e.stopPropagation();
    const { code, name } = e.currentTarget.dataset;
    const app = getApp();

    if (app.isWatched(code)) {
      app.removeWatchStock(code);
      wx.showToast({ title: '已移除自选', icon: 'none' });
    } else {
      app.addWatchStock({ code, name });
      wx.showToast({ title: '已加入自选 ⭐', icon: 'success' });
    }

    this.refreshWatchStatus();
  },

  onStockTap(e) {
    const { code, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/stock-detail/stock-detail?code=${code}&name=${encodeURIComponent(name || '')}`
    });
  },

  clearSearch() {
    this.setData({ searchKey: '', searchResults: [], showSearch: false });
  }
});