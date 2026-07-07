// pages/debug/debug.js
// API 调试页面 - 测试 utils/api.js 中的所有接口

const { api } = require('../../utils/api.js');
const dataUtils = require('../../utils/data.js');

Page({
  data: {
    // 输入框
    stockCode: '600519',          // 单股代码
    batchCodes: '600519,000001',  // 批量代码
    boardCode: 'BK0001',          // 板块代码（人工智能）
    searchKw: '茅台',             // 搜索关键词
    klineCode: '600519',          // K线代码
    klineType: 'day',             // K线周期
    klineTypeLabel: '日K',        // K线显示
    klineTypeIndex: 0,           // K线 picker 索引
    klineTypes: ['day', 'week', 'month', '60', '30', '15', '5', '1'],
    klineLabels: ['日K', '周K', '月K', '60分', '30分', '15分', '5分', '1分'],
    
    // 加载状态
    loading: {},
    loadTime: {},                 // 每个测试项耗时
    
    // 测试结果
    results: {},
    
    // 默认显示
    showDetail: {}                // 哪些详情展开
  },

  onLoad() {
    this.runAllTests();
  },

  onPullDownRefresh() {
    this.runAllTests().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 输入处理
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  // 设置加载状态
  setLoading(key, status) {
    this.setData({ [`loading.${key}`]: status });
  },

  // 记录耗时
  setLoadTime(key, ms) {
    this.setData({ [`loadTime.${key}`]: ms });
  },

  // 包装测试函数（统一处理 loading 和耗时）
  async runTest(key, fn) {
    this.setLoading(key, true);
    const start = Date.now();
    try {
      const result = await fn();
      const ms = Date.now() - start;
      this.setLoadTime(key, ms);
      this.setData({ [`results.${key}`]: { success: true, data: result, time: new Date().toLocaleTimeString() } });
      console.log(`[DEBUG] ${key} 成功 (${ms}ms):`, result);
      return result;
    } catch (err) {
      const ms = Date.now() - start;
      this.setLoadTime(key, ms);
      this.setData({ [`results.${key}`]: { success: false, error: String(err), time: new Date().toLocaleTimeString() } });
      console.error(`[DEBUG] ${key} 失败:`, err);
      return null;
    } finally {
      this.setLoading(key, false);
    }
  },

  // 切换详情展开
  toggleDetail(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ [`showDetail.${key}`]: !this.data.showDetail[key] });
  },

  // ========== 一键跑所有自动测试 ==========
  async runAllTests() {
    wx.showLoading({ title: '测试中...', mask: true });
    await Promise.all([
      this.testMainIndices(),
      this.testLimitUp(),
      this.testConceptBoards(),
      this.testQuote(),
      this.testQuotes(),
      this.testBoardDetail(),
      this.testSearch(),
      this.testKLine(),
      this.testCapitalFlow(),
      this.testAnnouncements()
    ]);
    wx.hideLoading();
  },

  // ========== 各项测试 ==========

  async testMainIndices() {
    return this.runTest('mainIndices', () => api.getMainIndices());
  },

  async testLimitUp() {
    return this.runTest('limitUp', () => api.getLimitUpStocks(10));
  },

  async testConceptBoards() {
    return this.runTest('conceptBoards', () => api.getConceptBoards(5));
  },

  async testQuote() {
    const code = this.data.stockCode.trim();
    if (!code) return;
    return this.runTest('quote', () => api.getQuote(code));
  },

  async testQuotes() {
    const text = this.data.batchCodes.trim();
    if (!text) return;
    const codes = text.split(/[,\s]+/).filter(Boolean);
    return this.runTest('quotes', () => api.getQuotes(codes));
  },

  async testBoardDetail() {
    const code = this.data.boardCode.trim();
    if (!code) return;
    return this.runTest('boardDetail', () => api.getBoardDetail(code, 10));
  },

  async testSearch() {
    const kw = this.data.searchKw.trim();
    if (!kw) return;
    return this.runTest('search', () => api.searchStock(kw));
  },

  async testKLine() {
    const code = this.data.klineCode.trim();
    if (!code) return;
    return this.runTest('kline', () => api.getKLine(code, this.data.klineType, 5));
  },

  async testCapitalFlow() {
    const code = this.data.stockCode.trim();
    if (!code) return;
    return this.runTest('capitalFlow', () => api.getCapitalFlow(code));
  },

  async testAnnouncements() {
    const code = this.data.stockCode.trim();
    if (!code) return;
    return this.runTest('announcements', () => api.getStockAnnouncements(code, 3));
  },

  // ========== 格式化辅助 ==========
  fmtNumber(n, d = 2) {
    return dataUtils.formatNumber(n, d);
  },
  fmtPct(n) {
    return dataUtils.formatChangePct(n, true);
  },
  fmtYi(n) {
    return dataUtils.formatAmount(n);
  },

  fmtUpDown(value) {
    if (value == null) return { text: '--', cls: 'neutral' };
    if (value > 0) return { text: '+' + value.toFixed(2), cls: 'up' };
    if (value < 0) return { text: value.toFixed(2), cls: 'down' };
    return { text: '0.00', cls: 'neutral' };
  },

  // K线周期切换
  onKLineTypeChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({
      klineType: this.data.klineTypes[idx],
      klineTypeLabel: this.data.klineLabels[idx],
      klineTypeIndex: idx
    });
  },

  // 复制结果到剪贴板
  copyResult(e) {
    const { key } = e.currentTarget.dataset;
    const result = this.data.results[key];
    if (!result) return;
    wx.setClipboardData({
      data: JSON.stringify(result.data, null, 2),
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  }
});