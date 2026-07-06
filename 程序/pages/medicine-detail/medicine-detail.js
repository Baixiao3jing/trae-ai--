// pages/medicine-detail/medicine-detail.js
// 药品详情：主档编辑、批次新增/编辑/停用闭环
const appStore = require('../../utils/appStore.js');
const {
  categoryColor,
  statusLabel,
  statusColor,
  daysBetween
} = require('../../utils/mockData.js');

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

    categoryOptions: ['慢病用药', '感冒发烧', '肠胃用药', '外用药', '急救备用', '保健品'],
    locationOptions: ['客厅药箱', '卧室床头', '厨房', '冰箱', '老人房', '外出药包'],
    unitOptions: ['片', '粒', '袋', '支', '瓶', '盒', '贴', '毫升'],

    showMasterEditor: false,
    masterDraft: {},
    masterError: '',

    showBatchEditor: false,
    batchEditorMode: 'add',
    batchDraft: {},
    batchError: ''
  },

  onLoad(options) {
    this._load(options);
  },

  onShow() {
    const id = this.data.medicine && this.data.medicine.id;
    if (id) this._load({ id });
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
      if (this.data.batchEditorMode === 'edit' && draft.id) {
        appStore.updateMedicineBatch(draft.id, draft);
      } else {
        appStore.addBatchToMedicine(medicine.id, { ...draft, source: 'manual', confidence: 1 });
      }
      this.setData({ showBatchEditor: false, batchError: '' });
      this._load({ id: medicine.id });
      wx.showToast({ title: this.data.batchEditorMode === 'edit' ? '批次已更新' : '批次已新增', icon: 'success' });
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
        try {
          appStore.setMedicineBatchStatus(id, nextDisabled ? 'disabled' : 'active');
          this._load({ id: this.data.medicine.id });
          wx.showToast({ title: nextDisabled ? '已停用' : '已恢复', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  goSetReminder() {
    wx.showToast({ title: '用药提醒配置（待完善）', icon: 'none' });
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
      'masterDraft.coverSource': 'none',
      masterError: ''
    });
  },

  saveMasterDraft() {
    const medicine = this.data.medicine;
    const draft = this.data.masterDraft;
    if (!medicine) return;
    try {
      appStore.updateMedicine(medicine.id, {
        ...draft,
        shortName: draft.name,
        genericName: draft.name,
        targetMemberIds: [],
        customTargetMemberName: draft.targetMemberLabel
      });
      this.setData({ showMasterEditor: false, masterError: '' });
      this._load({ id: medicine.id });
      wx.showToast({ title: '主档已更新', icon: 'success' });
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
