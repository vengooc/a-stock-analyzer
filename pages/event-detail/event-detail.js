// 事件详情页
const { api } = require('../../utils/api.js');

Page({
  data: {
    event: null,
    relatedStocks: [],
    loading: true,
    watchedMap: {}
  },

  onLoad(options) {
    const { id } = options;
    this.loadEventDetail(id);
    this.refreshWatchStatus();
  },

  async loadEventDetail(eventId) {
    console.log('[event-detail] loadEventDetail:', eventId);
    this.setData({ loading: true });
    
    try {
      console.log('[event-detail] 优先加载本地事件...');
      const events = api.generateLocalEvents(20);
      let event = events.find(e => e.id === eventId);
      
      if (!event) {
        console.warn('[event-detail] 本地未找到事件:', eventId);
        event = {
          id: eventId,
          title: '事件详情',
          type: 'other',
          time: Date.now(),
          source: '系统',
          summary: '事件详情加载失败，请稍后重试',
          sentimentLevel: 'C',
          relatedStocks: [],
          relatedBoards: []
        };
      }
      
      const relatedStockList = event.relatedStocks || [];
      const codes = relatedStockList.map(s => typeof s === 'string' ? s : s.code);
      const quotes = codes.length > 0 ? await api.getQuotes(codes) : [];
      const quoteMap = {};
      quotes.forEach(q => { quoteMap[q.code] = q; });
      
      const relatedStocks = relatedStockList.map(s => {
        const code = typeof s === 'string' ? s : s.code;
        const name = typeof s === 'string' ? '' : s.name;
        const q = quoteMap[code] || {};
        const relevanceScore = q.changePct != null ? Math.abs(q.changePct) : 0;
        let relevance = '弱';
        if (relevanceScore >= 4) relevance = '强';
        else if (relevanceScore >= 2) relevance = '中';
        
        return {
          code,
          name: name || q.name || '',
          changePct: q.changePct,
          changePctFmt: q.changePct != null 
            ? (q.changePct > 0 ? '+' : '') + Number(q.changePct).toFixed(2) + '%'
            : '--',
          lastPrice: q.lastPrice ? Number(q.lastPrice).toFixed(2) : '--',
          relevance
        };
      }).sort((a, b) => {
        const relevanceOrder = { '强': 3, '中': 2, '弱': 1 };
        return (relevanceOrder[b.relevance] || 0) - (relevanceOrder[a.relevance] || 0);
      });
      
      this.setData({ event, relatedStocks });
      this.setData({ loading: false });
      
      console.log('[event-detail] 后台刷新远程事件...');
      this.refreshRemoteEvent(eventId);
    } catch (err) {
      console.error('[event-detail] 加载失败:', err);
      const event = {
        id: eventId,
        title: '事件详情',
        type: 'other',
        time: Date.now(),
        source: '系统',
        summary: '事件详情加载失败，请稍后重试',
        sentimentLevel: 'C',
        relatedBoards: []
      };
      this.setData({ event, relatedStocks: [], loading: false });
    }
  },
  
  async refreshRemoteEvent(eventId) {
    try {
      const events = await api.getEvents('all', 20);
      const event = events.find(e => e.id === eventId);
      if (!event) return;
      
      console.log('[event-detail] 后台刷新成功:', eventId);
      const relatedStockList = event.relatedStocks || [];
      const codes = relatedStockList.map(s => typeof s === 'string' ? s : s.code);
      const quotes = codes.length > 0 ? await api.getQuotes(codes) : [];
      const quoteMap = {};
      quotes.forEach(q => { quoteMap[q.code] = q; });
      
      const relatedStocks = relatedStockList.map(s => {
        const code = typeof s === 'string' ? s : s.code;
        const name = typeof s === 'string' ? '' : s.name;
        const q = quoteMap[code] || {};
        const relevanceScore = q.changePct != null ? Math.abs(q.changePct) : 0;
        let relevance = '弱';
        if (relevanceScore >= 4) relevance = '强';
        else if (relevanceScore >= 2) relevance = '中';
        
        return {
          code,
          name: name || q.name || '',
          changePct: q.changePct,
          changePctFmt: q.changePct != null 
            ? (q.changePct > 0 ? '+' : '') + Number(q.changePct).toFixed(2) + '%'
            : '--',
          lastPrice: q.lastPrice ? Number(q.lastPrice).toFixed(2) : '--',
          relevance
        };
      }).sort((a, b) => {
        const relevanceOrder = { '强': 3, '中': 2, '弱': 1 };
        return (relevanceOrder[b.relevance] || 0) - (relevanceOrder[a.relevance] || 0);
      });
      
      this.setData({ event, relatedStocks });
    } catch (err) {
      console.warn('[event-detail] 后台刷新失败:', err);
    }
  },

  onShow() {
    this.refreshWatchStatus();
  },

  refreshWatchStatus() {
    const app = getApp();
    const watchedMap = {};
    (app.globalData.watchList || []).forEach(s => { watchedMap[s.code] = true; });
    this.setData({ watchedMap });
  },

  onAddWatch(e) {
    const { code, name } = e.currentTarget.dataset;
    const app = getApp();

    let success;
    if (app.isWatched(code)) {
      success = app.removeWatchStock(code);
      wx.showToast({ title: success ? '已移除自选' : '移除失败', icon: 'none' });
    } else {
      success = app.addWatchStock({ code, name });
      wx.showToast({ title: success ? '已加入自选 ⭐' : '添加失败', icon: success ? 'success' : 'none' });
    }
    this.refreshWatchStatus();
  },

  onStockTap(e) {
    const { code, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/stock-detail/stock-detail?code=${code}&name=${encodeURIComponent(name || '')}`
    });
  }
});