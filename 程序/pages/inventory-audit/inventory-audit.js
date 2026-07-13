const appStore = require('../../utils/appStore.js');
const cloudStore = require('../../utils/cloudStore.js');
const syncManager = require('../../utils/syncManager.js');
const notificationConfig = require('../../utils/notificationConfig.js');

Page({
  data: { loading: true, audit: null, items: [], completedCount: 0, canEdit: false, isAdmin: false, settings: { enabled: true, dayOfMonth: 1, reminderTime: '19:00' } },
  onLoad() { this.loadAudit(true); },
  onShow() { if (!this.data.loading) this.loadAudit(false); },
  loadAudit(force) {
    const familyId = appStore.getActiveFamilyId();
    if (!familyId) { this.setData({ loading: false }); return; }
    this.setData({ loading: true });
    const ensure = cloudStore.isCloudEnabled() ? cloudStore.ensureMonthlyInventoryAudit(familyId, force === true) : Promise.resolve(null);
    ensure.then(() => syncManager.refreshFamily(familyId)).then(() => {
      const state = appStore.readAppState();
      const audit = appStore.getPendingInventoryAudit();
      const medicines = state.medicines || [];
      const batches = state.medicineBatches || [];
      const rawItems = audit ? appStore.getInventoryAuditItems(audit.id) : [];
      const items = rawItems.map(item => {
        const medicine = medicines.find(m => m.id === item.medicineId) || {};
        const batch = batches.find(b => b.id === item.batchId) || {};
        return Object.assign({}, item, {
          medicineName: medicine.name || '药品',
          batchLabel: batch.batchNo || '未填写批号',
          expireDate: batch.expireDate || '',
          actualInput: item.actualQuantity == null ? '' : String(item.actualQuantity),
          confirmed: item.status === 'confirmed'
        });
      });
      const user = appStore.getCurrentUser();
      this.setData({ loading: false, audit, items, completedCount: items.filter(i => i.confirmed).length, canEdit: !!(user && (user.role === 'admin' || user.canEdit)), isAdmin: !!(user && user.role === 'admin'), settings: state.inventoryAuditSettings || this.data.settings });
    }).catch(err => {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || '盘点加载失败', icon: 'none' });
    });
  },
  onSettingInput(e) { this.setData({ [`settings.${e.currentTarget.dataset.field}`]: e.detail.value }); },
  onSettingTime(e) { this.setData({ 'settings.reminderTime': e.detail.value }); },
  onSettingEnabled(e) { this.setData({ 'settings.enabled': !!e.detail.value }); },
  saveSettings() {
    const familyId = appStore.getActiveFamilyId();
    cloudStore.saveInventoryAuditSettings(familyId, { enabled: this.data.settings.enabled, dayOfMonth: Number(this.data.settings.dayOfMonth), reminderTime: this.data.settings.reminderTime })
      .then(() => syncManager.refreshFamily(familyId)).then(() => { wx.showToast({ title: '盘点提醒已保存', icon: 'success' }); this.loadAudit(false); })
      .catch(err => wx.showToast({ title: err.message || '设置保存失败', icon: 'none' }));
  },
  requestAuditSubscription() {
    const templateId = notificationConfig.INVENTORY_AUDIT_TEMPLATE_ID;
    if (!templateId) { wx.showModal({ title: '订阅消息尚未配置', content: '请先在微信公众平台申请“药箱盘点提醒”模板。月盘任务和小程序内提醒不受影响。', showCancel: false }); return; }
    wx.requestSubscribeMessage({ tmplIds: [templateId], success: result => {
      cloudStore.saveNotificationSubscription(appStore.getActiveFamilyId(), templateId, result[templateId] || 'reject', 'inventoryAudit')
        .then(() => wx.showToast({ title: result[templateId] === 'accept' ? '月盘微信提醒已授权' : '未开启微信提醒', icon: 'none' }));
    } });
  },
  onActualInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ [`items[${index}].actualInput`]: e.detail.value });
  },
  confirmCorrect(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ [`items[${index}].actualInput`]: String(this.data.items[index].systemQuantity) });
    this.saveItem(index);
  },
  saveItemTap(e) { this.saveItem(Number(e.currentTarget.dataset.index)); },
  saveItem(index) {
    const item = this.data.items[index];
    const actual = Number(item.actualInput);
    if (!Number.isFinite(actual) || actual < 0) { wx.showToast({ title: '请填写正确的实际数量', icon: 'none' }); return; }
    const familyId = appStore.getActiveFamilyId();
    wx.showLoading({ title: '保存盘点...' });
    cloudStore.saveInventoryAuditItem(familyId, item.id, actual)
      .then(() => syncManager.refreshFamily(familyId))
      .then(() => { wx.hideLoading(); this.loadAudit(false); })
      .catch(err => { wx.hideLoading(); wx.showToast({ title: err.message || '保存失败', icon: 'none' }); });
  },
  completeAudit() {
    if (!this.data.audit || this.data.completedCount !== this.data.items.length) {
      wx.showToast({ title: '请先确认全部药品数量', icon: 'none' }); return;
    }
    wx.showModal({
      title: '完成本月盘点',
      content: '确认后将按实际数量修正库存，并生成不可删除的盘点流水。',
      confirmColor: '#2e7d6a',
      success: res => {
        if (!res.confirm) return;
        const familyId = appStore.getActiveFamilyId();
        wx.showLoading({ title: '正在完成...' });
        cloudStore.completeInventoryAudit(familyId, this.data.audit.id)
          .then(() => syncManager.refreshFamily(familyId))
          .then(() => { wx.hideLoading(); wx.showToast({ title: '本月盘点已完成', icon: 'success' }); setTimeout(() => wx.navigateBack(), 900); })
          .catch(err => { wx.hideLoading(); wx.showToast({ title: err.message || '完成失败', icon: 'none' }); });
      }
    });
  }
});
