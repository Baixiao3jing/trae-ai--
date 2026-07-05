// pages/settings/settings.js
// 药无忧第四阶段：新增"演示角色切换"和"重置演示数据"入口
// 同时显示当前演示身份（小李管理员/爸爸老人/妈妈老人）

const {
  mockCurrentUser,
  mockFamily,
  mockMembers,
  mockAccessLogs,
  members,
  medicines,
  medicineBatches
} = require('../../utils/mockData.js');

const {
  setCurrentRoleId,
  getCurrentRole,
  resetDemoRecords
} = require('../../utils/demoStore.js');

Page({
  data: {
    user: {},
    family: {},
    members: [],
    menuGroups: [],
    // 第四阶段：演示角色相关
    currentRole: null,
    roleOptions: [] // [{id,name,roleLabel,avatar,isActive}]
  },

  onLoad() {
    this._refreshAll();
  },

  onShow() {
    // 从老人端或其他页面返回时也要刷新当前角色
    this._refreshAll();
  },

  _refreshAll() {
    // 当前演示角色（从 storage 读取）
    const currentRole = getCurrentRole();

    // 角色切换选项
    const roleOptions = members.map(m => ({
      id: m.id,
      name: m.name,
      roleLabel: m.roleLabel,
      avatar: m.avatar,
      relation: m.relation,
      isActive: m.id === currentRole.id
    }));

    // 菜单分组（保留原有，同时可以新增"演示工具"分组）
    const menuGroups = [
      {
        title: '家庭',
        items: [
          {
            key: 'family',
            icon: '👨‍👩‍👧‍👦',
            label: '家庭管理',
            desc: `共 ${mockMembers.length} 位成员`,
            bg: '#e7f2ee',
            color: '#2e7d6a'
          },
          {
            key: 'elder',
            icon: '👴',
            label: '老人端预览',
            desc: '查看大字版提醒界面',
            bg: '#fff8e1',
            color: '#f39c12'
          }
        ]
      },
      {
        title: '演示工具（第四阶段）',
        items: [
          {
            key: 'reset-demo',
            icon: '🔄',
            label: '重置演示数据',
            desc: '恢复初始服药记录，用于比赛前演示',
            bg: '#fdecea',
            color: '#e74c3c'
          }
        ]
      },
      {
        title: '隐私与数据',
        items: [
          {
            key: 'privacy',
            icon: '🔒',
            label: '隐私授权',
            desc: '查看与管理授权状态',
            bg: '#e8f4fd',
            color: '#3498db'
          },
          {
            key: 'logs',
            icon: '📋',
            label: '访问记录',
            desc: `近期 ${mockAccessLogs.length} 条操作记录`,
            bg: '#f3e8fd',
            color: '#9b59b6'
          },
          {
            key: 'export',
            icon: '📤',
            label: '数据导出',
            desc: '导出药品台账 CSV',
            bg: '#e8fdf0',
            color: '#27ae60'
          }
        ]
      },
      {
        title: '其他',
        items: [
          {
            key: 'leave',
            icon: '🚪',
            label: '退出家庭',
            desc: '退出当前家庭空间',
            bg: '#fdecea',
            color: '#e74c3c'
          }
        ]
      }
    ];

    this.setData({
      user: mockCurrentUser,
      family: mockFamily,
      members: mockMembers,
      menuGroups,
      currentRole,
      roleOptions
    });
  },

  // ==================== 第四阶段：角色切换 ====================
  onRoleChange(e) {
    const userId = e.currentTarget.dataset.userId;
    if (!userId) return;
    if (userId === this.data.currentRole.id) return;

    setCurrentRoleId(userId);
    const mem = members.find(m => m.id === userId);

    // 根据角色提示不同文案
    if (mem && mem.role === 'admin') {
      wx.showToast({
        title: '已切换到管理员视角',
        icon: 'success',
        duration: 1600
      });
    } else {
      wx.showModal({
        title: '已切换老人视角',
        content: `当前身份：${mem ? mem.name : '老人'} / 老人。\n\n可进入「老人端预览」查看大字版提醒（仅显示该老人自己的服药记录）。`,
        showCancel: false,
        confirmText: '好的'
      });
    }

    // 刷新界面
    this._refreshAll();
  },

  // ==================== 第四阶段：重置演示数据 ====================
  onResetDemo() {
    wx.showModal({
      title: '重置演示数据',
      content: '是否恢复初始服药记录？\n\n用于比赛前重置演示状态（所有已确认的服药记录会回到待确认，当前角色切回小李管理员）。',
      confirmText: '确认重置',
      confirmColor: '#e74c3c',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        resetDemoRecords();
        wx.showToast({
          title: '演示数据已重置',
          icon: 'success',
          duration: 1800
        });
        // 刷新界面
        setTimeout(() => this._refreshAll(), 300);
      }
    });
  },

  onMenuTap(e) {
    const key = e.currentTarget.dataset.key;
    switch (key) {
      case 'family':
        wx.navigateTo({ url: '/pages/family/family' });
        break;
      case 'elder':
        wx.navigateTo({ url: '/pages/elder/elder' });
        break;
      case 'reset-demo':
        this.onResetDemo();
        break;
      case 'privacy':
        wx.navigateTo({ url: '/pages/privacy/privacy' });
        break;
      case 'logs':
        wx.navigateTo({ url: '/pages/access-logs/access-logs' });
        break;
      case 'export':
        // 第五阶段：弹窗展示导出摘要，不再只 toast
        this._showExportSummary();
        break;
      case 'leave':
        wx.showModal({
          title: '退出家庭',
          content: '确定退出「爸妈家的药箱」吗？退出后需重新被邀请才能加入。',
          confirmColor: '#e74c3c',
          success: (res) => {
            if (res.confirm) {
              wx.showToast({ title: '演示版本：已取消', icon: 'none' });
            }
          }
        });
        break;
      default:
        wx.showToast({ title: '功能开发中', icon: 'none' });
    }
  },

  // 第五阶段：导出摘要弹窗（与 privacy 页保持一致的体验）
  _showExportSummary() {
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
  }
});
