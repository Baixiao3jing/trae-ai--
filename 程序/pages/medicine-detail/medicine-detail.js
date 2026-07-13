// pages/medicine-detail/medicine-detail.js
// 药品详情：主档编辑、批次新增/编辑/停用闭环
const appStore = require('../../utils/appStore.js');
const cloudStore = require('../../utils/cloudStore.js');
const syncManager = require('../../utils/syncManager.js');
const notificationConfig = require('../../utils/notificationConfig.js');
const categoryColor = appStore.categoryColor;
const statusLabel = appStore.statusLabel;
const statusColor = appStore.statusColor;
const daysBetween = appStore.daysBetween;

const SOURCE_LABEL = {
  manual: '手动录入',
  barcode: '扫码辅助',
  ocr: '拍照辅助',
  imported: '导入'
};

function fieldValue(e) {
  return e && e.detail ? e.detail.value : '';
}

function buildMasterDraft(medicine) {
  return {
    name: medicine.name || '',
    specification: medicine.specification || '',
    category: medicine.category || '',
    manufacturer: medicine.manufacturer || '',
    barcode: medicine.barcode || '',
    targetMemberLabel: medicine.targetMemberLabel || medicine.customTargetMemberName || '',
    storageLocation: medicine.storageLocation || '',
    coverImage: medicine.coverImage || '',
    coverImageCloudId: medicine.coverImageCloudId || (String(medicine.coverImage || '').indexOf('cloud://') === 0 ? medicine.coverImage : ''),
    coverSource: medicine.coverImage ? (medicine.coverSource || 'photo') : 'none'
  };
}

function buildBatchDraft(batch) {
  return {
    id: batch && batch.id ? batch.id : '',
    batchNo: batch && batch.batchNo ? batch.batchNo : '',
    productionDate: batch && batch.productionDate ? batch.productionDate : '',
    expireDate: batch && batch.expireDate ? batch.expireDate : '',
    totalQuantity: batch && batch.totalQuantity != null ? String(batch.totalQuantity) : '',
    remainingQuantity: batch && batch.remainingQuantity != null ? String(batch.remainingQuantity) : '',
    unit: batch && batch.unit ? batch.unit : '片',
    imageSourceNote: batch && batch.imageSourceNote ? batch.imageSourceNote : '',
    note: batch && batch.note ? batch.note : ''
  };
}

function todayStr() {
  const d = new Date();
  const pad = n => n < 10 ? '0' + n : '' + n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function newClientRequestId() {
  return `PLAN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildPlanDraft(plan, medicine, members) {
  const fallbackMember = members && members[0] ? members[0].id : '';
  return {
    id: plan && plan.id ? plan.id : '',
    clientRequestId: plan && plan.clientRequestId ? plan.clientRequestId : newClientRequestId(),
    medicineId: medicine ? medicine.id : '',
    memberId: plan && plan.memberId ? plan.memberId : fallbackMember,
    doseQuantity: plan && plan.doseQuantity ? String(plan.doseQuantity) : '1',
    doseUnit: plan && plan.doseUnit ? plan.doseUnit : '片',
    dosePerTime: plan && plan.dosePerTime ? plan.dosePerTime : '1片',
    deductStock: plan ? plan.deductStock !== false : true,
    stockWarningDays: plan && plan.stockWarningDays ? String(plan.stockWarningDays) : '7',
    reminderTimes: plan && plan.reminderTimes && plan.reminderTimes.length ? plan.reminderTimes.slice() : ['08:00'],
    needGuardianConfirm: plan ? !!plan.needGuardianConfirm : true,
    enabled: plan ? plan.enabled !== false : true,
    startDate: plan && plan.startDate ? plan.startDate : todayStr(),
    endDate: plan && plan.endDate ? plan.endDate : '',
    note: plan && plan.note ? plan.note : ''
  };
}

function saveLocalImage(path, done) {
  if (!path || !wx.saveFile) {
    done(path || '');
    return;
  }
  wx.saveFile({
    tempFilePath: path,
    success: (res) => done(res.savedFilePath || path),
    fail: () => done(path)
  });
}

Page({
  data: {
    medicine: null,
    summary: null,
    forMemberText: '',
    categoryColor: '',
    tabs: [
      { key: 'info', label: '基础信息' },
      { key: 'batch', label: '批次库存' },
      { key: 'plan', label: '用药计划' }
    ],
    activeTab: 'info',
    batches: [],
    notFound: false,
    noFamily: false,
    canEdit: false,

    categoryOptions: ['慢病用药', '感冒发烧', '肠胃用药', '外用药', '急救备用', '保健品'],
    locationOptions: ['客厅药箱', '卧室床头', '厨房', '冰箱', '老人房', '外出药包'],
    unitOptions: ['片', '粒', '袋', '支', '瓶', '盒', '贴', '毫升'],

    showMasterEditor: false,
    masterDraft: {},
    masterError: '',

    showBatchEditor: false,
    batchEditorMode: 'add',
    batchDraft: {},
    batchError: '',

    medicationPlans: [],
    memberOptions: [],
    showPlanEditor: false,
    planEditorMode: 'add',
    planDraft: {},
    planError: '',
    planSaving: false,
    subscriptionConfigured: !!notificationConfig.MEDICATION_TEMPLATE_ID,
    usageForecast: null
  },

  onLoad(options) {
    this._load(options);
  },

  onShow() {
    const id = this.data.medicine && this.data.medicine.id;
    if (id) this._load({ id });
    syncManager.refreshCurrentFamily({ ensureToday: true })
      .then(() => { if (id) this._load({ id }); })
      .catch(() => {});
  },

  _load(options) {
    if (!appStore.hasFamily()) {
      this.setData({ noFamily: true, notFound: false });
      wx.setNavigationBarTitle({ title: '药品详情' });
      return;
    }
    const id = options.id || (this.data.medicine && this.data.medicine.id) || null;
    if (!id) {
      this.setData({ notFound: true, noFamily: false });
      wx.setNavigationBarTitle({ title: '药品详情' });
      return;
    }
    const medicine = appStore.getMedicineById(id);
    if (!medicine) {
      this.setData({ notFound: true, noFamily: false });
      wx.setNavigationBarTitle({ title: '药品详情' });
      return;
    }
    const summary = appStore.getMedicineSummary(id);
    const rawBatches = appStore.getMedicineBatches(id);
    const members = appStore.getMembers();
    const currentUser = appStore.getCurrentUser();
    const planList = appStore.getMedicationPlansByMedicine(id);
    const usageForecast = appStore.getMedicineUsageForecast(id);
    const medicationPlans = planList.map(plan => {
      const member = members.find(m => m.id === plan.memberId);
      return {
        ...plan,
        memberName: member ? member.name : '家人',
        timesText: (plan.reminderTimes || []).join('、'),
        enabledLabel: plan.enabled === false ? '已停用' : '已启用'
      };
    });
    const batches = rawBatches.map(b => {
      const disabled = b.status === 'inactive' || b.status === 'disabled';
      const computedStatus = appStore.computeBatchStatus(b);
      const effectiveStatus = disabled ? 'inactive' : computedStatus;
      const sc = disabled ? '#95a5a6' : statusColor(effectiveStatus);
      const expireDays = daysBetween(b.expireDate);
      const remainPercent = b.totalQuantity > 0
        ? Math.max(0, Math.min(100, Math.round(b.remainingQuantity / b.totalQuantity * 100)))
        : 0;
      return {
        ...b,
        disabled,
        status: effectiveStatus,
        statusLabel: disabled ? '已停用' : statusLabel(effectiveStatus),
        statusColor: sc,
        batchBorderColor: sc,
        remainPercent,
        progressStyle: `width: ${remainPercent}%; background: ${remainPercent < 30 ? '#e74c3c' : '#2e7d6a'};`,
        confidencePercent: Math.round((b.confidence || 0) * 100),
        sourceLabel: SOURCE_LABEL[b.source] || '手动录入',
        expireDaysText: disabled
          ? '已停用'
          : (effectiveStatus === 'expired' ? `已过期 ${Math.abs(expireDays)} 天` : `还有 ${expireDays} 天`)
      };
    }).sort((a, b) => {
      const order = { expired: 0, nearExpire: 1, warning: 1, lowStock: 2, normal: 3, inactive: 4, disabled: 5 };
      const aOrder = order[a.status] != null ? order[a.status] : 99;
      const bOrder = order[b.status] != null ? order[b.status] : 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (String(a.expireDate || '9999') < String(b.expireDate || '9999') ? -1 : 1);
    });

    wx.setNavigationBarTitle({
      title: medicine.name.length > 12 ? medicine.shortName || '药品详情' : medicine.name
    });

    this.setData({
      medicine: {
        ...medicine,
        categoryColor: categoryColor(medicine.category),
        coverText: String(medicine.shortName || medicine.name || '药').slice(0, 1)
      },
      summary,
      forMemberText: appStore.getMemberNames(medicine.targetMemberIds, medicine.targetMemberLabel || medicine.customTargetMemberName || ''),
      categoryColor: categoryColor(medicine.category),
      batches,
      medicationPlans,
      usageForecast,
      memberOptions: members.map(m => ({
        id: m.id,
        label: `${m.name}${m.relation ? ' · ' + m.relation : ''}`
      })),
      canEdit: !!(currentUser && (currentUser.role === 'admin' || currentUser.canEdit === true)),
      notFound: false,
      noFamily: false
    });
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key });
  },

  noop() {},

  goAddBatch() {
    this.setData({
      activeTab: 'batch',
      showBatchEditor: true,
      batchEditorMode: 'add',
      batchDraft: buildBatchDraft(null),
      batchError: ''
    });
  },

  goEditBatch(e) {
    const id = e.currentTarget.dataset.id;
    const batch = this.data.batches.find(item => item.id === id);
    if (!batch) return;
    this.setData({
      showBatchEditor: true,
      batchEditorMode: 'edit',
      batchDraft: buildBatchDraft(batch),
      batchError: ''
    });
  },

  closeBatchEditor() {
    this.setData({ showBatchEditor: false, batchError: '' });
  },

  onBatchInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`batchDraft.${field}`]: fieldValue(e), batchError: '' });
  },

  onBatchDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`batchDraft.${field}`]: fieldValue(e), batchError: '' });
  },

  chooseBatchUnit(e) {
    this.setData({ 'batchDraft.unit': e.currentTarget.dataset.value, batchError: '' });
  },

  saveBatchDraft() {
    const medicine = this.data.medicine;
    const draft = this.data.batchDraft;
    if (!medicine) return;
    try {
      const isEdit = this.data.batchEditorMode === 'edit' && draft.id;
      const payload = isEdit
        ? Object.assign({}, draft, { id: draft.id })
        : Object.assign({}, draft, { source: 'manual', confidence: 1 });
      wx.showLoading({ title: '正在保存...' });
      syncManager.write(
        familyId => cloudStore.addOrUpdateBatch(familyId, medicine.id, payload),
        () => isEdit
          ? appStore.updateMedicineBatch(draft.id, draft)
          : appStore.addBatchToMedicine(medicine.id, payload)
      ).then(() => {
        wx.hideLoading();
        this.setData({ showBatchEditor: false, batchError: '' });
        this._load({ id: medicine.id });
        wx.showToast({ title: isEdit ? '批次已更新' : '批次已新增', icon: 'success' });
      }).catch(err => {
        wx.hideLoading();
        this.setData({ batchError: err.message || '保存失败，请检查批次信息' });
      });
    } catch (err) {
      this.setData({ batchError: err.message || '保存失败，请检查批次信息' });
    }
  },

  goDisableBatch(e) {
    const id = e.currentTarget.dataset.id;
    const batch = this.data.batches.find(item => item.id === id);
    if (!batch) return;
    const nextDisabled = !batch.disabled;
    wx.showModal({
      title: nextDisabled ? '停用批次' : '恢复批次',
      content: nextDisabled
        ? `批次「${batch.batchNo || '未填写'}」停用后会被排除在可用库存和首页统计之外，确定吗？`
        : `恢复批次「${batch.batchNo || '未填写'}」后会重新计入库存统计，确定吗？`,
      confirmColor: nextDisabled ? '#e74c3c' : '#2e7d6a',
      success: (r) => {
        if (!r.confirm) return;
        syncManager.write(
          familyId => cloudStore.setBatchStatus(familyId, id, nextDisabled ? 'disabled' : 'active'),
          () => appStore.setMedicineBatchStatus(id, nextDisabled ? 'disabled' : 'active')
        ).then(() => {
          this._load({ id: this.data.medicine.id });
          wx.showToast({ title: nextDisabled ? '已停用' : '已恢复', icon: 'success' });
        }).catch(err => {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        });
      }
    });
  },

  goSetReminder() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '仅管理员或可编辑成员能管理计划', icon: 'none' });
      return;
    }
    this.openPlanEditor();
  },

  openPlanEditor(e) {
    if (!this.data.canEdit) {
      wx.showToast({ title: '当前账号只有查看权限', icon: 'none' });
      return;
    }
    const id = e && e.currentTarget ? e.currentTarget.dataset.id : '';
    const plan = id ? this.data.medicationPlans.find(item => item.id === id) : null;
    this.setData({
      activeTab: 'plan',
      showPlanEditor: true,
      planEditorMode: plan ? 'edit' : 'add',
      planDraft: buildPlanDraft(plan, this.data.medicine, this.data.memberOptions.map(m => ({ id: m.id }))),
      planError: ''
    });
  },

  closePlanEditor() {
    this.setData({ showPlanEditor: false, planError: '' });
  },

  onPlanInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`planDraft.${field}`]: fieldValue(e), planError: '' });
  },

  onPlanDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`planDraft.${field}`]: fieldValue(e), planError: '' });
  },

  choosePlanMember(e) {
    this.setData({ 'planDraft.memberId': e.currentTarget.dataset.id, planError: '' });
  },

  onPlanConfirmChange(e) {
    this.setData({ 'planDraft.needGuardianConfirm': !!fieldValue(e), planError: '' });
  },

  onPlanEnabledChange(e) {
    this.setData({ 'planDraft.enabled': !!fieldValue(e), planError: '' });
  },

  onPlanDeductChange(e) {
    this.setData({ 'planDraft.deductStock': !!fieldValue(e), planError: '' });
  },

  requestMedicationSubscription() {
    const templateId = notificationConfig.MEDICATION_TEMPLATE_ID;
    if (!templateId) {
      wx.showToast({ title: '微信通知暂未开通，小程序内提醒可正常使用', icon: 'none', duration: 2500 });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: result => {
        const status = result[templateId] || 'reject';
        const familyId = appStore.getActiveFamilyId();
        cloudStore.saveNotificationSubscription(familyId, templateId, status)
          .then(() => wx.showToast({ title: status === 'accept' ? '微信提醒已授权' : '未开启微信提醒', icon: 'none' }))
          .catch(err => wx.showToast({ title: err.message || '授权状态保存失败', icon: 'none' }));
      },
      fail: err => wx.showToast({ title: err.errMsg || '订阅请求失败', icon: 'none' })
    });
  },

  choosePlanDoseUnit(e) {
    this.setData({ 'planDraft.doseUnit': e.currentTarget.dataset.value, planError: '' });
  },

  addPlanTime() {
    const times = (this.data.planDraft.reminderTimes || []).slice();
    times.push('20:00');
    this.setData({ 'planDraft.reminderTimes': times, planError: '' });
  },

  removePlanTime(e) {
    const index = Number(e.currentTarget.dataset.index);
    const times = (this.data.planDraft.reminderTimes || []).slice();
    if (times.length <= 1) {
      this.setData({ planError: '请至少保留一个提醒时间' });
      return;
    }
    times.splice(index, 1);
    this.setData({ 'planDraft.reminderTimes': times, planError: '' });
  },

  onPlanTimeChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const times = (this.data.planDraft.reminderTimes || []).slice();
    times[index] = fieldValue(e);
    this.setData({ 'planDraft.reminderTimes': times, planError: '' });
  },

  savePlanDraft() {
    const medicine = this.data.medicine;
    if (!medicine || this.data.planSaving) return;
    try {
      const payload = {
        ...this.data.planDraft,
        medicineId: medicine.id,
        doseQuantity: Number(this.data.planDraft.doseQuantity),
        dosePerTime: `${this.data.planDraft.doseQuantity}${this.data.planDraft.doseUnit}`
      };
      const uniqueTimes = Array.from(new Set((payload.reminderTimes || []).filter(Boolean)));
      if (uniqueTimes.length !== (payload.reminderTimes || []).length) throw new Error('提醒时间不能重复');
      payload.reminderTimes = uniqueTimes.sort();
      this.setData({ planSaving: true, planError: '' });
      syncManager.write(
        familyId => cloudStore.saveMedicationPlan(familyId, payload),
        () => appStore.createOrUpdateMedicationPlan(payload),
        { ensureToday: true }
      ).then(() => {
        this.setData({ showPlanEditor: false, planError: '' });
        this._load({ id: medicine.id });
        wx.showToast({ title: '用药计划已保存', icon: 'success' });
      }).catch(err => this.setData({ planError: err.message || '保存失败，请检查用药计划' }))
        .finally(() => this.setData({ planSaving: false }));
    } catch (err) {
      this.setData({ planError: err.message || '保存失败，请检查用药计划' });
    }
  },

  togglePlanEnabled(e) {
    const id = e.currentTarget.dataset.id;
    const plan = this.data.medicationPlans.find(item => item.id === id);
    if (!plan) return;
    const enabled = plan.enabled === false;
    wx.showModal({
      title: enabled ? '启用计划' : '停用计划',
      content: enabled ? '启用后会生成今日提醒记录。' : '停用后不会再新增该计划的提醒记录，已确认历史会保留。',
      confirmColor: enabled ? '#2e7d6a' : '#e74c3c',
      success: (res) => {
        if (!res.confirm) return;
        const payload = Object.assign({}, plan, { enabled });
        syncManager.write(
          familyId => cloudStore.saveMedicationPlan(familyId, payload),
          () => appStore.setMedicationPlanEnabled(id, enabled),
          { ensureToday: true }
        ).then(() => {
          this._load({ id: this.data.medicine.id });
          wx.showToast({ title: enabled ? '已启用' : '已停用', icon: 'success' });
        }).catch(err => {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        });
      }
    });
  },

  goEdit() {
    if (!this.data.medicine) return;
    this.setData({
      showMasterEditor: true,
      masterDraft: buildMasterDraft(this.data.medicine),
      masterError: ''
    });
  },

  closeMasterEditor() {
    this.setData({ showMasterEditor: false, masterError: '' });
  },

  onMasterInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`masterDraft.${field}`]: fieldValue(e), masterError: '' });
  },

  chooseMasterCategory(e) {
    this.setData({ 'masterDraft.category': e.currentTarget.dataset.value, masterError: '' });
  },

  chooseMasterLocation(e) {
    this.setData({ 'masterDraft.storageLocation': e.currentTarget.dataset.value, masterError: '' });
  },

  chooseMasterCover() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = (res.tempFiles && res.tempFiles[0]) || null;
        const path = file ? file.path : (res.tempFilePaths && res.tempFilePaths[0]);
        if (!path) return;
        saveLocalImage(path, (savedPath) => {
          this.setData({
            'masterDraft.coverImage': savedPath,
            'masterDraft.coverImageCloudId': '',
            'masterDraft.coverSource': 'photo',
            masterError: ''
          });
        });
      }
    });
  },

  removeMasterCover() {
    this.setData({
      'masterDraft.coverImage': '',
      'masterDraft.coverImageCloudId': '',
      'masterDraft.coverSource': 'none',
      masterError: ''
    });
  },

  saveMasterDraft() {
    const medicine = this.data.medicine;
    const draft = this.data.masterDraft;
    if (!medicine) return;
    try {
      const oldCloudId = medicine.coverImageCloudId || (String(medicine.coverImage || '').indexOf('cloud://') === 0 ? medicine.coverImage : '');
      const basePatch = {
        ...draft,
        shortName: draft.name,
        genericName: draft.name,
        targetMemberIds: [],
        customTargetMemberName: draft.targetMemberLabel
      };
      wx.showLoading({ title: '正在保存...' });
      syncManager.write(familyId => {
        const upload = draft.coverImage && !draft.coverImageCloudId
          ? cloudStore.uploadMedicineCover(draft.coverImage, familyId)
          : Promise.resolve({ fileID: draft.coverImageCloudId || draft.coverImage || '' });
        return upload.then(res => {
          const fileID = res.fileID || '';
          const patch = Object.assign({}, basePatch, {
            coverImage: fileID,
            coverImageCloudId: fileID,
            coverSource: fileID ? (draft.coverSource || 'photo') : 'none'
          });
          return cloudStore.updateMedicine(familyId, medicine.id, patch).then(result => {
            if (oldCloudId && oldCloudId !== fileID) cloudStore.deleteCloudFiles([oldCloudId]).catch(() => {});
            return result;
          });
        });
      }, () => appStore.updateMedicine(medicine.id, basePatch)).then(() => {
        wx.hideLoading();
        this.setData({ showMasterEditor: false, masterError: '' });
        this._load({ id: medicine.id });
        wx.showToast({ title: '主档已更新', icon: 'success' });
      }).catch(err => {
        wx.hideLoading();
        this.setData({ masterError: err.message || '保存失败，请检查药品信息' });
      });
    } catch (err) {
      this.setData({ masterError: err.message || '保存失败，请检查药品信息' });
    }
  },

  goBackMedicines() {
    wx.switchTab({ url: '/pages/medicines/medicines' });
  },

  goCreateFamily() {
    wx.navigateTo({ url: '/pages/family/family?autoCreate=1' });
  }
});
