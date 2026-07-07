// 热点事件页
const { api } = require('../../utils/api.js');
const dataUtils = require('../../utils/data.js');

Page({
  data: {
    events: [],
    allEvents: [],
    currentType: 'all',
    loading: true,
    searchKey: ''
  },

  onLoad() {
    this.loadEvents();
  },

  onShow() {
    if (this._shouldRefresh) {
      this.loadEvents();
      this._shouldRefresh = false;
    }
  },

  onPullDownRefresh() {
    this.loadEvents().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadEvents() {
    console.log('[事件页] 开始加载数据');
    this.setData({ loading: true });
    
    try {
      console.log('[事件页] 优先加载本地事件...');
      const events = api.generateLocalEvents(20);
      console.log('[事件页] 本地事件:', events.length, '条');
      this.setData({ allEvents: events });
      this.filterEvents(this.data.currentType);
      this.setData({ loading: false });
      
      console.log('[事件页] 后台刷新远程事件...');
      this.refreshRemoteEvents();
    } catch (err) {
      console.error('[事件页] 加载数据失败:', err);
      const events = this.getMockEvents();
      this.setData({ allEvents: events });
      this.filterEvents(this.data.currentType);
      this.setData({ loading: false });
    }
  },
  
  async refreshRemoteEvents() {
    try {
      const events = await api.getEvents('all', 20);
      if (events && events.length > 0) {
        console.log('[事件页] 后台刷新成功:', events.length, '条');
        this.setData({ allEvents: events });
        this.filterEvents(this.data.currentType);
      }
    } catch (err) {
      console.warn('[事件页] 后台刷新失败:', err);
    }
  },

  filterEvents(type) {
    const { allEvents } = this.data;
    if (type === 'all') {
      this.setData({ events: allEvents });
      return;
    }
    const filtered = allEvents.filter(e => e.type === type);
    this.setData({ events: filtered });
  },

  // 兜底模拟数据（API 失败时使用）
  getMockEvents() {
    return [
      { id: '1', title: '国务院发布AI发展新政', type: 'policy',
        time: Date.now() - 3600000, summary: '国务院日前印发新一代人工智能发展规划...',
        sentimentLevel: 'A', relatedStocks: ['002230', '688256', '300567'] },
      { id: '2', title: '工信部推动半导体产业发展', type: 'policy',
        time: Date.now() - 7200000, summary: '工信部发布半导体产业支持政策...',
        sentimentLevel: 'B', relatedStocks: ['688981', '688008'] },
      { id: '3', title: '某公司签订重大订单', type: 'order',
        time: Date.now() - 10800000, summary: '某上市公司签订重大合同订单...',
        sentimentLevel: 'B', relatedStocks: [] },
      { id: '4', title: '技术突破！国产芯片量产', type: 'tech',
        time: Date.now() - 14400000, summary: '国产芯片实现重大技术突破...',
        sentimentLevel: 'A', relatedStocks: ['688981'] },
      { id: '5', title: '某车企销量同比增长200%', type: 'finance',
        time: Date.now() - 18000000, summary: '新能源汽车企业发布财报...',
        sentimentLevel: 'B', relatedStocks: ['002594'] }
    ];
  },

  // 切换分类
  onTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.currentType) return;
    this.setData({ currentType: type });
    this.filterEvents(type);
  },

  // 跳转到事件详情
  goToEventDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/event-detail/event-detail?id=${id}`
    });
  },

  // 获取事件类型标签
  getTypeLabel(type) {
    const labels = {
      policy: '政策',
      finance: '财报',
      order: '订单',
      tech: '技术',
      industry: '行业',
      international: '国际'
    };
    return labels[type] || type;
  },

  // 获取利好等级类
  getSentimentClass(level) {
    if (level === 'A') return 'sentiment-a';
    if (level === 'B') return 'sentiment-b';
    if (level === 'C') return 'sentiment-c';
    return 'sentiment-d';
  },

  /**
   * 格式化时间（北京时间）
   * @param {number|string} timestamp - 时间戳（毫秒）或可解析的日期字符串
   * @param {string} format - 'relative'(几小时前) | 'datetime'(2026-06-29 14:30) | 'date'(06-29 14:30) | 'time'(14:30)
   */
  formatTime(timestamp, format = 'datetime') {
    if (!timestamp) return '--';
    const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : +timestamp;
    if (isNaN(ts)) return '--';

    // 相对时间
    if (format === 'relative') {
      const diff = Date.now() - ts;
      const minutes = Math.floor(diff / 60000);
      if (minutes < 1) return '刚刚';
      if (minutes < 60) return minutes + '分钟前';
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + '小时前';
      const days = Math.floor(hours / 24);
      if (days < 7) return days + '天前';
      format = 'date';
    }

    const d = new Date(ts);
    const pad = n => n.toString().padStart(2, '0');
    const Y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    const s = pad(d.getSeconds());

    switch (format) {
      case 'time':       return `${h}:${m}`;
      case 'time-sec':   return `${h}:${m}:${s}`;
      case 'date':       return `${M}-${D} ${h}:${m}`;
      case 'full':       return `${Y}-${M}-${D} ${h}:${m}:${s}`;
      case 'datetime':
      default:           return `${M}-${D} ${h}:${m}`;
    }
  },

  // 搜索事件
  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value });
  },

  onSearch() {
    const { searchKey, allEvents } = this.data;
    if (!searchKey) {
      this.filterEvents(this.data.currentType);
      return;
    }
    const filtered = allEvents.filter(e => 
      (e.title && e.title.includes(searchKey)) ||
      (e.summary && e.summary.includes(searchKey))
    );
    this.setData({ events: filtered });
  }
});