// pages/access-logs/access-logs.js
// 药无忧第五阶段：访问与操作记录页
// 功能：展示 8+ 条 mockAccessLogs，按操作类型分色（新增绿、修改蓝、确认橙、导出紫、邀请灰、停用红）

const { getAccessLogsWithStyle } = require('../../utils/mockData.js');

Page({
  data: {
    logs: [],
    // 统计概览：各操作类型数量
    stats: {
      total: 0,
      createCount: 0,
      updateCount: 0,
      confirmCount: 0,
      disableCount: 0,
      exportCount: 0
    }
  },

  onLoad() {
    const logs = getAccessLogsWithStyle();
    // 按时间倒序展示（最新的在最上面）
    logs.sort((a, b) => (a.time > b.time ? -1 : 1));

    const stats = {
      total: logs.length,
      createCount: logs.filter(l => l.actionType === 'create').length,
      updateCount: logs.filter(l => l.actionType === 'update').length,
      confirmCount: logs.filter(l => l.actionType === 'confirm').length,
      disableCount: logs.filter(l => l.actionType === 'disable').length,
      exportCount: logs.filter(l => l.actionType === 'export').length
    };

    this.setData({ logs, stats });
  },

  onLogTap(e) {
    const log = e.currentTarget.dataset.log;
    wx.showModal({
      title: log.action,
      content:
`操作时间：${log.time}
操作人：${log.by}
目标对象：${log.target}
类型：${log.label}

（演示版本：无法进一步查看详情）`,
      showCancel: false,
      confirmText: '关闭'
    });
  },

  goPrivacy() {
    wx.navigateBack({ delta: 1, fail: () => {
      wx.navigateTo({ url: '/pages/privacy/privacy' });
    }});
  }
});
