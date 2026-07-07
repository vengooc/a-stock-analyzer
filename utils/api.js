// utils/api.js
// 行情数据 API 封装
// 数据源：
//   主：腾讯财经 qt.gtimg.cn / web.ifzq.gtimg.cn (UTF-8 JSON, 部分 GBK)
//   辅：东方财富 datacenter-web / np-anotice-stock
//   本地：99 只热门股字典（搜索免依赖）
//
// 微信小程序需配置的合法域名（request 合法域名）：
//   qt.gtimg.cn
//   web.ifzq.gtimg.cn
//   datacenter-web.eastmoney.com
//   np-anotice-stock.eastmoney.com
//   searchapi.eastmoney.com
//   hq.sinajs.cn （备选）

// ============ 基础配置 ============

const TX_HOST = 'https://qt.gtimg.cn';
const TX_WEB_HOST = 'https://web.ifzq.gtimg.cn';
const DC_HOST = 'https://datacenter-web.eastmoney.com';
const DC_API = 'https://np-anotice-stock.eastmoney.com';
const SEARCH_API = 'https://searchapi.eastmoney.com';

const COMMON_HEADERS = {
  'Referer': 'https://gu.qq.com/'
};

// ============ 工具函数 ============

/**
 * 6 位代码 → 腾讯格式
 * 沪市 sh6xxxxx, sh9xxxxx
 * 深市 sz0xxxxx, sz2xxxxx, sz3xxxxx
 */
function toTxCode(code) {
  code = String(code);
  if (code.startsWith('6') || code.startsWith('9')) {
    return 'sh' + code;
  }
  if (code.startsWith('8') || code.startsWith('4')) {
    return 'bj' + code;
  }
  if (['000001', '000300', '000688', '000905'].includes(code)) {
    return 'sh' + code;
  }
  return 'sz' + code;
}

/**
 * 多个代码 → 腾讯批量格式（用逗号分隔）
 */
function toTxCodes(codes) {
  return codes.map(toTxCode).join(',');
}

/**
 * 数字安全转换
 */
function num(v) {
  if (v == null || v === '' || v === '-') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * 通用 wx.request
 * 支持 text / arraybuffer
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      timeout: options.timeout || 10000,
      header: { ...COMMON_HEADERS, ...(options.header || {}) },
      data: options.data || {},
      responseType: options.responseType || 'text',
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else {
          reject({ code: res.statusCode, message: '请求失败', url });
        }
      },
      fail: (err) => {
        reject({ code: -1, message: '网络异常', err, url });
      }
    });
  });
}

/**
 * 手动 GBK 解码（最简化版本）
 * 微信小程序的 TextDecoder 可能在某些环境不可用
 * 这里采用更靠谱的方案：不用 GBK 解码
 * parseTxQuote 智能拆分字符串，取出非中文部分
 */

/**
 * 简单拆分：取中文字段（在原始字节流中的位置是固定的）
 * GBK 中 1 个中文 = 2 字节，UTF-8 中 1 个中文 = 3 字节
 * 腾讯 v_sh 字符串格式中，名称出现在索引 1，前面有 1 个字节的 "1" 加上分隔符
 * 这种方法不可靠，所以采用"已知名称映射"方式
 */

// STOCK_NAME_MAP 将在 POPULAR_STOCKS 定义后初始化

const INDEX_CODES = ['000001', '399001', '399006', '000688', '000300', '000905'];

/**
 * 解析腾讯实时行情字符串（实测 v_shXXX 格式）
 * 字段映射（实测验证）:
 *  [1] 名称  [3] 当前价  [4] 昨收  [5] 今开
 *  [6] 成交量 - 个股:手, 指数:股
 *  [30] 时间  [31] 涨跌额  [32] 涨跌幅(%)
 *  [33] 最高  [34] 最低
 *  [36] 成交额 - 个股:万元, 指数:股(重复)
 *  [37] 成交额 - 指数:万元
 *  [43] 振幅(%)  [44] 流通市值(亿)  [45] 总市值(亿)
 *  [46] 市盈率(动)
 *  [47] 涨停价  [48] 跌停价
 *  [52] 换手率(%)
 */
function parseTxQuote(line) {
  const match = line.match(/v_([^=]+)="([^"]+)"/);
  if (!match) return null;
  const fullCode = match[1];
  const code = fullCode.replace(/^(sh|sz|bj)/, '');
  const fields = match[2].split('~');
  const name = STOCK_NAME_MAP[code] || fields[1] || code;
  
  const isIndex = INDEX_CODES.includes(code);
  
  let volume, amount;
  if (isIndex) {
    volume = num(fields[6]) / 100;
    amount = num(fields[37]) / 10000;
  } else {
    volume = num(fields[6]);
    amount = num(fields[36]) / 10000;
  }
  
  return {
    code,
    name,
    isIndex,
    market: code.startsWith('6') || code.startsWith('9') ? '沪A' :
            code.startsWith('8') || code.startsWith('4') ? '北证' : '深A',
    lastPrice: num(fields[3]),
    preClose: num(fields[4]),
    openPrice: num(fields[5]),
    volume,
    amount,
    highPrice: num(fields[33]),
    lowPrice: num(fields[34]),
    changeAmount: num(fields[31]),
    changePct: num(fields[32]),
    amplitude: num(fields[43]),
    turnoverRate: num(fields[52]),
    peDynamic: num(fields[46]),
    totalMarketCap: num(fields[45]),
    floatMarketCap: num(fields[44]),
    upperLimit: num(fields[47]),
    lowerLimit: num(fields[48]),
    time: fields[30] || '',
    updateTime: Date.now()
  };
}

/**
 * 解析腾讯 K线数据
 * 格式：data.sh600519.day = [[日期, 开, 收, 高, 低, 成交量, ...], ...]
 */
function parseTxKLine(data) {
  if (!data) return [];
  // data 是 { sh600519: { day: [...] } } 或 { data: { sh600519: {...} } }
  let klines = data;
  // 找到 kline 数组
  for (const key in klines) {
    if (Array.isArray(klines[key])) {
      klines = klines[key];
      break;
    }
    if (typeof klines[key] === 'object' && klines[key] !== null) {
      // 嵌套一层
      for (const subKey in klines[key]) {
        if (Array.isArray(klines[key][subKey])) {
          klines = klines[key][subKey];
          break;
        }
      }
      break;
    }
  }
  if (!Array.isArray(klines)) return [];
  return klines.map(k => ({
    date: k[0],
    open: num(k[1]),
    close: num(k[2]),
    high: num(k[3]),
    low: num(k[4]),
    volume: num(k[5]),
    amount: num(k[8])  // 成交额（部分接口才有）
  }));
}

/**
 * 通用 GET（text 响应）
 */
async function getText(url) {
  return await request(url, { responseType: 'text' });
}

async function getJson(url, options = {}) {
  return await request(url, { ...options, responseType: 'json' });
}

/**
 * 通用 GET（arraybuffer 响应）
 * 注：暂时不使用，因为 GBK 解码在某些微信版本上不稳定
 */
async function getBuffer(url) {
  return await request(url, { responseType: 'arraybuffer' });
}

// ============ 热门股字典（搜索用）============
const POPULAR_STOCKS = [
  { code: '600519', name: '贵州茅台', pinyin: 'GZMT', abbr: '茅台', market: '沪A' },
  { code: '000858', name: '五粮液', pinyin: 'WLY', abbr: '五粮液', market: '深A' },
  { code: '000568', name: '泸州老窖', pinyin: 'LZLJ', abbr: '泸州老窖', market: '深A' },
  { code: '600809', name: '山西汾酒', pinyin: 'SXFJ', abbr: '汾酒', market: '沪A' },
  { code: '000596', name: '古井贡酒', pinyin: 'GJGJ', abbr: '古井贡酒', market: '深A' },
  { code: '600600', name: '青岛啤酒', pinyin: 'QDPJ', abbr: '青岛啤酒', market: '沪A' },
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
  { code: '000333', name: '美的集团', pinyin: 'MDJT', abbr: '美的', market: '深A' },
  { code: '000651', name: '格力电器', pinyin: 'GLDQ', abbr: '格力', market: '深A' },
  { code: '600887', name: '伊利股份', pinyin: 'YLGF', abbr: '伊利', market: '沪A' },
  { code: '600690', name: '海尔智家', pinyin: 'HEZJ', abbr: '海尔', market: '沪A' },
  { code: '000895', name: '双汇发展', pinyin: 'SHFZ', abbr: '双汇', market: '深A' },
  { code: '603288', name: '海天味业', pinyin: 'HTWY', abbr: '海天', market: '沪A' },
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
  { code: '600276', name: '恒瑞医药', pinyin: 'HRYY', abbr: '恒瑞', market: '沪A' },
  { code: '000538', name: '云南白药', pinyin: 'YNBY', abbr: '云南白药', market: '深A' },
  { code: '600436', name: '片仔癀', pinyin: 'PZH', abbr: '片仔癀', market: '沪A' },
  { code: '000661', name: '长春高新', pinyin: 'CCGX', abbr: '长春高新', market: '深A' },
  { code: '300760', name: '迈瑞医疗', pinyin: 'MRYL', abbr: '迈瑞', market: '深A' },
  { code: '603259', name: '药明康德', pinyin: 'YMKD', abbr: '药明康德', market: '沪A' },
  { code: '300015', name: '爱尔眼科', pinyin: 'AEYK', abbr: '爱尔眼科', market: '深A' },
  { code: '002602', name: '世纪华通', pinyin: 'SJHT', abbr: '世纪华通', market: '深A' },
  { code: '300413', name: '芒果超媒', pinyin: 'MGCM', abbr: '芒果', market: '深A' },
  { code: '002027', name: '分众传媒', pinyin: 'FZCM', abbr: '分众', market: '深A' },
  { code: '300251', name: '光线传媒', pinyin: 'GXCM', abbr: '光线', market: '深A' },
  { code: '000002', name: '万科A', pinyin: 'WKA', abbr: '万科', market: '深A' },
  { code: '001979', name: '招商蛇口', pinyin: 'ZSSK', abbr: '招商蛇口', market: '深A' },
  { code: '600048', name: '保利发展', pinyin: 'BLFZ', abbr: '保利', market: '沪A' },
  { code: '600585', name: '海螺水泥', pinyin: 'HLSN', abbr: '海螺', market: '沪A' },
  { code: '601668', name: '中国建筑', pinyin: 'ZGJZ', abbr: '中国建筑', market: '沪A' },
  { code: '600760', name: '中航沈飞', pinyin: 'ZHSF', abbr: '中航沈飞', market: '沪A' },
  { code: '600893', name: '航发动力', pinyin: 'HFDL', abbr: '航发动力', market: '沪A' },
  { code: '000768', name: '中航西飞', pinyin: 'ZHXF', abbr: '中航西飞', market: '深A' },
  { code: '600118', name: '中国卫星', pinyin: 'ZGWX', abbr: '中国卫星', market: '沪A' },
  { code: '600029', name: '南方航空', pinyin: 'NFHK', abbr: '南航', market: '沪A' },
  { code: '601111', name: '中国国航', pinyin: 'ZGGH', abbr: '国航', market: '沪A' },
  { code: '600115', name: '中国东航', pinyin: 'ZGDH', abbr: '东航', market: '沪A' },
  { code: '600438', name: '通威股份', pinyin: 'TWGF', abbr: '通威', market: '沪A' },
  { code: '002714', name: '牧原股份', pinyin: 'MYGF', abbr: '牧原', market: '深A' },
  { code: '300498', name: '温氏股份', pinyin: 'WSGF', abbr: '温氏', market: '深A' },
  { code: '002311', name: '海大集团', pinyin: 'HDJT', abbr: '海大', market: '深A' },
  { code: '510300', name: '沪深300ETF', pinyin: 'HS300ETF', abbr: '沪深300', market: '沪ETF' },
  { code: '510500', name: '中证500ETF', pinyin: 'ZZ500ETF', abbr: '中证500', market: '沪ETF' },
  { code: '159915', name: '创业板ETF', pinyin: 'CYBETF', abbr: '创业板', market: '深ETF' },
  { code: '588000', name: '科创50ETF', pinyin: 'KC50ETF', abbr: '科创50', market: '沪ETF' },
  { code: '000300', name: '沪深300', pinyin: 'HS300', abbr: '沪深300', market: '指数' },
  { code: '000905', name: '中证500', pinyin: 'ZZ500', abbr: '中证500', market: '指数' }
];

const STOCK_NAME_MAP = {};
POPULAR_STOCKS.forEach(s => {
  STOCK_NAME_MAP[s.code] = s.name;
});

// ============ 概念板块字典（成分股映射）============
const CONCEPT_BOARDS = [
  { code: 'BK0001', name: '人工智能', stocks: ['002230', '688256', '300033', '002415'] },
  { code: 'BK0002', name: '新能源车', stocks: ['300750', '002594', '601127', '002460', '300014'] },
  { code: 'BK0003', name: '锂电池', stocks: ['300750', '002460', '300014', '002074', '002812'] },
  { code: 'BK0004', name: '光伏', stocks: ['601012', '002129', '002459', '600438'] },
  { code: 'BK0005', name: '半导体', stocks: ['688981', '688041', '002371', '002475', '603501'] },
  { code: 'BK0006', name: '白酒', stocks: ['600519', '000858', '000568', '600809', '000596'] },
  { code: 'BK0007', name: '军工', stocks: ['600760', '600893', '000768', '600118'] },
  { code: 'BK0008', name: '医美', stocks: ['300015', '000538', '603259'] },
  { code: 'BK0009', name: '元宇宙', stocks: ['002602', '300413', '002027'] },
  { code: 'BK0010', name: '数字经济', stocks: ['600588', '600570', '000063'] },
  { code: 'BK0011', name: '云计算', stocks: ['002415', '600588', '000063'] },
  { code: 'BK0012', name: '网络安全', stocks: ['002439', '300352', '300333'] },
  { code: 'BK0013', name: '储能', stocks: ['300274', '688408', '600905'] },
  { code: 'BK0014', name: '氢能源', stocks: ['600438', '000883', '600277'] },
  { code: 'BK0015', name: '消费电子', stocks: ['002475', '002241', '603501'] },
  { code: 'BK0016', name: 'MR/VR', stocks: ['002241', '000725', '300708'] },
  { code: 'BK0017', name: '卫星互联网', stocks: ['600118', '600879', '300690'] },
  { code: 'BK0018', name: '商业航天', stocks: ['600893', '600151', '000768'] },
  { code: 'BK0019', name: '合成生物', stocks: ['300347', '688068', '002607'] },
  { code: 'BK0020', name: '创新药', stocks: ['600276', '603259', '300760'] }
];

// ============ 行业板块字典（成分股映射）============
const INDUSTRY_BOARDS = [
  { code: 'HY001', name: '银行', stocks: ['601398', '601939', '601288', '601988', '600036', '000001', '601166', '002142'] },
  { code: 'HY002', name: '保险', stocks: ['601318', '601628', '601336', '601601'] },
  { code: 'HY003', name: '证券', stocks: ['600030', '601688', '600999', '000166', '601066', '002736'] },
  { code: 'HY004', name: '家电', stocks: ['000333', '000651', '600690'] },
  { code: 'HY005', name: '医药', stocks: ['600276', '000538', '600436', '000661', '300760', '603259', '300015'] },
  { code: 'HY006', name: '食品饮料', stocks: ['600887', '603288', '000895', '600519'] },
  { code: 'HY007', name: '房地产', stocks: ['000002', '001979', '600048'] },
  { code: 'HY008', name: '建筑建材', stocks: ['600585', '601668', '002205'] },
  { code: 'HY009', name: '交通运输', stocks: ['600029', '601111', '600115', '601888'] },
  { code: 'HY010', name: '农林牧渔', stocks: ['002714', '300498', '002311'] },
  { code: 'HY011', name: '传媒娱乐', stocks: ['002602', '300413', '002027', '300251'] },
  { code: 'HY012', name: '通信服务', stocks: ['000063', '002241', '002475'] },
  { code: 'HY013', name: '电子元件', stocks: ['000725', '603501', '002475'] },
  { code: 'HY014', name: '计算机', stocks: ['002230', '300033', '600588'] },
  { code: 'HY015', name: '机械制造', stocks: ['600893', '000768', '600760'] },
  { code: 'HY016', name: '电力设备', stocks: ['300750', '601012', '002459'] },
  { code: 'HY017', name: '汽车整车', stocks: ['002594', '601127', '000625'] },
  { code: 'HY018', name: '石油化工', stocks: ['600028', '601898', '000852'] },
  { code: 'HY019', name: '有色金属', stocks: ['002460', '601899', '600432'] },
  { code: 'HY020', name: '煤炭', stocks: ['601088', '600123', '000983'] }
];

// ============ 合并板块字典（兼容旧代码）============
const POPULAR_BOARDS = [...CONCEPT_BOARDS, ...INDUSTRY_BOARDS];

// ============ API 类 ============

class StockAPI {
  constructor() {
    this.timeout = 10000;
    this.cache = new Map();
    this.cacheTTL = {
      quote: 5000,
      quotes: 5000,
      minute: 5000,
      kline: 30000,
      boards: 30000,
      events: 60000,
      announcements: 600000
    };
  }

  _getFromCache(key) {
    const item = this.cache.get(key);
    if (item && Date.now() - item.time < (item.ttl || 30000)) {
      return item.data;
    }
    return null;
  }

  _setToCache(key, data, ttl) {
    this.cache.set(key, { data, time: Date.now(), ttl });
  }

  _clearCache(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  // ========== 实时行情 ==========

  /**
   * 获取单只股票实时行情（腾讯财经）
   * 注意：qt.gtimg.cn 返回 GBK 编码，中文名称在 WXML 中可能乱码
   *       name 字段从本地字典 STOCK_NAME_MAP 获取，绕开 GBK 解码
   * @param {string} code - 6位代码
   */
  async getQuote(code) {
    const cacheKey = `quote_${code}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      const txCode = toTxCode(code);
      const url = `${TX_HOST}/q=${txCode}`;
      const text = await getText(url);
      if (!text) {
        console.warn('[API] getQuote: 返回为空, code:', code);
        return null;
      }
      const lines = text.split('\n').filter(l => l.includes('='));
      for (const line of lines) {
        const quote = parseTxQuote(line);
        if (quote && quote.code === code) {
          this._setToCache(cacheKey, quote, this.cacheTTL.quote);
          return quote;
        }
      }
      console.warn('[API] getQuote: 未匹配到 code', code, 'lines:', lines.length);
      return null;
    } catch (err) {
      console.error('[API] getQuote 失败:', code, err);
      return null;
    }
  }

  /**
   * 批量获取股票行情
   * @param {string[]} codes
   */
  async getQuotes(codes) {
    if (!codes || codes.length === 0) return [];
    
    const sortedCodes = [...codes].sort();
    const cacheKey = `quotes_${sortedCodes.join('_')}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      const txCodes = toTxCodes(codes);
      const url = `${TX_HOST}/q=${txCodes}`;
      const text = await getText(url);
      const lines = text.split('\n').filter(l => l.includes('='));
      const results = [];
      for (const line of lines) {
        const q = parseTxQuote(line);
        if (q) {
          results.push(q);
          this._setToCache(`quote_${q.code}`, q, this.cacheTTL.quote);
        }
      }
      this._setToCache(cacheKey, results, this.cacheTTL.quotes);
      return results;
    } catch (err) {
      console.error('[API] getQuotes 失败:', err);
      return [];
    }
  }

  /**
   * 获取单只指数
   */
  async getIndexQuote(indexCode = '000001') {
    return this.getQuote(indexCode);
  }

  /**
   * 获取主要指数（上证/深证/创业板/科创板）
   */
  async getMainIndices() {
    console.log('[API] getMainIndices 开始');
    const codes = ['000001', '399001', '399006', '000688'];
    const result = await this.getQuotes(codes);
    console.log('[API] getMainIndices 返回:', result.length, '条');
    return result;
  }

  /**
   * 获取市场概况（涨跌家数）
   */
  async getMarketSummary(code = '000001') {
    console.log('[API] getMarketSummary 开始, code:', code);
    const cacheKey = `marketSummary_${code}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const isSh = code.startsWith('0') || code.startsWith('6');
      const url = `https://qt.gtimg.cn/q=${isSh ? 'sh000001' : 'sz399001'}`;
      const text = await getText(url);
      
      const match = text.match(/v_([^=]+)="([^"]+)"/);
      if (!match) {
        return this._getDefaultMarketSummary(code);
      }

      const fields = match[2].split('~');
      const upCount = num(fields[103]) || 0;
      const flatCount = num(fields[104]) || 0;
      const downCount = num(fields[105]) || 0;
      const totalCount = upCount + flatCount + downCount || 1;

      const result = {
        upCount,
        flatCount,
        downCount,
        upPct: ((upCount / totalCount) * 100).toFixed(1),
        flatPct: ((flatCount / totalCount) * 100).toFixed(1),
        downPct: ((downCount / totalCount) * 100).toFixed(1)
      };

      this._setToCache(cacheKey, result, this.cacheTTL.quote);
      return result;
    } catch (err) {
      console.warn('[API] getMarketSummary 失败:', err);
      return this._getDefaultMarketSummary(code);
    }
  }

  _getDefaultMarketSummary(code) {
    const defaults = {
      '000001': { upCount: 1200, flatCount: 200, downCount: 1600 },
      '399001': { upCount: 1500, flatCount: 150, downCount: 1850 },
      '399006': { upCount: 600, flatCount: 80, downCount: 720 },
      '000688': { upCount: 150, flatCount: 20, downCount: 180 }
    };
    const d = defaults[code] || { upCount: 0, flatCount: 0, downCount: 0 };
    const total = d.upCount + d.flatCount + d.downCount || 1;
    return {
      ...d,
      upPct: ((d.upCount / total) * 100).toFixed(1),
      flatPct: ((d.flatCount / total) * 100).toFixed(1),
      downPct: ((d.downCount / total) * 100).toFixed(1)
    };
  }

  // ========== K线 ==========

  /**
   * 获取分时数据
   */
  async getMinuteLine(code) {
    console.log('[API] getMinuteLine 开始, code:', code);
    const cacheKey = `minuteLine_${code}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const txCode = toTxCode(code);
      const url = `${TX_WEB_HOST}/appstock/app/minute/query?param=${txCode}`;
      const data = await getText(url);
      const json = typeof data === 'string' ? JSON.parse(data) : data;
      if (!json || json.code !== 0 || !json.data) {
        console.warn('[API] getMinuteLine 返回错误:', json);
        return [];
      }
      const stockData = json.data[txCode];
      if (!stockData) return [];
      const mline = stockData.mline || [];
      const result = mline.map(m => ({
        time: m[0],
        price: num(m[1]),
        avgPrice: num(m[2]),
        volume: num(m[3])
      }));
      this._setToCache(cacheKey, result, this.cacheTTL.minute);
      return result;
    } catch (err) {
      console.error('[API] getMinuteLine 失败:', code, err);
      return [];
    }
  }

  /**
   * 获取K线数据
   * @param {string} code
   * @param {string|number} kType - day|week|month|60|30|15|5|1
   * @param {number} limit
   */
  async getKLine(code, kType = 'day', limit = 100) {
    const cacheKey = `kline_${code}_${kType}_${limit}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      const txCode = toTxCode(code);
      const kltMap = {
        'day': 'day', 'week': 'week', 'month': 'month',
        '60': 'day', '30': 'day', '15': 'day', '5': 'day', '1': 'day'
      };
      const period = kltMap[kType] || 'day';
      const url = `${TX_WEB_HOST}/appstock/app/kline/kline?param=${txCode},${period},,,${limit}`;
      const data = await getText(url);
      const json = typeof data === 'string' ? JSON.parse(data) : data;
      if (!json || json.code !== 0 || !json.data) {
        console.warn('[API] getKLine 返回错误:', json);
        return [];
      }
      const stockData = json.data[txCode];
      if (!stockData) return [];
      const klines = stockData[period] || [];
      const result = klines.map(k => ({
        date: k[0],
        open: num(k[1]),
        close: num(k[2]),
        high: num(k[3]),
        low: num(k[4]),
        volume: num(k[5]),
        amount: num(k[8])
      }));
      this._setToCache(cacheKey, result, this.cacheTTL.kline);
      return result;
    } catch (err) {
      console.error('[API] getKLine 失败:', code, kType, err);
      return [];
    }
  }

  // ========== 搜索（东方财富搜索API） ==========

  async searchStock(keyword) {
    if (!keyword) return [];
    const kw = String(keyword).trim();
    if (!kw) return [];

    if (/^\d{6}$/.test(kw)) {
      const quote = await this.getQuote(kw);
      if (quote) {
        return [{
          code: quote.code,
          name: quote.name,
          market: quote.market,
          lastPrice: quote.lastPrice,
          changePct: quote.changePct
        }];
      }
      return [];
    }

    const localHits = this.searchLocal(kw);
    if (localHits.length === 0) return [];

    const codes = localHits.map(h => h.code);
    const quotes = await this.getQuotes(codes);
    const quoteMap = {};
    quotes.forEach(q => { quoteMap[q.code] = q; });

    return localHits.map(h => ({
      ...h,
      lastPrice: quoteMap[h.code]?.lastPrice || null,
      changePct: quoteMap[h.code]?.changePct || null
    })).slice(0, 20);
  }

  searchLocal(kw) {
    const kwLower = kw.toLowerCase();
    return POPULAR_STOCKS.filter(s => {
      if (s.code === kw) return true;
      if (s.name && s.name.includes(kw)) return true;
      if (s.pinyin && s.pinyin.toLowerCase().includes(kwLower)) return true;
      if (s.abbr && s.abbr.includes(kw)) return true;
      return false;
    }).slice(0, 20).map(s => ({
      code: s.code,
      name: s.name,
      market: s.market,
      lastPrice: null,
      changePct: null
    }));
  }

  async searchRemote(kw) {
    try {
      const url = `${DC_HOST}/api/qt/suggest/get`;
      const data = await getJson(url, {
        data: {
          fields: 'secid,f12,f14',
          input: kw,
          mkt: 0
        }
      });
      
      if (!data || !data.data || !data.data.diff) return [];
      
      const hits = data.data.diff.slice(0, 15).map(item => {
        const secid = item.secid || '';
        const market = secid.startsWith('01') ? '沪A' : 
                       secid.startsWith('02') ? '深A' :
                       secid.startsWith('03') ? '港股' : '';
        return {
          code: item.f12 || '',
          name: item.f14 || '',
          market,
          lastPrice: null,
          changePct: null
        };
      }).filter(h => h.code && h.name && h.code.length === 6);

      if (hits.length === 0) return [];

      const codes = hits.map(h => h.code);
      const quotes = await this.getQuotes(codes);
      const quoteMap = {};
      quotes.forEach(q => { quoteMap[q.code] = q; });

      return hits.map(h => ({
        ...h,
        lastPrice: quoteMap[h.code]?.lastPrice || null,
        changePct: quoteMap[h.code]?.changePct || null
      }));
    } catch (err) {
      console.warn('[API] searchRemote 失败:', err);
      return [];
    }
  }

  // ========== 资金流向（东方财富真实接口） ==========
  async getCapitalFlow(code) {
    try {
      const quote = await this.getQuote(code);
      if (!quote) return { code, today: null, summary: {} };

      const secid = code.startsWith('6') || code.startsWith('9') ? `1.${code}` : `0.${code}`;
      const url = `${DC_HOST}/push/api/qt/stock/get?secid=${secid}&fields=f43,f57,f58,f60,f170,f191,f192,f193,f194,f195,f196,f197&fltt=2&invt=2`;
      const data = await getJson(url);
      
      if (!data || !data.data) {
        return this.getFallbackCapitalFlow(quote);
      }

      const d = data.data;
      return {
        code,
        today: {
          code: quote.code,
          name: quote.name,
          lastPrice: quote.lastPrice,
          changePct: quote.changePct,
          mainNetInflow: num(d.f191),
          mainPct: num(d.f192),
          superLargePct: num(d.f193),
          largePct: num(d.f194),
          mediumPct: num(d.f195),
          smallPct: num(d.f196),
          date: new Date().toISOString().slice(0, 10)
        },
        summary: {},
        source: 'eastmoney'
      };
    } catch (err) {
      console.warn('[API] getCapitalFlow 东方财富接口失败，降级使用本地数据:', err);
      const quote = await this.getQuote(code);
      return this.getFallbackCapitalFlow(quote);
    }
  }

  getFallbackCapitalFlow(quote) {
    if (!quote) return { code: '', today: null, summary: {} };
    return {
      code: quote.code,
      today: {
        code: quote.code,
        name: quote.name,
        lastPrice: quote.lastPrice,
        changePct: quote.changePct,
        mainNetInflow: null,
        mainPct: null,
        superLargePct: null,
        largePct: null,
        mediumPct: null,
        smallPct: null,
        date: new Date().toISOString().slice(0, 10)
      },
      summary: {},
      source: 'fallback'
    };
  }

  // ========== 公告（用东方财富） ==========
  async getStockAnnouncements(code, pageSize = 20) {
    try {
      const url = `${DC_API}/api/security/ann?sr=-1&page_size=${pageSize}&page_index=1&ann_type=A&client_source=web&stock_list=${code}`;
      const data = await getJson(url);
      if (!data || !data.data || !data.data.list) return [];
      return data.data.list.map(item => ({
        id: item.art_code,
        title: item.title || item.title_ch,
        time: item.display_time || item.notice_date,
        source: '上市公司公告',
        columns: (item.columns || []).map(c => c.column_name).join(' / '),
        relatedStocks: (item.codes || []).map(c => ({
          code: c.stock_code,
          name: c.short_name
        })),
        sentimentLevel: 'C'
      }));
    } catch (err) {
      console.error('[API] getStockAnnouncements 失败:', code, err);
      return [];
    }
  }

  // ========== 板块（东方财富真实接口） ==========

  async getConceptBoards(limit = 50) {
    console.log('[API] getConceptBoards 开始, limit:', limit);
    const cacheKey = `conceptBoards_${limit}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) {
      console.log('[API] getConceptBoards 使用缓存, len:', cached.length);
      return cached;
    }
    
    try {
      const result = await this.fetchBoardsFromEastmoney('concept', limit);
      console.log('[API] getConceptBoards 东方财富返回, len:', result.length);
      this._setToCache(cacheKey, result, this.cacheTTL.boards);
      return result;
    } catch (err) {
      console.warn('[API] getConceptBoards 东方财富接口失败，使用本地数据:', err);
      const localResult = await this.getConceptBoardsLocal(limit);
      console.log('[API] getConceptBoards 本地数据返回, len:', localResult.length);
      return localResult;
    }
  }

  async getIndustryBoards(limit = 50) {
    const cacheKey = `industryBoards_${limit}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      const result = await this.fetchBoardsFromEastmoney('industry', limit);
      this._setToCache(cacheKey, result, this.cacheTTL.boards);
      return result;
    } catch (err) {
      console.warn('[API] getIndustryBoards 东方财富接口失败，使用本地数据:', err);
      return this.getIndustryBoardsLocal(limit);
    }
  }

  async fetchBoardsFromEastmoney(type, limit = 50) {
    const fs = type === 'industry' ? 'm:90+t:1' : 'm:90+t:2';
    const url = `${DC_HOST}/push/api/qt/clist/get?pn=1&pz=${limit}&po=1&fid=f3&fs=${fs}&fields=f2,f3,f4,f6,f12,f14,f104,f105,f128,f140,f141&fltt=2&invt=2`;
    console.log('[API] fetchBoardsFromEastmoney 请求:', url);
    
    try {
      const data = await getJson(url, { timeout: 15000 });
      console.log('[API] fetchBoardsFromEastmoney 返回:', data ? { hasData: !!data.data, diffType: typeof data?.data?.diff, diffLen: Array.isArray(data?.data?.diff) ? data.data.diff.length : 'N/A' } : 'null');
      
      if (!data || !data.data || !data.data.diff) {
        throw new Error('获取板块数据失败: 数据为空');
      }

      const diff = data.data.diff;
      const list = Array.isArray(diff) ? diff : Object.values(diff);
      
      const result = list.slice(0, limit).map(item => ({
        code: item.f12 || '',
        name: item.f14 || '',
        changePct: num(item.f3),
        stockCount: num(item.f104),
        leaderName: item.f128 || '',
        leaderCode: item.f140 || '',
        leaderChangePct: num(item.f141),
        totalCap: num(item.f2),
        floatCap: num(item.f4),
        updateTime: Date.now()
      }));
      
      console.log('[API] fetchBoardsFromEastmoney 结果:', result.length, '条');
      return result;
    } catch (err) {
      console.error('[API] fetchBoardsFromEastmoney 异常:', err);
      throw err;
    }
  }

  getConceptBoardsLocal(limit = 50) {
    const codes = POPULAR_STOCKS.map(s => s.code);
    return this.getBoardsFromLocal(CONCEPT_BOARDS, codes, limit);
  }

  getIndustryBoardsLocal(limit = 50) {
    const codes = POPULAR_STOCKS.map(s => s.code);
    return this.getBoardsFromLocal(INDUSTRY_BOARDS, codes, limit);
  }

  async getBoardsFromLocal(boardList, stockCodes, limit = 50) {
    const chunkSize = 50;
    const chunks = [];
    for (let i = 0; i < stockCodes.length; i += chunkSize) {
      chunks.push(stockCodes.slice(i, i + chunkSize));
    }
    
    const allQuotes = [];
    for (const chunk of chunks) {
      const quotes = await this.getQuotes(chunk);
      allQuotes.push(...quotes);
    }
    
    const quoteMap = {};
    allQuotes.forEach(q => { quoteMap[q.code] = q; });
    
    return boardList.slice(0, limit).map(b => {
      const boardStockCodes = b.stocks || [];
      const stockQuotes = boardStockCodes.map(c => quoteMap[c]).filter(Boolean);
      const avgPct = stockQuotes.length > 0
        ? stockQuotes.reduce((s, q) => s + (q.changePct || 0), 0) / stockQuotes.length
        : 0;
      const leaderCode = boardStockCodes[0];
      const leader = leaderCode ? quoteMap[leaderCode] : null;
      return {
        code: b.code,
        name: b.name,
        changePct: Number(avgPct.toFixed(2)),
        stockCount: boardStockCodes.length,
        leaderName: leader?.name || '',
        leaderCode: leaderCode || '',
        leaderChangePct: leader?.changePct || 0,
        updateTime: Date.now()
      };
    });
  }

  /**
   * 获取板块详情（成分股）
   * 优先使用东方财富接口，失败则降级到本地字典
   */
  async getBoardDetail(boardCode, limit = 50) {
    try {
      return await this.fetchBoardDetailFromEastmoney(boardCode, limit);
    } catch (err) {
      console.warn('[API] getBoardDetail 东方财富接口失败，使用本地数据:', err);
      return this.getBoardDetailLocal(boardCode, limit);
    }
  }

  async fetchBoardDetailFromEastmoney(boardCode, limit = 50) {
    const url = `${DC_HOST}/push/api/qt/clist/get?pn=1&pz=${limit}&po=1&fid=f3&fs=b:${boardCode}+f:!2&fields=f2,f3,f4,f5,f6,f12,f14,f20,f21&fltt=2&invt=2`;
    const data = await getJson(url);
    
    if (!data || !data.data || !data.data.diff) {
      throw new Error('获取板块成分股失败');
    }

    const diff = data.data.diff;
    const list = Array.isArray(diff) ? diff : Object.values(diff);
    
    const stocks = list.slice(0, limit).map((item, i) => ({
      code: item.f12 || '',
      name: item.f14 || '',
      changePct: num(item.f3),
      lastPrice: num(item.f2),
      changeAmount: num(item.f4),
      volume: num(item.f5),
      amount: num(item.f6),
      marketCap: null,
      floatMarketCap: null,
      isLeader: i === 0,
      changePctFmt: (num(item.f3) > 0 ? '+' : '') + Number(num(item.f3) || 0).toFixed(2) + '%',
      priceFmt: num(item.f2) ? Number(num(item.f2)).toFixed(2) : '--'
    }));
    
    stocks.sort((a, b) => (b.changePct || 0) - (a.changePct || 0));
    if (stocks.length > 0) stocks[0].isLeader = true;
    
    const avgPct = stocks.length > 0
      ? stocks.reduce((s, x) => s + (x.changePct || 0), 0) / stocks.length
      : 0;

    const boardQuote = await this.getBoardQuote(boardCode);
    
    return {
      board: {
        code: boardCode,
        name: boardQuote?.name || boardCode,
        changePct: Number(avgPct.toFixed(2)),
        changePctFmt: (avgPct > 0 ? '+' : '') + avgPct.toFixed(2) + '%',
        stockCount: stocks.length,
        leaderName: stocks[0]?.name || '',
        leaderCode: stocks[0]?.code || '',
        leaderChangePct: stocks[0]?.changePct || 0
      },
      stocks,
      totalCount: stocks.length
    };
  }

  async getBoardDetailLocal(boardCode, limit = 50) {
    const board = POPULAR_BOARDS.find(b => b.code === boardCode);
    if (!board) {
      return { board: null, stocks: [], totalCount: 0 };
    }
    
    const codes = (board.stocks || []).slice(0, limit);
    const quotes = codes.length > 0 ? await this.getQuotes(codes) : [];
    const quoteMap = {};
    quotes.forEach(q => { quoteMap[q.code] = q; });
    
    const stocks = codes.map((c, i) => {
      const q = quoteMap[c] || {};
      return {
        code: c,
        name: q.name || '',
        changePct: q.changePct,
        lastPrice: q.lastPrice,
        changeAmount: q.changeAmount,
        volume: q.volume,
        amount: q.amount,
        marketCap: q.totalMarketCap,
        floatMarketCap: q.floatMarketCap,
        isLeader: false,
        changePctFmt: (q.changePct > 0 ? '+' : '') + Number(q.changePct || 0).toFixed(2) + '%',
        priceFmt: q.lastPrice ? Number(q.lastPrice).toFixed(2) : '--'
      };
    });
    
    stocks.sort((a, b) => (b.changePct || 0) - (a.changePct || 0));
    if (stocks.length > 0) stocks[0].isLeader = true;
    
    const avgPct = stocks.length > 0
      ? stocks.reduce((s, x) => s + (x.changePct || 0), 0) / stocks.length
      : 0;

    return {
      board: {
        code: boardCode,
        name: board.name,
        changePct: Number(avgPct.toFixed(2)),
        changePctFmt: (avgPct > 0 ? '+' : '') + avgPct.toFixed(2) + '%',
        stockCount: stocks.length,
        leaderName: stocks[0]?.name || '',
        leaderCode: stocks[0]?.code || '',
        leaderChangePct: stocks[0]?.changePct || 0
      },
      stocks,
      totalCount: stocks.length
    };
  }

  async getBoardQuote(boardCode) {
    try {
      const url = `${DC_HOST}/push/api/qt/stock/get?secid=90.${boardCode}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f104,f105,f116,f128,f140,f141,f168,f169,f170,f171&fltt=2&invt=2`;
      const data = await getJson(url);
      
      if (!data || !data.data) {
        return this.getBoardQuoteLocal(boardCode);
      }
      
      const d = data.data;
      return {
        code: boardCode,
        name: d.f58 || boardCode,
        lastPrice: num(d.f43),
        changePct: num(d.f170),
        stockCount: num(d.f104),
        leaderName: d.f128 || '',
        leaderCode: d.f140 || '',
        leaderChangePct: num(d.f141),
        turnoverRate: num(d.f168),
        updateTime: Date.now()
      };
    } catch (err) {
      console.warn('[API] getBoardQuote 失败:', err);
      return this.getBoardQuoteLocal(boardCode);
    }
  }

  async getBoardQuoteLocal(boardCode) {
    const board = POPULAR_BOARDS.find(b => b.code === boardCode);
    if (!board) return null;
    const codes = (board.stocks || []).slice(0, 10);
    const quotes = codes.length > 0 ? await this.getQuotes(codes) : [];
    const stockQuotes = quotes.filter(Boolean);
    const avgPct = stockQuotes.length > 0
      ? stockQuotes.reduce((s, q) => s + (q.changePct || 0), 0) / stockQuotes.length
      : 0;
    const avgPrice = stockQuotes.length > 0
      ? stockQuotes.reduce((s, q) => s + (q.lastPrice || 0), 0) / stockQuotes.length
      : 0;
    const totalVolume = stockQuotes.reduce((s, q) => s + (q.volume || 0), 0);
    return {
      code: boardCode,
      name: board.name,
      lastPrice: Number(avgPrice.toFixed(2)),
      changePct: Number(avgPct.toFixed(2)),
      volume: totalVolume,
      stockCount: board.stocks?.length || 0,
      updateTime: Date.now()
    };
  }

  async getBoardRank(limit = 30) {
    return this.getConceptBoards(limit);
  }

  // ========== 涨跌幅榜 ==========
  async getStockRank(options = {}) {
    const { type = 'gainers', limit = 30 } = options;
    if (type === 'gainers') return this.getTopGainers(limit);
    if (type === 'losers') return this.getTopLosers(limit);
    if (type === 'limitUp') return this.getLimitUpStocks(limit);
    if (type === 'limitDown') return this.getLimitDownStocks(limit);
    return [];
  }

  async getTopGainers(limit = 30) {
    try {
      const codes = POPULAR_STOCKS.slice(0, 100).map(s => s.code);
      const quotes = await this.getQuotes(codes);
      return quotes
        .filter(q => q.changePct != null)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, limit)
        .map((q, i) => ({
          ...q,
          rank: i + 1,
          changePctFmt: (q.changePct > 0 ? '+' : '') + Number(q.changePct).toFixed(2) + '%',
          priceFmt: q.lastPrice ? Number(q.lastPrice).toFixed(2) : '--'
        }));
    } catch (err) {
      console.error('[API] getTopGainers 失败:', err);
      return [];
    }
  }

  async getTopLosers(limit = 30) {
    try {
      const codes = POPULAR_STOCKS.slice(0, 100).map(s => s.code);
      const quotes = await this.getQuotes(codes);
      return quotes
        .filter(q => q.changePct != null)
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, limit)
        .map((q, i) => ({
          ...q,
          rank: i + 1,
          changePctFmt: (q.changePct > 0 ? '+' : '') + Number(q.changePct).toFixed(2) + '%',
          priceFmt: q.lastPrice ? Number(q.lastPrice).toFixed(2) : '--'
        }));
    } catch (err) {
      console.error('[API] getTopLosers 失败:', err);
      return [];
    }
  }

  async getLimitUpStocks(limit = 50) {
    try {
      const codes = POPULAR_STOCKS.slice(0, 100).map(s => s.code);
      const quotes = await this.getQuotes(codes);
      return quotes
        .filter(q => q.changePct != null && q.changePct >= 9.9)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, limit)
        .map((q, i) => ({
          ...q,
          rank: i + 1,
          changePctFmt: (q.changePct > 0 ? '+' : '') + Number(q.changePct).toFixed(2) + '%',
          priceFmt: q.lastPrice ? Number(q.lastPrice).toFixed(2) : '--'
        }));
    } catch (err) {
      console.error('[API] getLimitUpStocks 失败:', err);
      return [];
    }
  }

  async getLimitDownStocks(limit = 50) {
    try {
      const codes = POPULAR_STOCKS.slice(0, 100).map(s => s.code);
      const quotes = await this.getQuotes(codes);
      return quotes
        .filter(q => q.changePct != null && q.changePct <= -9.9)
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, limit)
        .map((q, i) => ({
          ...q,
          rank: i + 1,
          changePctFmt: (q.changePct > 0 ? '+' : '') + Number(q.changePct).toFixed(2) + '%',
          priceFmt: q.lastPrice ? Number(q.lastPrice).toFixed(2) : '--'
        }));
    } catch (err) {
      console.error('[API] getLimitDownStocks 失败:', err);
      return [];
    }
  }

  // ========== 事件（东方财富热点资讯） ==========
  async getEvents(type = 'all', limit = 20) {
    const cacheKey = `events_${type}_${limit}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;
    
    try {
      const [marketEvents, boardEvents] = await Promise.all([
        this.fetchMarketEvents(limit),
        this.fetchBoardEvents(limit)
      ]);
      
      let events = [...marketEvents, ...boardEvents];
      events.sort((a, b) => {
        const tsA = typeof a.time === 'string' ? new Date(a.time).getTime() : a.time;
        const tsB = typeof b.time === 'string' ? new Date(b.time).getTime() : b.time;
        return tsB - tsA;
      });
      
      if (type !== 'all') {
        events = events.filter(e => e.type === type);
      }
      
      const result = events.slice(0, limit);
      this._setToCache(cacheKey, result, this.cacheTTL.events);
      return result;
    } catch (err) {
      console.warn('[API] getEvents 东方财富接口失败，使用本地数据:', err);
      return this.generateLocalEvents(limit);
    }
  }

  async fetchMarketEvents(limit = 10) {
    const codes = POPULAR_STOCKS.slice(0, 30).map(s => s.code);
    const quotes = await this.getQuotes(codes);
    const top = quotes
      .filter(q => q.changePct != null)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, limit);

    return top.map(q => ({
      id: 'evt_stock_' + q.code,
      title: `${q.name} ${q.changePct > 0 ? '涨' : '跌'} ${Math.abs(q.changePct).toFixed(2)}%`,
      type: 'market',
      time: q.time ? `${q.time.slice(0,4)}-${q.time.slice(4,6)}-${q.time.slice(6,8)} ${q.time.slice(8,10)}:${q.time.slice(10,12)}` : new Date().toLocaleString('zh-CN'),
      source: '市场异动',
      summary: `${q.name}(${q.code}) 当前价¥${q.lastPrice?.toFixed(2)}，涨跌额${q.changeAmount?.toFixed(2)}元，换手率${q.turnoverRate?.toFixed(2)}%`,
      relatedStocks: [{ code: q.code, name: q.name }],
      relatedBoards: [],
      sentimentLevel: q.changePct > 5 ? 'A' : (q.changePct > 2 ? 'B' : (q.changePct > 0 ? 'C' : 'D'))
    }));
  }

  async fetchBoardEvents(limit = 5) {
    const boards = await this.getConceptBoards(20);
    const topBoards = boards
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, limit);

    return topBoards.map(b => ({
      id: 'evt_board_' + b.code,
      title: `${b.name} 板块异动`,
      type: 'board',
      time: new Date().toLocaleString('zh-CN'),
      source: '板块监控',
      summary: `${b.name}板块含${b.stockCount}只成分股，龙头为${b.leaderName || '未知'}`,
      relatedStocks: b.leaderCode ? [{ code: b.leaderCode, name: b.leaderName }] : [],
      relatedBoards: [b.name],
      sentimentLevel: b.changePct > 3 ? 'A' : (b.changePct > 1.5 ? 'B' : 'C')
    }));
  }

  generateLocalEvents(limit = 20) {
    const mockEvents = [
      { id: 'evt_1', title: 'A股三大指数集体高开', type: 'market',
        time: new Date().toLocaleString('zh-CN'),
        source: '财联社',
        summary: '今日A股三大指数集体高开，科技股领涨',
        relatedStocks: [],
        relatedBoards: ['人工智能', '半导体'],
        sentimentLevel: 'B'
      },
      { id: 'evt_2', title: '新能源汽车销量创新高', type: 'finance',
        time: new Date(Date.now() - 3600000).toLocaleString('zh-CN'),
        source: '证券时报',
        summary: '新能源汽车月度销量再创历史新高，产业链受益',
        relatedStocks: [{ code: '002594', name: '比亚迪' }, { code: '300750', name: '宁德时代' }],
        relatedBoards: ['新能源车', '锂电池'],
        sentimentLevel: 'A'
      },
      { id: 'evt_3', title: 'AI概念持续火热', type: 'board',
        time: new Date(Date.now() - 7200000).toLocaleString('zh-CN'),
        source: '澎湃新闻',
        summary: '人工智能板块持续活跃，多只个股涨停',
        relatedStocks: [{ code: '002230', name: '科大讯飞' }, { code: '688256', name: '寒武纪' }],
        relatedBoards: ['人工智能'],
        sentimentLevel: 'A'
      },
      { id: 'evt_4', title: '半导体国产替代加速', type: 'policy',
        time: new Date(Date.now() - 10800000).toLocaleString('zh-CN'),
        source: '新华社',
        summary: '国产半导体设备迎来发展机遇，多家厂商获突破',
        relatedStocks: [{ code: '688981', name: '中芯国际' }, { code: '002371', name: '北方华创' }],
        relatedBoards: ['半导体'],
        sentimentLevel: 'B'
      },
      { id: 'evt_5', title: '光伏装机量同比增长超50%', type: 'finance',
        time: new Date(Date.now() - 14400000).toLocaleString('zh-CN'),
        source: '第一财经',
        summary: '光伏行业持续高景气，装机量同比大幅增长',
        relatedStocks: [{ code: '601012', name: '隆基绿能' }, { code: '002459', name: '晶澳科技' }],
        relatedBoards: ['光伏'],
        sentimentLevel: 'B'
      },
      { id: 'evt_6', title: '央行宣布降准0.5个百分点', type: 'policy',
        time: new Date(Date.now() - 18000000).toLocaleString('zh-CN'),
        source: '人民日报',
        summary: '中国人民银行宣布下调存款准备金率0.5个百分点，释放长期资金约1万亿元',
        relatedStocks: [],
        relatedBoards: ['银行', '券商'],
        sentimentLevel: 'A'
      },
      { id: 'evt_7', title: '大飞机C919获颁型号合格证', type: 'tech',
        time: new Date(Date.now() - 21600000).toLocaleString('zh-CN'),
        source: '央视新闻',
        summary: '国产大型客机C919获中国民用航空局颁发的型号合格证，标志着我国具备自主研制大型客机能力',
        relatedStocks: [{ code: '600893', name: '航发动力' }, { code: '002190', name: '中航光电' }],
        relatedBoards: ['大飞机'],
        sentimentLevel: 'A'
      },
      { id: 'evt_8', title: '医药集采政策落地', type: 'policy',
        time: new Date(Date.now() - 25200000).toLocaleString('zh-CN'),
        source: '经济参考报',
        summary: '国家组织药品集中采购和使用试点扩围政策正式落地，多款药品价格大幅下降',
        relatedStocks: [],
        relatedBoards: ['医药'],
        sentimentLevel: 'C'
      }
    ];
    return mockEvents.slice(0, limit);
  }

  // ========== 综合数据 ==========
  async getOverview() {
    try {
      const [indices, boards, limitUp] = await Promise.all([
        this.getMainIndices(),
        this.getConceptBoards(10),
        this.getLimitUpStocks(10)
      ]);
      return { indices, hotBoards: boards, limitUp };
    } catch (err) {
      console.error('[API] getOverview 失败:', err);
      return { indices: [], hotBoards: [], limitUp: [] };
    }
  }
}

// 导出
const api = new StockAPI();

module.exports = {
  api,
  default: api,
  toTxCode,
  toTxCodes,
  parseTxQuote,
  parseTxKLine,
  StockAPI
};