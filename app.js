// A股探子 - A股概念板块龙头分析小程序
// App入口

App({
  globalData: {
    userId: null,
    // WebSocket连接状态
    wsConnected: false,
    // 实时行情数据缓存
    quoteCache: new Map(),
    // 自选股列表
    watchList: [],
    // 概念板块数据
    conceptBoards: [],
    // 热点事件列表
    events: [],
    // 用户设置
    settings: {
      pushEnabled: true,
      pushFrequency: 'realtime',
      defaultSortBy: 'changePct',
      theme: 'dark'
    },
    // 主题配置
    theme: {
      up: '#E53935',
      down: '#43A047',
      neutral: '#9E9E9E',
      bg: '#1A1A2E',
      card: '#16213E',
      accent: '#FFD700',
      text: '#FFFFFF',
      textSecondary: '#B0B0B0'
    }
  },

  onLaunch() {
    // 初始化应用
    this.initUser();
    this.loadWatchList();
    this.loadSettings();
    this.connectWebSocket();
  },

  onShow() {
    // 页面显示时检查连接状态
    if (!this.globalData.wsConnected) {
      this.connectWebSocket();
    }
  },

  onHide() {
    // 页面隐藏时断开连接节省资源
    // this.disconnectWebSocket();
  },

  // 初始化用户
  initUser() {
    const userId = wx.getStorageSync('user_id');
    if (userId) {
      this.globalData.userId = userId;
    } else {
      // 生成临时用户ID
      const newUserId = 'user_' + Date.now();
      wx.setStorageSync('user_id', newUserId);
      this.globalData.userId = newUserId;
    }
  },

  // 加载自选股列表
  loadWatchList() {
    const watchList = wx.getStorageSync('watch_list') || [];
    this.globalData.watchList = watchList;
  },

  // 保存自选股列表
  saveWatchList() {
    wx.setStorageSync('watch_list', this.globalData.watchList);
  },

  // 加载用户设置
  loadSettings() {
    const saved = wx.getStorageSync('settings');
    if (saved) {
      this.globalData.settings = { ...this.globalData.settings, ...saved };
    }
  },

  // 保存用户设置
  saveSettings() {
    wx.setStorageSync('settings', this.globalData.settings);
  },

  // 添加自选股
  addWatchStock(stock) {
    const exists = this.globalData.watchList.some(s => s.code === stock.code);
    if (!exists) {
      this.globalData.watchList.push({
        code: stock.code,
        name: stock.name,
        addTime: Date.now(),
        alertPriceUp: null,
        alertPriceDown: null,
        alertChangePct: null,
        notes: ''
      });
      this.saveWatchList();
      return true;
    }
    return false;
  },

  // 移除自选股
  removeWatchStock(stockCode) {
    const index = this.globalData.watchList.findIndex(s => s.code === stockCode);
    if (index > -1) {
      this.globalData.watchList.splice(index, 1);
      this.saveWatchList();
      return true;
    }
    return false;
  },

  // 检查是否已添加自选
  isWatched(stockCode) {
    return this.globalData.watchList.some(s => s.code === stockCode);
  },

  // WebSocket连接
  connectWebSocket() {
    const self = this;
    // 东方财富WebSocket API
    // 这里使用模拟连接，实际需要对接真实API
    this.globalData.wsConnected = true;
    
    // 模拟接收行情数据
    this.startQuoteSimulation();
  },

  // 断开WebSocket
  disconnectWebSocket() {
    this.globalData.wsConnected = false;
    if (this.quoteTimer) {
      clearInterval(this.quoteTimer);
    }
  },

  // 模拟行情数据推送
  startQuoteSimulation() {
    const self = this;
    this.quoteTimer = setInterval(() => {
      // 更新缓存中的行情数据
      self.globalData.quoteCache.forEach((quote, code) => {
        // 模拟价格波动
        const change = (Math.random() - 0.5) * 0.02;
        quote.changePct += change;
        quote.lastPrice = quote.lastPrice * (1 + change / 100);
        quote.updateTime = Date.now();
      });
    }, 3000);
  },

  // 更新行情数据
  updateQuote(code, data) {
    this.globalData.quoteCache.set(code, {
      ...data,
      updateTime: Date.now()
    });
  },

  // 获取单个股票行情
  getQuote(code) {
    return this.globalData.quoteCache.get(code);
  },

  // 批量获取行情
  getQuotes(codes) {
    const quotes = {};
    codes.forEach(code => {
      quotes[code] = this.globalData.quoteCache.get(code);
    });
    return quotes;
  },

  // 工具方法：格式化数字
  formatNumber(num, decimals = 2) {
    if (num == null) return '--';
    return Number(num).toFixed(decimals);
  },

  // 工具方法：格式化金额
  formatAmount(num) {
    if (num == null) return '--';
    if (num >= 100000000) {
      return (num / 100000000).toFixed(2) + '亿';
    } else if (num >= 10000) {
      return (num / 10000).toFixed(2) + '万';
    }
    return num.toFixed(2);
  },

  // 工具方法：获取涨跌颜色
  getChangeColor(changePct) {
    if (changePct > 0) return this.globalData.theme.up;
    if (changePct < 0) return this.globalData.theme.down;
    return this.globalData.theme.neutral;
  },

  // 工具方法：显示Toast
  showToast(title, icon = 'none') {
    wx.showToast({ title, icon });
  }
});