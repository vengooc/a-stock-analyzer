// 设置页面
const { saveSettings, getSettings, clear, exportUserData } = require('../../utils/storage.js');

Page({
  data: {
    settings: {},
    version: '1.0.0'
  },

  onLoad() {
    this.loadSettings();
  },

  loadSettings() {
    const settings = getSettings();
    this.setData({ settings });
  },

  onPushToggle(e) {
    const enabled = e.detail.value;
    const settings = { ...this.data.settings, pushEnabled: enabled };
    this.setData({ settings });
    this.saveSettings(settings);
  },

  onFrequencyChange(e) {
    const frequency = e.currentTarget.dataset.frequency;
    const settings = { ...this.data.settings, pushFrequency: frequency };
    this.setData({ settings });
    this.saveSettings(settings);
  },

  onThemeChange(e) {
    const theme = e.currentTarget.dataset.theme;
    const settings = { ...this.data.settings, theme };
    this.setData({ settings });
    this.saveSettings(settings);
  },

  onDefaultSortChange(e) {
    const sortBy = e.currentTarget.dataset.sort;
    const settings = { ...this.data.settings, defaultSortBy: sortBy };
    this.setData({ settings });
    this.saveSettings(settings);
  },

  saveSettings(settings) {
    const app = getApp();
    app.globalData.settings = settings;
    saveSettings(settings);
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有缓存数据吗？',
      success: (res) => {
        if (res.confirm) {
          clear();
          this.loadSettings();
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  },

  onExportData() {
    const data = exportUserData();
    
    wx.setClipboardData({
      data: JSON.stringify(data, null, 2),
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
      }
    });
  },

  onAbout() {
    wx.showModal({
      title: '关于 A股探子',
      content: '版本：1.0.0\n\nA股概念板块龙头分析小程序',
      showCancel: false
    });
  },

  goToDebug() {
    wx.navigateTo({ url: '/pages/debug/debug' });
  }
});