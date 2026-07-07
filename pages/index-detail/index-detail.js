const { api } = require('../../utils/api.js');

Page({
  data: {
    code: '',
    name: '',
    loading: true,
    error: null,
    quote: null,
    klineType: 'minute',
    klineTypes: [
      { value: 'minute', label: '分时' },
      { value: 'day', label: '日K' },
      { value: 'week', label: '周K' },
      { value: 'month', label: '月K' }
    ],
    klineList: [],
    minuteList: [],
    priceRange: { high: 0, low: 0 },
    marketSummary: null
  },

  onLoad(options) {
    const { code, name } = options;
    if (!code) {
      this.setData({ error: '未指定指数代码' });
      return;
    }
    this.setData({ code, name: decodeURIComponent(name || '') });
    wx.setNavigationBarTitle({ title: decodeURIComponent(name || '') || code || '指数详情' });
    this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadAll() {
    this.setData({ loading: true, error: null });
    const results = await Promise.allSettled([
      this.loadQuote(),
      this.loadChartData(),
      this.loadMarketSummary()
    ]);
    const errors = results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message || String(r.reason));
    if (errors.length > 0) {
      console.warn('[index-detail] 部分加载失败:', errors);
    }
    this.setData({ loading: false });
  },

  async loadQuote() {
    const quote = await api.getQuote(this.data.code);
    if (quote) {
      const fmt = (v, decimals = 2) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        return Number(v).toFixed(decimals);
      };
      const fmtPct = (v) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        const n = Number(v);
        return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
      };
      const formattedQuote = {
        ...quote,
        // 预计算格式化字段
        lastPriceFmt: fmt(quote.lastPrice),
        changeAmountFmt: fmt(quote.changeAmount),
        changePctFmt: fmtPct(quote.changePct),
        openPriceFmt: fmt(quote.openPrice),
        preCloseFmt: fmt(quote.preClose),
        highPriceFmt: fmt(quote.highPrice),
        lowPriceFmt: fmt(quote.lowPrice),
        upperLimitFmt: fmt(quote.upperLimit),
        lowerLimitFmt: fmt(quote.lowerLimit),
        turnoverRateFmt: fmt(quote.turnoverRate),
        peDynamicFmt: fmt(quote.peDynamic, 2),
        amplitudeFmt: fmt(quote.amplitude),
        volumeFmt: this.formatVolume(quote.volume, quote.isIndex),
        amountFmt: this.formatAmount(quote.amount)
      };
      this.setData({
        quote: formattedQuote,
        name: quote.name || this.data.name
      });
      wx.setNavigationBarTitle({ title: quote.name || this.data.code });
    }
  },

  formatVolume(val, isIndex) {
    if (!val || val <= 0) return '--';
    const unit = isIndex ? '亿股' : '亿手';
    const unit2 = isIndex ? '万股' : '万手';
    if (val >= 100000000) {
      return (val / 100000000).toFixed(2) + unit;
    }
    if (val >= 10000) {
      return (val / 10000).toFixed(1) + unit2;
    }
    return val.toString() + (isIndex ? '股' : '手');
  },

  formatAmount(val) {
    if (!val || val <= 0) return '--';
    if (val >= 10000) {
      return (val / 10000).toFixed(2) + '万亿';
    }
    return val.toFixed(2) + '亿';
  },

  async loadChartData() {
    if (this.data.klineType === 'minute') {
      await this.loadMinuteLine();
    } else {
      await this.loadKLine();
    }
  },

  async loadMinuteLine() {
    const minuteList = await api.getMinuteLine(this.data.code);
    if (minuteList && minuteList.length > 0) {
      const prices = minuteList.map(m => m.price || 0);
      const high = Math.max(...prices);
      const low = Math.min(...prices.filter(p => p > 0));
      this.setData({ minuteList, klineList: [], priceRange: { high, low } });
      this.drawMinuteCanvas();
    } else {
      this.setData({ minuteList: [], priceRange: { high: 0, low: 0 } });
    }
  },

  async loadKLine() {
    const klineList = await api.getKLine(this.data.code, this.data.klineType, 60);
    if (klineList && klineList.length > 0) {
      const fmt = (v) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        return Number(v).toFixed(2);
      };
      const fmtPct = (v) => {
        if (v == null || v === '' || isNaN(v)) return '--';
        const n = Number(v);
        return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
      };
      const formattedList = klineList.map(k => ({
        ...k,
        openFmt: fmt(k.open),
        closeFmt: fmt(k.close),
        highFmt: fmt(k.high),
        lowFmt: fmt(k.low),
        changePctFmt: fmtPct(k.changePct),
        changePct: k.changePct,  // 保留原始值用于排序
      }));
      const high = Math.max(...klineList.map(k => k.high || 0));
      const low = Math.min(...klineList.map(k => k.low || Infinity));
      this.setData({ klineList: formattedList, minuteList: [], priceRange: { high, low } });
      this.drawKLineCanvas();
    } else {
      this.setData({ klineList: [], priceRange: { high: 0, low: 0 } });
    }
  },

  async loadMarketSummary() {
    const summary = await api.getMarketSummary(this.data.code);
    this.setData({ marketSummary: summary });
  },

  onKLineTypeChange(e) {
    const { value } = e.currentTarget.dataset;
    if (value === this.data.klineType) return;
    this.setData({ klineType: value, klineList: [], minuteList: [] });
    this.loadChartData();
  },

  drawMinuteCanvas() {
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
        const list = this.data.minuteList;
        if (!list || list.length === 0) return;

        const { high, low } = this.data.priceRange;
        const range = high - low || 1;
        const padding = { top: 20, bottom: 40, left: 10, right: 50 };
        const chartW = W - padding.left - padding.right;
        const chartH = H - padding.top - padding.bottom;
        const slotW = chartW / (list.length - 1 || 1);

        ctx.fillStyle = '#16213E';
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const y = padding.top + (chartH / 4) * i;
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(W - padding.right, y);
          ctx.stroke();
          const price = high - (range / 4) * i;
          ctx.fillStyle = '#9E9E9E';
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(price.toFixed(2), W - padding.right + 4, y + 3);
        }

        let points = [];
        let avgPoints = [];
        list.forEach((m, i) => {
          const x = padding.left + slotW * i;
          const y = padding.top + ((high - m.price) / range) * chartH;
          const yAvg = padding.top + ((high - m.avgPrice) / range) * chartH;
          points.push({ x, y });
          avgPoints.push({ x, y: yAvg });
        });

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = '#E53935';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(avgPoints[0].x, avgPoints[0].y);
        for (let i = 1; i < avgPoints.length; i++) {
          ctx.lineTo(avgPoints[i].x, avgPoints[i].y);
        }
        ctx.strokeStyle = '#43A047';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        const last = list[list.length - 1];
        const isUp = last.price >= (list[0]?.price || last.price);
        const color = isUp ? '#E53935' : '#43A047';
        const yLast = padding.top + ((high - last.price) / range) * chartH;
        ctx.fillStyle = color;
        ctx.fillRect(W - padding.right, yLast - 8, padding.right - 4, 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(last.price.toFixed(2), W - padding.right + 2, yLast + 4);

        const timeLabels = [0, Math.floor(list.length / 4), Math.floor(list.length / 2), Math.floor(list.length * 3 / 4), list.length - 1];
        ctx.fillStyle = '#9E9E9E';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        timeLabels.forEach(idx => {
          if (list[idx]) {
            const x = padding.left + slotW * idx;
            ctx.fillText(list[idx].time, x - 15, H - 10);
          }
        });
      });
  },

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

        const { high, low } = this.data.priceRange;
        const range = high - low || 1;
        const padding = { top: 20, bottom: 30, left: 10, right: 50 };
        const chartW = W - padding.left - padding.right;
        const chartH = H - padding.top - padding.bottom;
        const barW = Math.max(2, Math.floor(chartW / list.length * 0.6));
        const slotW = chartW / list.length;

        ctx.fillStyle = '#16213E';
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const y = padding.top + (chartH / 4) * i;
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(W - padding.right, y);
          ctx.stroke();
          const price = high - (range / 4) * i;
          ctx.fillStyle = '#9E9E9E';
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(price.toFixed(2), W - padding.right + 4, y + 3);
        }

        list.forEach((k, i) => {
          const x = padding.left + slotW * i + slotW / 2;
          const yOpen = padding.top + ((high - k.open) / range) * chartH;
          const yClose = padding.top + ((high - k.close) / range) * chartH;
          const yHigh = padding.top + ((high - k.high) / range) * chartH;
          const yLow = padding.top + ((high - k.low) / range) * chartH;

          const isUp = k.close >= k.open;
          const color = isUp ? '#E53935' : '#43A047';

          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, yHigh);
          ctx.lineTo(x, yLow);
          ctx.stroke();

          ctx.fillStyle = color;
          const bodyH = Math.max(1, Math.abs(yOpen - yClose));
          const bodyY = Math.min(yOpen, yClose);
          ctx.fillRect(x - barW / 2, bodyY, barW, bodyH);
        });

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