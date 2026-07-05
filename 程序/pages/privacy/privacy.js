// pages/privacy/privacy.js
// 药无忧第五阶段：隐私与授权页
// 内容：授权状态卡片 + 4 段说明 + 4 个用户可控操作（弹窗演示）

const {
  medicines,
  medicineBatches,
  mockMembers,
  mockAccessLogs,
  mockFamily
} = require('../../utils/mockData.js');

// 授权状态卡片数据
const AUTH_LIST = [
  { key: 'wxLogin',  icon: '💚', label: '微信登录',       status: '已授权',       statusColor: '#27ae60', desc: '用于识别家庭账户与成员身份' },
  { key: 'ocr',      icon: '📷', label: '药盒图片识别',   status: '仅识别时临时使用', statusColor: '#2e7d6a', desc: '识别完成后不长期保存原图' },
  { key: 'family',   icon: '👪', label: '家庭共享',       status: '已由家庭成员授权', statusColor: '#2980b9', desc: '仅家庭成员间可见药品台账' },
  { key: 'location', icon: '📍', label: '位置信息',       status: '未采集',        statusColor: '#7f8c8d', desc: '非必要，不采集' },
  { key: 'phone',    icon: '📱', label: '手机号',         status: '未采集',        statusColor: '#7f8c8d', desc: '不采集手机号，仅微信昵称' },
  { key: 'idcard',   icon: '🛡️', label: '身份证/病历',    status: '未采集',        statusColor: '#7f8c8d', desc: '非必要，不采集任何医疗敏感信息' }
];

Page({
  data: {
    familyName: '',
    authList: AUTH_LIST
  },

  onLoad() {
    this.setData({ familyName: mockFamily.name });
  },

  // 导出药品台账（弹窗演示摘要）
  onExport() {
    const medCount = medicines.length;
    const batchCount = medicineBatches.length;
    const memCount = mockMembers.length;
    const logCount = mockAccessLogs.length;

    wx.showModal({
      title: '导出药品台账',
      editable: false,
      content:
`【导出前摘要】
· 药品主档数量：${medCount} 条
· 批次数量：${batchCount} 条
· 家庭成员数量：${memCount} 位
· 最近访问记录：${logCount} 条

【导出字段】
药品名 · 类别 · 使用人 · 批号 · 有效期 · 剩余数量 · 存放位置

演示版本将生成 CSV 格式文件（实际不写入文件系统）。`,
      confirmText: '确认导出',
      confirmColor: '#2e7d6a',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '已生成演示版台账文件',
            icon: 'success',
            duration: 2000
          });
        }
      }
    });
  },

  // 清空个人数据（弹窗演示）
  onClearPersonal() {
    wx.showModal({
      title: '清空个人数据',
      content: '确认清空您的个人偏好与自定义数据？\n\n（演示版本：不会真的删除家庭药品台账，仅清除本地缓存配置）',
      confirmText: '确认清空',
      confirmColor: '#e67e22',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync();
          } catch (e) {}
          wx.showToast({
            title: '已清空个人缓存',
            icon: 'none',
            duration: 1800
          });
        }
      }
    });
  },

  // 退出家庭（弹窗演示）
  onLeaveFamily() {
    wx.showModal({
      title: '退出当前家庭',
      content: `确认退出「${this.data.familyName}」吗？\n\n退出后您将无法继续查看该家庭的药品台账、提醒状态和操作记录。如需再次加入，请向家庭成员索取邀请码。\n\n（演示版本：不实际移除成员）`,
      confirmText: '确认退出',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '演示版本：已取消',
            icon: 'none'
          });
        }
      }
    });
  },

  // 删除家庭空间（弹窗演示）
  onDeleteFamily() {
    wx.showModal({
      title: '删除家庭空间',
      content: '⚠️ 此操作不可恢复：\n\n· 删除所有药品主档与批次\n· 删除所有提醒与服药记录\n· 所有家庭成员自动退出\n\n（演示版本：不实际删除任何数据，仅用于比赛展示确认流程）',
      confirmText: '我已了解，删除空间',
      confirmColor: '#c0392b',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '二次确认',
            content: '请输入家庭邀请码 YAO2026 以确认删除家庭空间：\n\n（演示版本：无论输入什么都不会真的删除）',
            editable: true,
            placeholderText: '输入邀请码',
            confirmText: '确认删除',
            confirmColor: '#c0392b',
            success: (r2) => {
              if (r2.confirm) {
                wx.showToast({
                  title: '演示版本：已取消删除',
                  icon: 'none',
                  duration: 2000
                });
              }
            }
          });
        }
      }
    });
  },

  goAccessLogs() {
    wx.navigateTo({ url: '/pages/access-logs/access-logs' });
  }
});
