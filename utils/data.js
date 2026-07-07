// 数据处理工具函数

/**
 * 格式化数字，添加千分位分隔符
 */
function formatNumber(num, decimals = 2) {
  if (num == null || isNaN(num)) return '--';
  return Number(num).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 格式化金额（亿/万）
 */
function formatAmount(num) {
  if (num == null || isNaN(num)) return '--';
  if (num >= 100000000) {
    return (num / 100000000).toFixed(2) + '亿';
  } else if (num >= 10000) {
    return (num / 10000).toFixed(2) + '万';
  }
  return num.toFixed(2);
}

/**
 * 格式化市值
 */
function formatMarketCap(num) {
  if (num == null || isNaN(num)) return '--';
  if (num >= 10000) {
    return (num / 10000).toFixed(0) + '亿';
  }
  return num.toFixed(0) + '万';
}

/**
 * 格式化涨跌幅
 */
function formatChangePct(num, showSign = true) {
  if (num == null || isNaN(num)) return '--';
  const sign = num > 0 && showSign ? '+' : '';
  return sign + num.toFixed(2) + '%';
}

/**
 * 格式化成交量
 */
function formatVolume(num) {
  if (num == null || isNaN(num)) return '--';
  if (num >= 100000000) {
    return (num / 100000000).toFixed(2) + '亿手';
  } else if (num >= 10000) {
    return (num / 10000).toFixed(2) + '万手';
  }
  return num.toFixed(0) + '手';
}

/**
 * 格式化成交额
 */
function formatAmount2(num) {
  if (num == null || isNaN(num)) return '--';
  if (num >= 100000000) {
    return (num / 100000000).toFixed(2) + '亿';
  } else if (num >= 10000) {
    return (num / 10000).toFixed(2) + '万';
  }
  return num.toFixed(0);
}

/**
 * 格式化换手率
 */
function formatTurnoverRate(num) {
  if (num == null || isNaN(num)) return '--';
  return num.toFixed(2) + '%';
}

/**
 * 格式化时间
 */
function formatTime(timestamp, format = 'HH:mm') {
  const date = new Date(timestamp);
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  const second = date.getSeconds().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  if (format === 'HH:mm:ss') {
    return `${hour}:${minute}:${second}`;
  } else if (format === 'MM-DD') {
    return `${month}-${day}`;
  } else if (format === 'MM-DD HH:mm') {
    return `${month}-${day} ${hour}:${minute}`;
  }
  return `${hour}:${minute}`;
}

/**
 * 格式化日期
 */
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 获取涨跌颜色
 */
function getChangeColor(changePct) {
  if (changePct > 0) return '#E53935';
  if (changePct < 0) return '#43A047';
  return '#9E9E9E';
}

/**
 * 获取涨跌CSS类
 */
function getChangeClass(changePct) {
  if (changePct > 0) return 'up';
  if (changePct < 0) return 'down';
  return 'neutral';
}

/**
 * 获取排名CSS类
 */
function getRankClass(rank) {
  if (rank === 1) return 'rank-1';
  if (rank === 2) return 'rank-2';
  if (rank === 3) return 'rank-3';
  return 'rank-other';
}

/**
 * 计算综合得分（龙头评分公式）
 * 综合得分 = 市值得分×35% + 涨幅得分×35% + 成交额得分×15% + 热度得分×15%
 */
function calculateScore(stock, boardStats = {}) {
  // 市值得分
  const marketCapScore = Math.min((stock.marketCap || 0) / (boardStats.medianCap || 1), 1.5) * 100;
  
  // 涨幅得分（综合日、周、月涨幅）
  const changeScore = (
    (stock.dayChangePct || 0) + 
    (stock.weekChangePct || 0) * 0.75 + 
    (stock.monthChangePct || 0) * 0.5
  ) / 3 * 100;
  
  // 成交额得分
  const amountScore = Math.min((stock.amount || 0) / (boardStats.avgAmount || 1), 2) * 100;
  
  // 热度得分（搜索+研报+机构持仓）
  const heatScore = (
    (stock.searchHeat || 0) * 0.4 + 
    (stock.researchCoverage || 0) * 0.3 + 
    (stock.institutionHolding || 0) * 0.3
  );
  
  // 综合得分
  const totalScore = marketCapScore * 0.35 + changeScore * 0.35 + amountScore * 0.15 + heatScore * 0.15;
  
  return Math.round(totalScore * 100) / 100;
}

/**
 * 排序股票列表（按综合得分）
 */
function sortByScore(stocks, boardStats = {}) {
  return stocks.map(stock => ({
    ...stock,
    score: calculateScore(stock, boardStats)
  })).sort((a, b) => b.score - a.score);
}

/**
 * 筛选龙头股
 * 1. 排除ST/退市/停牌
 * 2. 市值>=门槛
 * 3. 按得分排序
 */
function filterLeaderStocks(stocks, options = {}) {
  const { minMarketCap = 0, excludeST = true } = options;
  
  return stocks
    .filter(stock => {
      // 排除ST
      if (excludeST && stock.name && stock.name.includes('ST')) {
        return false;
      }
      // 排除停牌
      if (stock.isSuspended) {
        return false;
      }
      // 市值门槛
      if (stock.marketCap < minMarketCap) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.marketCap - a.marketCap);
}

/**
 * 事件分类
 */
function categorizeEvent(event) {
  const keywords = {
    policy: ['政策', '规划', '方案', '意见', '通知', '决定', '条例'],
    finance: ['财报', '业绩', '营收', '利润', '同比增长', '扭亏'],
    order: ['中标', '签约', '订单', '合作', '合同'],
    tech: ['突破', '首发', '量产', '研发', '技术'],
    industry: ['展会', '论坛', '峰会', '行业'],
    international: ['制裁', '断供', '出口', '关税', '贸易']
  };
  
  const title = event.title || '';
  const summary = event.summary || '';
  const text = title + summary;
  
  for (const [type, words] of Object.entries(keywords)) {
    if (words.some(w => text.includes(w))) {
      return type;
    }
  }
  return 'other';
}

/**
 * 事件利好程度分级
 */
function getSentimentLevel(event) {
  const title = event.title || '';
  const summary = event.summary || '';
  const text = title + summary;
  
  // A级：国家级政策、重大订单
  if (text.includes('国务院') || text.includes('中央') || text.includes('财政部') || text.includes('重大')) {
    return 'A';
  }
  // B级：部委政策、亿元订单
  if (text.includes('工信部') || text.includes('证监会') || text.includes('亿') || text.includes('订单')) {
    return 'B';
  }
  // C级：公司公告、研报
  if (text.includes('公司') || text.includes('公告')) {
    return 'C';
  }
  // D级：其他
  return 'D';
}

/**
 * 关联事件与股票
 */
function relateEventToStocks(event, stocks) {
  const eventText = (event.title || '') + (event.summary || '');
  
  return stocks
    .map(stock => {
      let relevance = 0;
      
      // 直接提及
      if (eventText.includes(stock.name)) {
        relevance = 1.0;
      }
      // 业务关联（简化判断）
      else if (stock.conceptTags && stock.conceptTags.some(tag => eventText.includes(tag))) {
        relevance = 0.6;
      }
      
      return { ...stock, relevance };
    })
    .filter(stock => stock.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);
}

/**
 * 获取热点板块（按涨幅和热度）
 */
function getHotBoards(boards, options = {}) {
  const { minChangePct = 0, limit = 10 } = options;
  
  return boards
    .filter(b => b.changePct >= minChangePct)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, limit);
}

/**
 * 生成模拟数据（开发/测试用）
 */
function generateMockData(type, count = 10) {
  const mockStocks = [
    { code: '000001', name: '平安银行' },
    { code: '000002', name: '万科A' },
    { code: '000063', name: '中兴通讯' },
    { code: '000333', name: '美的集团' },
    { code: '000651', name: '格力电器' },
    { code: '000858', name: '五粮液' },
    { code: '600519', name: '贵州茅台' },
    { code: '600036', name: '招商银行' },
    { code: '601318', name: '中国平安' },
    { code: '601398', name: '工商银行' }
  ];
  
  const mockBoards = [
    { code: 'BK0001', name: '人工智能' },
    { code: 'BK0002', name: '新能源汽车' },
    { code: 'BK0003', name: '半导体' },
    { code: 'BK0004', name: '光伏' },
    { code: 'BK0005', name: '锂电池' },
    { code: 'BK0006', name: '储能' },
    { code: 'BK0007', name: '元宇宙' },
    { code: 'BK0008', name: '数字经济' },
    { code: 'BK0009', name: '云计算' },
    { code: 'BK0010', name: '网络安全' }
  ];
  
  const mockEvents = [
    { id: '1', title: '国务院发布AI发展新政', type: 'policy' },
    { id: '2', title: '某公司签订重大订单', type: 'order' },
    { id: '3', title: '工信部推动半导体产业发展', type: 'policy' },
    { id: '4', title: '某车企销量同比增长200%', type: 'finance' },
    { id: '5', title: '技术突破！国产芯片量产', type: 'tech' }
  ];
  
  const randomChange = () => (Math.random() - 0.5) * 20;
  const randomCap = () => Math.random() * 500 + 10;
  const randomVolume = () => Math.floor(Math.random() * 10000000);
  
  switch (type) {
    case 'stocks':
      return mockStocks.slice(0, count).map(s => ({
        ...s,
        lastPrice: (Math.random() * 100 + 10).toFixed(2),
        changePct: randomChange(),
        marketCap: randomCap() * 10000,
        volume: randomVolume()
      }));
    case 'boards':
      return mockBoards.slice(0, count).map(b => ({
        ...b,
        changePct: randomChange(),
        stockCount: Math.floor(Math.random() * 50 + 10),
        totalCap: randomCap() * 10000,
        floatCap: randomCap() * 5000
      }));
    case 'events':
      return mockEvents.slice(0, count).map((e, i) => ({
        ...e,
        time: Date.now() - i * 3600000,
        summary: '这是事件摘要内容...',
        sentimentLevel: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)]
      }));
    default:
      return [];
  }
}

// 导出所有工具函数
module.exports = {
  formatNumber,
  formatAmount,
  formatMarketCap,
  formatChangePct,
  formatVolume,
  formatAmount2,
  formatTurnoverRate,
  formatTime,
  formatDate,
  getChangeColor,
  getChangeClass,
  getRankClass,
  calculateScore,
  sortByScore,
  filterLeaderStocks,
  categorizeEvent,
  getSentimentLevel,
  relateEventToStocks,
  getHotBoards,
  generateMockData
};