// pages/elder/elder.js
// 第六阶段：基于真实 appStore 生成老人端提醒，区分"无家庭/无提醒/有提醒"
const appStore = require('../../utils/appStore.js');
const {
  confirmMedicationRecord,
  skipMedicationRecord,
  isCurrentRoleAdmin,
  getCurrentRole
} = require('../../utils/demoStore.js');

Page({
  data: {
    today: '',
    dateStr: '',
    greet: '',
    headerTitle: '',
    headerSubtitle: '',
    isAdminView: true,
    currentRole: null,
    reminders: [],
    completedCount: 0,
    pendingCount: 0,
    skippedCount: 0,
    stage: 'ready' // ready / noFamily / noReminders
  },

  onLoad() {
    this.refreshDate();
    this.refreshReminders();
  },

  onShow() {
    this.refreshReminders();
  },

  refreshDate() {
    const now = new Date();
    const weekMap = ['日', '一', '二', '三', '四', '五', '六'];
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const week = weekMap[now.getDay()];
    const hour = now.getHours();
    let greet = '您好';
    if (hour < 6) greet = '夜深了，注意休息';
    else if (hour < 11) greet = '早上好';
    else if (hour < 13) greet = '中午好';
    else if (hour < 18) greet = '下午好';
    else greet = '晚上好';

    this.setData({
      today: `${month}月${date}日 · 星期${week}`,
      dateStr: `${now.getFullYear()}年${month}月${date}日`,
      greet
    });
  },

  refreshReminders() {
    // Stage 1：无家庭 → 空态
    if (!appStore.hasFamily()) {
      this.setData({
        stage: 'noFamily',
        reminders: [],
        completedCount: 0,
        pendingCount: 0,
        skippedCount: 0,
        headerTitle: '家人提醒（大字版）',
        headerSubtitle: '请先创建家庭药箱'
      });
      return;
    }

    const isAdmin = isCurrentRoleAdmin();
    const currentRole = getCurrentRole();
    const members = appStore.getMembers();
    const medicines = appStore.getMedicines();
    const medicationPlans = appStore.getMedicationPlans();

    // 生成提醒（基于 appStore + demoStore 的记录）
    const reminders = appStore.generateElderReminders({
      medicationPlans,
      medicines,
      members
    });

    const completedCount = reminders.filter(r => r.status === 'done').length;
    const pendingCount = reminders.filter(r => r.status === 'pending' || r.status === 'upcoming').length;
    const skippedCount = reminders.filter(r => r.status === 'skipped').length;

    // Stage 2：有家庭但无提醒 → 空态引导
    if (!reminders || reminders.length === 0) {
      let headerTitle;
      let headerSubtitle;
      if (isAdmin) {
        headerTitle = '家人提醒（大字版）';
        headerSubtitle = '暂时还没有用药提醒';
      } else {
        headerTitle = `${this.data.greet}，${currentRole.name}`;
        headerSubtitle = '今天暂时没有服药计划';
      }
      this.setData({
        stage: 'noReminders',
        isAdminView: isAdmin,
        currentRole,
        reminders: [],
        completedCount: 0,
        pendingCount: 0,
        skippedCount: 0,
        headerTitle,
        headerSubtitle
      });
      return;
    }

    // Stage 3：有提醒
    let headerTitle;
    let headerSubtitle;
    if (isAdmin) {
      headerTitle = '家人提醒（大字版）';
      const elderNames = members.filter(m => m.role === 'elder').map(m => m.name);
      headerSubtitle = elderNames && elderNames.length > 0
        ? `子女正在查看 · ${elderNames.join('、')}今日服药`
        : '子女正在查看 · 今日服药提醒';
    } else {
      headerTitle = `${this.data.greet}，${currentRole.name}`;
      headerSubtitle = '今日服药提醒 · 大字体版';
    }

    this.setData({
      stage: 'ready',
      isAdminView: isAdmin,
      currentRole,
      reminders,
      completedCount,
      pendingCount,
      skippedCount,
      headerTitle,
      headerSubtitle
    });
  },

  onTake(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    confirmMedicationRecord(id);
    this.refreshReminders();
    wx.showToast({
      title: '已记录，家人会同步看到',
      icon: 'success',
      duration: 1800
    });
  },

  onLater(e) {
    const id = e.currentTarget.dataset.id;
    const reminder = this.data.reminders.find(r => r.id === id);
    const name = reminder ? reminder.medicineName : '该药品';
    wx.showModal({
      title: '稍后提醒',
      content: `已为「${name}」设置 10 分钟后再次提醒。`,
      showCancel: false,
      confirmText: '好的'
    });
  },

  onSkip(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    skipMedicationRecord(id);
    this.refreshReminders();
    wx.showToast({ title: '已跳过本次服药', icon: 'none' });
  },

  onCallFamily() {
    const members = appStore.getMembers();
    const admin = members.find(m => m.role === 'admin');
    const contactName = admin ? admin.name : '家人';
    wx.showModal({
      title: '联系家人',
      content: `将联系家人「${contactName}」询问用药问题？`,
      confirmText: '联系',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: `已发起联系：${contactName}`, icon: 'none' });
        }
      }
    });
  },

  goCreateFamily() {
    wx.navigateTo({ url: '/pages/family/family?autoCreate=1' });
  },

  goAddMedicine() {
    wx.switchTab({ url: '/pages/medicines/medicines' });
  },

  goBack() {
    wx.navigateBack({ delta: 1, fail: () => {
      wx.switchTab({ url: '/pages/index/index' });
    }});
  }
});
