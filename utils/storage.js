// 本地存储工具

const STORAGE_KEYS = {
  WATCH_LIST: 'watch_list',
  USER_ID: 'user_id',
  SETTINGS: 'settings',
  CONCEPT_CACHE: 'concept_cache',
  EVENT_CACHE: 'event_cache',
  QUOTE_CACHE: 'quote_cache',
  LAST_UPDATE: 'last_update'
};

/**
 * 获取本地存储
 */
function get(key, defaultValue = null) {
  try {
    const value = wx.getStorageSync(key);
    if (value) {
      return JSON.parse(value);
    }
    return defaultValue;
  } catch (err) {
    console.error('读取存储失败:', key, err);
    return defaultValue;
  }
}

/**
 * 设置本地存储
 */
function set(key, value) {
  try {
    wx.setStorageSync(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('写入存储失败:', key, err);
    return false;
  }
}

/**
 * 移除存储
 */
function remove(key) {
  try {
    wx.removeStorageSync(key);
    return true;
  } catch (err) {
    console.error('删除存储失败:', key, err);
    return false;
  }
}

/**
 * 清空所有存储
 */
function clear() {
  try {
    wx.clearStorageSync();
    return true;
  } catch (err) {
    console.error('清空存储失败:', err);
    return false;
  }
}

// ============ 业务存储方法 ============

/**
 * 获取自选股列表
 */
function getWatchList() {
  return get(STORAGE_KEYS.WATCH_LIST, []);
}

/**
 * 保存自选股列表
 */
function saveWatchList(watchList) {
  return set(STORAGE_KEYS.WATCH_LIST, watchList);
}

/**
 * 添加自选股
 */
function addWatchStock(stock) {
  const watchList = getWatchList();
  const exists = watchList.some(s => s.code === stock.code);
  
  if (!exists) {
    watchList.push({
      code: stock.code,
      name: stock.name,
      addTime: Date.now(),
      alertPriceUp: null,
      alertPriceDown: null,
      alertChangePct: null,
      notes: ''
    });
    saveWatchList(watchList);
    return true;
  }
  return false;
}

/**
 * 移除自选股
 */
function removeWatchStock(stockCode) {
  const watchList = getWatchList();
  const index = watchList.findIndex(s => s.code === stockCode);
  
  if (index > -1) {
    watchList.splice(index, 1);
    saveWatchList(watchList);
    return true;
  }
  return false;
}

/**
 * 检查是否已添加自选
 */
function isWatched(stockCode) {
  const watchList = getWatchList();
  return watchList.some(s => s.code === stockCode);
}

/**
 * 更新自选股提醒设置
 */
function updateWatchAlert(stockCode, alertConfig) {
  const watchList = getWatchList();
  const index = watchList.findIndex(s => s.code === stockCode);
  
  if (index > -1) {
    watchList[index] = { ...watchList[index], ...alertConfig };
    saveWatchList(watchList);
    return true;
  }
  return false;
}

/**
 * 获取用户设置
 */
function getSettings() {
  return get(STORAGE_KEYS.SETTINGS, {
    pushEnabled: true,
    pushFrequency: 'realtime', // realtime, morning, evening
    defaultSortBy: 'changePct', // changePct, marketCap, volume
    theme: 'dark', // dark, light
    showChangeTag: true
  });
}

/**
 * 保存用户设置
 */
function saveSettings(settings) {
  const current = getSettings();
  return set(STORAGE_KEYS.SETTINGS, { ...current, ...settings });
}

/**
 * 获取缓存数据
 */
function getCache(key) {
  const cache = get(key);
  if (cache) {
    const { data, expireTime } = cache;
    if (expireTime && Date.now() > expireTime) {
      // 缓存过期
      remove(key);
      return null;
    }
    return data;
  }
  return null;
}

/**
 * 设置缓存数据
 */
function setCache(key, data, ttlSeconds = 300) {
  return set(key, {
    data,
    expireTime: Date.now() + ttlSeconds * 1000,
    updateTime: Date.now()
  });
}

/**
 * 获取概念板块缓存
 */
function getConceptCache() {
  return getCache(STORAGE_KEYS.CONCEPT_CACHE);
}

/**
 * 保存概念板块缓存
 */
function saveConceptCache(boards, ttlSeconds = 600) {
  return setCache(STORAGE_KEYS.CONCEPT_CACHE, boards, ttlSeconds);
}

/**
 * 获取事件缓存
 */
function getEventCache() {
  return getCache(STORAGE_KEYS.EVENT_CACHE);
}

/**
 * 保存事件缓存
 */
function saveEventCache(events, ttlSeconds = 300) {
  return setCache(STORAGE_KEYS.EVENT_CACHE, events, ttlSeconds);
}

/**
 * 获取行情缓存
 */
function getQuoteCache() {
  return getCache(STORAGE_KEYS.QUOTE_CACHE);
}

/**
 * 保存行情缓存
 */
function saveQuoteCache(quotes) {
  return setCache(STORAGE_KEYS.QUOTE_CACHE, quotes, 30);
}

// ============ 数据同步方法 ============

/**
 * 同步自选股到云端（预留接口）
 */
async function syncWatchListToCloud() {
  // TODO: 实现云端同步
  const watchList = getWatchList();
  console.log('同步自选股到云端:', watchList.length, '条');
  return true;
}

/**
 * 从云端同步自选股
 */
async function syncWatchListFromCloud() {
  // TODO: 实现云端同步
  // 暂时返回本地数据
  return getWatchList();
}

/**
 * 导出用户数据
 */
function exportUserData() {
  return {
    watchList: getWatchList(),
    settings: getSettings(),
    exportTime: Date.now()
  };
}

/**
 * 导入用户数据
 */
function importUserData(data) {
  if (data.watchList) {
    saveWatchList(data.watchList);
  }
  if (data.settings) {
    saveSettings(data.settings);
  }
  return true;
}

// 导出
module.exports = {
  STORAGE_KEYS,
  get,
  set,
  remove,
  clear,
  getWatchList,
  saveWatchList,
  addWatchStock,
  removeWatchStock,
  isWatched,
  updateWatchAlert,
  getSettings,
  saveSettings,
  getCache,
  setCache,
  getConceptCache,
  saveConceptCache,
  getEventCache,
  saveEventCache,
  getQuoteCache,
  saveQuoteCache,
  syncWatchListToCloud,
  syncWatchListFromCloud,
  exportUserData,
  importUserData
};