// utils/mockData.js
// 药无忧 - 第二阶段：正式数据模型 + 计算工具函数
// 说明：所有日期以今日 2026-07-05 为基准推算

// ==================== 1. family 家庭空间 ====================
const family = {
  id: 'F001',
  name: '爸妈家的药箱',
  adminUserId: 'U001',
  members: ['U001', 'U002', 'U003'],
  createdAt: '2026-01-15',
  inviteCode: 'YAO2026'
};

// ==================== 2. members 家庭成员 ====================
const members = [
  {
    id: 'U001',
    name: '小李',
    role: 'admin',
    roleLabel: '管理员',
    avatar: '👨‍💼',
    relation: '儿子',
    canEdit: true,
    joinTime: '2026-01-15'
  },
  {
    id: 'U002',
    name: '爸爸',
    role: 'elder',
    roleLabel: '老人',
    avatar: '👴',
    relation: '父亲',
    canEdit: false,
    joinTime: '2026-01-16'
  },
  {
    id: 'U003',
    name: '妈妈',
    role: 'elder',
    roleLabel: '老人',
    avatar: '👵',
    relation: '母亲',
    canEdit: false,
    joinTime: '2026-01-16'
  }
];

// ==================== 3. medicines 药品主档 ====================
const medicines = [
  {
    id: 'M001',
    familyId: 'F001',
    name: '硝苯地平控释片',
    genericName: '硝苯地平控释片',
    shortName: '降压药',
    category: '降压',
    specification: '30mg × 7片 × 2板',
    manufacturer: '拜耳医药保健有限公司',
    barcode: '6923245600018',
    targetMemberIds: ['U002'],
    storageLocation: '客厅药箱',
    status: 'active'
  },
  {
    id: 'M002',
    familyId: 'F001',
    name: '盐酸二甲双胍片',
    genericName: '盐酸二甲双胍缓释片',
    shortName: '降糖药',
    category: '降糖',
    specification: '0.5g × 10片 × 3板',
    manufacturer: '中美上海施贵宝制药有限公司',
    barcode: '6923245600025',
    targetMemberIds: ['U003'],
    storageLocation: '卧室床头',
    status: 'active'
  },
  {
    id: 'M003',
    familyId: 'F001',
    name: '复方氨酚烷胺胶囊',
    genericName: '复方氨酚烷胺胶囊',
    shortName: '感冒药',
    category: '感冒发烧',
    specification: '0.25g × 12粒/盒',
    manufacturer: '华润三九医药股份有限公司',
    barcode: '6923245600032',
    targetMemberIds: ['U001', 'U002', 'U003'],
    storageLocation: '客厅药箱',
    status: 'active'
  },
  {
    id: 'M004',
    familyId: 'F001',
    name: '碘伏消毒棉签',
    genericName: '碘伏棉棒',
    shortName: '碘伏棉签',
    category: '外用',
    specification: '50支/盒',
    manufacturer: '稳健医疗用品股份有限公司',
    barcode: '6923245600049',
    targetMemberIds: ['U001', 'U002', 'U003'],
    storageLocation: '外出药包',
    status: 'active'
  }
];

// ==================== 4. medicineBatches 批次库存 ====================
// 每个药品至少 1 批次，有效期、批号、剩余数量、来源、置信度不同
const medicineBatches = [
  // 硝苯地平控释片（降压药）：2 个批次，一个 30 天内临期，一个正常
  {
    id: 'B001',
    medicineId: 'M001',
    batchNo: 'BJ250901-A',
    productionDate: '2025-09-15',
    expireDate: '2026-08-01', // 距今日 27 天，30 天内临期
    totalQuantity: 28,
    remainingQuantity: 12,
    unit: '片',
    source: 'barcode',
    sourceLabel: '条码',
    confidence: 0.98,
    imageSourceNote: '有效期来源：条码匹配默认值，未拍照复核',
    storageLocation: '客厅药箱上层',
    disabled: false,
    status: 'nearExpire'
  },
  {
    id: 'B002',
    medicineId: 'M001',
    batchNo: 'SH251103-C',
    productionDate: '2025-11-20',
    expireDate: '2027-03-15', // 正常
    totalQuantity: 30,
    remainingQuantity: 27,
    unit: '片',
    source: 'ocr',
    sourceLabel: 'OCR',
    confidence: 0.92,
    imageSourceNote: '有效期来源：拍药盒侧面 OCR 识别（置信度 92%）',
    storageLocation: '客厅药箱上层',
    disabled: false,
    status: 'normal'
  },

  // 盐酸二甲双胍片（降糖药）：库存不足
  {
    id: 'B003',
    medicineId: 'M002',
    batchNo: 'GZ250422-B',
    productionDate: '2025-04-22',
    expireDate: '2027-05-15',
    totalQuantity: 60,
    remainingQuantity: 6, // 仅剩 6 片，库存不足
    unit: '片',
    source: 'manual',
    sourceLabel: '手动',
    confidence: 1.0,
    imageSourceNote: '数据来源：手动录入，子女核对确认',
    storageLocation: '卧室床头抽屉',
    disabled: false,
    status: 'lowStock'
  },

  // 复方氨酚烷胺胶囊（感冒药）：已过期
  {
    id: 'B004',
    medicineId: 'M003',
    batchNo: 'SZ240310-D',
    productionDate: '2024-03-10',
    expireDate: '2026-03-10', // 已过期
    totalQuantity: 24,
    remainingQuantity: 12,
    unit: '粒',
    source: 'barcode',
    sourceLabel: '条码',
    confidence: 0.95,
    imageSourceNote: '有效期来源：条码默认值，建议复核',
    storageLocation: '客厅药箱下层',
    disabled: false,
    status: 'expired'
  },

  // 碘伏消毒棉签（外用）：正常
  {
    id: 'B005',
    medicineId: 'M004',
    batchNo: 'WH251015-E',
    productionDate: '2025-10-15',
    expireDate: '2027-10-14',
    totalQuantity: 100,
    remainingQuantity: 86,
    unit: '支',
    source: 'ocr',
    sourceLabel: 'OCR',
    confidence: 0.88,
    imageSourceNote: '有效期来源：拍照 OCR（置信度 88%），已人工核对',
    storageLocation: '外出药包内袋',
    disabled: false,
    status: 'normal'
  },

  // 碘伏棉签第 2 小盒：已拆封、库存少、但正常
  {
    id: 'B006',
    medicineId: 'M004',
    batchNo: 'WH250228-F',
    productionDate: '2025-02-28',
    expireDate: '2027-02-27',
    totalQuantity: 50,
    remainingQuantity: 4, // 少，但不是库存不足（主逻辑仍正常）
    unit: '支',
    source: 'manual',
    sourceLabel: '手动',
    confidence: 1.0,
    imageSourceNote: '手动录入补录批次',
    storageLocation: '外出药包内袋',
    disabled: true, // 拆封后暂停用的小盒
    status: 'lowStock'
  }
];

// ==================== 5. medicationPlans 用药计划 ====================
const medicationPlans = [
  {
    id: 'P001',
    medicineId: 'M001', // 硝苯地平控释片
    memberId: 'U002',   // 爸爸
    dosePerTime: '1片',
    timesPerDay: 2,
    reminderTimes: ['08:00', '20:00'],
    needGuardianConfirm: true,
    enabled: true
  },
  {
    id: 'P002',
    medicineId: 'M002', // 盐酸二甲双胍片
    memberId: 'U003',   // 妈妈
    dosePerTime: '1片',
    timesPerDay: 2,
    reminderTimes: ['08:30', '12:30'],
    needGuardianConfirm: true,
    enabled: true
  },
  {
    id: 'P003',
    medicineId: 'M001', // 硝苯地平控释片（备用老人端卡片展示）
    memberId: 'U002',   // 爸爸
    dosePerTime: '1片',
    timesPerDay: 1,
    reminderTimes: ['08:00'],
    needGuardianConfirm: true,
    enabled: true
  }
];

// ==================== 6. medicationRecords 服药记录 ====================
// 今日 2026-07-05：至少 1 条待确认、1 条已服用
const today = '2026-07-05';
const medicationRecords = [
  // 已服用
  {
    id: 'R001',
    planId: 'P001',
    memberId: 'U002',
    scheduledTime: `${today} 08:00`,
    confirmedAt: `${today} 08:06`,
    status: 'done'
  },
  // 待确认（未服用）
  {
    id: 'R002',
    planId: 'P001',
    memberId: 'U002',
    scheduledTime: `${today} 20:00`,
    confirmedAt: null,
    status: 'pending'
  },
  // 待确认（妈妈）
  {
    id: 'R003',
    planId: 'P002',
    memberId: 'U003',
    scheduledTime: `${today} 08:30`,
    confirmedAt: null,
    status: 'pending'
  },
  {
    id: 'R004',
    planId: 'P002',
    memberId: 'U003',
    scheduledTime: `${today} 12:30`,
    confirmedAt: null,
    status: 'pending'
  }
];

// ==================== 辅助：旧结构兼容字段（给未重构的页面继续用） ====================
function computeLegacyMedicines() {
  return medicines.map(m => {
    const summary = getMedicineSummary(m.id);
    return {
      id: m.id,
      name: m.name,
      shortName: m.shortName,
      category: m.category,
      categoryColor: _categoryColor(m.category),
      forMember: _memberNames(m.targetMemberIds),
      forMemberIds: m.targetMemberIds,
      status: summary.status,
      statusLabel: _statusLabel(summary.status),
      statusColor: _statusColor(summary.status),
      batchCount: summary.batchCount,
      totalQuantity: summary.availableStock,
      spec: m.specification,
      manufacturer: m.manufacturer,
      expireDate: summary.nearestExpire,
      location: m.storageLocation
    };
  });
}

function computeLegacyDashboard() {
  return getDashboardStats();
}

function computeLegacyAttention() {
  return getTodayAttention();
}

const mockAccessLogs = [
  { id: 'L001', time: '2026-07-05 09:30', action: '新增批次',   target: '硝苯地平控释片 SH251103-C', by: '小李', actionType: 'create' },
  { id: 'L002', time: '2026-07-05 08:05', action: '老人确认服药', target: '硝苯地平控释片 08:00',      by: '爸爸', actionType: 'confirm' },
  { id: 'L003', time: '2026-07-05 08:02', action: '老人确认服药', target: '盐酸二甲双胍片 08:30',      by: '妈妈', actionType: 'confirm' },
  { id: 'L004', time: '2026-07-04 20:20', action: '修改批次',   target: '复方感冒灵颗粒 M2412-A1 有效期', by: '小李', actionType: 'update' },
  { id: 'L005', time: '2026-07-04 18:20', action: '导出药品台账', target: '家庭药品台账 2026-07.csv',  by: '小李', actionType: 'export' },
  { id: 'L006', time: '2026-07-04 15:40', action: '查看隐私授权', target: '隐私与授权页面',            by: '小李', actionType: 'view' },
  { id: 'L007', time: '2026-07-04 14:10', action: '添加药品草稿', target: '阿莫西林胶囊（草稿未存）',   by: '小李', actionType: 'create' },
  { id: 'L008', time: '2026-07-04 12:30', action: '停用批次',   target: '复方感冒灵颗粒 M240501',     by: '小李', actionType: 'disable' },
  { id: 'L009', time: '2026-07-03 14:00', action: '邀请成员',   target: '妈妈',                     by: '小李', actionType: 'invite' },
  { id: 'L010', time: '2026-07-03 09:05', action: '新增药品',   target: '维生素 C 咀嚼片（主档+批次）', by: '小李', actionType: 'create' },
  { id: 'L011', time: '2026-07-02 20:10', action: '老人确认服药', target: '盐酸二甲双胍片 20:00',      by: '妈妈', actionType: 'confirm' }
];

// 访问记录颜色映射（给第五阶段 access-logs 页面展示用）
const accessLogStyleMap = {
  create:  { label: '新增', color: '#27ae60', bg: '#eafaf1', borderColor: '#a9dfbf' },  // 绿
  update:  { label: '修改', color: '#2980b9', bg: '#eaf4fc', borderColor: '#aed6f1' },  // 蓝
  confirm: { label: '确认', color: '#e67e22', bg: '#fef5e7', borderColor: '#fad7a0' },  // 橙
  export:  { label: '导出', color: '#8e44ad', bg: '#f5eef9', borderColor: '#d7bde2' },  // 紫
  invite:  { label: '邀请', color: '#566573', bg: '#f2f3f4', borderColor: '#d5d8dc' },  // 灰
  disable: { label: '停用', color: '#c0392b', bg: '#fdecea', borderColor: '#f5b7b1' },  // 红
  view:    { label: '查看', color: '#2e7d6a', bg: '#eef5f1', borderColor: '#c8e6d6' }   // 主色
};

function getAccessLogsWithStyle() {
  return mockAccessLogs.map(log => {
    const style = accessLogStyleMap[log.actionType] || accessLogStyleMap.view;
    return { ...log, ...style };
  });
}

// 老人端提醒数据（从 plans + records 生成，保持向后兼容）
function computeLegacyElderReminders() {
  return [
    {
      id: 'R-ELDER-1',
      time: '08:00',
      medicineName: '硝苯地平控释片',
      dosage: '1片',
      memberName: '爸爸',
      icon: '💊',
      status: 'done',
      statusLabel: '已服用'
    },
    {
      id: 'R-ELDER-2',
      time: '08:30',
      medicineName: '盐酸二甲双胍片',
      dosage: '1片',
      memberName: '妈妈',
      icon: '💊',
      status: 'pending',
      statusLabel: '待服用'
    },
    {
      id: 'R-ELDER-3',
      time: '12:30',
      medicineName: '盐酸二甲双胍片',
      dosage: '1片',
      memberName: '妈妈',
      icon: '💊',
      status: 'pending',
      statusLabel: '待服用'
    },
    {
      id: 'R-ELDER-4',
      time: '20:00',
      medicineName: '硝苯地平控释片',
      dosage: '1片',
      memberName: '爸爸',
      icon: '💊',
      status: 'upcoming',
      statusLabel: '待服用'
    }
  ];
}

// ==================== 工具函数（内部辅助） ====================
function _memberNames(ids) {
  if (!ids || ids.length === 0) return '';
  if (ids.length >= 3) return '全家备用';
  return ids.map(id => (members.find(m => m.id === id) || {}).name).filter(Boolean).join('、');
}

function _categoryColor(cat) {
  const map = {
    '降压': '#e74c3c',
    '降糖': '#3498db',
    '心脑血管': '#1abc9c',
    '感冒发烧': '#9b59b6',
    '外用': '#f39c12',
    '急救备用': '#2ecc71'
  };
  return map[cat] || '#7f8c8d';
}

function _statusLabel(s) {
  const map = { normal: '正常', nearExpire: '临期', expired: '已过期', lowStock: '库存不足', pendingConfirm: '待确认' };
  return map[s] || '正常';
}

function _statusColor(s) {
  const map = {
    normal: '#27ae60',
    nearExpire: '#f39c12',
    expired: '#c0392b',
    lowStock: '#3498db',
    pendingConfirm: '#8e44ad'
  };
  return map[s] || '#7f8c8d';
}

function _daysBetween(dateStr, todayStr = '2026-07-05') {
  const a = new Date(dateStr.replace(/-/g, '/')).getTime();
  const b = new Date(todayStr.replace(/-/g, '/')).getTime();
  return Math.round((a - b) / 86400000);
}

// ==================== 4 个公开计算工具函数 ====================

/**
 * 1. 汇总某个药品的库存、批次、最近有效期、整体状态
 * - 已过期和 disabled 批次不计入可用库存
 */
function getMedicineSummary(medicineId) {
  const batches = medicineBatches.filter(b => b.medicineId === medicineId);
  // 有效批次：未过期 + 未停用
  const activeBatches = batches.filter(b => {
    if (b.disabled) return false;
    if (b.status === 'expired') return false;
    return true;
  });

  // 可用库存（有效批次的剩余数量之和）
  const availableStock = activeBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0);

  // 批次数量（含停用与过期总批次）
  const batchCount = batches.length;

  // 有效批次中最近的有效期
  let nearestExpire = null;
  activeBatches.forEach(b => {
    if (!nearestExpire || b.expireDate < nearestExpire) {
      nearestExpire = b.expireDate;
    }
  });
  // 如果没有有效批次，回落到所有批次中的最近有效期
  if (!nearestExpire && batches.length > 0) {
    nearestExpire = batches.map(b => b.expireDate).sort()[0];
  }

  // 计算药品整体状态
  // 优先级：过期批次存在仍标为正常药品状态（批次自己标过期），
  // 这里的状态只基于有效批次做提示
  let status = 'normal';
  // 有效批次中是否还有临期？
  const hasNearExpire = activeBatches.some(b => b.status === 'nearExpire');
  // 有效批次中库存总量是否不足？（单位按片/粒 < 10；支 < 10 也判定不足）
  const isLowStock = availableStock > 0 && availableStock < 10;
  // 是否有未确认服药？
  const pendingRec = medicationRecords.filter(r => r.status === 'pending');

  if (activeBatches.length === 0 && batches.length > 0) {
    status = 'expired'; // 无有效批次（全过期/停用）
  } else if (activeBatches.some(b => b.status === 'expired')) {
    status = 'expired';
  } else if (hasNearExpire) {
    status = 'nearExpire';
  } else if (isLowStock) {
    status = 'lowStock';
  } else if (pendingRec.length > 0 && batches.some(b => activeBatches.includes(b))) {
    // 保持 normal，待确认不影响药品状态（首页会单独提示）
    status = 'normal';
  }

  return {
    medicineId,
    availableStock,
    batchCount,
    nearestExpire: nearestExpire || '-',
    status,
    statusLabel: _statusLabel(status),
    statusColor: _statusColor(status),
    needRestock: availableStock < 10, // 少于 10 份建议补货
    activeBatchCount: activeBatches.length
  };
}

/**
 * 2. 仪表盘统计（首页使用）
 */
function getDashboardStats() {
  // 药品总数（主档数量）
  const medicineCount = medicines.filter(m => m.status === 'active').length;

  // 临期批次数：status = nearExpire
  const nearExpireCount = medicineBatches.filter(b => !b.disabled && b.status === 'nearExpire').length;

  // 已过期批次数
  const expiredCount = medicineBatches.filter(b => !b.disabled && b.status === 'expired').length;

  // 库存不足药品数：主档汇总后 availableStock > 0 且 < 10
  const lowStockMedIds = [];
  medicines.forEach(m => {
    const s = getMedicineSummary(m.id);
    if (s.status === 'lowStock') lowStockMedIds.push(m.id);
  });
  const lowStockCount = lowStockMedIds.length;

  // 今日待确认服药数：status = pending
  const todayUnconfirmedCount = medicationRecords.filter(r => r.status === 'pending').length;

  return {
    medicineCount,
    nearExpireCount,
    expiredCount,
    lowStockCount,
    todayUnconfirmedCount
  };
}

/**
 * 3. 今日关注列表（首页使用）
 */
function getTodayAttention() {
  const list = [];

  // 临期批次（30 天内）
  medicineBatches
    .filter(b => !b.disabled && b.status === 'nearExpire')
    .forEach(b => {
      const m = medicines.find(x => x.id === b.medicineId) || {};
      const d = _daysBetween(b.expireDate);
      list.push({
        id: `ATT-NE-${b.id}`,
        type: 'nearExpire',
        typeLabel: '临期提醒',
        icon: '⚠️',
        bgColor: '#fff8e1',
        borderColor: '#f39c12',
        title: m.name || b.batchNo,
        desc: `有效期至 ${b.expireDate}，还有 ${d} 天（剩余 ${b.remainingQuantity}）`,
        medicineId: b.medicineId
      });
    });

  // 已过期批次
  medicineBatches
    .filter(b => !b.disabled && b.status === 'expired')
    .forEach(b => {
      const m = medicines.find(x => x.id === b.medicineId) || {};
      const d = Math.abs(_daysBetween(b.expireDate));
      list.push({
        id: `ATT-EX-${b.id}`,
        type: 'expired',
        typeLabel: '已过期',
        icon: '🚫',
        bgColor: '#fdecea',
        borderColor: '#e74c3c',
        title: m.name || b.batchNo,
        desc: `已于 ${b.expireDate} 过期，已超 ${d} 天，请及时处理（${b.remainingQuantity} 份）`,
        medicineId: b.medicineId
      });
    });

  // 库存不足药品
  medicines.forEach(m => {
    const s = getMedicineSummary(m.id);
    if (s.status === 'lowStock') {
      list.push({
        id: `ATT-LS-${m.id}`,
        type: 'lowStock',
        typeLabel: '库存不足',
        icon: '📦',
        bgColor: '#e8f4fd',
        borderColor: '#3498db',
        title: m.name,
        desc: `可用库存仅剩 ${s.availableStock} 份，建议尽快补充（存放：${m.storageLocation}）`,
        medicineId: m.id
      });
    }
  });

  // 老人未确认服药
  const pending = medicationRecords.filter(r => r.status === 'pending');
  if (pending.length > 0) {
    const names = [...new Set(pending.map(r => {
      const mem = members.find(m => m.id === r.memberId);
      return mem ? mem.name : '家人';
    }))].join('、');
    list.push({
      id: 'ATT-PENDING-GLOBAL',
      type: 'unconfirmed',
      typeLabel: '待确认',
      icon: '✅',
      bgColor: '#eafaf1',
      borderColor: '#27ae60',
      title: `${names} 今日服药`,
      desc: `${pending.length} 次服药待老人点击确认，子女可在老人端代为查看`,
      medicineId: null
    });
  }

  return list;
}

/**
 * 4. 返回某药品下的批次（按规则排序）
 *  - 未过期批次在前
 *  - 越早过期越靠前
 *  - 已过期批次放后
 *  - disabled 批次放最后
 */
function getMedicineBatches(medicineId) {
  const batches = medicineBatches.filter(b => b.medicineId === medicineId);
  return batches.sort((a, b) => {
    // 1) disabled 排最后
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    // 2) 已过期的排到未过期的后面
    const aExpired = a.status === 'expired';
    const bExpired = b.status === 'expired';
    if (aExpired !== bExpired) return aExpired ? 1 : -1;
    // 3) 同组内按有效期升序（越早过期越靠前）
    if (a.expireDate < b.expireDate) return -1;
    if (a.expireDate > b.expireDate) return 1;
    return 0;
  });
}

// ==================== 新增：第三阶段 条码库 / OCR 模拟库 ====================
// 1) 模拟条码数据库（扫条码时匹配）
const mockBarcodeLibrary = [
  {
    barcode: '6923245600018',
    name: '硝苯地平控释片',
    genericName: '硝苯地平控释片',
    shortName: '降压药',
    category: '降压',
    specification: '30mg × 7片 × 2板',
    manufacturer: '拜耳医药保健有限公司',
    defaultTargetMemberIds: ['U002'],
    defaultTargetMemberLabel: '爸爸',
    defaultStorageLocation: '客厅药箱',
    defaultSourceConfidence: 0.98,
    icon: '💊'
  },
  {
    barcode: '6923245600025',
    name: '盐酸二甲双胍片',
    genericName: '盐酸二甲双胍缓释片',
    shortName: '降糖药',
    category: '降糖',
    specification: '0.5g × 10片 × 3板',
    manufacturer: '中美上海施贵宝制药有限公司',
    defaultTargetMemberIds: ['U003'],
    defaultTargetMemberLabel: '妈妈',
    defaultStorageLocation: '卧室床头',
    defaultSourceConfidence: 0.97,
    icon: '💊'
  },
  {
    barcode: '6923245600999',
    name: '氯雷他定片',
    genericName: '氯雷他定片',
    shortName: '抗过敏药',
    category: '感冒发烧',
    specification: '10mg × 6片/盒',
    manufacturer: '扬子江药业集团',
    defaultTargetMemberIds: ['U001', 'U002', 'U003'],
    defaultTargetMemberLabel: '全家备用',
    defaultStorageLocation: '客厅药箱',
    defaultSourceConfidence: 0.95,
    icon: '💊'
  }
];

// 2) OCR 模拟识别结果（3 组：高置信度 / 低置信度 / 识别失败）
const mockOcrResults = {
  high: {
    key: 'high',
    label: '高置信度识别（示例）',
    desc: '光线充足，文字清晰',
    icon: '✅',
    confidence: 0.92,
    batchNo: 'BJ260105-A',
    productionDate: '2026-01-05',
    expireDate: '2027-01-04',
    totalQuantity: 28,
    unit: '片',
    imageSourceNote: '有效期来自包装侧面第 2 行文字（拍摄角度 0°）',
    success: true
  },
  low: {
    key: 'low',
    label: '低置信度识别（示例）',
    desc: '局部模糊，数字 0/6/8 易混淆',
    icon: '⚠️',
    confidence: 0.63,
    batchNo: 'OCR-LOW-01',
    productionDate: '2025-09-15',
    expireDate: '2026-08-01',
    totalQuantity: 28,
    unit: '片',
    imageSourceNote: '有效期疑似来自包装底部文字，数字存在混淆风险，建议核对',
    success: true
  },
  fail: {
    key: 'fail',
    label: '识别失败（示例）',
    desc: '反光 / 遮挡 / 模糊，无法读取有效期',
    icon: '❌',
    success: false,
    errorMessage: '图片存在反光或文字被遮挡，请重新拍摄或手动录入字段。'
  }
};

// 3) 辅助函数：查条码
function lookupBarcode(code) {
  if (!code) return null;
  const hit = mockBarcodeLibrary.find(x => x.barcode === String(code).trim());
  if (!hit) return null;
  return {
    source: 'barcode',
    sourceLabel: '条码',
    confidence: hit.defaultSourceConfidence,
    medicine: {
      barcode: hit.barcode,
      name: hit.name,
      genericName: hit.genericName,
      shortName: hit.shortName,
      category: hit.category,
      specification: hit.specification,
      manufacturer: hit.manufacturer,
      targetMemberIds: hit.defaultTargetMemberIds.slice(),
      targetMemberLabel: hit.defaultTargetMemberLabel,
      storageLocation: hit.defaultStorageLocation
    }
  };
}

// 4) 辅助函数：取 OCR 结果
function getOcrScenario(key) {
  const sc = mockOcrResults[key];
  if (!sc) return null;
  if (!sc.success) {
    return {
      source: 'ocr',
      sourceLabel: 'OCR',
      success: false,
      errorMessage: sc.errorMessage
    };
  }
  return {
    source: 'ocr',
    sourceLabel: 'OCR',
    success: true,
    confidence: sc.confidence,
    batch: {
      batchNo: sc.batchNo,
      productionDate: sc.productionDate,
      expireDate: sc.expireDate,
      totalQuantity: sc.totalQuantity,
      remainingQuantity: sc.totalQuantity,
      unit: sc.unit,
      imageSourceNote: sc.imageSourceNote
    }
  };
}

// 5) 辅助函数：匹配已有药品（根据条码或名称），用于确认页预览"新增主档 or 新增批次"
function matchExistingMedicineByForm({ barcode, name }) {
  if (!barcode && !name) return null;
  if (barcode) {
    const byCode = medicines.find(m => m.barcode === String(barcode).trim());
    if (byCode) return { medicine: byCode, reason: 'barcode' };
  }
  if (name) {
    const byName = medicines.find(m => m.name === String(name).trim());
    if (byName) return { medicine: byName, reason: 'name' };
  }
  return null;
}

// ==================== 对外导出 ====================
module.exports = {
  // 正式模型（第二阶段推荐使用）
  family,
  members,
  medicines,
  medicineBatches,
  medicationPlans,
  medicationRecords,

  // 4 个公开工具函数
  getMedicineSummary,
  getDashboardStats,
  getTodayAttention,
  getMedicineBatches,

  // 工具：辅助映射
  getMemberNames: _memberNames,
  statusLabel: _statusLabel,
  statusColor: _statusColor,
  categoryColor: _categoryColor,
  daysBetween: _daysBetween,

  // 向后兼容：旧命名导出（未改的页面仍可使用）
  mockFamily: family,
  mockCurrentUser: members[0],
  mockMembers: members,
  get mockMedicines() { return computeLegacyMedicines(); },
  get mockMedicineBatches() { return medicineBatches; },
  get mockDashboard() { return computeLegacyDashboard(); },
  get mockTodayAttention() { return computeLegacyAttention(); },
  get mockElderReminders() { return computeLegacyElderReminders(); },
  mockAccessLogs,
  getAccessLogsWithStyle,
  accessLogStyleMap,

  // 筛选器元数据给药箱页用
  FILTER_META: {
    statuses: [
      { key: 'all', label: '全部' },
      { key: 'normal', label: '正常' },
      { key: 'nearExpire', label: '临期' },
      { key: 'expired', label: '已过期' },
      { key: 'lowStock', label: '库存不足' },
      { key: 'pendingConfirm', label: '待确认' }
    ],
    members: [
      { key: 'all', label: '全部使用人' },
      { key: 'U002', label: '爸爸' },
      { key: 'U003', label: '妈妈' },
      { key: 'family', label: '全家备用' }
    ],
    categories: [
      { key: 'all', label: '全部类别' },
      { key: '降压', label: '降压' },
      { key: '降糖', label: '降糖' },
      { key: '心脑血管', label: '心脑血管' },
      { key: '感冒发烧', label: '感冒发烧' },
      { key: '外用', label: '外用' },
      { key: '急救备用', label: '急救备用' }
    ],
    locations: [
      { key: 'all', label: '全部位置' },
      { key: '客厅药箱', label: '客厅药箱' },
      { key: '卧室床头', label: '卧室床头' },
      { key: '冰箱', label: '冰箱' },
      { key: '外出药包', label: '外出药包' }
    ]
  },

  // ==================== 第三阶段新增 ====================
  mockBarcodeLibrary,
  mockOcrResults,
  lookupBarcode,
  getOcrScenario,
  matchExistingMedicineByForm,

  // 给录入流程提供便捷 picker 元数据（去掉"全部"）
  PICKER_OPTIONS: {
    categories: ['降压', '降糖', '心脑血管', '感冒发烧', '外用', '急救备用'],
    locations: ['客厅药箱', '卧室床头', '冰箱', '外出药包'],
    members: [
      { key: 'U002', label: '爸爸', ids: ['U002'] },
      { key: 'U003', label: '妈妈', ids: ['U003'] },
      { key: 'family', label: '全家备用', ids: ['U001', 'U002', 'U003'] }
    ]
  }
};
