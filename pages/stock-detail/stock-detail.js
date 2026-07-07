// pages/stock-detail/stock-detail.js
// 股票详情页

const { api } = require('../../utils/api.js');

Page({
  data: {
    code: '',
    name: '',

    // 加载状态
    loading: true,
    refreshing: false,
    error: null,

    // 行情
    quote: null,

    // K线
    klineType: 'day',          // day/week/month
    klineTypes: [
      { value: 'day', label: '日K' },
      { value: 'week', label: '周K' },
      { value: 'month', label: '月K' }
    ],
    klineList: [],
    klineRange: { high: 0, low: 0 },

    // 资金流向
    capitalFlow: null,

    // 公告
    announcements: [],

    // 自选状态
    watched: false,

    // 当前显示的区块
    activeTab: 'quote'         // quote / kline / flow / news
  },

  onLoad(options) {
    console.log('[stock-detail] onLoad options:', options);
    const { code, name } = options;
    if (!code) {
      this.setData({ error: '未指定股票代码' });
      return;
    }
    this.setData({ code, name: decodeURIComponent(name || '') });
    wx.setNavigationBarTitle({ title: decodeURIComponent(name || '') || code || '股票详情' });
    this.loadAll();
  },

  onShow() {
    this.refreshWatchStatus();
  },

  onPullDownRefresh() {
    this.loadAll().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载所有数据（每个接口独立 catch，互不影响）
  async loadAll() {
    this.setData({ loading: true, error: null });
    // 并行加载，单独捕获错误
    const results = await Promise.allSettled([
      this.loadQuote(),
      this.loadKLine(),
      this.loadCapitalFlow(),
      this.loadAnnouncements()
    ]);
    // 汇总错误
    const errors = results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message || String(r.reason));
    if (errors.length > 0) {
      console.warn('[stock-detail] 部分加载失败:', errors);
      this.setData({ error: errors.join('; ') });
    }
    this.setData({ loading: false });
  },

  // 加载行情
  async loadQuote() {
    console.log('[stock-detail] loadQuote:', this.data.code);
    const quote = await api.getQuote(this.data.code);
    console.log('[stock-detail] loadQuote result:', quote);
    if (quote) {
      // 预计算格式化字段，避免在 WXML 中做计算
      const fmt = (v, decimals = 2) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        return Number(v).toFixed(decimals);
      };
      const fmtInt = (v) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        return Number(v).toLocaleString();
      };
      const fmtPct = (v) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        const n = Number(v);
        return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
      };

      const formattedQuote = {
        ...quote,
        // 价格族
        lastPriceFmt: fmt(quote.lastPrice),
        changeAmountFmt: fmt(quote.changeAmount),
        changePctFmt: fmtPct(quote.changePct),
        openPriceFmt: fmt(quote.openPrice),
        preCloseFmt: fmt(quote.preClose),
        highPriceFmt: fmt(quote.highPrice),
        lowPriceFmt: fmt(quote.lowPrice),
        upperLimitFmt: fmt(quote.upperLimit),
        lowerLimitFmt: fmt(quote.lowerLimit),
        // 量价
        volumeFmt: fmtInt(quote.volume),
        amountFmt: fmt(quote.amount),
        turnoverRateFmt: fmt(quote.turnoverRate),
        // 估值
        peDynamicFmt: fmt(quote.peDynamic, 2),
        amplitudeFmt: fmt(quote.amplitude),
        totalMarketCapFmt: fmt(quote.totalMarketCap),
        floatMarketCapFmt: fmt(quote.floatMarketCap),
      };

      this.setData({
        quote: formattedQuote,
        name: quote.name || this.data.name,
        watched: getApp().isWatched(this.data.code)
      });
      wx.setNavigationBarTitle({ title: quote.name || this.data.code });
    } else {
      throw new Error('获取行情为空（可能是代码错误或网络问题）');
    }
  },

  // 加载K线
  async loadKLine() {
    const klineList = await api.getKLine(this.data.code, this.data.klineType, 60);
    if (klineList && klineList.length > 0) {
      // 预计算格式化字段
      const fmt = (v) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        return Number(v).toFixed(2);
      };
      const fmtPct = (v) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        const n = Number(v);
        return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
      };
      const fmtK = (v) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        return Number(v).toFixed(2);
      };
      const formattedList = klineList.map(k => ({
        ...k,
        openFmt: fmtK(k.open),
        closeFmt: fmtK(k.close),
        highFmt: fmtK(k.high),
        lowFmt: fmtK(k.low),
        changePctFmt: fmtPct(k.changePct),
        changePct: k.changePct,  // 保留原始值用于排序
      }));
      const high = Math.max(...klineList.map(k => k.high || 0));
      const low = Math.min(...klineList.map(k => k.low || Infinity));
      this.setData({ klineList: formattedList, klineRange: { high, low } });
      this.drawKLineCanvas();
    } else {
      this.setData({ klineList: [], klineRange: { high: 0, low: 0 } });
    }
  },

  // 加载资金流向
  async loadCapitalFlow() {
    const result = await api.getCapitalFlow(this.data.code);
    // 格式化资金流向数据
    if (result && result.today) {
      const t = result.today;
      const fmtFlow = (v) => {
        if (v == null || isNaN(v)) return '--';
        const n = Number(v);
        return n >= 0 ? '+' + n.toFixed(2) : n.toFixed(2);
      };
      const fmtPct = (v) => {
        if (v == null || isNaN(v)) return '--';
        return Number(v).toFixed(2) + '%';
      };
      result.today = {
        ...t,
        mainNetInflowFmt: fmtFlow(t.mainNetInflow),
        mainPctFmt: fmtPct(t.mainPct),
        superLargePctFmt: fmtPct(t.superLargePct),
        largePctFmt: fmtPct(t.largePct),
        mediumPctFmt: fmtPct(t.mediumPct),
        smallPctFmt: fmtPct(t.smallPct),
        absSmallPct: Math.abs(t.smallPct || 0),
      };
    }
    this.setData({ capitalFlow: result });
  },

  // 加载公告
  async loadAnnouncements() {
    const announcements = await api.getStockAnnouncements(this.data.code, 10);
    this.setData({ announcements: announcements || [] });
  },

  // 切换K线周期
  async onKLineTypeChange(e) {
    const { value } = e.currentTarget.dataset;
    if (value === this.data.klineType) return;
    this.setData({ klineType: value, klineList: [] });
    await this.loadKLine();
  },

  // 切换 Tab
  onTabChange(e) {
    const { tab } = e.currentTarget.dataset;
    this.setData({ activeTab: tab });
  },

  // 切换自选
  onToggleWatch() {
    const app = getApp();
    const { code, name } = this.data;
    if (this.data.watched) {
      const success = app.removeWatchStock(code);
      if (success) wx.showToast({ title: '已移除自选', icon: 'none' });
    } else {
      const success = app.addWatchStock({ code, name });
      if (success) wx.showToast({ title: '已加入自选 ⭐', icon: 'success' });
    }
    this.setData({ watched: app.isWatched(code) });
  },

  // 刷新自选状态
  refreshWatchStatus() {
    const app = getApp();
    this.setData({ watched: app.isWatched(this.data.code) });
  },

  // 画 K线
  drawKLineCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#klineCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        const W = res[0].width;
        const H = res[0].height;
        const list = this.data.klineList;
        if (!list || list.length === 0) return;

        // 计算高低价
        const { high, low } = this.data.klineRange;
        const range = high - low || 1;
        const padding = { top: 20, bottom: 30, left: 10, right: 50 };
        const chartW = W - padding.left - padding.right;
        const chartH = H - padding.top - padding.bottom;
        const barW = Math.max(2, Math.floor(chartW / list.length * 0.6));
        const slotW = chartW / list.length;

        // 清空画布
        ctx.fillStyle = '#16213E';
        ctx.fillRect(0, 0, W, H);

        // 画网格
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const y = padding.top + (chartH / 4) * i;
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(W - padding.right, y);
          ctx.stroke();

          // 价格标签
          const price = high - (range / 4) * i;
          ctx.fillStyle = '#9E9E9E';
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(price.toFixed(2), W - padding.right + 4, y + 3);
        }

        // 画K线
        list.forEach((k, i) => {
          const x = padding.left + slotW * i + slotW / 2;
          const yOpen = padding.top + ((high - k.open) / range) * chartH;
          const yClose = padding.top + ((high - k.close) / range) * chartH;
          const yHigh = padding.top + ((high - k.high) / range) * chartH;
          const yLow = padding.top + ((high - k.low) / range) * chartH;

          const isUp = k.close >= k.open;
          const color = isUp ? '#E53935' : '#43A047';

          // 影线
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, yHigh);
          ctx.lineTo(x, yLow);
          ctx.stroke();

          // 实体
          ctx.fillStyle = color;
          const bodyH = Math.max(1, Math.abs(yOpen - yClose));
          const bodyY = Math.min(yOpen, yClose);
          ctx.fillRect(x - barW / 2, bodyY, barW, bodyH);
        });

        // 显示最新价格
        if (list.length > 0) {
          const last = list[list.length - 1];
          const isUp = last.close >= last.open;
          const color = isUp ? '#E53935' : '#43A047';
          const yLast = padding.top + ((high - last.close) / range) * chartH;
          ctx.fillStyle = color;
          ctx.fillRect(W - padding.right, yLast - 8, padding.right - 4, 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(last.close.toFixed(2), W - padding.right + 2, yLast + 4);
        }
      });
  }
});