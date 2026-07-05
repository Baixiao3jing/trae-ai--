// pages/index/index.js
// 药无忧第四阶段：dashboard.todayUnconfirmedCount 和今日关注的"待确认服药"项
// 必须基于 demoStore 的最新 medicationRecords 计算
// 首页 onShow 时重新读取 demoStore 刷新，确保老人端确认后子女端同步变化

const {
  family,
  members,
  getDashboardStats,
  getTodayAttention
} = require('../../utils/mockData.js');

const {
  getDashboardStatsWithDemoStore,
  getTodayAttentionWithDemoStore,
  getCurrentRole
} = require('../../utils/demoStore.js');

Page({
  data: {
    family: {},
    user: {},
    dashboard: {},
    todayList: [],
    // 同步提示：老人端确认后子女端会自动更新
    syncTip: '老人端确认后，子女端会自动更新今日关注。',
    // 当前角色（用于显示当前身份）
    currentRole: null
  },

  _refreshAll() {
    // 基于 mockData 的基础统计（药品总数、临期、过期、库存不足）
    const baseStats = getDashboardStats();
    // 基于 demoStore 最新 records 重算 todayUnconfirmedCount
    const dashboard = getDashboardStatsWithDemoStore(baseStats);

    // 基于 mockData 的今日关注（临期、过期、库存不足）
    const baseList = getTodayAttention();
    // 基于 demoStore 最新 records 重算"待确认服药"项
    const todayList = getTodayAttentionWithDemoStore(baseList);

    // 当前角色（用于显示身份信息）
    const currentRole = getCurrentRole();
    // 用户仍显示"管理员"作为操作人（首页是子女端视角）
    const currentUser = members.find(m => m.role === 'admin') || members[0];

    this.setData({
      dashboard,
      todayList,
      currentRole,
      user: currentUser
    });
  },

  onLoad() {
    this.setData({ family });
    this._refreshAll();
  },

  onShow() {
    // 每次显示都重新读取 demoStore 刷新（老人端确认后回到首页能看到变化）
    this._refreshAll();
  },

  goAddMedicine() {
    wx.navigateTo({
      url: '/pages/add-medicine/add-medicine'
    });
  },

  goMedicines() {
    wx.switchTab({
      url: '/pages/medicines/medicines'
    });
  },

  goFamily() {
    wx.navigateTo({
      url: '/pages/family/family'
    });
  },

  goElder() {
    wx.navigateTo({
      url: '/pages/elder/elder'
    });
  },

  onAttentionTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    // 如果有 medicineId（临期/过期/库存不足）-> 跳药品详情
    if (item.medicineId) {
      wx.navigateTo({
        url: `/pages/medicine-detail/medicine-detail?id=${item.medicineId}`
      });
      return;
    }
    // 否则（待确认服药 ATT-PENDING-GLOBAL 或无 id 的项）-> 跳老人端
    wx.navigateTo({
      url: '/pages/elder/elder'
    });
  }
});
