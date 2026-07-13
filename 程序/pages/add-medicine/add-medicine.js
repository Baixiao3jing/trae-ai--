// pages/add-medicine/add-medicine.js
// 真实录入流程：选择方式 -> 统一表单 -> 保存成功
const appStore = require('../../utils/appStore.js');
const cloudStore = require('../../utils/cloudStore.js');
const syncManager = require('../../utils/syncManager.js');
const PICKER_OPTIONS = appStore.PICKER_OPTIONS;

const lookupBarcode = appStore.lookupBarcode;
const matchExistingMedicineByForm = appStore.matchExistingMedicineByForm;
const statusLabel = appStore.statusLabel;
const statusColor = appStore.statusColor;
const daysBetween = appStore.daysBetween;

function toNumber(v, def) {
  const fallback = def === undefined ? 0 : def;
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function percent(n) {
  return Math.round((Number(n) || 0) * 100);
}

function emptyMedicine() {
  return {
    name: '',
    genericName: '',
    shortName: '',
    category: '',
    specification: '',
    manufacturer: '',
    barcode: '',
    targetMemberIds: [],
    targetMemberLabel: '',
    customTargetMemberName: '',
    storageLocation: '',
    coverImage: '',
    coverImageCloudId: '',
    coverSource: 'none'
  };
}

function emptyBatch() {
  return {
    batchNo: '',
    productionDate: '',
    expireDate: '',
    totalQuantity: '',
    remainingQuantity: '',
    unit: '片',
    imageSourceNote: ''
  };
}

function emptyDraft() {
  return {
    medicine: emptyMedicine(),
    batch: emptyBatch()
  };
}

function batchStatus(batch) {
  const expDays = daysBetween(batch.expireDate);
  const remain = toNumber(batch.remainingQuantity, -1);
  if (expDays < 0) return 'expired';
  if (expDays <= 30) return 'nearExpire';
  if (remain >= 0 && remain < 10) return 'lowStock';
  return 'normal';
}

Page({
  data: {
    step: 'choose',
    noFamily: false,
    noEditPermission: false,
    draft: emptyDraft(),
    sources: {
      medicineSource: 'manual',
      batchSource: 'manual',
      medicineConfidence: 1,
      batchConfidence: 1
    },
    assistNotice: null,
    matchPreview: null,
    savePreview: null,
    errorMap: {},

    membersPickerList: [],
    memberPickerOptions: [],
    memberPickerIdx: 0,
    memberLabels: {},
    categoryOptions: PICKER_OPTIONS.categories,
    categoryPickerIdx: 0,
    locationOptions: PICKER_OPTIONS.locations,
    locationPickerIdx: 0,
    categoryCustomVisible: false,
    memberCustomVisible: false,
    locationCustomVisible: false,

    safetyNotices: [
      '扫码与拍照仅为辅助识别能力，保存前请人工核对。',
      '药无忧只做家庭药品库存、有效期和提醒管理，不提供医疗诊断和用药建议。'
    ]
  },

  onLoad() {
    this.refreshPickers();
  },

  onShow() {
    this.refreshPickers();
    this.ensureFamilyGate();
  },

  ensureFamilyGate() {
    if (!appStore.hasFamily()) {
      this.setData({ noFamily: true, noEditPermission: false, step: 'choose' });
      return false;
    }
    const user = appStore.getCurrentUser();
    if (!user || (user.role !== 'admin' && user.canEdit !== true)) {
      this.setData({ noFamily: true, noEditPermission: true, step: 'choose' });
      wx.showToast({ title: '当前成员没有药品编辑权限', icon: 'none' });
      return false;
    }
    this.setData({ noFamily: false, noEditPermission: false });
    return true;
  },

  refreshPickers() {
    const members = appStore.getMembers();
    const allIds = (members || []).map(m => m.id);
    const list = [
      { key: 'family', label: '全家备用', ids: allIds.slice() }
    ];
    (members || []).forEach(m => {
      list.push({
        key: m.id,
        label: `${m.name}（${m.relation || '家人'}）`,
        ids: [m.id]
      });
    });
    const labels = list.map(x => x.label);
    const labelMap = {};
    (members || []).forEach(m => { labelMap[m.id] = m.name; });
    this.setData({
      membersPickerList: list,
      memberPickerOptions: labels,
      memberLabels: labelMap
    });
    this.syncPickers();
  },

  goCreateFamily() {
    wx.navigateTo({ url: '/pages/family/family?autoCreate=1' });
  },

  resetDraft() {
    this.setData({
      draft: emptyDraft(),
      sources: {
        medicineSource: 'manual',
        batchSource: 'manual',
        medicineConfidence: 1,
        batchConfidence: 1
      },
      assistNotice: null,
      matchPreview: null,
      savePreview: null,
      errorMap: {},
      memberPickerIdx: 0,
      categoryPickerIdx: 0,
      locationPickerIdx: 0,
      categoryCustomVisible: false,
      memberCustomVisible: false,
      locationCustomVisible: false
    });
  },

  openFormWithDraft(patch) {
    const current = this.data.draft || emptyDraft();
    const next = {
      medicine: Object.assign(emptyMedicine(), current.medicine, patch && patch.medicine),
      batch: Object.assign(emptyBatch(), current.batch, patch && patch.batch)
    };
    this.setData({ step: 'form', draft: next, errorMap: {} });
    this.syncPickers();
    this.refreshMatchPreview();
  },

  onManualInput() {
    if (!this.ensureFamilyGate()) return;
    this.resetDraft();
    this.openFormWithDraft();
  },

  onScanAssist() {
    if (!this.ensureFamilyGate()) return;
    if (this.data.step === 'choose') this.resetDraft();
    if (typeof wx.scanCode !== 'function') {
      wx.showToast({ title: '当前环境不支持扫码', icon: 'none' });
      return;
    }
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['barCode', 'qrCode'],
      success: res => {
        const code = res && res.result ? String(res.result).trim() : '';
        if (!code) {
          wx.showToast({ title: '未获取到扫码内容', icon: 'none' });
          return;
        }
        const hit = lookupBarcode(code);
        if (hit && hit.matched && hit.medicine) {
          const med = Object.assign(emptyMedicine(), hit.medicine, { barcode: hit.barcode || code });
          const isLocal = hit.source === 'local-family';
          if (!isLocal) {
            med.targetMemberIds = [];
            med.targetMemberLabel = '';
          }
          this.setData({
            sources: Object.assign({}, this.data.sources, {
              medicineSource: 'barcode',
              medicineConfidence: hit.confidence || (isLocal ? 1 : 0.86)
            }),
            assistNotice: {
              type: 'success',
              title: isLocal ? '已从家庭药箱识别' : '辅助识别结果，请核对',
              desc: isLocal
                ? `条码 ${hit.barcode || code} 已在本家庭药箱中学习过，已自动填充药品信息。保存前仍可修改。`
                : `条码 ${hit.barcode || code} 命中内置辅助样本，置信度 ${percent(hit.confidence || 0.86)}%。保存前请人工核对。`
            }
          });
          this.openFormWithDraft({ medicine: med });
        } else {
          const learnedBarcode = (hit && hit.barcode) || code;
          this.setData({
            sources: Object.assign({}, this.data.sources, {
              medicineSource: 'manual',
              medicineConfidence: 1
            }),
            assistNotice: {
              type: 'warning',
              title: '首次录入该条码',
              desc: `已保留条码 ${learnedBarcode}。填写并保存后，下次在本家庭药箱中扫码会自动识别。`
            }
          });
          this.openFormWithDraft({ medicine: { barcode: learnedBarcode } });
        }
      },
      fail: err => {
        const msg = err && err.errMsg ? String(err.errMsg) : '';
        if (msg.indexOf('cancel') !== -1) {
          wx.showToast({ title: '已取消扫码', icon: 'none' });
          return;
        }
        wx.showModal({
          title: '扫码失败',
          content: '无法使用扫码功能，可以继续手动录入药品信息。',
          showCancel: false,
          confirmText: '手动录入',
          success: () => this.onManualInput()
        });
      }
    });
  },

  onPhotoAssist() {
    if (!this.ensureFamilyGate()) return;
    if (this.data.step === 'choose') this.resetDraft();
    const fillByScenario = (imageInfo) => {
      const coverPatch = imageInfo && imageInfo.path
        ? { coverImage: imageInfo.path, coverSource: imageInfo.source || 'photo' }
        : {};
      const res = this.getOcrScenario();
      if (res && res.success) {
        this.setData({
          sources: Object.assign({}, this.data.sources, {
            batchSource: 'ocr',
            batchConfidence: res.confidence || 0.82
          }),
          assistNotice: {
            type: 'success',
            title: '已辅助填充批次信息',
            desc: `已识别批号、有效期或数量，置信度 ${percent(res.confidence || 0.82)}%。保存前请人工核对。`
          }
        });
        this.openFormWithDraft({ medicine: coverPatch, batch: res.batch });
      } else {
        this.setData({
          sources: Object.assign({}, this.data.sources, {
            batchSource: 'manual',
            batchConfidence: 1
          }),
          assistNotice: {
            type: 'warning',
            title: '未识别到有效批次信息',
            desc: (res && res.errorMessage) || '请手动填写有效期、数量和批号。'
          }
        });
        this.openFormWithDraft({ medicine: coverPatch });
      }
    };

    const chooseSuccess = (res, sourceType) => {
      const imageInfo = this.extractChosenImage(res, sourceType);
      wx.showLoading({ title: '识别中...', mask: true });
      this.persistImagePath(imageInfo.path, savedPath => {
        setTimeout(() => {
          wx.hideLoading();
          fillByScenario(Object.assign({}, imageInfo, { path: savedPath || imageInfo.path }));
        }, 500);
      });
    };

    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        success: res => chooseSuccess(res, 'photo'),
        fail: err => {
          const msg = err && err.errMsg ? String(err.errMsg) : '';
          if (msg.indexOf('cancel') !== -1) wx.showToast({ title: '已取消选择', icon: 'none' });
        }
      });
      return;
    }
    if (typeof wx.chooseImage === 'function') {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera', 'album'],
        success: res => chooseSuccess(res, 'photo'),
        fail: err => {
          const msg = err && err.errMsg ? String(err.errMsg) : '';
          if (msg.indexOf('cancel') !== -1) wx.showToast({ title: '已取消选择', icon: 'none' });
        }
      });
      return;
    }
    wx.showToast({ title: '当前环境不支持选择图片', icon: 'none' });
  },

  extractChosenImage(res, fallbackSource) {
    if (res && res.tempFiles && res.tempFiles.length) {
      const file = res.tempFiles[0] || {};
      return {
        path: file.tempFilePath || file.path || '',
        source: fallbackSource || 'photo'
      };
    }
    if (res && res.tempFilePaths && res.tempFilePaths.length) {
      return {
        path: res.tempFilePaths[0],
        source: fallbackSource || 'album'
      };
    }
    return { path: '', source: 'none' };
  },

  persistImagePath(path, done) {
    if (!path || typeof wx.saveFile !== 'function') {
      done && done(path || '');
      return;
    }
    wx.saveFile({
      tempFilePath: path,
      success: res => done && done((res && res.savedFilePath) || path),
      fail: () => done && done(path)
    });
  },

  onChooseCoverImage() {
    if (!this.ensureFamilyGate()) return;
    const applyImage = (res, source) => {
      const imageInfo = this.extractChosenImage(res, source);
      if (!imageInfo.path) {
        wx.showToast({ title: '未获取到图片', icon: 'none' });
        return;
      }
      this.persistImagePath(imageInfo.path, savedPath => {
        this.setData({
          'draft.medicine.coverImage': savedPath || imageInfo.path,
          'draft.medicine.coverImageCloudId': '',
          'draft.medicine.coverSource': imageInfo.source || 'album'
        });
      });
    };
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        success: res => applyImage(res, 'album'),
        fail: err => {
          const msg = err && err.errMsg ? String(err.errMsg) : '';
          if (msg.indexOf('cancel') !== -1) wx.showToast({ title: '已取消选择', icon: 'none' });
        }
      });
      return;
    }
    if (typeof wx.chooseImage === 'function') {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera', 'album'],
        success: res => applyImage(res, 'album'),
        fail: err => {
          const msg = err && err.errMsg ? String(err.errMsg) : '';
          if (msg.indexOf('cancel') !== -1) wx.showToast({ title: '已取消选择', icon: 'none' });
        }
      });
      return;
    }
    wx.showToast({ title: '当前环境不支持选择图片', icon: 'none' });
  },

  onRemoveCoverImage() {
    this.setData({
      'draft.medicine.coverImage': '',
      'draft.medicine.coverImageCloudId': '',
      'draft.medicine.coverSource': 'none'
    });
  },

  getOcrScenario() {
    const r = Math.random();
    let key = 'high';
    if (r < 0.12) key = 'fail';
    else if (r < 0.28) key = 'low';
    if (appStore.getOcrScenario) return appStore.getOcrScenario(key);
    return null;
  },

  onMedInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`draft.medicine.${field}`]: e.detail.value });
    this.clearFieldError(field);
    if (field === 'name' || field === 'barcode') this.refreshMatchPreview();
  },

  onBatchInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`draft.batch.${field}`]: e.detail.value });
    this.clearFieldError(field);
  },

  onMemberPicker(e) {
    const idx = Number(e.detail.value);
    const opt = this.data.membersPickerList[idx] || this.data.membersPickerList[0];
    this.setData({
      memberPickerIdx: idx,
      'draft.medicine.targetMemberIds': (opt && opt.ids && opt.ids.slice()) || [],
      'draft.medicine.targetMemberLabel': (opt && opt.label) || ''
    });
    this.clearFieldError('targetMemberIds');
  },

  onMemberQuickTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const opt = this.data.membersPickerList[idx];
    if (!opt) return;
    this.setData({
      memberPickerIdx: idx,
      memberCustomVisible: false,
      'draft.medicine.targetMemberIds': (opt.ids && opt.ids.slice()) || [],
      'draft.medicine.targetMemberLabel': opt.label || '',
      'draft.medicine.customTargetMemberName': ''
    });
    this.clearFieldError('targetMemberIds');
  },

  onMemberOtherTap() {
    this.setData({
      memberCustomVisible: true,
      memberPickerIdx: -1,
      'draft.medicine.targetMemberIds': [],
      'draft.medicine.targetMemberLabel': this.data.draft.medicine.customTargetMemberName || ''
    });
  },

  onMemberCustomInput(e) {
    const value = e.detail.value;
    this.setData({
      memberCustomVisible: true,
      memberPickerIdx: -1,
      'draft.medicine.targetMemberIds': [],
      'draft.medicine.targetMemberLabel': value,
      'draft.medicine.customTargetMemberName': value
    });
    this.clearFieldError('targetMemberIds');
  },

  onCategoryPicker(e) {
    const idx = Number(e.detail.value);
    this.setData({
      categoryPickerIdx: idx,
      'draft.medicine.category': this.data.categoryOptions[idx] || ''
    });
    this.clearFieldError('category');
  },

  onCategoryQuickTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const category = this.data.categoryOptions[idx] || '';
    this.setData({
      categoryPickerIdx: idx,
      categoryCustomVisible: false,
      'draft.medicine.category': category
    });
    this.clearFieldError('category');
    this.refreshMatchPreview();
  },

  onCategoryOtherTap() {
    this.setData({
      categoryPickerIdx: -1,
      categoryCustomVisible: true,
      'draft.medicine.category': this.isPresetCategory(this.data.draft.medicine.category) ? '' : this.data.draft.medicine.category
    });
  },

  onCategoryCustomInput(e) {
    this.setData({
      categoryPickerIdx: -1,
      categoryCustomVisible: true,
      'draft.medicine.category': e.detail.value
    });
    this.clearFieldError('category');
  },

  onLocationPicker(e) {
    const idx = Number(e.detail.value);
    this.setData({
      locationPickerIdx: idx,
      'draft.medicine.storageLocation': this.data.locationOptions[idx] || ''
    });
    this.clearFieldError('storageLocation');
  },

  onLocationQuickTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const location = this.data.locationOptions[idx] || '';
    this.setData({
      locationPickerIdx: idx,
      locationCustomVisible: false,
      'draft.medicine.storageLocation': location
    });
    this.clearFieldError('storageLocation');
  },

  onLocationOtherTap() {
    this.setData({
      locationPickerIdx: -1,
      locationCustomVisible: true,
      'draft.medicine.storageLocation': this.isPresetLocation(this.data.draft.medicine.storageLocation) ? '' : this.data.draft.medicine.storageLocation
    });
  },

  onLocationCustomInput(e) {
    this.setData({
      locationPickerIdx: -1,
      locationCustomVisible: true,
      'draft.medicine.storageLocation': e.detail.value
    });
    this.clearFieldError('storageLocation');
  },

  onProdDateChange(e) {
    this.setData({ 'draft.batch.productionDate': e.detail.value });
  },

  onExpireDateChange(e) {
    this.setData({ 'draft.batch.expireDate': e.detail.value });
    this.clearFieldError('expireDate');
  },

  syncPickers() {
    const med = this.data.draft.medicine || emptyMedicine();
    const memberOptions = this.data.membersPickerList || [];
    let memberIdx = 0;
    if (med.targetMemberIds && med.targetMemberIds.length) {
      const found = memberOptions.findIndex(opt => {
        const ids = opt.ids || [];
        return ids.length === med.targetMemberIds.length &&
          med.targetMemberIds.every(id => ids.indexOf(id) !== -1);
      });
      if (found >= 0) memberIdx = found;
    }
    const catIdx = this.data.categoryOptions.indexOf(med.category);
    const locIdx = this.data.locationOptions.indexOf(med.storageLocation);
    const hasCustomMember = !med.targetMemberIds || med.targetMemberIds.length === 0
      ? !!String(med.targetMemberLabel || med.customTargetMemberName || '').trim()
      : false;
    this.setData({
      memberPickerIdx: hasCustomMember ? -1 : memberIdx,
      categoryPickerIdx: catIdx,
      locationPickerIdx: locIdx,
      memberCustomVisible: hasCustomMember,
      categoryCustomVisible: !!med.category && catIdx < 0,
      locationCustomVisible: !!med.storageLocation && locIdx < 0
    });
  },

  isPresetCategory(value) {
    return this.data.categoryOptions.indexOf(value) >= 0;
  },

  isPresetLocation(value) {
    return this.data.locationOptions.indexOf(value) >= 0;
  },

  clearFieldError(field) {
    if (!this.data.errorMap || !this.data.errorMap[field]) return;
    const next = Object.assign({}, this.data.errorMap);
    delete next[field];
    this.setData({ errorMap: next });
  },

  refreshMatchPreview() {
    const med = this.data.draft.medicine || emptyMedicine();
    const hit = matchExistingMedicineByForm({
      barcode: med.barcode,
      name: med.name
    });
    if (hit && hit.medicine) {
      const reasonLabel = hit.matchType === 'barcode' ? '匹配到相同条码' : '匹配到相同药品名称';
      const isSameNameDifferentBarcode = hit.matchType === 'name' &&
        med.barcode &&
        hit.medicine.barcode &&
        hit.medicine.barcode !== med.barcode;
      this.setData({
        matchPreview: {
          isMatched: true,
          reasonLabel: isSameNameDifferentBarcode ? '可能是同一药品的新包装' : reasonLabel,
          actionText: isSameNameDifferentBarcode
            ? '保存后将为现有同名药品新增批次，并学习这个新条码'
            : '保存后将为现有药品新增一个批次库存',
          cardBg: '#fff8e1',
          cardFg: '#8a5a15',
          cardIcon: '🔁'
        }
      });
      return;
    }
    this.setData({
      matchPreview: {
        isMatched: false,
        reasonLabel: '未找到相同药品',
        actionText: '保存后将创建新药品主档，并新增首个批次',
        cardBg: '#eef5f1',
        cardFg: '#276754',
        cardIcon: '➕'
      }
    });
  },

  validateDraft() {
    const med = this.data.draft.medicine;
    const batch = this.data.draft.batch;
    const err = {};
    if (!String(med.name || '').trim()) err.name = '请填写药品名称';
    if (!String(med.specification || '').trim()) err.specification = '请填写规格';
    if (!String(med.category || '').trim()) err.category = '请选择或填写类别';
    if ((!med.targetMemberIds || med.targetMemberIds.length === 0) &&
      !String(med.targetMemberLabel || med.customTargetMemberName || '').trim()) {
      err.targetMemberIds = '请选择或填写使用人';
    }
    if (!String(med.storageLocation || '').trim()) err.storageLocation = '请选择或填写存放位置';
    if (!String(batch.expireDate || '').trim()) err.expireDate = '请选择有效期';

    const totalText = String(batch.totalQuantity || '').trim();
    const remainText = String(batch.remainingQuantity || '').trim();
    const total = Number(totalText);
    const remain = Number(remainText);
    if (!totalText || !Number.isFinite(total) || total <= 0) err.totalQuantity = '请填写大于 0 的总数量';
    if (!remainText || !Number.isFinite(remain) || remain < 0) err.remainingQuantity = '请填写不小于 0 的剩余数量';
    if (!err.totalQuantity && !err.remainingQuantity && remain > total) {
      err.remainingQuantity = '剩余数量不能大于总数量';
    }
    this.setData({ errorMap: err });
    return Object.keys(err).length === 0;
  },

  firstErrorMessage() {
    const keys = Object.keys(this.data.errorMap || {});
    return keys.length ? this.data.errorMap[keys[0]] : '';
  },

  onConfirmSave() {
    if (!this.ensureFamilyGate()) {
      wx.showToast({ title: '请先创建家庭', icon: 'none' });
      return;
    }
    if (!this.validateDraft()) {
      wx.showToast({ title: this.firstErrorMessage() || '请完善必填字段', icon: 'none' });
      return;
    }

    const med = Object.assign({}, this.data.draft.medicine, {
      name: String(this.data.draft.medicine.name).trim(),
      specification: String(this.data.draft.medicine.specification).trim(),
      manufacturer: String(this.data.draft.medicine.manufacturer || '').trim(),
      barcode: String(this.data.draft.medicine.barcode || '').trim(),
      genericName: String(this.data.draft.medicine.genericName || '').trim(),
      shortName: String(this.data.draft.medicine.shortName || this.data.draft.medicine.name).trim(),
      targetMemberIds: (this.data.draft.medicine.targetMemberIds || []).slice(),
      targetMemberLabel: String(this.data.draft.medicine.targetMemberLabel || this.data.draft.medicine.customTargetMemberName || '').trim(),
      customTargetMemberName: String(this.data.draft.medicine.customTargetMemberName || '').trim(),
      coverImage: String(this.data.draft.medicine.coverImage || '').trim(),
      coverImageCloudId: String(this.data.draft.medicine.coverImageCloudId || '').trim(),
      coverSource: this.data.draft.medicine.coverImage
        ? String(this.data.draft.medicine.coverSource || 'photo').trim()
        : 'none'
    });
    const batch = Object.assign({}, this.data.draft.batch, {
      totalQuantity: toNumber(this.data.draft.batch.totalQuantity),
      remainingQuantity: toNumber(this.data.draft.batch.remainingQuantity),
      unit: String(this.data.draft.batch.unit || '片').trim(),
      batchNo: String(this.data.draft.batch.batchNo || '').trim(),
      imageSourceNote: String(this.data.draft.batch.imageSourceNote || '').trim(),
      source: this.data.sources.batchSource || 'manual',
      confidence: this.data.sources.batchConfidence || 1
    });
    const status = batchStatus(batch);
    const expireDays = daysBetween(batch.expireDate);
    const expireText = status === 'expired'
      ? `已过期 ${Math.abs(expireDays)} 天`
      : `还有 ${expireDays} 天`;
    const match = matchExistingMedicineByForm({ barcode: med.barcode, name: med.name });
    const summary = match
      ? '已找到同名或同条码药品，将新增一个批次库存。'
      : '将创建新药品主档，并新增第一个批次。';

    wx.showModal({
      title: '保存前确认',
      content:
        `${summary}\n\n药品：${med.name}\n规格：${med.specification}\n有效期：${batch.expireDate}（${expireText}）\n数量：${batch.remainingQuantity}/${batch.totalQuantity} ${batch.unit}\n\n请确认以上信息已人工核对。`,
      confirmText: '确认保存',
      confirmColor: '#2e7d6a',
      cancelText: '再检查',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '正在保存...' });
        const localWrite = () => appStore.addMedicineAndBatch(med, batch);
        syncManager.write(familyId => {
          const upload = med.coverImage && !med.coverImageCloudId
            ? cloudStore.uploadMedicineCover(med.coverImage, familyId)
            : Promise.resolve({ fileID: med.coverImageCloudId || med.coverImage || '' });
          return upload.then(uploaded => {
            const fileID = uploaded.fileID || '';
            const cloudMedicine = Object.assign({}, med, {
              coverImage: fileID,
              coverImageCloudId: fileID,
              coverSource: fileID ? med.coverSource : 'none'
            });
            return cloudStore.saveMedicine(familyId, cloudMedicine, batch);
          });
        }, localWrite).then(writeResult => {
          wx.hideLoading();
          const medicineId = writeResult.medicineId;
          const batchId = writeResult.batchId || writeResult.newBatchId;
          const finalMedicine = appStore.getMedicineById(medicineId) || med;
          this.setData({
            step: 'success',
            savePreview: {
              actionSummary: match
                ? '已为现有药品新增一个批次库存。'
                : '已创建新药品主档，并新增首个批次。',
              finalMedicineId: medicineId,
              finalBatchId: batchId,
              finalMedicine,
              finalBatch: Object.assign({}, batch, { id: batchId, medicineId }),
              batchStatus: status,
              batchStatusLabel: statusLabel(status),
              batchStatusColor: statusColor(status),
              expireDaysText: expireText,
              medicineSource: this.sourceLabel(this.data.sources.medicineSource),
              batchSource: this.sourceLabel(this.data.sources.batchSource)
            }
          });
        }).catch(err => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '保存失败，请稍后重试', icon: 'none' });
        });
      }
    });
  },

  sourceLabel(source) {
    if (source === 'barcode') return '扫码辅助';
    if (source === 'ocr') return '拍照辅助';
    return '手动录入';
  },

  onSaveDraft() {
    wx.showModal({
      title: '暂未保存草稿',
      content: '当前版本先保存正式药品台账。草稿能力会在后续和提醒、云端同步一起完善。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onBackToChoose() {
    this.setData({ step: 'choose' });
  },

  onGoMedicines() {
    wx.switchTab({ url: '/pages/medicines/medicines' });
  },

  onGoDetail() {
    const id = this.data.savePreview && this.data.savePreview.finalMedicineId;
    if (!id) {
      wx.switchTab({ url: '/pages/medicines/medicines' });
      return;
    }
    wx.redirectTo({ url: `/pages/medicine-detail/medicine-detail?id=${id}` });
  },

  onAddAnother() {
    this.resetDraft();
    this.setData({ step: 'choose' });
  }
});
