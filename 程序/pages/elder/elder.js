// pages/elder/elder.js
// 药无忧第四阶段：基于正式模型（medicationPlans+medicines+members）+ demoStore 生成老人端提醒
// 支持两种入口：
//   1. 管理员预览：展示所有老人（爸爸+妈妈）的提醒，顶部显示"老人端预览 · 子女正在查看"
//   2. 老人角色（爸爸/妈妈）：只展示自己的提醒，顶部显示"早上好，爸爸/妈妈"

const {
  medicationPlans,
  medicines,
  members
} = require('../../utils/mockData.js');

const {
  generateElderReminders,
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
    // 展示用标题：根据角色不同显示不同问候
    headerTitle: '',
    headerSubtitle: '',
    // 是否为管理员预览模式
    isAdminPreview: true,
    // 当前角色对象（用于显示老人名字）
    currentRole: null,
    reminders: [],
    completedCount: 0,
    pendingCount: 0,
    skippedCount: 0
  },

  onLoad() {
    this.refreshDate();
    this.refreshReminders();
  },

  onShow() {
    // 从首页切换回来也要刷新（因为可能从子女端重置了数据）
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
    const isAdmin = isCurrentRoleAdmin();
    const currentRole = getCurrentRole();

    // 基于 medicationPlans + medicines + members + demoStore.records 生成
    const reminders = generateElderReminders({
      medicationPlans,
      medicines,
      members
    });

    const completedCount = reminders.filter(r => r.status === 'done').length;
    const pendingCount = reminders.filter(r => r.status === 'pending' || r.status === 'upcoming').length;
    const skippedCount = reminders.filter(r => r.status === 'skipped').length;

    let headerTitle;
    let headerSubtitle;

    if (isAdmin) {
      headerTitle = '老人端预览';
      headerSubtitle = '子女正在查看 · 爸爸、妈妈今日服药';
    } else {
      // 老人角色：使用正式问候
      headerTitle = `${this.data.greet}，${currentRole.name}`;
      headerSubtitle = '今日服药提醒 · 大字体版';
    }

    this.setData({
      isAdminPreview: isAdmin,
      currentRole,
      headerTitle,
      headerSubtitle,
      reminders,
      completedCount,
      pendingCount,
      skippedCount
    });
  },

  onTake(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    confirmMedicationRecord(id);
    this.refreshReminders();

    wx.showToast({
      title: '已记录，子女端会同步看到',
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
      content: `已为「${name}」设置 10 分钟后再次提醒。（演示版本：不实际创建定时器）`,
      showCancel: false,
      confirmText: '好的'
    });
  },

  onSkip(e) {
    // 可选：如果用户长按或其他操作，可标记为 skipped
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    skipMedicationRecord(id);
    this.refreshReminders();
    wx.showToast({ title: '已跳过本次服药', icon: 'none' });
  },

  onCallFamily() {
    wx.showModal({
      title: '联系家人',
      content: '将联系家人「小李」询问用药问题？\n\n（演示版本：不实际拨打电话）',
      confirmText: '联系',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '已模拟拨打给小李', icon: 'none' });
        }
      }
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1, fail: () => {
      wx.switchTab({ url: '/pages/index/index' });
    }});
  }
});
