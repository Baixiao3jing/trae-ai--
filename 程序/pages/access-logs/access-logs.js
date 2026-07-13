// pages/access-logs/access-logs.js
const appStore = require('../../utils/appStore.js');
const syncManager = require('../../utils/syncManager.js');

function statsOf(logs) {
  return {
    total: logs.length,
    createCount: logs.filter(l => l.actionType === 'create').length,
    updateCount: logs.filter(l => l.actionType === 'update').length,
    confirmCount: logs.filter(l => l.actionType === 'confirm').length,
    disableCount: logs.filter(l => l.actionType === 'disable').length,
    exportCount: logs.filter(l => l.actionType === 'export').length
  };
}

Page({
  data: { logs: [], stats: statsOf([]), syncText: '' },

  onShow() {
    this.refresh();
    syncManager.refreshCurrentFamily().then(() => this.refresh()).catch(() => {
      this.setData({ syncText: '当前显示最近一次同步记录' });
    });
  },

  refresh() {
    const logs = appStore.getAccessLogsWithStyle()
      .sort((a, b) => (String(a.time) > String(b.time) ? -1 : 1));
    this.setData({ logs, stats: statsOf(logs), syncText: syncManager.getState().text });
  },

  onLogTap(e) {
    const log = e.currentTarget.dataset.log;
    if (!log) return;
    wx.showModal({
      title: log.action,
      content: `操作时间：${log.time || '未记录'}\n操作人：${log.by || '家庭成员'}\n目标对象：${log.target || '未记录'}\n类型：${log.label}`,
      showCancel: false,
      confirmText: '关闭'
    });
  },

  goPrivacy() {
    wx.navigateBack({ delta: 1, fail: () => wx.navigateTo({ url: '/pages/privacy/privacy' }) });
  }
});
