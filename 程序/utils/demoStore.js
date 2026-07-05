// utils/demoStore.js
// 药无忧第四阶段：本地演示状态管理（替代静态 mockData.medicationRecords）
// 职责：
//   - 管理 medicationRecords 的运行时状态（读写 + 持久化到 wx.Storage）
//   - 管理当前演示角色（currentDemoUserId）
//   - 提供重置演示数据功能（比赛前恢复初始状态）
// 注意：不接真实云数据库，仅用于本地演示闭环

const {
  medicationRecords: mockMedicationRecords,
  members
} = require('./mockData.js');

// ==================== Storage Key 常量 ====================
const RECORDS_KEY = 'yaowuyou_demo_records';
const ROLE_KEY = 'yaowuyou_current_role';
const ADMIN_USER_ID = 'U001';

// ==================== 内部辅助 ====================
function _clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _readStore() {
  try {
    const saved = wx.getStorageSync(RECORDS_KEY);
    if (saved && Array.isArray(saved)) {
      return saved;
    }
  } catch (e) {}
  // 本地没有则使用 mockData 的初始记录
  const initial = _clone(mockMedicationRecords);
  try {
    wx.setStorageSync(RECORDS_KEY, initial);
  } catch (e) {}
  return initial;
}

function _writeStore(records) {
  try {
    wx.setStorageSync(RECORDS_KEY, records);
  } catch (e) {}
}

function _nowISO() {
  const now = new Date();
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ==================== 1. medicationRecords 读写 ====================

function getMedicationRecords() {
  return _clone(_readStore());
}

function confirmMedicationRecord(recordId) {
  const records = _readStore();
  const updated = records.map(r => {
    if (r.id === recordId && (r.status === 'pending' || r.status === 'missed' || r.status === 'upcoming')) {
      return {
        ...r,
        status: 'done',
        confirmedAt: _nowISO()
      };
    }
    return r;
  });
  _writeStore(updated);
  return _clone(updated);
}

function skipMedicationRecord(recordId) {
  const records = _readStore();
  const updated = records.map(r => {
    if (r.id === recordId && r.status !== 'done') {
      return {
        ...r,
        status: 'skipped',
        skippedAt: _nowISO()
      };
    }
    return r;
  });
  _writeStore(updated);
  return _clone(updated);
}

function resetDemoRecords() {
  const initial = _clone(mockMedicationRecords);
  _writeStore(initial);
  // 重置角色为管理员
  try {
    wx.setStorageSync(ROLE_KEY, ADMIN_USER_ID);
  } catch (e) {}
  return _clone(initial);
}

// ==================== 2. 当前演示角色 ====================

function getCurrentRoleId() {
  try {
    const saved = wx.getStorageSync(ROLE_KEY);
    if (saved && typeof saved === 'string') {
      return saved;
    }
  } catch (e) {}
  return ADMIN_USER_ID;
}

function setCurrentRoleId(userId) {
  try {
    wx.setStorageSync(ROLE_KEY, userId || ADMIN_USER_ID);
  } catch (e) {}
  return userId || ADMIN_USER_ID;
}

function getCurrentRole() {
  const id = getCurrentRoleId();
  const mem = members.find(m => m.id === id);
  if (mem) return _clone(mem);
  const admin = members.find(m => m.id === ADMIN_USER_ID) || members[0];
  return _clone(admin);
}

function isCurrentRoleAdmin() {
  return getCurrentRoleId() === ADMIN_USER_ID;
}

// ==================== 3. 给首页/仪表盘提供的计算函数（基于 demoStore 的最新 records） ====================
// 这些函数是对 mockData.js 同名函数的"替换版本"，使用 demoStore 中的 medicationRecords 重新计算

function getDashboardStatsWithDemoStore(baseStats) {
  const records = getMedicationRecords();
  const unconfirmed = records.filter(r => r.status === 'pending').length;
  return {
    ...baseStats,
    todayUnconfirmedCount: unconfirmed
  };
}

function getTodayAttentionWithDemoStore(baseList) {
  const records = getMedicationRecords();
  const pending = records.filter(r => r.status === 'pending');

  // 先移除 baseList 中的旧 unconfirmed 项（如果有的话）
  const filtered = (baseList || []).filter(a => a.type !== 'unconfirmed');

  if (pending.length > 0) {
    const names = [...new Set(pending.map(r => {
      const mem = members.find(m => m.id === r.memberId);
      return mem ? mem.name : '家人';
    }))].join('、');
    filtered.push({
      id: 'ATT-PENDING-GLOBAL',
      type: 'unconfirmed',
      typeLabel: '待确认',
      icon: '✅',
      bgColor: '#eafaf1',
      borderColor: '#27ae60',
      title: `${names} 今日服药`,
      desc: `还有 ${pending.length} 次服药待确认，点击查看老人端`,
      medicineId: null
    });
  }

  return filtered;
}

// ==================== 4. 给老人端生成提醒列表 ====================
// 基于 medicationPlans + medicines + members + demoStore medicationRecords

function generateElderReminders({ medicationPlans, medicines, members }) {
  const records = getMedicationRecords();
  const currentRoleId = getCurrentRoleId();
  const isAdmin = currentRoleId === ADMIN_USER_ID;

  // 以 records 为基准，关联 plans + medicines + members 补全展示字段
  const reminders = records.map(r => {
    const plan = (medicationPlans || []).find(p => p.id === r.planId);
    const medicine = plan ? (medicines || []).find(m => m.id === plan.medicineId) : null;
    const member = (members || []).find(m => m.id === r.memberId);

    const scheduledTime = r.scheduledTime || '';
    const timeOnly = scheduledTime.includes(' ')
      ? scheduledTime.split(' ')[1]
      : scheduledTime;

    let status = r.status || 'pending';
    // upcoming：状态是 pending 但标记为稍后时间（这里简单处理：如果 timeOnly 大于当前时间可标 upcoming）
    // 为了演示稳定，所有 pending 都按 pending 展示；可以根据需要将较晚时间的标记为 upcoming
    let statusLabel = '待服用';
    if (status === 'done') statusLabel = '已确认服用';
    else if (status === 'skipped') statusLabel = '已跳过';
    else if (status === 'missed') statusLabel = '已错过';
    else if (status === 'upcoming') statusLabel = '稍后服用';

    return {
      id: r.id,
      recordId: r.id,
      planId: r.planId,
      medicineId: medicine ? medicine.id : null,
      medicineName: medicine ? medicine.name : (plan ? '未知药品' : '未知药品'),
      memberId: r.memberId,
      memberName: member ? member.name : '家人',
      time: timeOnly || '--:--',
      dosage: plan ? plan.dosePerTime : '1份',
      status,
      statusLabel,
      icon: '💊'
    };
  });

  // 角色过滤
  const filtered = isAdmin
    ? reminders
    : reminders.filter(r => r.memberId === currentRoleId);

  // 按时间升序排序（方便老人查看）
  filtered.sort((a, b) => (a.time > b.time ? 1 : -1));

  return filtered;
}

// ==================== 对外导出 ====================
module.exports = {
  // Storage Key 常量（只读）
  RECORDS_KEY,
  ROLE_KEY,
  ADMIN_USER_ID,

  // medicationRecords
  getMedicationRecords,
  confirmMedicationRecord,
  skipMedicationRecord,
  resetDemoRecords,

  // 演示角色
  getCurrentRoleId,
  setCurrentRoleId,
  getCurrentRole,
  isCurrentRoleAdmin,

  // 首页/仪表盘计算（基于 demoStore 最新状态）
  getDashboardStatsWithDemoStore,
  getTodayAttentionWithDemoStore,

  // 老人端提醒生成器
  generateElderReminders
};
