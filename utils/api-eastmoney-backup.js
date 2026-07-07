// utils/api.js
// 东方财富 API - 数据请求封装（已对接真实接口）
// 数据源：push2.eastmoney.com / push2his.eastmoney.com
//
// ========== 字段单位约定 ===========
// 本文件中：
//   - /api/qt/stock/get（个股详情）：加 fltt=2&invt=2 返回真实小数
//   - /api/qt/ulist.np/get（批量）：带 fltt=2&invt=2 时返回真实小数，无需 ÷100
//   - /api/qt/clist/get（列表）：带 fltt=2&invt=2 时返回真实小数，无需 ÷100
//
// 所有列表接口统一使用 fltt=2&invt=2 返回真实小数，所以解析器不再 ÷100
// 个股接口（stock/get）保持原样返回整数，解析器统一 ÷100
//
// 实际含义：
//   价格类 (f43, f2, f15, f16, f17, f18)       -> 元
//   涨跌幅 (f170, f3, f7)                      -> 百分比 (如 10.5 表示 10.5%)
//   换手率 (f168, f8)                          -> 百分比
//   量比 (f50, f10)                            -> 比值 (如 1.5)
//   PE/PB (f162, f167, f9, f23)                -> 数值 (如 13.71)
//   成交额 (f48, f6)                           -> 元
//   成交量 (f47, f5)                           -> 手
//   总市值 (f116, f20)                         -> 元
//   流通市值 (f117, f21)                       -> 元
//   涨跌额 (f169, f4)                          -> 元

// ============ 基础配置 ============

// push2 实际部署在子域名上（1.push2 ~ 24.push2），裸域名可能被限流
// 这里随机选一个可用子域名，带 fallback
const PUSH_SUBDOMAINS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'];

// 运行时动态选择：启动时并发试拉，挑一个能用的记住
let _pushHost = null;
async function getPushHost() {
  if (_pushHost) return _pushHost;
  // 并发测试几个子域名
  const tests = PUSH_SUBDOMAINS.slice(0, 8).map(async (sub) => {
    try {
      const r = await new Promise((resolve) => {
        wx.request({
          url: `https://${sub}.push2.eastmoney.com/api/qt/stock/get?secid=1.000001&fields=f43`,
          method: 'GET',
          timeout: 3000,
          success: (res) => resolve(res.statusCode === 200),
          fail: () => resolve(false)
        });
      });
      return r ? `https://${sub}.push2.eastmoney.com` : null;
    } catch (e) { return null; }
  });
  const results = await Promise.all(tests);
  _pushHost = results.find(h => h) || 'https://push2.eastmoney.com';
  console.log('[API] push2 选用节点:', _pushHost);
  return _pushHost;
}

// 同步使用的 fallback（请求时才动态取）
const PUSH_HOST = 'https://push2.eastmoney.com';
const PUSH_HOST_BACKUP = 'https://1.push2.eastmoney.com';
const HIS_HOST = 'https://push2his.eastmoney.com';
const HIS_HOST_BACKUP = 'https://1.push2his.eastmoney.com';
const NOTICE_HOST = 'https://np-anotice-stock.eastmoney.com';

/**
 * 热门 A股字典（名称/代码/拼音/简称）
 * 用于本地搜索免依赖 searchapi
 */
const POPULAR_STOCKS = [
  // ===== 贵州茅台、五粮液等白酒 =====
  { code: '600519', name: '贵州茅台', pinyin: 'GZMT', abbr: '茅台', market: '沪A' },
  { code: '000858', name: '五粮液', pinyin: 'WLY', abbr: '五粮液', market: '深A' },
  { code: '000568', name: '泸州老窖', pinyin: 'LZLJ', abbr: '泸州老窖', market: '深A' },
  { code: '600809', name: '山西汾酒', pinyin: 'SXFJ', abbr: '汾酒', market: '沪A' },
  { code: '000596', name: '古井贡酒', pinyin: 'GJGJ', abbr: '古井贡酒', market: '深A' },
  { code: '600600', name: '青岛啤酒', pinyin: 'QDPJ', abbr: '青岛啤酒', market: '沪A' },

  // ===== 银行 =====
  { code: '601398', name: '工商银行', pinyin: 'GSYH', abbr: '工行', market: '沪A' },
  { code: '601939', name: '建设银行', pinyin: 'JSYH', abbr: '建行', market: '沪A' },
  { code: '601288', name: '农业银行', pinyin: 'NYYH', abbr: '农行', market: '沪A' },
  { code: '601988', name: '中国银行', pinyin: 'ZGYH', abbr: '中行', market: '沪A' },
  { code: '600036', name: '招商银行', pinyin: 'ZSYH', abbr: '招行', market: '沪A' },
  { code: '000001', name: '平安银行', pinyin: 'PAYH', abbr: '平安银行', market: '深A' },
  { code: '601166', name: '兴业银行', pinyin: 'XYYH', abbr: '兴业银行', market: '沪A' },
  { code: '600000', name: '浦发银行', pinyin: 'PFYH', abbr: '浦发', market: '沪A' },
  { code: '601328', name: '交通银行', pinyin: 'JTYH', abbr: '交行', market: '沪A' },
  { code: '601818', name: '光大银行', pinyin: 'GDYH', abbr: '光大银行', market: '沪A' },
  { code: '601658', name: '邮储银行', pinyin: 'YCYH', abbr: '邮储银行', market: '沪A' },
  { code: '601169', name: '北京银行', pinyin: 'BJYH', abbr: '北京银行', market: '沪A' },
  { code: '002142', name: '宁波银行', pinyin: 'NBYH', abbr: '宁波银行', market: '深A' },

  // ===== 保险/证券 =====
  { code: '601318', name: '中国平安', pinyin: 'ZGPA', abbr: '平安', market: '沪A' },
  { code: '601628', name: '中国人寿', pinyin: 'ZGRS', abbr: '国寿', market: '沪A' },
  { code: '601336', name: '新华保险', pinyin: 'XHBX', abbr: '新华保险', market: '沪A' },
  { code: '601601', name: '中国太保', pinyin: 'ZGTB', abbr: '太保', market: '沪A' },
  { code: '600030', name: '中信证券', pinyin: 'ZXZQ', abbr: '中信证券', market: '沪A' },
  { code: '601688', name: '华泰证券', pinyin: 'HTZQ', abbr: '华泰证券', market: '沪A' },
  { code: '600999', name: '招商证券', pinyin: 'ZSZQ', abbr: '招商证券', market: '沪A' },
  { code: '000166', name: '申万宏源', pinyin: 'SWHY', abbr: '申万宏源', market: '深A' },
  { code: '601066', name: '中信建投', pinyin: 'ZXJZ', abbr: '中信建投', market: '沪A' },
  { code: '002736', name: '国信证券', pinyin: 'GXZQ', abbr: '国信证券', market: '深A' },
  { code: '601995', name: '中国中金', pinyin: 'ZGZJ', abbr: '中金', market: '沪A' },

  // ===== 白马股/消费 =====
  { code: '000333', name: '美的集团', pinyin: 'MDJT', abbr: '美的', market: '深A' },
  { code: '000651', name: '格力电器', pinyin: 'GLDQ', abbr: '格力', market: '深A' },
  { code: '600887', name: '伊利股份', pinyin: 'YLGF', abbr: '伊利', market: '沪A' },
  { code: '600690', name: '海尔智家', pinyin: 'HEZJ', abbr: '海尔', market: '沪A' },
  { code: '000895', name: '双汇发展', pinyin: 'SHFZ', abbr: '双汇', market: '深A' },
  { code: '603288', name: '海天味业', pinyin: 'HTWY', abbr: '海天', market: '沪A' },

  // ===== 新能源车/锂电 =====
  { code: '300750', name: '宁德时代', pinyin: 'NDSF', abbr: '宁德', market: '深A' },
  { code: '002594', name: '比亚迪', pinyin: 'BYD', abbr: '比亚迪', market: '深A' },
  { code: '601127', name: '赛力斯', pinyin: 'SLS', abbr: '赛力斯', market: '沪A' },
  { code: '002460', name: '赣锋锂业', pinyin: 'GFLY', abbr: '赣锋锂业', market: '深A' },
  { code: '300014', name: '亿纬锂能', pinyin: 'YWLN', abbr: '亿纬锂能', market: '深A' },
  { code: '002074', name: '国轩高科', pinyin: 'GXGK', abbr: '国轩高科', market: '深A' },
  { code: '300037', name: '新宙邦', pinyin: 'XZB', abbr: '新宙邦', market: '深A' },
  { code: '002812', name: '恩捷股份', pinyin: 'EJGF', abbr: '恩捷股份', market: '深A' },
  { code: '600905', name: '三峡能源', pinyin: 'SXNY', abbr: '三峡能源', market: '沪A' },
  { code: '601012', name: '隆基绿能', pinyin: 'LJLY', abbr: '隆基', market: '沪A' },
  { code: '002129', name: 'TCL中环', pinyin: 'TCLZH', abbr: 'TCL中环', market: '深A' },
  { code: '002459', name: '晶澳科技', pinyin: 'JAKJ', abbr: '晶澳', market: '深A' },

  // ===== 半导体/科技 =====
  { code: '688981', name: '中芯国际', pinyin: 'ZXGJ', abbr: '中芯国际', market: '科创' },
  { code: '688041', name: '海光信息', pinyin: 'HGXX', abbr: '海光信息', market: '科创' },
  { code: '688256', name: '寒武纪', pinyin: 'HWJ', abbr: '寒武纪', market: '科创' },
  { code: '002230', name: '科大讯飞', pinyin: 'KDXF', abbr: '科大讯飞', market: '深A' },
  { code: '300033', name: '同花顺', pinyin: 'THS', abbr: '同花顺', market: '深A' },
  { code: '600588', name: '用友网络', pinyin: 'YYWL', abbr: '用友', market: '沪A' },
  { code: '600570', name: '恒生电子', pinyin: 'HSDZ', abbr: '恒生电子', market: '沪A' },
  { code: '002415', name: '海康威视', pinyin: 'HKWS', abbr: '海康威视', market: '深A' },
  { code: '000063', name: '中兴通讯', pinyin: 'ZYTX', abbr: '中兴通讯', market: '深A' },
  { code: '002475', name: '立讯精密', pinyin: 'LXJM', abbr: '立讯精密', market: '深A' },
  { code: '603501', name: '韦尔股份', pinyin: 'WEGF', abbr: '韦尔股份', market: '沪A' },
  { code: '002241', name: '歌尔股份', pinyin: 'GEGF', abbr: '歌尔股份', market: '深A' },
  { code: '000725', name: '京东方A', pinyin: 'JDFA', abbr: '京东方', market: '深A' },
  { code: '002371', name: '北方华创', pinyin: 'BFHC', abbr: '北方华创', market: '深A' },

  // ===== 医药 =====
  { code: '600276', name: '恒瑞医药', pinyin: 'HRYY', abbr: '恒瑞', market: '沪A' },
  { code: '000538', name: '云南白药', pinyin: 'YNBY', abbr: '云南白药', market: '深A' },
  { code: '600436', name: '片仔癀', pinyin: 'PZH', abbr: '片仔癀', market: '沪A' },
  { code: '000661', name: '长春高新', pinyin: 'CCGX', abbr: '长春高新', market: '深A' },
  { code: '300760', name: '迈瑞医疗', pinyin: 'MRYL', abbr: '迈瑞', market: '深A' },
  { code: '603259', name: '药明康德', pinyin: 'YMKD', abbr: '药明康德', market: '沪A' },
  { code: '300015', name: '爱尔眼科', pinyin: 'AEYK', abbr: '爱尔眼科', market: '深A' },

  // ===== 互联网/传媒 =====
  { code: '600519', name: '贵州茅台', pinyin: 'GZMT', abbr: '茅台', market: '沪A' },  // 重复占位忽略
  { code: '002602', name: '世纪华通', pinyin: 'SJHT', abbr: '世纪华通', market: '深A' },
  { code: '300413', name: '芒果超媒', pinyin: 'MGCM', abbr: '芒果', market: '深A' },
  { code: '002027', name: '分众传媒', pinyin: 'FZCM', abbr: '分众', market: '深A' },
  { code: '300251', name: '光线传媒', pinyin: 'GXCM', abbr: '光线', market: '深A' },

  // ===== 地产/基建 =====
  { code: '000002', name: '万科A', pinyin: 'WKA', abbr: '万科', market: '深A' },
  { code: '001979', name: '招商蛇口', pinyin: 'ZSSK', abbr: '招商蛇口', market: '深A' },
  { code: '600048', name: '保利发展', pinyin: 'BLFZ', abbr: '保利', market: '沪A' },
  { code: '600585', name: '海螺水泥', pinyin: 'HLSN', abbr: '海螺', market: '沪A' },
  { code: '601668', name: '中国建筑', pinyin: 'ZGJZ', abbr: '中国建筑', market: '沪A' },

  // ===== 军工/航空 =====
  { code: '600760', name: '中航沈飞', pinyin: 'ZHSF', abbr: '中航沈飞', market: '沪A' },
  { code: '600893', name: '航发动力', pinyin: 'HFDL', abbr: '航发动力', market: '沪A' },
  { code: '000768', name: '中航西飞', pinyin: 'ZHXF', abbr: '中航西飞', market: '深A' },
  { code: '600118', name: '中国卫星', pinyin: 'ZGWX', abbr: '中国卫星', market: '沪A' },
  { code: '600029', name: '南方航空', pinyin: 'NFHK', abbr: '南航', market: '沪A' },
  { code: '601111', name: '中国国航', pinyin: 'ZGGH', abbr: '国航', market: '沪A' },
  { code: '600115', name: '中国东航', pinyin: 'ZGDH', abbr: '东航', market: '沪A' },

  // ===== 工业/制造 =====
  { code: '601012', name: '隆基绿能', pinyin: 'LJLY', abbr: '隆基', market: '沪A' },
  { code: '600438', name: '通威股份', pinyin: 'TWGF', abbr: '通威', market: '沪A' },
  { code: '002714', name: '牧原股份', pinyin: 'MYGF', abbr: '牧原', market: '深A' },
  { code: '300498', name: '温氏股份', pinyin: 'WSGF', abbr: '温氏', market: '深A' },
  { code: '002311', name: '海大集团', pinyin: 'HDJT', abbr: '海大', market: '深A' },

  // ===== 主要指数 ETF =====
  { code: '510300', name: '沪深300ETF', pinyin: 'HS300ETF', abbr: '沪深300', market: '沪ETF' },
  { code: '510500', name: '中证500ETF', pinyin: 'ZZ500ETF', abbr: '中证500', market: '沪ETF' },
  { code: '159915', name: '创业板ETF', pinyin: 'CYBETF', abbr: '创业板', market: '深ETF' },
  { code: '588000', name: '科创50ETF', pinyin: 'KC50ETF', abbr: '科创50', market: '沪ETF' }
];

// 通用请求头（东方财富要求 Referer）
const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'Referer': 'https://quote.eastmoney.com/',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
};

// ============ 工具函数 ============

/**
 * 根据股票代码生成 secid
 * 沪市(6/9/5开头) -> 1.code
 * 深市(0/2/3开头) -> 0.code
 * 北交所(8/4开头) -> 0.code
 */
function toSecid(code) {
  code = String(code).padStart(6, '0');
  if (code.startsWith('6') || code.startsWith('9') || code.startsWith('5')) {
    return '1.' + code;
  }
  return '0.' + code;
}

/**
 * 批量 secid 拼接
 */
function toSecids(codes) {
  return codes.map(toSecid).join(',');
}

/**
 * push2 节点池
 * push2 的子域名（1-24）经常不稳定，这里提供多个候选节点自动重试
 */
const PUSH_NODE_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
let _pushNodeCursor = 0;       // 轮询游标
let _pushNodeCache = [];       // 已知可用节点缓存

/**
 * 下一个 push2 节点（轮询）
 */
function nextPushNode() {
  // 优先用缓存的可用节点
  if (_pushNodeCache.length > 0) {
    const node = _pushNodeCache[_pushNodeCursor % _pushNodeCache.length];
    _pushNodeCursor++;
    return `https://${node}.push2.eastmoney.com`;
  }
  // 随机起点轮询所有节点
  const node = PUSH_NODE_POOL[Math.floor(Math.random() * PUSH_NODE_POOL.length)];
  return `https://${node}.push2.eastmoney.com`;
}

/**
 * 标记某个节点可用，加入缓存
 */
function markPushNodeGood(sub) {
  if (!_pushNodeCache.includes(sub)) {
    _pushNodeCache.push(sub);
    console.log('[API] push2 节点加入缓存:', sub, '缓存大小:', _pushNodeCache.length);
  }
}

/**
 * 标记某个节点不可用，从缓存移除
 */
function markPushNodeBad(sub) {
  const idx = _pushNodeCache.indexOf(sub);
  if (idx > -1) {
    _pushNodeCache.splice(idx, 1);
    console.warn('[API] push2 节点移除:', sub, '缓存大小:', _pushNodeCache.length);
  }
}

/**
 * 通用 wx.request 封装
 * 自动处理 push2 节点轮询和重试
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    // 如果是 push2 URL，记录当前节点并做节点替换
    let currentNode = null;
    let isPushUrl = false;
    if (url.includes('push2.eastmoney.com')) {
      isPushUrl = true;
      // 提取当前子域名
      const m = url.match(/https?:\/\/(\d+)\.push2\.eastmoney\.com/);
      if (m) currentNode = parseInt(m[1]);
    }

    wx.request({
      url,
      method: options.method || 'GET',
      timeout: options.timeout || 8000,
      header: { ...COMMON_HEADERS, ...(options.header || {}) },
      data: options.data || {},
      success: (res) => {
        if (res.statusCode === 200) {
          if (isPushUrl && currentNode) markPushNodeGood(currentNode);
          resolve(res.data);
        } else {
          if (isPushUrl && currentNode) markPushNodeBad(currentNode);
          reject({ code: res.statusCode, message: '请求失败', url });
        }
      },
      fail: (err) => {
        if (isPushUrl && currentNode) markPushNodeBad(currentNode);
        reject({ code: -1, message: '网络异常', err, url });
      }
    });
  });
}

/**
 * 安全除以 100（处理价格/涨跌幅/换手率等需要 ÷100 的字段）
 * null/undefined/非数字 返回 null
 */
function div100(v) {
  if (v == null || v === '' || isNaN(Number(v))) return null;
  const n = Number(v);
  if (n === 0 && v !== 0) return null;  // null 被转为 0 的情况
  return n / 100;
}

/**
 * 保持原值（不需要 ÷100 的）
 */
function raw(v) {
  if (v == null || v === '' || isNaN(Number(v))) return null;
  return Number(v);
}

// ============ 数据解析器 ============

/**
 * 解析单只股票行情（/api/qt/stock/get）
 * 注意：stock/get 接口返回的字段是 ×100 的整数，需要 ÷100
 */
function parseStockQuote(data) {
  if (!data || !data.data || Object.keys(data.data).length === 0) return null;
  const d = data.data;
  return {
    code: d.f57,
    name: d.f58,
    lastPrice: div100(d.f43),
    highPrice: div100(d.f44),
    lowPrice: div100(d.f45),
    openPrice: div100(d.f46),
    preClose: div100(d.f60),
    volume: raw(d.f47),
    amount: raw(d.f48),
    quantityRatio: div100(d.f50),
    upperLimit: div100(d.f51),
    lowerLimit: div100(d.f52),
    marketCap: raw(d.f116),
    floatMarketCap: raw(d.f117),
    peTTM: div100(d.f162),
    peDynamic: div100(d.f167),
    turnoverRate: div100(d.f168),
    changeAmount: div100(d.f169),
    changePct: div100(d.f170),
    amplitude: div100(d.f171),
    mainNetInflow: raw(d.f191),
    largeNetInflow: raw(d.f192),
    market: d.f107,
    status: d.f111,
    updateTime: Date.now()
  };
}

/**
 * 解析列表数据中的股票（/api/qt/ulist.np/get 和 /api/qt/clist/get）
 * 注意：这两个接口都使用 fltt=2&invt=2，字段值已是真实小数，直接使用
 */
function parseListQuote(d) {
  return {
    code: d.f12,
    name: d.f14,
    lastPrice: raw(d.f2),
    changePct: raw(d.f3),
    changeAmount: raw(d.f4),
    volume: raw(d.f5),
    amount: raw(d.f6),
    amplitude: raw(d.f7),
    turnoverRate: raw(d.f8),
    peRatio: raw(d.f9),
    quantityRatio: raw(d.f10),
    highPrice: raw(d.f15),
    lowPrice: raw(d.f16),
    openPrice: raw(d.f17),
    preClose: raw(d.f18),
    marketCap: raw(d.f20),
    floatMarketCap: raw(d.f21),
    pbRatio: raw(d.f23),
    updateTime: Date.now()
  };
}

/**
 * 解析概念板块列表（/api/qt/clist/get, fs=m:90+t:2）
 * fltt=2&invt=2 下字段已是真实小数
 */
function parseConceptBoard(d) {
  return {
    code: d.f12,
    name: d.f14,
    changePct: raw(d.f3),
    changeAmount: raw(d.f4),
    stockCount: raw(d.f104),
    upCount: raw(d.f105),
    leaderName: d.f128,
    leaderCode: d.f140,
    leaderChangePct: raw(d.f141),
    totalAmount: raw(d.f6),
    updateTime: Date.now()
  };
}

/**
 * 解析公告
 */
function parseAnnouncement(item) {
  return {
    id: item.art_code,
    title: item.title || item.title_ch,
    time: item.display_time || item.notice_date,
    source: '上市公司公告',
    summary: '',
    type: 'announcement',
    relatedStocks: (item.codes || []).map(c => ({
      code: c.stock_code,
      name: c.short_name,
      market: c.market_code
    })),
    columns: (item.columns || []).map(c => c.column_name).join(' / '),
    sentimentLevel: 'C'
  };
}

// ============ API 类 ============

class EastMoneyAPI {
  constructor() {
    this.requestTimeout = 10000;
  }

  // ========== 股票行情 ==========

  /**
   * 获取单只股票实时行情
   * @param {string} stockCode - 6 位股票代码
   */
  async getQuote(stockCode) {
    try {
      const url = `${nextPushNode()}/api/qt/stock/get?secid=${toSecid(stockCode)}&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f57,f58,f60,f107,f111,f116,f117,f162,f167,f168,f169,f170,f171,f191,f192&fltt=2&invt=2`;
      const data = await request(url);
      return parseStockQuote(data);
    } catch (err) {
      console.error('[API] getQuote 失败:', stockCode, err);
      return null;
    }
  }

  /**
   * 批量获取多只股票行情
   * @param {string[]} stockCodes
   */
  async getQuotes(stockCodes) {
    if (!stockCodes || stockCodes.length === 0) return [];
    try {
      const fields = 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23';
      const url = `${nextPushNode()}/api/qt/ulist.np/get?secids=${toSecids(stockCodes)}&fields=${fields}&fltt=2&invt=2`;
      const data = await request(url);
      if (!data || !data.data || !data.data.diff) return [];
      const diff = data.data.diff;
      return (Array.isArray(diff) ? diff : Object.values(diff)).map(parseListQuote);
    } catch (err) {
      console.error('[API] getQuotes 失败:', err);
      return [];
    }
  }

  /**
   * 获取大盘指数行情（上证、深证、创业板、科创板等）
   * @param {string} indexCode - 指数代码 如 000001(上证) 399001(深证) 399006(创业板) 000688(科创板) 899050(北证50)
   */
  async getIndexQuote(indexCode = '000001') {
    const secid = indexCode.startsWith('3') ? `0.${indexCode}` : `1.${indexCode}`;
    try {
      const url = `${nextPushNode()}/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170,f171&fltt=2&invt=2`;
      const data = await request(url);
      const result = parseStockQuote(data);
      if (result) result.isIndex = true;
      return result;
    } catch (err) {
      console.error('[API] getIndexQuote 失败:', indexCode, err);
      return null;
    }
  }

  /**
   * 获取主要指数（上证、深证、创业板、科创板、北证50）
   */
  async getMainIndices() {
    const codes = ['000001', '399001', '399006', '000688'];
    const promises = codes.map(code => this.getIndexQuote(code));
    // 北证50 secid 是 0.899050，单独处理
    promises.push(
      request(`${nextPushNode()}/api/qt/stock/get?secid=0.899050&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f116,f117,f169,f170,f171&fltt=2&invt=2`)
        .then(data => {
          const q = parseStockQuote(data);
          if (q) q.isIndex = true;
          return q;
        })
        .catch(() => null)
    );
    const results = await Promise.all(promises);
    return results.filter(Boolean);
  }

  /**
   * 沪深A股涨跌幅榜 / 涨停股列表
   * @param {object} options - { limit, sortField, asc, market }
   */
  async getStockRank(options = {}) {
    const { limit = 30, sortField = 'f3', asc = false, market = 'all' } = options;
    let fs;
    if (market === 'sh') fs = 'm:0+t:6,m:0+t:80';
    else if (market === 'sz') fs = 'm:1+t:2,m:1+t:23';
    else if (market === 'bj') fs = 'm:0+t:81,m:1+t:82';
    else fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23';

    const po = asc ? 2 : 1;
    const fields = 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23';
    try {
      const url = `${nextPushNode()}/api/qt/clist/get?pn=1&pz=${limit}&po=${po}&fid=${sortField}&fs=${encodeURIComponent(fs)}&fields=${fields}&fltt=2&invt=2`;
      const data = await request(url);
      if (!data || !data.data || !data.data.diff) return [];
      const diff = data.data.diff;
      return (Array.isArray(diff) ? diff : Object.values(diff)).map(parseListQuote);
    } catch (err) {
      console.error('[API] getStockRank 失败:', err);
      return [];
    }
  }

  /**
   * 获取涨幅榜 TOP N（按涨幅倒序）
   */
  async getTopGainers(limit = 30, market = 'all') {
    return this.getStockRank({ limit, sortField: 'f3', asc: false, market });
  }

  /**
   * 获取跌幅榜 TOP N（按涨幅正序）
   */
  async getTopLosers(limit = 30, market = 'all') {
    return this.getStockRank({ limit, sortField: 'f3', asc: true, market });
  }

  /**
   * 获取涨停股列表（涨幅≥9.5%）
   */
  async getLimitUpStocks(limit = 50) {
    const all = await this.getTopGainers(limit);
    return all.filter(s => (s.changePct || 0) >= 9.5);
  }

  /**
   * 获取跌停股列表（涨幅≤-9.5%）
   */
  async getLimitDownStocks(limit = 50) {
    const all = await this.getTopLosers(limit);
    return all.filter(s => (s.changePct || 0) <= -9.5);
  }

  // ========== 板块相关 ==========

  /**
   * 获取概念板块列表（涨幅排行）
   * @param {number} limit
   */
  async getConceptBoards(limit = 50) {
    try {
      const fields = 'f2,f3,f4,f6,f12,f14,f104,f105,f128,f140,f141';
      const url = `${nextPushNode()}/api/qt/clist/get?pn=1&pz=${limit}&po=1&fid=f3&fs=${encodeURIComponent('m:90+t:2')}&fields=${fields}&fltt=2&invt=2`;
      const data = await request(url);
      if (!data || !data.data || !data.data.diff) return [];
      const diff = data.data.diff;
      return (Array.isArray(diff) ? diff : Object.values(diff)).map(parseConceptBoard);
    } catch (err) {
      console.error('[API] getConceptBoards 失败:', err);
      return [];
    }
  }

  /**
   * 获取行业板块列表
   */
  async getIndustryBoards(limit = 50) {
    try {
      const fields = 'f2,f3,f4,f6,f12,f14,f104,f105,f128,f140,f141';
      const url = `${nextPushNode()}/api/qt/clist/get?pn=1&pz=${limit}&po=1&fid=f3&fs=${encodeURIComponent('m:90+t:1')}&fields=${fields}&fltt=2&invt=2`;
      const data = await request(url);
      if (!data || !data.data || !data.data.diff) return [];
      const diff = data.data.diff;
      return (Array.isArray(diff) ? diff : Object.values(diff)).map(parseConceptBoard);
    } catch (err) {
      console.error('[API] getIndustryBoards 失败:', err);
      return [];
    }
  }

  /**
   * 板块涨幅榜（与 getConceptBoards 同义，保留向后兼容）
   */
  async getBoardRank(limit = 30) {
    return this.getConceptBoards(limit);
  }

  /**
   * 获取板块详情 + 成分股
   * @param {string} boardCode - BKxxxx
   * @param {number} limit - 成分股数量
   */
  async getBoardDetail(boardCode, limit = 50) {
    try {
      const fields = 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23';
      const url = `${nextPushNode()}/api/qt/clist/get?pn=1&pz=${limit}&po=1&fid=f3&fs=${encodeURIComponent('b:' + boardCode + '+f:!2')}&fields=${fields}&fltt=2&invt=2`;
      const data = await request(url);
      let stocks = [];
      let totalCount = 0;
      if (data && data.data && data.data.diff) {
        const diff = data.data.diff;
        stocks = (Array.isArray(diff) ? diff : Object.values(diff)).map(parseListQuote);
        totalCount = data.data.total || stocks.length;
      }
      // 同时获取板块自身行情
      const boardInfo = await this.getBoardQuote(boardCode);
      // 从板块自身行情取成分股数量（fallback）
      const stockCount = (boardInfo && boardInfo.stockCount && boardInfo.stockCount > 0)
        ? boardInfo.stockCount : totalCount;
      if (boardInfo) {
        boardInfo.stockCount = stockCount;
      }
      return { board: boardInfo, stocks, totalCount };
    } catch (err) {
      console.error('[API] getBoardDetail 失败:', boardCode, err);
      return { board: null, stocks: [], totalCount: 0 };
    }
  }

  /**
   * 获取板块本身行情（作为特殊股票看待）
   * 板块 secid 格式: 90.BKxxxx
   */
  async getBoardQuote(boardCode) {
    try {
      const secid = '90.' + boardCode;
      const url = `${nextPushNode()}/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f104,f105,f116,f128,f140,f141,f168,f169,f170,f171&fltt=2&invt=2`;
      const data = await request(url);
      if (!data || !data.data || Object.keys(data.data).length === 0) return null;
      const d = data.data;
      return {
        code: boardCode,
        name: d.f58,
        lastPrice: div100(d.f43),
        changePct: div100(d.f170),
        changeAmount: div100(d.f169),
        amount: raw(d.f48),
        volume: raw(d.f47),
        highPrice: div100(d.f44),
        lowPrice: div100(d.f45),
        openPrice: div100(d.f46),
        preClose: div100(d.f60),
        stockCount: raw(d.f104),
        upCount: raw(d.f105),
        leaderName: d.f128,
        leaderCode: d.f140,
        leaderChangePct: div100(d.f141),
        amplitude: div100(d.f171),
        turnoverRate: div100(d.f168),
        marketCap: raw(d.f116),
        isBoard: true,
        updateTime: Date.now()
      };
    } catch (err) {
      console.error('[API] getBoardQuote 失败:', boardCode, err);
      return null;
    }
  }

  // ========== 搜索 ==========

  /**
   * 搜索股票（在沪深A股 TOP 500 内按名称/代码模糊匹配）
   * @param {string} keyword
   */
  /**
   * 搜索股票
   * 策略：
   *   1. 纯数字代码（如 600519）→ 直接当股票代码查行情
   *   2. 中文/拼音 → 先查本地热门股字典，再试 searchapi
   * @param {string} keyword
   */
  async searchStock(keyword) {
    if (!keyword) return [];
    const kw = String(keyword).trim();
    if (!kw) return [];

    // 策略 1: 纯数字代码 → 直接查行情
    if (/^\d{6}$/.test(kw)) {
      try {
        const quote = await this.getQuote(kw);
        if (quote) {
          return [{
            code: quote.code,
            name: quote.name,
            market: quote.market === 1 ? '沪A' : '深A',
            secid: toSecid(kw),
            lastPrice: quote.lastPrice,
            changePct: quote.changePct
          }];
        }
      } catch (e) {}
      return [];
    }

    // 策略 2: 本地热门股字典（不依赖网络）
    const localHits = this._searchLocalStocks(kw);
    if (localHits.length > 0) {
      // 补上行情
      try {
        const codes = localHits.map(s => s.code);
        const quotes = await this.getQuotes(codes);
        const quotesMap = {};
        quotes.forEach(q => { quotesMap[q.code] = q; });
        return localHits.map(s => {
          const q = quotesMap[s.code] || {};
          return { ...s, lastPrice: q.lastPrice, changePct: q.changePct };
        });
      } catch (e) {
        return localHits;
      }
    }

    // 策略 3: searchapi（需域名白名单）
    try {
      const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(kw)}&type=14&count=20&preHintCount=2`;
      const data = await request(url, {
        header: { 'Referer': 'https://www.eastmoney.com/' }
      });
      if (data && data.QuotationCodeTable && data.QuotationCodeTable.Data) {
        const results = data.QuotationCodeTable.Data;
        const codes = results.map(r => r.Code).filter(c => /^\d{6}$/.test(c));
        let quotesMap = {};
        if (codes.length > 0) {
          try {
            const quotes = await this.getQuotes(codes);
            quotes.forEach(q => { quotesMap[q.code] = q; });
          } catch (e) {}
        }
        return results.map(r => {
          const q = quotesMap[r.Code] || {};
          return {
            code: r.Code,
            name: r.Name,
            pinyin: r.PinYin,
            market: r.SecurityTypeName,
            secid: r.QuoteID,
            lastPrice: q.lastPrice,
            changePct: q.changePct
          };
        });
      }
    } catch (err) {
      // searchapi 不可用，静默失败
    }

    return [];
  }

  /**
   * 本地搜索（热门 A股 字典，含名称/代码/拼音）
   */
  _searchLocalStocks(keyword) {
    const kw = String(keyword).trim();
    if (!kw) return [];
    const kwLower = kw.toLowerCase();
    const matches = POPULAR_STOCKS.filter(s => {
      if (s.code === kw) return true;
      if (s.name && s.name.includes(kw)) return true;
      if (s.pinyin && s.pinyin.toLowerCase().includes(kwLower)) return true;
      if (s.abbr && s.abbr.includes(kw)) return true;
      return false;
    }).slice(0, 20);
    return matches.map(s => ({
      code: s.code,
      name: s.name,
      market: s.market,
      secid: toSecid(s.code)
    }));
  }

  // ========== K线 ==========

  /**
   * 获取K线数据
   * @param {string} stockCode
   * @param {string|number} kType - day|week|month|60|30|15|5|1
   * @param {number} limit
   */
  async getKLine(stockCode, kType = 'day', limit = 100) {
    const kltMap = {
      'day': 101, 'week': 102, 'month': 103, 'quarter': 104,
      '60': 60, '30': 30, '15': 15, '5': 5, '1': 1
    };
    const klt = typeof kType === 'number' ? kType : (kltMap[kType] || 101);
    // 计算 beg/end（默认取近 5 年）
    const endDate = new Date();
    const begDate = new Date();
    begDate.setFullYear(endDate.getFullYear() - 5);
    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
    try {
      const fields1 = 'f1,f2,f3,f4,f5,f6';
      const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';
      const url = `${HIS_HOST_BACKUP}/api/qt/stock/kline/get?secid=${toSecid(stockCode)}&fields1=${fields1}&fields2=${fields2}&klt=${klt}&fqt=1&beg=${fmt(begDate)}&end=${fmt(endDate)}&lmt=${limit}`;
      const data = await request(url);
      if (!data || !data.data || !data.data.klines) return [];
      return data.data.klines.map(line => {
        const parts = line.split(',');
        return {
          date: parts[0],
          open: div100(parts[1]),
          close: div100(parts[2]),
          high: div100(parts[3]),
          low: div100(parts[4]),
          volume: raw(parts[5]),
          amount: raw(parts[6]),
          amplitude: div100(parts[7]),
          changePct: div100(parts[8]),
          changeAmount: div100(parts[9]),
          turnoverRate: div100(parts[10])
        };
      });
    } catch (err) {
      console.error('[API] getKLine 失败:', stockCode, kType, err);
      return [];
    }
  }

  // ========== 资金流向 ==========

  /**
   * 获取个股资金流向
   * 数据源：push2.eastmoney.com /api/qt/stock/get 字段 f191-f197
   *   f191 = 主力净流入（亿元）
   *   f192 = 大单净流入（手）
   *   f193 = 特大单净流入占比（%）
   *   f194 = 大单净流入占比（%）
   *   f195 = 中单净流入占比（%）
   *   f196 = 小单净流入占比（%）
   *   f197 = 主力净流入占比（%）
   * 注：东方财富 fflow/daykline 接口已下架，这里直接用 stock/get 的 f191
   * @param {string} stockCode
   * @param {number} days - 历史天数（实际只返回当日数据）
   */
  async getCapitalFlow(stockCode, days = 30) {
    try {
      const url = `${nextPushNode()}/api/qt/stock/get?secid=${toSecid(stockCode)}&fields=f43,f57,f58,f60,f170,f191,f192,f193,f194,f195,f196,f197&fltt=2&invt=2`;
      const data = await request(url);
      if (!data || !data.data || Object.keys(data.data).length === 0) {
        return { code: stockCode, today: null, summary: {}, source: 'unavailable' };
      }
      const d = data.data;
      const today = {
        code: d.f57,
        name: d.f58,
        closePrice: d.f60,
        changePct: d.f170,
        mainNetInflow: d.f191,       // 主力净流入（亿元）
        largeNetInflow: d.f192,      // 大单净流入（手）
        superLargePct: d.f193,       // 特大单净流入占比(%)
        largePct: d.f194,            // 大单净流入占比(%)
        mediumPct: d.f195,           // 中单净流入占比(%)
        smallPct: d.f196,            // 小单净流入占比(%)
        mainPct: d.f197,             // 主力净流入占比(%)
        date: new Date().toISOString().slice(0, 10)
      };
      return {
        code: stockCode,
        today,
        summary: {
          mainNetInflow: d.f191,
          mainPct: d.f197
        },
        source: 'eastmoney',
        note: '东方财富 stock/get 仅提供当日资金流向，历史数据需结合其他接口'
      };
    } catch (err) {
      console.error('[API] getCapitalFlow 失败:', stockCode, err);
      return null;
    }
  }

  // ========== 事件/资讯 ==========

  /**
   * 获取热点事件（基于实时市场数据生成）
   * 注：东方财富没有公开的事件聚合接口，这里用市场实时数据推断
   */
  async getEvents(type = 'all', limit = 20) {
    try {
      const stocks = await this.getLimitUpStocks(20);
      return stocks.slice(0, limit).map((s, i) => ({
        id: 'evt_' + s.code + '_' + Date.now() + '_' + i,
        title: `${s.name}(${s.code}) 涨幅 ${(s.changePct || 0).toFixed(2)}%`,
        time: new Date().toLocaleString('zh-CN'),
        source: '市场实时数据',
        summary: `当前价${(s.lastPrice || 0).toFixed(2)}元，成交量${s.volume || 0}手`,
        type: 'market',
        relatedStocks: [{ code: s.code, name: s.name }],
        sentimentLevel: (s.changePct || 0) >= 9.5 ? 'A' : 'B'
      }));
    } catch (err) {
      console.error('[API] getEvents 失败:', err);
      return [];
    }
  }

  /**
   * 获取个股公告（东方财富官方接口）
   * @param {string} stockCode
   * @param {number} pageSize
   */
  async getStockAnnouncements(stockCode, pageSize = 20) {
    try {
      const url = `${NOTICE_HOST}/api/security/ann?sr=-1&page_size=${pageSize}&page_index=1&ann_type=A&client_source=web&stock_list=${stockCode}`;
      const data = await request(url);
      if (!data || !data.data || !data.data.list) return [];
      return data.data.list.map(parseAnnouncement);
    } catch (err) {
      console.error('[API] getStockAnnouncements 失败:', stockCode, err);
      return [];
    }
  }

  /**
   * 获取个股所属概念
   * 注：东方财富没有公开的"个股→概念"映射接口，需要后端聚合
   * 这里返回空数组，建议后端实现
   */
  async getStockConcepts(stockCode) {
    // TODO: 后端聚合
    return [];
  }

  // ========== 综合查询（用于首页） ==========

  /**
   * 首页综合数据：主要指数 + 热点板块 + 涨停股
   */
  async getOverview() {
    try {
      const [indices, hotBoards, limitUp] = await Promise.all([
        this.getMainIndices(),
        this.getConceptBoards(10),
        this.getLimitUpStocks(10)
      ]);
      return { indices, hotBoards, limitUp };
    } catch (err) {
      console.error('[API] getOverview 失败:', err);
      return { indices: [], hotBoards: [], limitUp: [] };
    }
  }
}

// 导出 API 实例和工具函数
const api = new EastMoneyAPI();

module.exports = {
  api,                    // API 实例
  default: api,           // 默认导出
  toSecid,                // 工具：生成 secid
  toSecids,               // 工具：批量 secid
  parseStockQuote,        // 工具：解析单只股票
  parseListQuote,         // 工具：解析列表股票
  parseConceptBoard,      // 工具：解析板块
  EastMoneyAPI            // 类（方便 new 实例）
};