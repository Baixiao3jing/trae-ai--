// utils/appStore.js
// 药无忧第六阶段：真实用户从零开始使用的本地状态层
// 管理：currentUser / currentFamily / members / medicines / medicineBatches
//       / medicationPlans / medicationRecords
// 数据持久化到 wx.Storage（不接云），默认为"空状态"，用户创建家庭后才有数据
// 同时保留：demoSeedData（原 mock 全套数据），通过 loadDemoSeedData() 按需加载，
// 仅在 ENABLE_DEMO_TOOLS=true 时作为开发体验能力暴露，不影响真实主路径。

// ============================================================
// 功能开关：ENABLE_DEMO_TOOLS
// ============================================================
// false：正式产品模式，隐藏"角色切换/加载演示数据/重置演示数据"等开发演示工具，
//        家庭成员模板不默认填入"爸爸/妈妈/小李"等示例名字，首页/我的/老人端
//        不出现"预览/模拟/演示"等字样。
// true ：开发体验模式，打开上述入口，便于比赛演示和调试。
// ============================================================
const ENABLE_DEMO_TOOLS = false;

const {
  family: demoFamily,
  members: demoMembers,
  medicines: demoMedicines,
  medicineBatches: demoBatches,
  medicationPlans: demoPlans,
  medicationRecords: demoRecords,
  mockBarcodeLibrary,
  mockOcrResults,
  lookupBarcode: origLookupBarcode,
  getOcrScenario: origGetOcrScenario,
  categoryColor,
  FILTER_META,
  PICKER_OPTIONS
} = require('./mockData.js');
const reminderPolicy = require('./reminderPolicy.js');

// ==================== Storage Key ====================
const APP_STATE_KEY = 'yaowuyou_app_state_v1';
const INVITE_PREFIX = 'YAO'; // 邀请码前缀

// ==================== 内部辅助 ====================
function _clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function _pad(n) { return n < 10 ? '0' + n : '' + n; }
function _nowDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
}
function _nowDateTimeStr() {
  const d = new Date();
  return `${_nowDateStr()} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
}
function _genId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000).toString(36);
}
function _genInviteCode() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${INVITE_PREFIX}${n}`;
}
function _normalizeBarcode(code) {
  return String(code || '').trim().replace(/[^0-9A-Za-z]/g, '');
}
function _medicineCoverText(medicine) {
  const name = String((medicine && (medicine.shortName || medicine.name)) || '').trim();
  if (name) return name.slice(0, 1);
  const category = String((medicine && medicine.category) || '').trim();
  return category ? category.slice(0, 1) : '药';
}
function _normalizeCloudRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = Object.assign({}, row);
  if (!out.id && out._id) out.id = out._id;
  return out;
}
function _addAccessLog(state, { action, target, actionType }) {
  state.accessLogs = state.accessLogs || [];
  state.accessLogs.unshift({
    id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    time: _nowDateTimeStr(),
    action,
    target,
    by: (state.currentUser && state.currentUser.name) || '当前用户',
    actionType
  });
}
function _normalizeQuantity(value, label, allowZero) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n <= 0)) {
    throw new Error(`${label}必须${allowZero ? '不小于 0' : '大于 0'}`);
  }
  return n;
}
function _normalizeTimeText(time) {
  const t = String(time || '').trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return '';
  return `${_pad(h)}:${_pad(min)}`;
}
function _todayDateTime(time) {
  return `${_nowDateStr()} ${_normalizeTimeText(time) || '08:00'}`;
}
function _recordStatusForScheduledTime(scheduledTime) {
  const time = String(scheduledTime || '').split(' ')[1] || '00:00';
  const now = new Date();
  const current = `${_pad(now.getHours())}:${_pad(now.getMinutes())}`;
  return time > current ? 'upcoming' : 'pending';
}

// ==================== 空状态初始值 ====================
function _initialState() {
  return {
    currentUser: {
      id: 'U001',
      name: '当前用户',
      role: 'admin',
      roleLabel: '管理员',
      avatar: '👤',
      relation: '本人',
      canEdit: true
    },
    currentFamily: null,
    members: [],
    medicines: [],
    medicineBatches: [],
    medicationPlans: [],
    medicationRecords: [],
    inventoryMovements: [],
    inventoryAudits: [],
    inventoryAuditItems: [],
    inventoryAuditSettings: { enabled: true, dayOfMonth: 1, reminderTime: '19:00' },
    notificationSettings: null,
    accessLogs: []
  };
}

// ==================== 读写 ====================
let _memCache = null;
function readAppState() {
  if (_memCache) return _memCache;
  try {
    const saved = wx.getStorageSync(APP_STATE_KEY);
    if (saved && typeof saved === 'object' && saved.currentUser) {
      _memCache = saved;
      return _memCache;
    }
  } catch (e) {}
  const init = _initialState();
  init.members = [{ ...init.currentUser, joinTime: _nowDateStr() }];
  _writeAppState(init);
  _memCache = init;
  return init;
}

function _writeAppState(state) {
  _memCache = state;
  try { wx.setStorageSync(APP_STATE_KEY, state); } catch (e) {}
}

// ==================== 状态判断辅助 ====================
function hasFamily() { return !!readAppState().currentFamily; }
function hasAnyMedicine() {
  const s = readAppState();
  return s.medicines && s.medicines.length > 0;
}

// ==================== 1. 用户 & 家庭 ====================
function getCurrentUser() { return _clone(readAppState().currentUser); }
function updateCurrentUser(patch) {
  const s = readAppState();
  s.currentUser = Object.assign({}, s.currentUser, patch || {});
  // 同步更新 members 里的自己
  s.members = s.members.map(m => m.id === s.currentUser.id ? { ...m, ...patch } : m);
  _writeAppState(s);
  return getCurrentUser();
}
function getCurrentFamily() {
  const f = readAppState().currentFamily;
  return f ? _clone(f) : null;
}
function getMembers() { return _clone(readAppState().members); }
function clearFamilyCache() {
  const s = readAppState();
  const next = _initialState();
  next.currentUser = Object.assign({}, next.currentUser, {
    id: s.currentUser && s.currentUser.id ? s.currentUser.id : next.currentUser.id,
    name: s.currentUser && s.currentUser.name ? s.currentUser.name : next.currentUser.name
  });
  next.members = [{ ...next.currentUser, joinTime: _nowDateStr() }];
  _writeAppState(next);
  return _clone(next);
}
function getActiveFamilyId() {
  const f = readAppState().currentFamily;
  return f ? (f.id || f._id) : '';
}
function syncFromCloudSnapshot(snapshot) {
  if (!snapshot || !snapshot.family) return readAppState();
  const s = readAppState();
  s.currentFamily = _normalizeCloudRow(snapshot.family);
  s.members = (snapshot.members || []).map(m => _normalizeCloudRow(m));
  s.medicines = (snapshot.medicines || []).map(m => _normalizeCloudRow(m));
  s.medicineBatches = (snapshot.medicineBatches || []).map(b => _normalizeCloudRow(b));
  s.medicationPlans = (snapshot.medicationPlans || []).map(p => _normalizeCloudRow(p));
  s.medicationRecords = (snapshot.medicationRecords || []).map(r => _normalizeCloudRow(r));
  s.inventoryMovements = (snapshot.inventoryMovements || []).map(r => _normalizeCloudRow(r));
  s.inventoryAudits = (snapshot.inventoryAudits || []).map(r => _normalizeCloudRow(r));
  s.inventoryAuditItems = (snapshot.inventoryAuditItems || []).map(r => _normalizeCloudRow(r));
  s.inventoryAuditSettings = snapshot.inventoryAuditSettings || s.inventoryAuditSettings;
  s.notificationSettings = snapshot.notificationSettings || null;
  s.accessLogs = (snapshot.accessLogs || []).map(l => _normalizeCloudRow(l));
  const selfMember = snapshot.currentMember
    ? _normalizeCloudRow(snapshot.currentMember)
    : s.members.find(m => m.openid && snapshot.openid && m.openid === snapshot.openid);
  if (selfMember) {
    s.currentUser = Object.assign({}, s.currentUser, selfMember, {
      id: selfMember.id || selfMember._id || s.currentUser.id
    });
  }
  _writeAppState(s);
  return _clone(s);
}

function createFamily({ familyName, adminName, note }) {
  const s = readAppState();
  if (!familyName || !String(familyName).trim()) {
    throw new Error('家庭名称不能为空');
  }
  const name = String(familyName).trim();
  const remark = note ? String(note).trim() : '';
  const adminNameTrim = adminName ? String(adminName).trim() : s.currentUser.name;
  const now = _nowDateStr();
  const family = {
    id: _genId('F'),
    name: name,
    note: remark,
    inviteCode: _genInviteCode(),
    createdAt: now,
    createdBy: s.currentUser.id,
    adminName: adminNameTrim
  };
  // 更新当前用户信息（如果填了管理员姓名则更新）
  if (adminNameTrim && s.currentUser.name !== adminNameTrim) {
    s.currentUser = Object.assign({}, s.currentUser, { name: adminNameTrim });
  }
  // 把自己加入 members（如果未加入）
  let members = s.members || [];
  if (!members.find(m => m.id === s.currentUser.id)) {
    members = [{ ...s.currentUser, joinTime: now }, ...members];
  } else {
    members = members.map(m => m.id === s.currentUser.id
      ? { ...m, ...s.currentUser, joinTime: m.joinTime || now }
      : m);
  }
  s.currentFamily = family;
  s.members = members;
  // 家庭创建访问记录
  s.accessLogs = s.accessLogs || [];
  s.accessLogs.unshift({
    id: 'LOG-' + Date.now(),
    time: _nowDateTimeStr(),
    action: '创建家庭',
    target: family.name,
    by: s.currentUser.name,
    actionType: 'create'
  });
  _writeAppState(s);
  return _clone(family);
}

// ==================== 2. 成员管理（预设家庭关系模板） ====================
// 当 ENABLE_DEMO_TOOLS=false：模板 name 留空（由用户输入自定义姓名），
// 仅提供"关系/角色/头像"的快速骨架，避免默认出现"爸爸/妈妈"的示例成员。
// 当 ENABLE_DEMO_TOOLS=true：保留旧演示名字方便比赛/调试时一键加示例成员。
const PRESET_MEMBER_TEMPLATES = ENABLE_DEMO_TOOLS
  ? {
      dad:   { name: '爸爸', avatar: '👴', role: 'elder',  roleLabel: '老人',       relation: '父亲', canEdit: false },
      mom:   { name: '妈妈', avatar: '👵', role: 'elder',  roleLabel: '老人',       relation: '母亲', canEdit: false },
      other: { name: '其他家人', avatar: '👩', role: 'member', roleLabel: '家庭成员', relation: '家人', canEdit: false }
    }
  : {
      elder_male:   { name: '', avatar: '👴', role: 'elder',  roleLabel: '老人',       relation: '父亲/公公/岳父等', canEdit: false },
      elder_female: { name: '', avatar: '👵', role: 'elder',  roleLabel: '老人',       relation: '母亲/婆婆/岳母等', canEdit: false },
      spouse:       { name: '', avatar: '👩‍❤️‍👨', role: 'member', roleLabel: '家庭成员', relation: '配偶',         canEdit: true },
      child:        { name: '', avatar: '👧', role: 'member', roleLabel: '家庭成员', relation: '子女',         canEdit: true },
      other:        { name: '', avatar: '👥', role: 'member', roleLabel: '家庭成员', relation: '其他家人',     canEdit: false }
    };

function addMemberFromTemplate(templateKey, customName) {
  const tpl = PRESET_MEMBER_TEMPLATES[templateKey] || PRESET_MEMBER_TEMPLATES.other;
  const s = readAppState();
  if (!s.currentFamily) throw new Error('请先创建家庭');
  const nameRaw = (customName && customName.trim()) || tpl.name;
  const name = nameRaw && nameRaw.trim();
  if (!name) {
    throw new Error('请填写该家人的姓名或称呼');
  }
  const relation = tpl.relation;
  const exist = s.members.find(m => m.name === name && m.relation === relation);
  if (exist) return _clone(exist);
  const mem = {
    id: _genId('U'),
    name,
    role: tpl.role,
    roleLabel: tpl.roleLabel,
    avatar: tpl.avatar,
    relation,
    canEdit: tpl.canEdit,
    joinTime: _nowDateStr()
  };
  s.members = s.members.concat([mem]);
  s.accessLogs = s.accessLogs || [];
  s.accessLogs.unshift({
    id: 'LOG-' + Date.now(),
    time: _nowDateTimeStr(),
    action: '邀请成员加入',
    target: `${name}（${mem.relation}）`,
    by: s.currentUser.name,
    actionType: 'invite'
  });
  _writeAppState(s);
  return _clone(mem);
}

// ==================== 3. 药品 & 批次 ====================
function getMedicines() { return _clone(readAppState().medicines || []); }
function getMedicineBatches(medicineId) {
  const list = readAppState().medicineBatches || [];
  return _clone(medicineId ? list.filter(b => b.medicineId === medicineId) : list);
}
function getMedicineById(id) {
  const m = (readAppState().medicines || []).find(x => x.id === id);
  return m ? _clone(m) : null;
}

/**
 * 同条码或同名药品是否已存在
 * @returns {null|{medicine: object, matchType: 'barcode'|'name'}}
 */
function matchExistingMedicineByForm({ barcode, name }) {
  const meds = readAppState().medicines || [];
  const normalizedBarcode = _normalizeBarcode(barcode);
  if (normalizedBarcode) {
    const byCode = meds.find(m => _normalizeBarcode(m.barcode) === normalizedBarcode ||
      ((m.barcodeAliases || []).map(_normalizeBarcode).indexOf(normalizedBarcode) !== -1));
    if (byCode) return { medicine: _clone(byCode), matchType: 'barcode' };
  }
  if (name) {
    const byName = meds.find(m => m.name && String(m.name).trim() === String(name).trim());
    if (byName) return { medicine: _clone(byName), matchType: 'name' };
  }
  return null;
}

/**
 * 录入药品：同条码/同名则新增批次；否则新建主档+第一个批次
 * @returns {{medicineId: string, isNewMedicine: boolean, newBatchId: string}}
 */
function addMedicineAndBatch(medicineForm, batchForm) {
  const s = readAppState();
  if (!s.currentFamily) throw new Error('请先创建家庭');
  if (!medicineForm || !medicineForm.name) throw new Error('药品名称必填');
  if (!batchForm || !batchForm.expireDate) throw new Error('有效期必填');

  const now = _nowDateStr();
  const med = { ...medicineForm };
  if (med.barcode) med.barcode = _normalizeBarcode(med.barcode);
  med.coverImage = med.coverImage ? String(med.coverImage).trim() : '';
  med.coverSource = med.coverImage ? (med.coverSource || 'photo') : 'none';
  if (med.barcodeAliases && med.barcode) {
    med.barcodeAliases = Array.from(new Set((med.barcodeAliases || []).map(_normalizeBarcode).filter(Boolean).concat([med.barcode])));
  }
  const batch = { ...batchForm };
  const familyId = s.currentFamily.id;
  const totalQuantity = Number(batch.totalQuantity);
  const remainingQuantity = Number(batch.remainingQuantity);
  if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) throw new Error('总数量必须大于 0');
  if (!Number.isFinite(remainingQuantity) || remainingQuantity < 0) throw new Error('剩余数量不能小于 0');
  if (remainingQuantity > totalQuantity) throw new Error('剩余数量不能大于总数量');

  // 匹配
  const match = matchExistingMedicineByForm({ barcode: med.barcode, name: med.name });
  let targetMed;
  let isNew = false;

  if (match) {
    targetMed = s.medicines.find(m => m.id === match.medicine.id);
    // 合并用户填写但 targetMed 还没有的字段
    Object.keys(med).forEach(k => {
      if (!targetMed[k] && med[k] !== undefined && med[k] !== '') {
        targetMed[k] = med[k];
      }
    });
    // targetMemberIds 并集
    if (med.targetMemberIds && med.targetMemberIds.length) {
      targetMed.targetMemberIds = Array.from(new Set((targetMed.targetMemberIds || []).concat(med.targetMemberIds)));
    }
    if (med.barcode) {
      targetMed.barcodeAliases = Array.from(new Set((targetMed.barcodeAliases || []).concat([targetMed.barcode, med.barcode]).map(_normalizeBarcode).filter(Boolean)));
      if (!targetMed.barcode) targetMed.barcode = med.barcode;
    }
  } else {
    isNew = true;
    targetMed = Object.assign({
      id: _genId('M'),
      familyId,
      status: 'active',
      createdAt: now,
      createdBy: s.currentUser.id,
      shortName: med.shortName || med.name,
      genericName: med.genericName || med.name,
      category: med.category || '',
      specification: med.specification || '',
      manufacturer: med.manufacturer || '',
      barcode: med.barcode || '',
      targetMemberIds: med.targetMemberIds || [],
      storageLocation: med.storageLocation || '',
      coverImage: med.coverImage || '',
      coverImageCloudId: med.coverImageCloudId || '',
      coverSource: med.coverImage ? (med.coverSource || 'photo') : 'none'
    }, med);
    s.medicines.push(targetMed);
  }

  // 新增批次
  const batchNoVal = (batch.batchNo && batch.batchNo.trim()) || `B-${_nowDateStr().replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
  const newBatch = Object.assign({
    id: _genId('B'),
    medicineId: targetMed.id,
    familyId,
    batchNo: batchNoVal,
    productionDate: batch.productionDate || '',
    expireDate: batch.expireDate,
    totalQuantity,
    remainingQuantity,
    unit: batch.unit || '份',
    confidence: Number(batch.confidence) || 1,
    source: batch.source || 'manual',
    status: 'active',
    addedAt: now,
    addedBy: s.currentUser.id
  }, batch);
  newBatch.totalQuantity = totalQuantity;
  newBatch.remainingQuantity = remainingQuantity;
  if (!newBatch.remainingQuantity && newBatch.remainingQuantity !== 0) {
    newBatch.remainingQuantity = newBatch.totalQuantity;
  }
  s.medicineBatches.push(newBatch);

  // 访问记录
  s.accessLogs = s.accessLogs || [];
  s.accessLogs.unshift({
    id: 'LOG-' + Date.now(),
    time: _nowDateTimeStr(),
    action: isNew ? '新增药品主档+批次' : '新增批次',
    target: `${targetMed.name} · ${newBatch.batchNo}`,
    by: s.currentUser.name,
    actionType: 'create'
  });

  _writeAppState(s);
  return { medicineId: targetMed.id, isNewMedicine: isNew, newBatchId: newBatch.id };
}

function updateMedicine(medicineId, patch) {
  const s = readAppState();
  if (!s.currentFamily) throw new Error('请先创建家庭');
  const target = (s.medicines || []).find(m => m.id === medicineId);
  if (!target) throw new Error('未找到该药品');

  const p = patch || {};
  const required = [
    ['name', '药品名称'],
    ['specification', '规格'],
    ['category', '类别'],
    ['targetMemberLabel', '使用人'],
    ['storageLocation', '存放位置']
  ];
  required.forEach(([key, label]) => {
    if (Object.prototype.hasOwnProperty.call(p, key) && !String(p[key] || '').trim()) {
      throw new Error(`${label}不能为空`);
    }
  });

  const allowed = [
    'name', 'shortName', 'genericName', 'specification', 'category', 'manufacturer',
    'barcode', 'barcodeAliases', 'targetMemberIds', 'targetMemberLabel',
    'customTargetMemberName', 'storageLocation', 'coverImage', 'coverImageCloudId', 'coverSource'
  ];
  allowed.forEach(k => {
    if (!Object.prototype.hasOwnProperty.call(p, k)) return;
    if (k === 'barcode') {
      target.barcode = _normalizeBarcode(p.barcode);
      if (target.barcode) {
        target.barcodeAliases = Array.from(new Set((target.barcodeAliases || []).concat([target.barcode]).map(_normalizeBarcode).filter(Boolean)));
      }
      return;
    }
    if (k === 'barcodeAliases') {
      target.barcodeAliases = Array.from(new Set((p.barcodeAliases || []).map(_normalizeBarcode).filter(Boolean)));
      return;
    }
    if (k === 'targetMemberIds') {
      target.targetMemberIds = Array.isArray(p.targetMemberIds) ? p.targetMemberIds : [];
      return;
    }
    target[k] = typeof p[k] === 'string' ? p[k].trim() : p[k];
  });
  target.shortName = target.shortName || target.name;
  target.genericName = target.genericName || target.name;
  target.coverSource = target.coverImage ? (target.coverSource || 'photo') : 'none';
  target.updatedAt = _nowDateTimeStr();
  target.updatedBy = s.currentUser.id;

  _addAccessLog(s, {
    action: '修改药品主档',
    target: target.name,
    actionType: 'update'
  });
  _writeAppState(s);
  return _clone(target);
}

function _normalizeBatchForm(batchForm, existing) {
  const b = batchForm || {};
  const totalRaw = Object.prototype.hasOwnProperty.call(b, 'totalQuantity')
    ? b.totalQuantity
    : existing && existing.totalQuantity;
  const remainRaw = Object.prototype.hasOwnProperty.call(b, 'remainingQuantity')
    ? b.remainingQuantity
    : existing && existing.remainingQuantity;
  const totalQuantity = _normalizeQuantity(totalRaw, '总数量', false);
  const remainingQuantity = _normalizeQuantity(remainRaw, '剩余数量', true);
  if (remainingQuantity > totalQuantity) throw new Error('剩余数量不能大于总数量');
  const expireDate = String((Object.prototype.hasOwnProperty.call(b, 'expireDate') ? b.expireDate : existing && existing.expireDate) || '').trim();
  if (!expireDate) throw new Error('有效期必填');
  const unit = String((Object.prototype.hasOwnProperty.call(b, 'unit') ? b.unit : existing && existing.unit) || '').trim();
  if (!unit) throw new Error('单位必填');
  return {
    batchNo: String((Object.prototype.hasOwnProperty.call(b, 'batchNo') ? b.batchNo : existing && existing.batchNo) || '').trim(),
    productionDate: String((Object.prototype.hasOwnProperty.call(b, 'productionDate') ? b.productionDate : existing && existing.productionDate) || '').trim(),
    expireDate,
    totalQuantity,
    remainingQuantity,
    unit,
    imageSourceNote: String((Object.prototype.hasOwnProperty.call(b, 'imageSourceNote') ? b.imageSourceNote : existing && existing.imageSourceNote) || '').trim(),
    note: String((Object.prototype.hasOwnProperty.call(b, 'note') ? b.note : existing && existing.note) || '').trim()
  };
}

function addBatchToMedicine(medicineId, batchForm) {
  const s = readAppState();
  if (!s.currentFamily) throw new Error('请先创建家庭');
  const medicine = (s.medicines || []).find(m => m.id === medicineId);
  if (!medicine) throw new Error('未找到该药品');
  const normalized = _normalizeBatchForm(batchForm);
  const now = _nowDateStr();
  const batchNo = normalized.batchNo || `B-${_nowDateStr().replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
  const newBatch = {
    id: _genId('B'),
    medicineId,
    familyId: s.currentFamily.id,
    batchNo,
    productionDate: normalized.productionDate,
    expireDate: normalized.expireDate,
    totalQuantity: normalized.totalQuantity,
    remainingQuantity: normalized.remainingQuantity,
    unit: normalized.unit,
    confidence: Number(batchForm && batchForm.confidence) || 1,
    source: (batchForm && batchForm.source) || 'manual',
    status: 'active',
    addedAt: now,
    addedBy: s.currentUser.id,
    imageSourceNote: normalized.imageSourceNote,
    note: normalized.note
  };
  s.medicineBatches = (s.medicineBatches || []).concat([newBatch]);
  _addAccessLog(s, {
    action: '新增批次',
    target: `${medicine.name} · ${newBatch.batchNo}`,
    actionType: 'create'
  });
  _writeAppState(s);
  return _clone(newBatch);
}

function updateMedicineBatch(batchId, patch) {
  const s = readAppState();
  if (!s.currentFamily) throw new Error('请先创建家庭');
  const batch = (s.medicineBatches || []).find(b => b.id === batchId);
  if (!batch) throw new Error('未找到该批次');
  const medicine = (s.medicines || []).find(m => m.id === batch.medicineId);
  const normalized = _normalizeBatchForm(patch, batch);
  Object.assign(batch, normalized, {
    updatedAt: _nowDateTimeStr(),
    updatedBy: s.currentUser.id
  });
  _addAccessLog(s, {
    action: '修改批次',
    target: `${medicine ? medicine.name : '药品'} · ${batch.batchNo}`,
    actionType: 'update'
  });
  _writeAppState(s);
  return _clone(batch);
}

function setMedicineBatchStatus(batchId, status) {
  const nextStatus = status === 'disabled' ? 'disabled' : 'active';
  const s = readAppState();
  if (!s.currentFamily) throw new Error('请先创建家庭');
  const batch = (s.medicineBatches || []).find(b => b.id === batchId);
  if (!batch) throw new Error('未找到该批次');
  const medicine = (s.medicines || []).find(m => m.id === batch.medicineId);
  batch.status = nextStatus;
  batch.statusChangedAt = _nowDateTimeStr();
  batch.statusChangedBy = s.currentUser.id;
  _addAccessLog(s, {
    action: nextStatus === 'disabled' ? '停用批次' : '恢复批次',
    target: `${medicine ? medicine.name : '药品'} · ${batch.batchNo}`,
    actionType: nextStatus === 'disabled' ? 'disable' : 'update'
  });
  _writeAppState(s);
  return _clone(batch);
}

// ==================== 4. 提醒计划 & 记录 ====================
function getMedicationPlans() { return _clone((readAppState().medicationPlans || []).filter(p => !p.duplicateOf)); }
function getMedicationPlansByMedicine(medicineId) {
  const plans = readAppState().medicationPlans || [];
  return _clone(plans.filter(p => p.medicineId === medicineId && !p.duplicateOf));
}
function getMedicationRecords() { return _clone(readAppState().medicationRecords || []); }
function _normalizePlanForm(planForm, existing) {
  const p = planForm || {};
  const medicineId = String(p.medicineId || (existing && existing.medicineId) || '').trim();
  const memberId = String(p.memberId || (existing && existing.memberId) || '').trim();
  const dosePerTime = String(p.dosePerTime || (existing && existing.dosePerTime) || '').trim();
  const doseQuantity = Number(Object.prototype.hasOwnProperty.call(p, 'doseQuantity') ? p.doseQuantity : (existing && existing.doseQuantity));
  const doseUnit = String(p.doseUnit || (existing && existing.doseUnit) || '').trim();
  const startDate = String(p.startDate || (existing && existing.startDate) || _nowDateStr()).trim();
  const endDate = String(Object.prototype.hasOwnProperty.call(p, 'endDate') ? p.endDate : (existing && existing.endDate) || '').trim();
  const note = String(Object.prototype.hasOwnProperty.call(p, 'note') ? p.note : (existing && existing.note) || '').trim();
  const reminderTimes = (p.reminderTimes || (existing && existing.reminderTimes) || [])
    .map(_normalizeTimeText)
    .filter(Boolean);
  if (!medicineId) throw new Error('药品不能为空');
  if (!memberId) throw new Error('使用人不能为空');
  if (!dosePerTime) throw new Error('每次用量不能为空');
  if (!Number.isFinite(doseQuantity) || doseQuantity <= 0) throw new Error('每次用量必须大于 0');
  if (!doseUnit) throw new Error('用量单位不能为空');
  if (!startDate) throw new Error('开始日期不能为空');
  if (reminderTimes.length === 0) throw new Error('请至少设置一个提醒时间');
  const uniqueTimes = Array.from(new Set(reminderTimes)).sort();
  return {
    clientRequestId: String(p.clientRequestId || (existing && existing.clientRequestId) || '').trim(),
    medicineId,
    memberId,
    dosePerTime,
    doseQuantity,
    doseUnit,
    deductStock: Object.prototype.hasOwnProperty.call(p, 'deductStock') ? !!p.deductStock : (existing ? existing.deductStock !== false : true),
    stockWarningDays: Number(p.stockWarningDays || (existing && existing.stockWarningDays) || 7),
    timesPerDay: uniqueTimes.length,
    reminderTimes: uniqueTimes,
    needGuardianConfirm: Object.prototype.hasOwnProperty.call(p, 'needGuardianConfirm')
      ? !!p.needGuardianConfirm
      : (existing ? !!existing.needGuardianConfirm : true),
    enabled: Object.prototype.hasOwnProperty.call(p, 'enabled')
      ? !!p.enabled
      : (existing ? existing.enabled !== false : true),
    startDate,
    endDate,
    note
  };
}
function _isPlanActiveToday(plan) {
  const today = _nowDateStr();
  if (!plan || plan.enabled === false) return false;
  if (plan.startDate && plan.startDate > today) return false;
  if (plan.endDate && plan.endDate < today) return false;
  return true;
}
function _syncTodayRecordsForPlan(state, plan) {
  state.medicationRecords = state.medicationRecords || [];
  if (!_isPlanActiveToday(plan)) return [];
  const today = _nowDateStr();
  const expectedTimes = (plan.reminderTimes || []).map(_normalizeTimeText).filter(Boolean);
  const expectedScheduled = expectedTimes.map(t => `${today} ${t}`);
  state.medicationRecords = state.medicationRecords.filter(r => {
    if (r.planId !== plan.id) return true;
    if (!String(r.scheduledTime || '').startsWith(today + ' ')) return true;
    if (r.status === 'done' || r.status === 'skipped') return true;
    return expectedScheduled.indexOf(r.scheduledTime) !== -1;
  });
  const created = [];
  expectedScheduled.forEach(scheduledTime => {
    const exists = state.medicationRecords.find(r => r.planId === plan.id && r.scheduledTime === scheduledTime);
    if (exists) {
      if (exists.status !== 'done' && exists.status !== 'skipped') {
        exists.status = _recordStatusForScheduledTime(scheduledTime);
      }
      return;
    }
    const rec = {
      id: _genId('R'),
      planId: plan.id,
      memberId: plan.memberId,
      medicineId: plan.medicineId,
      doseQuantity: Number(plan.doseQuantity) || 0,
      doseUnit: plan.doseUnit || '',
      scheduledTime,
      recordKey: `${plan.id}|${today}|${scheduledTime.slice(-5)}`,
      confirmedAt: null,
      skippedAt: null,
      status: _recordStatusForScheduledTime(scheduledTime)
    };
    state.medicationRecords.push(rec);
    created.push(rec);
  });
  return created;
}
function createOrUpdateMedicationPlan(planForm) {
  const s = readAppState();
  if (!s.currentFamily) throw new Error('请先创建家庭');
  const p = planForm || {};
  const existing = p.id ? (s.medicationPlans || []).find(x => x.id === p.id) : null;
  const normalized = _normalizePlanForm(p, existing);
  const medicine = (s.medicines || []).find(m => m.id === normalized.medicineId);
  if (!medicine) throw new Error('未找到该药品');
  const member = (s.members || []).find(m => m.id === normalized.memberId);
  if (!member) throw new Error('未找到使用人');
  let target = existing;
  if (target) {
    Object.assign(target, normalized, {
      updatedAt: _nowDateTimeStr(),
      updatedBy: s.currentUser.id
    });
  } else {
    target = Object.assign({
      id: _genId('P'),
      familyId: s.currentFamily.id,
      createdAt: _nowDateTimeStr(),
      createdBy: s.currentUser.id
    }, normalized);
    s.medicationPlans = (s.medicationPlans || []).concat([target]);
  }
  _syncTodayRecordsForPlan(s, target);
  _addAccessLog(s, {
    action: existing ? '修改用药计划' : '新增用药计划',
    target: `${medicine.name} · ${member.name} · ${target.reminderTimes.join('、')}`,
    actionType: existing ? 'update' : 'create'
  });
  _writeAppState(s);
  return _clone(target);
}
function setMedicationPlanEnabled(planId, enabled) {
  const s = readAppState();
  if (!s.currentFamily) throw new Error('请先创建家庭');
  const plan = (s.medicationPlans || []).find(p => p.id === planId);
  if (!plan) throw new Error('未找到用药计划');
  plan.enabled = !!enabled;
  plan.updatedAt = _nowDateTimeStr();
  plan.updatedBy = s.currentUser.id;
  if (plan.enabled) _syncTodayRecordsForPlan(s, plan);
  const medicine = (s.medicines || []).find(m => m.id === plan.medicineId);
  _addAccessLog(s, {
    action: plan.enabled ? '启用用药计划' : '停用用药计划',
    target: `${medicine ? medicine.name : '药品'} · ${plan.reminderTimes.join('、')}`,
    actionType: plan.enabled ? 'update' : 'disable'
  });
  _writeAppState(s);
  return _clone(plan);
}
function generateTodayMedicationRecords(planId) {
  const s = readAppState();
  if (!s.currentFamily) return [];
  const plan = (s.medicationPlans || []).find(p => p.id === planId);
  if (!plan) throw new Error('未找到用药计划');
  const created = _syncTodayRecordsForPlan(s, plan);
  _writeAppState(s);
  return _clone(created);
}
function ensureTodayMedicationRecords() {
  const s = readAppState();
  if (!s.currentFamily) return [];
  const plans = s.medicationPlans || [];
  const created = [];
  plans.forEach(plan => {
    created.push(..._syncTodayRecordsForPlan(s, plan));
  });
  _writeAppState(s);
  return _clone(created);
}
function confirmMedicationRecord(recordId) {
  const s = readAppState();
  const current = (s.medicationRecords || []).find(r => r.id === recordId);
  if (!current || current.status === 'done') return getMedicationRecords();
  if (!reminderPolicy.isActionable(current)) throw new Error('还没有到本次服药时间');
  const plan = (s.medicationPlans || []).find(p => p.id === current.planId);
  const quantity = Number(plan && plan.doseQuantity) || 0;
  const unit = String((plan && plan.doseUnit) || '');
  let need = quantity;
  const allocations = [];
  if (plan && plan.deductStock !== false && quantity > 0 && unit) {
    const batches = (s.medicineBatches || []).filter(b => b.medicineId === plan.medicineId && b.status !== 'disabled' && b.status !== 'inactive' && (!b.expireDate || b.expireDate >= _nowDateStr()) && b.unit === unit && Number(b.remainingQuantity) > 0)
      .sort((a, b) => String(a.expireDate || '9999').localeCompare(String(b.expireDate || '9999')));
    batches.forEach(batch => {
      if (need <= 0) return;
      const amount = Math.min(need, Number(batch.remainingQuantity));
      batch.remainingQuantity -= amount;
      need -= amount;
      allocations.push({ batchId: batch.id, quantity: amount });
    });
    s.inventoryMovements = s.inventoryMovements || [];
    s.inventoryMovements.unshift({
      id: _genId('IM'), familyId: s.currentFamily && s.currentFamily.id,
      medicineId: plan.medicineId, recordId, type: 'medication', quantity: -(quantity - need),
      requestedQuantity: quantity, shortage: need, unit, allocations, createdAt: _nowDateTimeStr()
    });
  }
  Object.assign(current, {
    status: 'done', confirmedAt: _nowDateTimeStr(), medicineId: plan && plan.medicineId,
    doseQuantity: quantity, doseUnit: unit,
    deductedQuantity: quantity - need, stockShortage: need,
    stockDeductionStatus: !plan || plan.deductStock === false ? 'disabled' : (quantity <= 0 || !unit ? 'needs_confirmation' : (need > 0 ? 'shortage' : 'done'))
  });
  s.accessLogs = s.accessLogs || [];
  const rec = s.medicationRecords.find(r => r.id === recordId);
  if (rec) {
    const mem = s.members.find(m => m.id === rec.memberId);
    s.accessLogs.unshift({
      id: 'LOG-' + Date.now(),
      time: _nowDateTimeStr(),
      action: '老人确认服药',
      target: (mem ? mem.name : '家人') + ` · 记录 ${recordId}`,
      by: mem ? mem.name : s.currentUser.name,
      actionType: 'confirm'
    });
  }
  _writeAppState(s);
  return getMedicationRecords();
}
function snoozeMedicationRecord(recordId, minutes) {
  const s = readAppState();
  const record = (s.medicationRecords || []).find(r => r.id === recordId);
  if (!record) throw new Error('未找到该提醒记录');
  if (!reminderPolicy.isActionable(record)) throw new Error('当前提醒暂不能稍后处理');
  const delay = Math.max(5, Math.min(120, Number(minutes) || 10));
  const d = new Date(Date.now() + delay * 60000);
  record.snoozedUntil = `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
  record.status = 'pending';
  _writeAppState(s);
  return _clone(record);
}
function skipMedicationRecord(recordId) {
  const s = readAppState();
  s.medicationRecords = (s.medicationRecords || []).map(r => {
    if (r.id === recordId && r.status !== 'done' && r.status !== 'skipped') {
      return Object.assign({}, r, { status: 'skipped', skippedAt: _nowDateTimeStr() });
    }
    return r;
  });
  const rec = s.medicationRecords.find(r => r.id === recordId);
  if (rec) {
    const mem = s.members.find(m => m.id === rec.memberId);
    _addAccessLog(s, {
      action: '跳过本次服药',
      target: (mem ? mem.name : '家人') + ` · 记录 ${recordId}`,
      actionType: 'update'
    });
  }
  _writeAppState(s);
  return getMedicationRecords();
}

function getMedicineUsageForecast(medicineId) {
  const s = readAppState();
  const plans = (s.medicationPlans || []).filter(p => p.medicineId === medicineId && p.enabled !== false && _isPlanActiveToday(p) && p.deductStock !== false);
  const units = Array.from(new Set(plans.map(p => p.doseUnit).filter(Boolean)));
  if (units.length !== 1) return { calculable: false, reason: plans.length ? '计划用量单位不一致' : '尚未配置启用的用药计划' };
  const unit = units[0];
  const dailyUsage = plans.reduce((sum, plan) => sum + (Number(plan.doseQuantity) || 0) * (plan.reminderTimes || []).length, 0);
  const availableStock = (s.medicineBatches || []).filter(b => b.medicineId === medicineId && b.status !== 'disabled' && b.status !== 'inactive' && (!b.expireDate || b.expireDate >= _nowDateStr()) && b.unit === unit)
    .reduce((sum, batch) => sum + (Number(batch.remainingQuantity) || 0), 0);
  if (!(dailyUsage > 0)) return { calculable: false, reason: '计划用量尚未完善' };
  const daysRemaining = Math.floor(availableStock / dailyUsage);
  const runout = new Date();
  runout.setDate(runout.getDate() + daysRemaining);
  const runoutDate = `${runout.getFullYear()}-${_pad(runout.getMonth() + 1)}-${_pad(runout.getDate())}`;
  const warningDays = Math.min(...plans.map(p => Number(p.stockWarningDays) || 7));
  return { calculable: true, unit, dailyUsage, availableStock, daysRemaining, runoutDate, warningDays, lowStock: daysRemaining <= warningDays };
}

function getPendingInventoryAudit() {
  const audits = readAppState().inventoryAudits || [];
  return _clone(audits.find(a => a.status === 'pending' || a.status === 'inProgress') || null);
}

function getInventoryAuditItems(auditId) {
  return _clone((readAppState().inventoryAuditItems || []).filter(item => item.auditId === auditId));
}

// ==================== 5. 访问日志 ====================
function getAccessLogs() { return _clone(readAppState().accessLogs || []); }

const ACCESS_LOG_STYLE = {
  create:  { label: '新增', color: '#27ae60', bg: '#eafaf1', borderColor: '#a9dfbf' },
  update:  { label: '修改', color: '#2980b9', bg: '#eaf4fc', borderColor: '#aed6f1' },
  confirm: { label: '确认', color: '#e67e22', bg: '#fef5e7', borderColor: '#fad7a0' },
  export:  { label: '导出', color: '#8e44ad', bg: '#f5eef9', borderColor: '#d7bde2' },
  invite:  { label: '邀请', color: '#566573', bg: '#f2f3f4', borderColor: '#d5d8dc' },
  disable: { label: '停用', color: '#c0392b', bg: '#fdecea', borderColor: '#f5b7b1' },
  view:    { label: '查看', color: '#2e7d6a', bg: '#eef5f1', borderColor: '#c8e6d6' }
};
function getAccessLogsWithStyle() {
  return getAccessLogs().map(log => {
    const s = ACCESS_LOG_STYLE[log.actionType] || ACCESS_LOG_STYLE.view;
    return Object.assign({}, log, s);
  });
}

// ==================== 6. 计算函数（药品汇总、仪表盘、今日关注、老人提醒） ====================
// 基于 appStore 真实数据计算，不依赖 mockData 静态数据

function _daysBetween(dateStr) {
  try {
    const d = new Date(String(dateStr).replace(/-/g, '/'));
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - t.getTime()) / 86400000);
  } catch (e) { return 99999; }
}
function _batchStatus({ expireDate, remainingQuantity }) {
  const d = _daysBetween(expireDate);
  if (d < 0) return 'expired';
  if (d <= 30) return 'nearExpire';
  if (typeof remainingQuantity === 'number' && remainingQuantity < 10) return 'lowStock';
  return 'normal';
}
const STATUS_LABEL = { normal: '正常', nearExpire: '临期', expired: '已过期', lowStock: '库存不足',
  done: '已完成', pending: '待确认', missed: '已错过', skipped: '已跳过', upcoming: '稍后服用' };
const STATUS_COLOR = { normal: '#27ae60', nearExpire: '#f39c12', expired: '#e74c3c', lowStock: '#8e44ad' };
function statusLabel(k) { return STATUS_LABEL[k] || k || ''; }
function statusColor(k) { return STATUS_COLOR[k] || '#2e7d6a'; }
function getMemberNames(ids, fallbackLabel) {
  if (!ids || ids.length === 0) return fallbackLabel || '';
  if (ids.length >= 3) return '全家备用';
  const membersList = getMembers();
  return ids.map(id => {
    const m = membersList.find(x => x.id === id);
    return m ? m.name : '家人';
  }).filter(Boolean).join('、');
}

function getMedicineSummary(medicineId) {
  const batches = (readAppState().medicineBatches || []).filter(b => b.medicineId === medicineId && b.status !== 'disabled' && b.status !== 'inactive');
  const activeBatches = batches.filter(b => b.status === 'active');
  let overall = 'normal';
  const availableStock = batches.reduce((sum, b) => sum + (Number(b.remainingQuantity) || 0), 0);
  let nearestExpire = '';
  batches.forEach(b => {
    const s = _batchStatus(b);
    // 严重程度：expired > nearExpire > lowStock > normal
    const severity = { expired: 4, nearExpire: 3, lowStock: 2, normal: 1 };
    if (severity[s] > (severity[overall] || 0)) overall = s;
    if (!nearestExpire || (b.expireDate && b.expireDate < nearestExpire)) {
      nearestExpire = b.expireDate || '';
    }
  });
  return {
    medicineId,
    status: batches.length ? overall : 'normal',
    statusLabel: statusLabel(overall),
    statusColor: statusColor(overall),
    batchCount: batches.length,
    activeBatchCount: activeBatches.length,
    availableStock,
    nearestExpire,
    needRestock: overall === 'lowStock' || overall === 'expired'
  };
}

function getMedicineBatchesForList(medicineId) {
  const s = readAppState();
  const meds = s.medicines || [];
  const batches = s.medicineBatches || [];

  // 构造批次行列表：当不指定 medicineId 时，输出与每个药品 join 后的列表行（首页/药箱列表用）
  // 指定 medicineId 时，只返回该药品对应批次（详情页用）
  let targetBatches = batches;
  if (medicineId) {
    targetBatches = batches.filter(b => b.medicineId === medicineId);
  }

  // 如果不指定 medicineId，则按药品汇总（每个药品 1 行），这是列表页/筛选需要的结构
  if (!medicineId) {
    // 只统计 status=active （非 disabled/inactive 存储级）的药品
    const activeMeds = meds.filter(m => !m.status || m.status === 'active');
    const list = activeMeds.map(m => {
      const mBatches = batches.filter(b => b.medicineId === m.id && b.status !== 'disabled' && b.status !== 'inactive');
      if (mBatches.length === 0) {
        return null;
      }
      // 每个药品计算 1 行汇总
      let worstStatus = 'normal';
      let totalStock = 0;
      let nearestExpire = null;
      const batchNos = [];
      const sev = { expired: 4, nearExpire: 3, lowStock: 2, normal: 1 };
      mBatches.forEach(b => {
        const bs = _batchStatus(b);
        if ((sev[bs] || 0) > (sev[worstStatus] || 0)) worstStatus = bs;
        totalStock += Number(b.remainingQuantity) || 0;
        if (!nearestExpire || b.expireDate < nearestExpire) nearestExpire = b.expireDate;
        if (b.batchNo) batchNos.push(b.batchNo);
      });
      return {
        id: m.id,
        medicineId: m.id,
        name: m.name,
        shortName: m.shortName || m.name,
        category: m.category || '',
        categoryColor: categoryColor(m.category),
        spec: m.specification || '',
        manufacturer: m.manufacturer || '',
        status: worstStatus,
        statusLabel: statusLabel(worstStatus),
        statusColor: statusColor(worstStatus),
        batchCount: mBatches.length,
        batchNos: batchNos,
        totalQuantity: totalStock,
        expireDate: nearestExpire,
        expireDays: nearestExpire ? _daysBetween(nearestExpire) : null,
        location: m.storageLocation || '',
        storageLocation: m.storageLocation || '',
        targetMemberIds: m.targetMemberIds || [],
        targetMemberLabel: m.targetMemberLabel || m.customTargetMemberName || '',
        forMemberText: getMemberNames(m.targetMemberIds || [], m.targetMemberLabel || m.customTargetMemberName || ''),
        coverImage: m.coverImage || '',
        coverSource: m.coverSource || 'none',
        coverText: _medicineCoverText(m),
        coverColor: categoryColor(m.category),
        needRestock: totalStock < 10,
        availableStock: totalStock
      };
    }).filter(Boolean);
    // 排序：按严重度 → 有效期
    const ord = { expired: 0, nearExpire: 1, lowStock: 2, normal: 3 };
    list.sort((a, b) => {
      const d1 = (ord[a.status] ?? 9) - (ord[b.status] ?? 9);
      if (d1 !== 0) return d1;
      return (a.expireDate || '9999').localeCompare(b.expireDate || '9999');
    });
    return list;
  }

  // 指定了 medicineId：返回该药品所有批次的独立行
  return targetBatches
    .map(b => Object.assign({}, b, {
      status: _batchStatus(b),
      statusLabel: statusLabel(_batchStatus(b)),
      statusColor: statusColor(_batchStatus(b)),
      expireDays: _daysBetween(b.expireDate)
    }))
    .sort((a, b) => {
      const ord = { expired: 0, nearExpire: 1, lowStock: 2, normal: 3 };
      const diff = (ord[a.status] ?? 9) - (ord[b.status] ?? 9);
      if (diff !== 0) return diff;
      return (a.expireDate || '').localeCompare(b.expireDate || '');
    });
}

function _getActionableTodayRecords(state) {
  const s = state || readAppState();
  const todayPrefix = _nowDateStr() + ' ';
  const plans = s.medicationPlans || [];
  const seen = new Set();
  return (s.medicationRecords || []).filter(record => {
    if (!String(record.scheduledTime || '').startsWith(todayPrefix) || !reminderPolicy.isActionable(record)) return false;
    const plan = plans.find(item => item.id === record.planId);
    const key = [plan && plan.medicineId || record.medicineId || '', record.memberId || '', record.scheduledTime || '', record.doseQuantity || '', record.doseUnit || ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getDashboardStats() {
  const s = readAppState();
  if (!s.currentFamily) {
    return {
      medicineCount: 0, nearExpireCount: 0, expiredCount: 0,
      lowStockCount: 0, todayUnconfirmedCount: 0
    };
  }
  const meds = s.medicines || [];
  const batches = s.medicineBatches || [];
  let near = 0, exp = 0, low = 0;
  const medicineAggregateStatus = {};
  meds.forEach(m => { medicineAggregateStatus[m.id] = 'normal'; });
  batches.forEach(b => {
    if (b.status === 'disabled' || b.status === 'inactive') return;
    const bs = _batchStatus(b);
    if (bs === 'expired') exp++;
    else if (bs === 'nearExpire') near++;
    else if (bs === 'lowStock') low++;
    // 归并到药品级
    const cur = medicineAggregateStatus[b.medicineId];
    const severity = { expired: 4, nearExpire: 3, lowStock: 2, normal: 1 };
    if (severity[bs] > (severity[cur] || 0)) medicineAggregateStatus[b.medicineId] = bs;
  });
  // 仪表盘按批次级统计更实用（和 mockData 保持一致）
  const unconfirmed = _getActionableTodayRecords(s).length;
  return {
    medicineCount: meds.length,
    nearExpireCount: near,
    expiredCount: exp,
    lowStockCount: low,
    todayUnconfirmedCount: unconfirmed
  };
}

function getTodayAttention() {
  const s = readAppState();
  if (!s.currentFamily) return [];
  const batches = s.medicineBatches || [];
  const meds = s.medicines || [];
  const records = s.medicationRecords || [];
  const list = [];
  // 过期批次 -> 药品维度归并
  const expiredMedIds = new Set();
  const nearMedIds = new Set();
  const lowMedIds = new Set();
  batches.forEach(b => {
    if (b.status === 'disabled' || b.status === 'inactive') return;
    const bs = _batchStatus(b);
    if (bs === 'expired') expiredMedIds.add(b.medicineId);
    else if (bs === 'nearExpire') nearMedIds.add(b.medicineId);
    else if (bs === 'lowStock') lowMedIds.add(b.medicineId);
  });
  expiredMedIds.forEach(mid => {
    const m = meds.find(x => x.id === mid); if (!m) return;
    list.push({
      id: 'ATT-EXP-' + mid, type: 'expired', typeLabel: '已过期', icon: '⚠️',
      bgColor: '#fdecea', borderColor: '#e74c3c',
      title: `${m.name} 已过期`,
      desc: `有效期已过，请及时停用并更换，点击查看详情。`,
      medicineId: mid
    });
  });
  nearMedIds.forEach(mid => {
    if (expiredMedIds.has(mid)) return;
    const m = meds.find(x => x.id === mid); if (!m) return;
    const bs = batches.filter(b => b.medicineId === mid && _batchStatus(b) === 'nearExpire').length;
    list.push({
      id: 'ATT-NEAR-' + mid, type: 'nearExpire', typeLabel: '临期', icon: '⏳',
      bgColor: '#fff8e1', borderColor: '#f39c12',
      title: `${m.name} 临期`,
      desc: `${bs} 个批次将在 30 天内到期，建议提前准备新药。`,
      medicineId: mid
    });
  });
  lowMedIds.forEach(mid => {
    if (expiredMedIds.has(mid)) return;
    const m = meds.find(x => x.id === mid); if (!m) return;
    list.push({
      id: 'ATT-LOW-' + mid, type: 'lowStock', typeLabel: '库存不足', icon: '📦',
      bgColor: '#f5eef9', borderColor: '#8e44ad',
      title: `${m.name} 库存不足`,
      desc: `库存少于 10，请尽快补货。`,
      medicineId: mid
    });
  });

  // 未确认服药
  const todayPrefix = _nowDateStr() + ' ';
  const pending = _getActionableTodayRecords(s);
  if (pending.length > 0) {
    const membersList = s.members || [];
    const names = [...new Set(pending.map(r => {
      const mm = membersList.find(m => m.id === r.memberId);
      return mm ? mm.name : '家人';
    }))].join('、');
    list.push({
      id: 'ATT-PENDING-GLOBAL', type: 'unconfirmed', typeLabel: '待确认', icon: '✅',
      bgColor: '#eafaf1', borderColor: '#27ae60',
      title: `${names} 今日服药`,
      desc: `还有 ${pending.length} 次服药待确认，点击查看老人端`,
      medicineId: null
    });
  }
  return list;
}

function generateElderReminders() {
  const s = readAppState();
  if (!s.currentFamily) return [];
  const plans = s.medicationPlans || [];
  const meds = s.medicines || [];
  const membersList = s.members || [];
  const records = s.medicationRecords || [];
  const todayPrefix = _nowDateStr() + ' ';
  const visibleRecords = [];
  const seen = new Set();
  records.filter(r => String(r.scheduledTime || '').startsWith(todayPrefix)).forEach(r => {
    const plan = plans.find(p => p.id === r.planId);
    const key = [plan && plan.medicineId || r.medicineId || '', r.memberId || '', r.scheduledTime || '', r.doseQuantity || '', r.doseUnit || ''].join('|');
    if (seen.has(key) && r.status !== 'done' && r.status !== 'skipped') return;
    seen.add(key);
    visibleRecords.push(r);
  });
  const reminders = visibleRecords.map(r => {
    const plan = plans.find(p => p.id === r.planId);
    const medicine = plan ? meds.find(m => m.id === plan.medicineId) : null;
    const mem = membersList.find(m => m.id === r.memberId);
    const st = reminderPolicy.classify(r);
    let label = '待服用';
    if (st === 'done') label = '已确认服用';
    else if (st === 'skipped') label = '已跳过';
    else if (st === 'missed') label = '已错过';
    else if (st === 'upcoming') label = '今日稍后';
    else if (st === 'snoozed') label = `稍后提醒至 ${(r.snoozedUntil || '').slice(-5)}`;
    else if (st === 'overdue') label = '已超时，待确认';
    const timeOnly = (r.scheduledTime || '').includes(' ')
      ? r.scheduledTime.split(' ')[1]
      : (r.scheduledTime || '--:--');
    return {
      id: r.id, recordId: r.id, planId: r.planId,
      medicineId: medicine ? medicine.id : null,
      medicineName: medicine ? medicine.name : '未知药品',
      memberId: r.memberId,
      memberName: mem ? mem.name : '家人',
      time: timeOnly,
      dosage: plan ? plan.dosePerTime : '1份',
      status: st, statusLabel: label,
      actionable: st === 'due' || st === 'overdue',
      snoozedUntil: r.snoozedUntil || '',
      displayHint: st === 'snoozed' ? label : `将在 ${timeOnly} 提醒，未到时间不能确认`,
      icon: '💊'
    };
  });
  reminders.sort((a, b) => a.time.localeCompare(b.time));
  return reminders;
}

// ==================== 7. 角色 ====================
function setCurrentRoleId(userId) {
  try { wx.setStorageSync('yaowuyou_current_role', userId || 'U001'); } catch (e) {}
  return userId || 'U001';
}
function getCurrentRoleId() {
  try {
    const s = wx.getStorageSync('yaowuyou_current_role');
    if (s && typeof s === 'string') return s;
  } catch (e) {}
  return 'U001';
}
function isCurrentRoleAdmin() {
  const id = getCurrentRoleId();
  const mem = (readAppState().members || []).find(m => m.id === id);
  if (mem) return mem.role === 'admin';
  return id === 'U001';
}
function getCurrentRole() {
  const id = getCurrentRoleId();
  const mem = (readAppState().members || []).find(m => m.id === id);
  if (mem) return _clone(mem);
  return getCurrentUser();
}

// ==================== 8. 重置 & 种子数据 ====================
function resetLocalData() {
  _memCache = null;
  try { wx.removeStorageSync(APP_STATE_KEY); } catch (e) {}
  try { wx.removeStorageSync('yaowuyou_current_role'); } catch (e) {}
  try { wx.removeStorageSync('yaowuyou_demo_records'); } catch (e) {}
  const init = _initialState();
  init.members = [{ ...init.currentUser, joinTime: _nowDateStr() }];
  _writeAppState(init);
  return init;
}

// 原来的"爸妈家的药箱"演示种子数据，只在用户点"加载演示数据"时使用
function loadDemoSeedData() {
  const demoState = {
    currentUser: _clone(demoMembers[0]), // 小李
    currentFamily: _clone(demoFamily),
    members: _clone(demoMembers),
    medicines: _clone(demoMedicines),
    medicineBatches: _clone(demoBatches),
    medicationPlans: _clone(demoPlans),
    medicationRecords: _clone(demoRecords),
    accessLogs: [
      { id: 'L-D1', time: '2026-07-05 09:30', action: '新增批次', target: '硝苯地平控释片 SH251103-C', by: '小李', actionType: 'create' },
      { id: 'L-D2', time: '2026-07-05 08:05', action: '老人确认服药', target: '硝苯地平控释片 08:00', by: '爸爸', actionType: 'confirm' },
      { id: 'L-D3', time: '2026-07-05 08:02', action: '老人确认服药', target: '盐酸二甲双胍片 08:30', by: '妈妈', actionType: 'confirm' },
      { id: 'L-D4', time: '2026-07-04 20:20', action: '修改批次', target: '复方感冒灵颗粒 M2412-A1 有效期', by: '小李', actionType: 'update' },
      { id: 'L-D5', time: '2026-07-04 18:20', action: '导出药品台账', target: '家庭药品台账 2026-07.csv', by: '小李', actionType: 'export' },
      { id: 'L-D6', time: '2026-07-04 15:40', action: '查看隐私授权', target: '隐私与授权页面', by: '小李', actionType: 'view' },
      { id: 'L-D7', time: '2026-07-04 14:10', action: '添加药品草稿', target: '阿莫西林胶囊（草稿未存）', by: '小李', actionType: 'create' },
      { id: 'L-D8', time: '2026-07-04 12:30', action: '停用批次', target: '复方感冒灵颗粒 M240501', by: '小李', actionType: 'disable' },
      { id: 'L-D9', time: '2026-07-03 14:00', action: '邀请成员加入', target: '妈妈（母亲）', by: '小李', actionType: 'invite' },
      { id: 'L-D10', time: '2026-07-03 09:05', action: '新增药品主档+批次', target: '维生素 C 咀嚼片', by: '小李', actionType: 'create' },
      { id: 'L-D11', time: '2026-07-02 20:10', action: '老人确认服药', target: '盐酸二甲双胍片 20:00', by: '妈妈', actionType: 'confirm' }
    ]
  };
  _writeAppState(demoState);
  setCurrentRoleId('U001'); // 回到管理员
  return _clone(demoState);
}

// ==================== 9. 条码/OCR 库 & 元数据（透传 mockData 给页面用） ====================
// 这些还是静态辅助，与真实流程不冲突
function lookupBarcode(code) {
  const normalized = _normalizeBarcode(code);
  if (!normalized) {
    return { matched: false, source: 'unknown', barcode: '', shouldLearn: false };
  }
  // 家庭自学习优先：用户录入过的条码，下次扫码应先从真实家庭药箱识别。
  const real = (readAppState().medicines || []).find(m => _normalizeBarcode(m.barcode) === normalized ||
    ((m.barcodeAliases || []).map(_normalizeBarcode).indexOf(normalized) !== -1));
  if (real) {
    return {
      matched: true,
      matchType: 'barcode',
      source: 'local-family',
      barcode: normalized,
      medicine: _clone(real),
      confidence: 1
    };
  }
  const orig = origLookupBarcode && origLookupBarcode(normalized);
  if (orig && orig.medicine) {
    return Object.assign({}, orig, {
      matched: true,
      matchType: 'barcode',
      source: 'builtin-seed',
      barcode: normalized,
      confidence: orig.confidence || 0.86
    });
  }
  return {
    matched: false,
    source: 'unknown',
    barcode: normalized,
    shouldLearn: true
  };
}
function getOcrScenario(scenarioKey) { return origGetOcrScenario(scenarioKey); }

// ==================== 对外导出 ====================
module.exports = {
  // ---- 功能开关（去演示化总开关） ----
  ENABLE_DEMO_TOOLS,

  // ---- 读写 ----
  readAppState,
  hasFamily,
  hasAnyMedicine,
  syncFromCloudSnapshot,
  getActiveFamilyId,

  // ---- 用户 & 家庭 ----
  getCurrentUser,
  updateCurrentUser,
  getCurrentFamily,
  getMembers,
  clearFamilyCache,
  createFamily,

  // ---- 成员预设关系模板（本地快速添加） ----
  PRESET_MEMBER_TEMPLATES,
  addMemberFromTemplate,

  // ---- 药品 & 批次 ----
  getMedicines,
  getMedicineById,
  getMedicineBatches,
  matchExistingMedicineByForm,
  addMedicineAndBatch,
  updateMedicine,
  addBatchToMedicine,
  updateMedicineBatch,
  setMedicineBatchStatus,

  // ---- 提醒计划 & 记录（兼容第四阶段老人端） ----
  getMedicationPlans,
  getMedicationPlansByMedicine,
  getMedicationRecords,
  createOrUpdateMedicationPlan,
  setMedicationPlanEnabled,
  generateTodayMedicationRecords,
  ensureTodayMedicationRecords,
  confirmMedicationRecord,
  snoozeMedicationRecord,
  skipMedicationRecord,
  getMedicineUsageForecast,
  getPendingInventoryAudit,
  getInventoryAuditItems,
  generateElderReminders,

  // ---- 访问日志 ----
  getAccessLogs,
  getAccessLogsWithStyle,
  ACCESS_LOG_STYLE,

  // ---- 计算函数（替代原来 mockData 里的公开工具） ----
  getMedicineSummary,
  getMedicineBatchesForList,
  getDashboardStats,
  getTodayAttention,
  getMemberNames,
  categoryColor,
  statusLabel,
  statusColor,
  daysBetween: _daysBetween,
  computeBatchStatus: _batchStatus,

  // ---- 角色（第四阶段） ----
  setCurrentRoleId,
  getCurrentRoleId,
  isCurrentRoleAdmin,
  getCurrentRole,

  // ---- 重置与示例种子（示例数据仅当 ENABLE_DEMO_TOOLS 开启时默认加载） ----
  resetLocalData,
  loadDemoSeedData,

  // ---- 辅助元数据 & 条码/OCR 透传 ----
  FILTER_META,
  PICKER_OPTIONS,
  mockBarcodeLibrary,
  mockOcrResults,
  lookupBarcode,
  getOcrScenario,
  _genId
};
