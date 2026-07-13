// pages/elder/elder.js
// 第六阶段：基于真实 appStore 生成老人端提醒，区分"无家庭/无提醒/有提醒"
const appStore = require('../../utils/appStore.js');
const cloudStore = require('../../utils/cloudStore.js');
const syncManager = require('../../utils/syncManager.js');

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
    upcomingReminders: [],
    completedReminders: [],
    showUpcoming: false,
    showCompleted: false,
    processingRecordId: '',
    duplicateCount: 0,
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
    syncManager.refreshCurrentFamily({ ensureToday: true })
      .then(() => this.refreshReminders())
      .catch(() => {});
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
        upcomingReminders: [],
        completedReminders: [],
        duplicateCount: 0,
        completedCount: 0,
        pendingCount: 0,
        skippedCount: 0,
        headerTitle: '家人提醒（大字版）',
        headerSubtitle: '请先创建家庭药箱'
      });
      return;
    }

    if (!cloudStore.isCloudEnabled()) appStore.ensureTodayMedicationRecords();
    const isAdmin = appStore.isCurrentRoleAdmin();
    const currentRole = appStore.getCurrentRole();
    const members = appStore.getMembers();

    const allReminders = appStore.generateElderReminders();
    const reminders = allReminders.filter(r => r.actionable);
    const upcomingReminders = allReminders.filter(r => r.status === 'upcoming' || r.status === 'snoozed');
    const completedReminders = allReminders.filter(r => r.status === 'done' || r.status === 'skipped');
    const now = new Date();
    const pad = n => n < 10 ? '0' + n : '' + n;
    const todayPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `;
    const rawNonFinalCount = appStore.getMedicationRecords().filter(r => String(r.scheduledTime || '').startsWith(todayPrefix) && r.status !== 'done' && r.status !== 'skipped').length;
    const duplicateCount = Math.max(0, rawNonFinalCount - reminders.length - upcomingReminders.length);
    const completedCount = completedReminders.filter(r => r.status === 'done').length;
    const pendingCount = reminders.length;
    const skippedCount = completedReminders.filter(r => r.status === 'skipped').length;

    // Stage 2：有家庭但无提醒 → 空态引导
    if (!allReminders || allReminders.length === 0) {
      let headerTitle;
      let headerSubtitle;
      if (isAdmin) {
        headerTitle = '今日服药提醒';
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
        upcomingReminders: [],
        completedReminders: [],
        duplicateCount: 0,
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
      headerTitle = '今日服药提醒';
      const elderNames = members.filter(m => m.role === 'elder').map(m => m.name);
      headerSubtitle = elderNames && elderNames.length > 0
        ? `查看 ${elderNames.join('、')} 的服药安排`
        : '查看家人的服药安排';
    } else {
      headerTitle = `${this.data.greet}，${currentRole.name}`;
      headerSubtitle = '今日服药提醒 · 大字体版';
    }

    this.setData({
      stage: 'ready',
      isAdminView: isAdmin,
      currentRole,
      reminders,
      upcomingReminders,
      completedReminders,
      completedCount,
      pendingCount,
      skippedCount,
      duplicateCount,
      headerTitle,
      headerSubtitle
    });
  },

  onTake(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.processingRecordId) return;
    const reminder = this.data.reminders.find(item => item.id === id);
    if (!reminder || !reminder.actionable) {
      wx.showToast({ title: '还没有到本次服药时间', icon: 'none' });
      return;
    }
    this.setData({ processingRecordId: id });
    syncManager.write(
      familyId => cloudStore.confirmMedicationRecord(familyId, id, 'done'),
      () => appStore.confirmMedicationRecord(id)
    ).then(result => {
      this.refreshReminders();
      const deduction = result && result.deduction;
      const title = deduction && deduction.shortage > 0
        ? '已记录，库存不足请家人核对'
        : (deduction && deduction.deducted > 0 ? `已服用，库存减 ${deduction.deducted}${result.doseUnit || ''}` : '已记录，家人会同步看到');
      wx.showToast({ title, icon: 'none', duration: 2200 });
    }).catch(err => wx.showToast({ title: err.message || '记录失败，请重试', icon: 'none' }))
      .finally(() => this.setData({ processingRecordId: '' }));
  },

  onLater(e) {
    const id = e.currentTarget.dataset.id;
    const reminder = this.data.reminders.find(r => r.id === id);
    const name = reminder ? reminder.medicineName : '该药品';
    if (!reminder || !reminder.actionable || this.data.processingRecordId) return;
    this.setData({ processingRecordId: id });
    syncManager.write(
      familyId => cloudStore.snoozeMedicationRecord(familyId, id, 10),
      () => appStore.snoozeMedicationRecord(id, 10)
    ).then(() => {
      this.refreshReminders();
      wx.showToast({ title: `「${name}」将在 10 分钟后提醒`, icon: 'none', duration: 2200 });
    }).catch(err => wx.showToast({ title: err.message || '设置失败，请重试', icon: 'none' }))
      .finally(() => this.setData({ processingRecordId: '' }));
  },

  toggleUpcoming() {
    this.setData({ showUpcoming: !this.data.showUpcoming });
  },

  toggleCompleted() {
    this.setData({ showCompleted: !this.data.showCompleted });
  },

  repairDuplicates() {
    if (!this.data.isAdminView || !this.data.duplicateCount) return;
    const familyId = appStore.getActiveFamilyId();
    cloudStore.repairMedicationReminders(familyId, false).then(report => {
      if (!report.duplicatePlanCount && !report.duplicateRecordCount) {
        wx.showToast({ title: '未发现需要修复的数据', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '修复重复提醒',
        content: `将停用 ${report.duplicatePlanCount} 个重复计划，并移除 ${report.duplicateRecordCount} 条未确认的重复提醒。已服用和已跳过历史不会删除。`,
        confirmText: '开始修复',
        success: res => {
          if (!res.confirm) return;
          cloudStore.repairMedicationReminders(familyId, true)
            .then(() => syncManager.refreshCurrentFamily({ ensureToday: true }))
            .then(() => { this.refreshReminders(); wx.showToast({ title: '重复提醒已修复', icon: 'success' }); })
            .catch(err => wx.showToast({ title: err.message || '修复失败', icon: 'none' }));
        }
      });
    }).catch(err => wx.showToast({ title: err.message || '检查失败', icon: 'none' }));
  },

  onSkip(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    syncManager.write(
      familyId => cloudStore.confirmMedicationRecord(familyId, id, 'skipped'),
      () => appStore.skipMedicationRecord(id)
    ).then(() => {
      this.refreshReminders();
      wx.showToast({ title: '已跳过本次服药', icon: 'none' });
    }).catch(err => wx.showToast({ title: err.message || '操作失败，请重试', icon: 'none' }));
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
