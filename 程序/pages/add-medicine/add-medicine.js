// pages/add-medicine/add-medicine.js
// 药无忧第三阶段：条码 + OCR + 人工确认录入流程
const {
  members,
  mockBarcodeLibrary,
  mockOcrResults,
  lookupBarcode,
  getOcrScenario,
  matchExistingMedicineByForm,
  statusLabel,
  statusColor,
  daysBetween,
  PICKER_OPTIONS
} = require('../../utils/mockData.js');

// ---------- 辅助小工具 ----------
function pct(n) { return Math.round((Number(n) || 0) * 100); }
function toNumber(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// 基于批次字段计算状态（独立于正式工具函数，专门用于确认页预览）
function _computePreviewBatchStatus({ expireDate, totalQuantity, remainingQuantity }) {
  const expDays = daysBetween(expireDate);
  const remain = toNumber(remainingQuantity, -1);
  if (expDays < 0) return 'expired';
  if (expDays <= 30) return 'nearExpire';
  if (remain >= 0 && remain < 10) return 'lowStock';
  return 'normal';
}

function _emptyMedicineForm() {
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
    storageLocation: ''
  };
}

function _emptyBatchForm() {
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

// 生成一组合理的手动录入默认值（让比赛演示时"手动录入"也能快速到下一步）
function _defaultManualMedicine() {
  return {
    name: '苯磺酸氨氯地平片',
    genericName: '苯磺酸氨氯地平片',
    shortName: '降压药',
    category: '降压',
    specification: '5mg × 7片/盒',
    manufacturer: '辉瑞制药有限公司',
    barcode: '',
    targetMemberIds: ['U002'],
    targetMemberLabel: '爸爸',
    storageLocation: '客厅药箱'
  };
}

function _defaultManualBatch() {
  return {
    batchNo: 'MANUAL-2026-001',
    productionDate: '2026-03-10',
    expireDate: '2028-03-09',
    totalQuantity: 28,
    remainingQuantity: 28,
    unit: '片',
    imageSourceNote: '用户手动录入，无 OCR 识别图像记录'
  };
}

Page({
  data: {
    // ---- step 控制 ----
    step: 'choose', // choose | barcode | ocr | confirm | success
    stepIndex: 0,   // 进度条步数（0~4）
    stepper: [
      { idx: 1, title: '识别基础', active: false, done: false },
      { idx: 2, title: '识别批次', active: false, done: false },
      { idx: 3, title: '人工确认', active: false, done: false },
      { idx: 4, title: '完成', active: false, done: false }
    ],

    // ---- 入口模式 ----
    entryMode: '', // 'barcode' | 'ocr-only' | 'manual'

    // ---- 模拟条码库 ----
    barcodeLibrary: [],
    selectedBarcodeIdx: 0,
    barcodeRecognized: false,
    barcodeResult: null,

    // ---- OCR Scenario ----
    ocrScenarios: [],   // [{key,label,desc,icon}]
    selectedOcrKey: 'high',
    ocrRecognized: false,
    ocrResult: null,    // {success, confidence, batch, errorMessage?}

    // ---- 表单（可编辑） ----
    form: {
      medicine: _emptyMedicineForm(),
      batch: _emptyBatchForm()
    },
    sources: {
      medicineSource: null,   // 'barcode' | 'ocr' | 'manual' | null
      batchSource: null,      // 'ocr' | 'manual' | null
      medicineConfidence: 1,
      batchConfidence: 1
    },

    // ---- picker 元数据 ----
    memberPickerOptions: PICKER_OPTIONS.members.map(m => m.label),
    memberPickerIdx: 0,
    categoryOptions: PICKER_OPTIONS.categories,
    categoryPickerIdx: 0,
    locationOptions: PICKER_OPTIONS.locations,
    locationPickerIdx: 0,

    // ---- 确认页 & 预览 ----
    lowMedicineConfidence: false,  // 条码识别置信度低（虽然条码默认 0.95+ 不触发，但保留）
    lowBatchConfidence: false,     // OCR 置信度低
    errorMap: {},                  // 必填错误 {field:'请填写xxx'}
    matchPreview: null,            // {isMatched, reasonLabel, existingMedicine?}
    savePreview: null,             // 成功页展示内容

    // ---- 安全提示 ----
    safetyNotices: [
      'AI 只做预填，确认后才会写入家庭药品台账。',
      '药无忧只做库存、有效期和提醒管理，不提供用药建议。'
    ],

    memberLabels: { U001: '小李', U002: '爸爸', U003: '妈妈' }
  },

  // ==================== 生命周期 ====================
  onLoad() {
    const barcodeLibrary = mockBarcodeLibrary.map(x => ({
      ...x,
      confidenceLabel: pct(x.defaultSourceConfidence)
    }));
    const ocrScenarios = Object.keys(mockOcrResults).map(k => {
      const o = mockOcrResults[k];
      return { key: k, label: o.label, desc: o.desc, icon: o.icon };
    });
    this.setData({ barcodeLibrary, ocrScenarios });
  },

  // ==================== 工具：更新进度条 ====================
  _setStep(step) {
    const idxMap = { choose: 0, barcode: 1, ocr: 2, confirm: 3, success: 4 };
    const idx = idxMap[step] || 0;
    const stepper = this.data.stepper.map((s, i) => ({
      ...s,
      active: i === idx - 1 && idx >= 1 && idx <= 4,
      done: i < idx - 1
    }));
    this.setData({ step, stepper, stepIndex: idx, errorMap: {} });
  },

  // 从 targetMemberIds 推导 memberPickerIdx
  _syncMemberPicker() {
    const ids = this.data.form.medicine.targetMemberIds || [];
    const opts = PICKER_OPTIONS.members;
    let idx = 0;
    if (ids.length >= 3) {
      idx = opts.findIndex(o => o.key === 'family');
    } else if (ids.includes('U003')) {
      idx = opts.findIndex(o => o.key === 'U003');
    } else if (ids.includes('U002')) {
      idx = opts.findIndex(o => o.key === 'U002');
    }
    this.setData({ memberPickerIdx: idx < 0 ? 0 : idx });
  },

  _syncCategoryPicker() {
    const c = this.data.form.medicine.category;
    const i = this.data.categoryOptions.indexOf(c);
    this.setData({ categoryPickerIdx: i < 0 ? 0 : i });
  },

  _syncLocationPicker() {
    const l = this.data.form.medicine.storageLocation;
    const i = this.data.locationOptions.indexOf(l);
    this.setData({ locationPickerIdx: i < 0 ? 0 : i });
  },

  // ==================== Step 1：choose 选择入口 ====================
  onScanBarcode() {
    // 条码流程：choose -> barcode -> ocr -> confirm -> success
    const idx = this.data.selectedBarcodeIdx;
    const first = this.data.barcodeLibrary[idx];
    this.setData({
      entryMode: 'barcode',
      barcodeRecognized: false,
      barcodeResult: null,
      form: { medicine: _emptyMedicineForm(), batch: _emptyBatchForm() },
      sources: { medicineSource: null, batchSource: null, medicineConfidence: 1, batchConfidence: 1 },
      lowMedicineConfidence: false, lowBatchConfidence: false
    });
    this._setStep('barcode');
    // 默认选中第一个（便于快速演示）
    if (first) this._doSelectBarcode(idx);
  },

  onTakePhoto() {
    // OCR-only 作为独立入口（不依赖条码）：choose -> ocr -> confirm（主档由确认页补）
    this.setData({
      entryMode: 'ocr-only',
      ocrRecognized: false,
      ocrResult: null,
      selectedOcrKey: 'high',
      form: { medicine: _emptyMedicineForm(), batch: _emptyBatchForm() },
      sources: { medicineSource: null, batchSource: null, medicineConfidence: 1, batchConfidence: 1 },
      lowMedicineConfidence: false, lowBatchConfidence: false
    });
    this._setStep('ocr');
  },

  onManualInput() {
    // 手动录入：choose -> confirm
    const med = _defaultManualMedicine();
    const bat = _defaultManualBatch();
    this.setData({
      entryMode: 'manual',
      form: { medicine: med, batch: bat },
      sources: { medicineSource: 'manual', batchSource: 'manual', medicineConfidence: 1, batchConfidence: 1 },
      lowMedicineConfidence: false, lowBatchConfidence: false,
      barcodeRecognized: false, ocrRecognized: false
    });
    this._syncMemberPicker();
    this._syncCategoryPicker();
    this._syncLocationPicker();
    this._refreshMatchPreview();
    this._setStep('confirm');
  },

  // ==================== Step 2：barcode 条码识别模拟 ====================
  onSelectBarcode(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (!Number.isFinite(idx)) return;
    this._doSelectBarcode(idx);
  },

  _doSelectBarcode(idx) {
    this.setData({ selectedBarcodeIdx: idx, barcodeRecognized: false, barcodeResult: null });
  },

  onStartBarcodeRecognize() {
    const idx = this.data.selectedBarcodeIdx;
    const entry = this.data.barcodeLibrary[idx];
    if (!entry) {
      wx.showToast({ title: '请选择模拟条码', icon: 'none' });
      return;
    }
    // 动画 loading 展示 800ms
    wx.showLoading({ title: '条码识别中...', mask: true });
    setTimeout(() => {
      wx.hideLoading();
      const res = lookupBarcode(entry.barcode);
      if (!res) {
        wx.showToast({ title: '未命中条码库', icon: 'none' });
        return;
      }
      const med = res.medicine;
      this.setData({
        barcodeRecognized: true,
        barcodeResult: {
          ...res,
          confidencePercent: pct(res.confidence),
          targetMemberLabel: med.targetMemberLabel
        },
        'form.medicine': med,
        'sources.medicineSource': 'barcode',
        'sources.medicineConfidence': res.confidence,
        lowMedicineConfidence: res.confidence < 0.8
      });
      this._syncMemberPicker();
      this._syncCategoryPicker();
      this._syncLocationPicker();
      wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    }, 800);
  },

  onBarcodeNextOcr() {
    if (!this.data.barcodeRecognized) {
      wx.showToast({ title: '请先点击开始识别', icon: 'none' });
      return;
    }
    this.setData({ ocrRecognized: false, ocrResult: null, selectedOcrKey: 'high' });
    this._setStep('ocr');
  },

  onBarcodeManual() {
    // 条码不对手动：保留当前 form.medicine（可继续改），medicine 来源转 manual
    const med = this.data.form.medicine;
    this.setData({
      'sources.medicineSource': 'manual',
      'sources.medicineConfidence': 1,
      lowMedicineConfidence: false,
      ocrRecognized: false, ocrResult: null,
      form: {
        medicine: Object.assign(_emptyMedicineForm(), med, {
          targetMemberIds: med.targetMemberIds && med.targetMemberIds.length ? med.targetMemberIds : ['U002'],
          targetMemberLabel: med.targetMemberLabel || '爸爸'
        }),
        batch: _emptyBatchForm()
      }
    });
    this._syncMemberPicker();
    this._syncCategoryPicker();
    this._syncLocationPicker();
    this._refreshMatchPreview();
    this._setStep('confirm');
  },

  // ==================== Step 3：ocr OCR 模拟 ====================
  onSelectOcr(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this.setData({ selectedOcrKey: key, ocrRecognized: false, ocrResult: null });
  },

  onStartOcrRecognize() {
    const key = this.data.selectedOcrKey;
    if (!key) return;
    wx.showLoading({ title: 'OCR 识别中...', mask: true });
    setTimeout(() => {
      wx.hideLoading();
      const res = getOcrScenario(key);
      if (!res) {
        wx.showToast({ title: '识别失败', icon: 'none' });
        return;
      }
      const lowConf = res.success ? res.confidence < 0.8 : false;
      if (res.success) {
        const currentBatch = this.data.form.batch;
        // 保留用户可能已有的 unit（手动设置过的情况）
        const merged = Object.assign({}, currentBatch, res.batch, {
          totalQuantity: res.batch.totalQuantity,
          remainingQuantity: res.batch.remainingQuantity
        });
        this.setData({
          ocrRecognized: true,
          ocrResult: {
            ...res,
            confidencePercent: pct(res.confidence)
          },
          'form.batch': merged,
          'sources.batchSource': 'ocr',
          'sources.batchConfidence': res.confidence,
          lowBatchConfidence: lowConf
        });
      } else {
        this.setData({
          ocrRecognized: true,
          ocrResult: res,   // {success:false, errorMessage}
          lowBatchConfidence: false
        });
      }
      wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    }, 900);
  },

  onOcrNextConfirm() {
    if (!this.data.ocrRecognized) {
      wx.showToast({ title: '请先选择并开始识别', icon: 'none' });
      return;
    }
    if (this.data.ocrResult && !this.data.ocrResult.success) {
      wx.showToast({ title: '识别失败，请重新识别或手动录入', icon: 'none' });
      return;
    }
    // 如果是 ocr-only 且 medicine 还是空的：补一组默认值（不强制，用户可在确认页改）
    if (this.data.entryMode === 'ocr-only') {
      const curr = this.data.form.medicine;
      if (!curr.name) {
        const fallback = {
          name: '（请填写药品名称）',
          genericName: '',
          shortName: '',
          category: '降压',
          specification: '（请填写规格）',
          manufacturer: '',
          barcode: '',
          targetMemberIds: ['U002'],
          targetMemberLabel: '爸爸',
          storageLocation: '客厅药箱'
        };
        this.setData({
          'form.medicine': Object.assign(_emptyMedicineForm(), fallback, curr),
          'sources.medicineSource': this.data.sources.medicineSource || 'manual',
          'sources.medicineConfidence': this.data.sources.medicineConfidence || 1
        });
      }
    }
    this._syncMemberPicker();
    this._syncCategoryPicker();
    this._syncLocationPicker();
    this._refreshMatchPreview();
    this._setStep('confirm');
  },

  onRetryOcr() {
    this.setData({ ocrRecognized: false, ocrResult: null, lowBatchConfidence: false });
  },

  onOcrManual() {
    // 手动录入批次：保留 OCR 结果（若有）但置信度强制 100%；若无则给默认
    const base = this.data.ocrResult && this.data.ocrResult.success
      ? this.data.ocrResult.batch
      : _defaultManualBatch();
    this.setData({
      'form.batch': base,
      'sources.batchSource': 'manual',
      'sources.batchConfidence': 1,
      lowBatchConfidence: false,
      ocrRecognized: false, ocrResult: null
    });
    this._refreshMatchPreview();
    this._setStep('confirm');
  },

  onSaveOcrDraft() {
    this._showDraftToast();
  },

  // ==================== 确认页：字段编辑 ====================
  onMedInput(e) {
    const field = e.currentTarget.dataset.field;
    const v = e.detail.value;
    this.setData({ [`form.medicine.${field}`]: v });
    this._clearFieldError(field);
  },

  onBatchInput(e) {
    const field = e.currentTarget.dataset.field;
    let v = e.detail.value;
    if (field === 'totalQuantity' || field === 'remainingQuantity') {
      v = toNumber(v, '');
    }
    this.setData({ [`form.batch.${field}`]: v });
    this._clearFieldError(field);
  },

  onMemberPicker(e) {
    const idx = Number(e.detail.value);
    const opt = PICKER_OPTIONS.members[idx] || PICKER_OPTIONS.members[0];
    this.setData({
      memberPickerIdx: idx,
      'form.medicine.targetMemberIds': opt.ids.slice(),
      'form.medicine.targetMemberLabel': opt.label
    });
    this._clearFieldError('targetMemberIds');
  },

  onCategoryPicker(e) {
    const idx = Number(e.detail.value);
    const v = this.data.categoryOptions[idx];
    this.setData({ categoryPickerIdx: idx, 'form.medicine.category': v });
    this._clearFieldError('category');
  },

  onLocationPicker(e) {
    const idx = Number(e.detail.value);
    const v = this.data.locationOptions[idx];
    this.setData({ locationPickerIdx: idx, 'form.medicine.storageLocation': v });
    this._clearFieldError('storageLocation');
  },

  onProdDateChange(e) {
    this.setData({ 'form.batch.productionDate': e.detail.value });
  },

  onExpireDateChange(e) {
    this.setData({ 'form.batch.expireDate': e.detail.value });
    this._clearFieldError('expireDate');
  },

  _clearFieldError(f) {
    if (this.data.errorMap && this.data.errorMap[f]) {
      const m = Object.assign({}, this.data.errorMap);
      delete m[f];
      this.setData({ errorMap: m });
    }
  },

  // ==================== 确认页：匹配预览 ====================
  _refreshMatchPreview() {
    const { barcode, name } = this.data.form.medicine;
    const hit = matchExistingMedicineByForm({ barcode, name });
    if (hit) {
      const reasonLabel = hit.reason === 'barcode' ? '匹配到相同条码' : '匹配到相同药品名称';
      this.setData({
        matchPreview: {
          isMatched: true,
          reasonLabel,
          existingMedicine: hit.medicine,
          existingMedicineId: hit.medicine.id,
          actionText: '将新增一个批次库存',
          cardBg: '#fff8e1',
          cardFg: '#b7791f',
          cardIcon: '🔁'
        }
      });
    } else {
      this.setData({
        matchPreview: {
          isMatched: false,
          reasonLabel: '未找到相同药品',
          actionText: '将创建新药品主档，并新增第一个批次',
          cardBg: '#eef5f1',
          cardFg: '#276754',
          cardIcon: '➕'
        }
      });
    }
  },

  // ==================== 确认页：必填校验 ====================
  _validate() {
    const m = this.data.form.medicine;
    const b = this.data.form.batch;
    const err = {};
    if (!String(m.name || '').trim()) err.name = '请填写药品名称';
    if (!String(m.specification || '').trim()) err.specification = '请填写规格';
    if (!String(b.expireDate || '').trim()) err.expireDate = '请选择有效期';
    if (!toNumber(b.totalQuantity, NaN) && String(b.totalQuantity) !== '0') err.totalQuantity = '请填写总数量';
    if (toNumber(b.remainingQuantity, NaN) === '' && String(b.remainingQuantity) !== '0' && !toNumber(b.remainingQuantity, NaN)) {
      // 空串或非法
      err.remainingQuantity = '请填写剩余数量';
    }
    if (!toNumber(b.remainingQuantity, 0) && String(b.remainingQuantity) !== '0') {
      // 0 可允许，但若完全没填（undefined/空/null）算错
      if (!b.remainingQuantity && b.remainingQuantity !== 0) err.remainingQuantity = '请填写剩余数量';
    }
    if (!m.targetMemberIds || m.targetMemberIds.length === 0) err.targetMemberIds = '请选择使用人';
    if (!String(m.category || '').trim()) err.category = '请选择类别';
    if (!String(m.storageLocation || '').trim()) err.storageLocation = '请选择存放位置';
    this.setData({ errorMap: err });
    return Object.keys(err).length === 0;
  },

  _firstErrorKey() {
    const keys = Object.keys(this.data.errorMap || {});
    return keys[0];
  },

  // ==================== 确认页：按钮 ====================
  onConfirmSave() {
    if (!this._validate()) {
      const first = this._firstErrorKey();
      wx.showToast({
        title: this.data.errorMap[first] || '请完善必填字段',
        icon: 'none'
      });
      return;
    }
    // 生成预览
    const medicine = Object.assign({}, this.data.form.medicine, {
      targetMemberIds: (this.data.form.medicine.targetMemberIds || []).slice()
    });
    const batch = Object.assign({}, this.data.form.batch, {
      totalQuantity: toNumber(batch_total(this.data)),
      remainingQuantity: toNumber(batch_remain(this.data))
    });
    if (!batch.remainingQuantity && batch.remainingQuantity !== 0) {
      batch.remainingQuantity = batch.totalQuantity;
    }
    const batchStatus = _computePreviewBatchStatus(batch);
    const batchStatusLabel = statusLabel(batchStatus);
    const batchStatusColor = statusColor(batchStatus);
    const expireDays = daysBetween(batch.expireDate);
    const expireDaysText = batchStatus === 'expired'
      ? `已过期 ${Math.abs(expireDays)} 天`
      : `还有 ${expireDays} 天`;

    // 修复：保存前基于最新表单重新执行匹配判断
    // 不依赖进入确认页时生成的 matchPreview，避免用户修改名称/条码后预览不准确
    const freshMatch = matchExistingMedicineByForm({
      barcode: medicine.barcode,
      name: medicine.name
    });
    const matched = !!freshMatch;
    const matchedExistingMedicine = freshMatch ? freshMatch.medicine : null;
    const actionSummary = matched
      ? `已找到同名药品，将新增一个批次库存。`
      : `将创建新药品主档，并新增第一个批次。`;

    wx.showModal({
      title: '保存前预览',
      content: `${actionSummary}\n\n药品：${medicine.name}\n批次：${batch.batchNo || '（系统生成）'}\n有效期：${batch.expireDate}（${expireDaysText}）\n批次状态：${batchStatusLabel}`,
      confirmText: '确认保存',
      confirmColor: '#2e7d6a',
      cancelText: '再看看',
      success: (r) => {
        if (!r.confirm) return;
        // 构造成功页展示数据（使用最新匹配结果）
        const finalMedicineId = matchedExistingMedicine ? matchedExistingMedicine.id : null;
        const savePreview = {
          actionSummary,
          isMatched: matched,
          finalMedicineId,
          showDetailBtn: !!finalMedicineId,
          finalMedicine: matchedExistingMedicine || medicine,
          finalBatch: batch,
          batchStatus,
          batchStatusLabel,
          batchStatusColor,
          expireDaysText,
          batchSource: this.data.sources.batchSource === 'ocr' ? 'OCR'
                   : this.data.sources.batchSource === 'manual' ? '手动' : '未知',
          medicineSource: this.data.sources.medicineSource === 'barcode' ? '条码'
                        : this.data.sources.medicineSource === 'ocr' ? 'OCR' : '手动'
        };
        this.setData({ savePreview });
        this._setStep('success');
      }
    });
  },

  onSaveDraft() {
    this._showDraftToast();
  },

  _showDraftToast() {
    wx.showModal({
      title: '已保存为草稿',
      content: '已保存为待确认草稿，稍后可继续完善。\n\n未确认前不会进入正式家庭药品台账。',
      showCancel: false,
      confirmText: '好的',
      confirmColor: '#2e7d6a'
    });
  },

  onBackReIdentify() {
    // 根据 entryMode 和当前是否有 OCR/条码 选择回退到哪一步：优先回到 OCR，再回到条码
    const mode = this.data.entryMode;
    if (mode === 'manual') {
      this._setStep('choose');
      return;
    }
    if (mode === 'ocr-only') {
      this.setData({ ocrRecognized: false, ocrResult: null });
      this._setStep('ocr');
      return;
    }
    // barcode 模式：回到 OCR 步（如果 OCR 没做过）或条码步
    if (this.data.ocrRecognized || this.data.sources.batchSource) {
      this.setData({ ocrRecognized: false, ocrResult: null });
      this._setStep('ocr');
    } else {
      this.setData({ barcodeRecognized: false, barcodeResult: null });
      this._setStep('barcode');
    }
  },

  // ==================== Step 5：成功页 ====================
  onGoMedicines() {
    wx.switchTab({ url: '/pages/medicines/medicines' });
  },

  onGoDetail() {
    const id = this.data.savePreview && this.data.savePreview.finalMedicineId;
    if (!id) {
      wx.showToast({
        title: '演示版本：新药品主档暂未真实写入，已返回药箱',
        icon: 'none',
        duration: 2200
      });
      setTimeout(() => wx.switchTab({ url: '/pages/medicines/medicines' }), 900);
      return;
    }
    wx.redirectTo({
      url: `/pages/medicine-detail/medicine-detail?id=${id}`
    });
  },

  // ==================== 通用：返回选择页（顶部） ====================
  onBackToChoose() {
    this._setStep('choose');
  },

  onBackToPrev() {
    // 顶部小"返回"：按 step 顺序倒退回
    const s = this.data.step;
    if (s === 'barcode' || s === 'ocr-only' || s === 'success') this._setStep('choose');
    else if (s === 'ocr') {
      if (this.data.entryMode === 'barcode') this._setStep('barcode');
      else this._setStep('choose');
    }
    else if (s === 'confirm') {
      if (this.data.entryMode === 'manual') this._setStep('choose');
      else if (this.data.entryMode === 'ocr-only') this._setStep('ocr');
      else this._setStep('ocr');
    }
    else this._setStep('choose');
  }
});

// -------------------- 辅助：避免在对象字面量里访问未定义变量 --------------------
function batch_total(data) { return data.form.batch.totalQuantity; }
function batch_remain(data) { return data.form.batch.remainingQuantity; }
