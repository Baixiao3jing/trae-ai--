// pages/index/index.js
// 药无忧第六阶段：真实从零使用流程
// - 无家庭 → 显示"创建家庭药箱"引导
// - 有家庭但无药品 → 显示"空药箱"引导（添加药品 / 邀请家人）
// - 有数据 → 显示基于真实数据的统计、今日关注

const appStore = require('../../utils/appStore.js');

Page({
  data: {
    // 流程阶段：'noFamily' | 'emptyMedicine' | 'hasData'
    stage: 'noFamily',
    family: null,
    user: null,
    dashboard: {
      medicineCount: 0,
      nearExpireCount: 0,
      expiredCount: 0,
      lowStockCount: 0,
      todayUnconfirmedCount: 0
    },
    todayList: [],
    currentRole: null,
    syncTip: '家人确认服药后，家庭端会自动同步今日关注。'
  },

  _refreshAll() {
    const s = appStore.readAppState();
    const family = s.currentFamily;
    const user = s.currentUser;
    let stage = 'noFamily';
    if (family) {
      stage = (s.medicines && s.medicines.length > 0) ? 'hasData' : 'emptyMedicine';
    }
    const dashboard = family ? appStore.getDashboardStats() : {
      medicineCount: 0, nearExpireCount: 0, expiredCount: 0, lowStockCount: 0, todayUnconfirmedCount: 0
    };
    const todayList = family ? appStore.getTodayAttention() : [];
    const currentRole = appStore.getCurrentRole();

    this.setData({
      stage,
      family,
      user,
      dashboard,
      todayList,
      currentRole
    });
  },

  onLoad() {
    this._refreshAll();
  },

  onShow() {
    // 每次显示都重算：家庭创建、药品录入、老人端确认、重置都会更新
    this._refreshAll();
  },

  // ==================== 空家庭阶段 ====================
  onCreateFamily() {
    wx.navigateTo({ url: '/pages/family/family?autoCreate=1' });
  },

  onLearnMore() {
    wx.showModal({
      title: '药无忧能做什么',
      content: '药无忧帮你管理家庭药品：\n\n1. 录入药品主档和批次，自动关注有效期和库存。\n2. 给家人设置用药提醒，老人确认服药后全家同步。\n3. 家人共享同一份药箱，谁都能补录和确认。\n\n药无忧只做家庭药品库存、有效期、提醒和补货管理，不提供医疗诊断和用药建议。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // ==================== 空药箱阶段 ====================
  goAddMedicine() {
    if (!appStore.hasFamily()) {
      wx.showToast({ title: '请先创建家庭', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/add-medicine/add-medicine' });
  },

  onInviteFromEmpty() {
    wx.navigateTo({ url: '/pages/family/family?invite=1' });
  },

  // ==================== 有数据阶段 ====================
  goMedicines() {
    wx.switchTab({ url: '/pages/medicines/medicines' });
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/family' });
  },

  goElder() {
    if (!appStore.hasFamily()) {
      wx.showToast({ title: '请先创建家庭', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/elder/elder' });
  },

  onAttentionTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    if (item.medicineId) {
      wx.navigateTo({ url: `/pages/medicine-detail/medicine-detail?id=${item.medicineId}` });
      return;
    }
    wx.navigateTo({ url: '/pages/elder/elder' });
  }
});
