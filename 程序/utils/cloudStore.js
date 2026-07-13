// utils/cloudStore.js
// 微信云开发调用封装：页面统一走这里，不直接调用 wx.cloud.callFunction。
const cloudConfig = require('./cloudConfig.js');

const FUNCTION_NAME = 'familyApi';
const REQUIRED_FUNCTION_VERSION = '2026.07.13-reminder-v2';
const REQUIRED_REMINDER_ACTIONS = ['saveMedicationPlan', 'ensureTodayMedicationRecords', 'confirmMedicationRecord', 'snoozeMedicationRecord'];

function isCloudEnabled() {
  return !!(cloudConfig.ENABLE_CLOUD_SYNC && cloudConfig.CLOUD_ENV_ID && wx.cloud);
}

function call(action, payload) {
  if (!isCloudEnabled()) {
    return Promise.reject(new Error('云开发未启用'));
  }
  return wx.cloud.callFunction({
    name: FUNCTION_NAME,
    config: { env: cloudConfig.CLOUD_ENV_ID },
    data: Object.assign({ action }, payload || {})
  }).then(res => {
    const result = res && res.result;
    if (!result) throw new Error('云函数无返回');
    if (result.ok === false) {
      const message = result.message || '云端操作失败';
      if (/未知云函数 action/i.test(message)) throw new Error('云服务版本过旧，请重新部署 familyApi 后再试');
      throw new Error(message);
    }
    return result.data || result;
  });
}

function healthCheck() {
  return call('healthCheck').then(info => {
    const actions = (info && info.supportedActions) || [];
    const missingActions = REQUIRED_REMINDER_ACTIONS.filter(action => actions.indexOf(action) === -1);
    return Object.assign({}, info, {
      compatible: info && info.version === REQUIRED_FUNCTION_VERSION && missingActions.length === 0,
      requiredVersion: REQUIRED_FUNCTION_VERSION,
      missingActions
    });
  });
}

function userLogin() {
  return call('userLogin');
}

function createFamily(form) {
  return call('createFamily', form);
}

function joinFamilyByInvite(form) {
  return call('joinFamilyByInvite', form);
}

function getInvitePreview(inviteCode) {
  return call('getInvitePreview', { inviteCode });
}

function getFamilySnapshot(familyId) {
  return call('getFamilySnapshot', { familyId });
}

function refreshLocalSnapshot(appStore, familyId) {
  if (!familyId) return Promise.resolve(null);
  return getFamilySnapshot(familyId).then(snapshot => {
    if (appStore && appStore.syncFromCloudSnapshot) {
      appStore.syncFromCloudSnapshot(snapshot);
    }
    return snapshot;
  });
}

function saveMedicine(familyId, medicine, batch) {
  return call('saveMedicine', { familyId, medicine, batch });
}

function updateMedicine(familyId, medicineId, patch) {
  return call('updateMedicine', { familyId, medicineId, patch });
}

function addOrUpdateBatch(familyId, medicineId, batch) {
  return call('addOrUpdateBatch', { familyId, medicineId, batch });
}

function setBatchStatus(familyId, batchId, status) {
  return call('setBatchStatus', { familyId, batchId, status });
}

function saveMedicationPlan(familyId, plan) {
  return call('saveMedicationPlan', { familyId, plan });
}

function confirmMedicationRecord(familyId, recordId, action) {
  return call('confirmMedicationRecord', { familyId, recordId, action });
}

function snoozeMedicationRecord(familyId, recordId, minutes) {
  return call('snoozeMedicationRecord', { familyId, recordId, minutes: Number(minutes) || 10 });
}

function repairMedicationReminders(familyId, execute) {
  return call('repairMedicationReminders', { familyId, execute: execute === true });
}

function ensureTodayMedicationRecords(familyId) {
  return call('ensureTodayMedicationRecords', { familyId });
}

function ensureMonthlyInventoryAudit(familyId, force) {
  return call('ensureMonthlyInventoryAudit', { familyId, force: force === true });
}

function saveInventoryAuditSettings(familyId, settings) {
  return call('saveInventoryAuditSettings', Object.assign({ familyId }, settings || {}));
}

function saveInventoryAuditItem(familyId, itemId, actualQuantity) {
  return call('saveInventoryAuditItem', { familyId, itemId, actualQuantity });
}

function completeInventoryAudit(familyId, auditId) {
  return call('completeInventoryAudit', { familyId, auditId });
}

function saveNotificationSubscription(familyId, templateId, status, kind) {
  return call('saveNotificationSubscription', { familyId, templateId, status, kind: kind || 'medication' });
}

function updateFamilyMember(familyId, memberId, patch) {
  return call('updateFamilyMember', { familyId, memberId, patch });
}

function removeFamilyMember(familyId, memberId) {
  return call('removeFamilyMember', { familyId, memberId });
}

function leaveFamily(familyId) {
  return call('leaveFamily', { familyId });
}

function transferFamilyAdmin(familyId, memberId) {
  return call('transferFamilyAdmin', { familyId, memberId });
}

function rotateInviteCode(familyId) {
  return call('rotateInviteCode', { familyId });
}

function deleteFamily(familyId, confirmation) {
  return call('deleteFamily', { familyId, confirmation });
}

function uploadMedicineCover(filePath, familyId) {
  if (!isCloudEnabled()) return Promise.reject(new Error('云开发未启用'));
  if (!filePath || String(filePath).indexOf('cloud://') === 0) {
    return Promise.resolve({ fileID: filePath || '' });
  }
  const extMatch = String(filePath).match(/\.([A-Za-z0-9]+)(?:\?|$)/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const nonce = Math.random().toString(36).slice(2, 10);
  const cloudPath = `medicine-covers/${familyId}/${Date.now()}-${nonce}.${ext}`;
  return wx.cloud.uploadFile({ cloudPath, filePath });
}

function deleteCloudFiles(fileList) {
  const list = (fileList || []).filter(path => String(path || '').indexOf('cloud://') === 0);
  if (!list.length || !isCloudEnabled()) return Promise.resolve(null);
  return wx.cloud.deleteFile({ fileList: list });
}

module.exports = {
  isCloudEnabled,
  call,
  healthCheck,
  userLogin,
  createFamily,
  joinFamilyByInvite,
  getInvitePreview,
  getFamilySnapshot,
  refreshLocalSnapshot,
  saveMedicine,
  updateMedicine,
  addOrUpdateBatch,
  setBatchStatus,
  saveMedicationPlan,
  confirmMedicationRecord,
  snoozeMedicationRecord,
  repairMedicationReminders,
  ensureTodayMedicationRecords,
  ensureMonthlyInventoryAudit,
  saveInventoryAuditSettings,
  saveInventoryAuditItem,
  completeInventoryAudit,
  saveNotificationSubscription,
  updateFamilyMember,
  removeFamilyMember,
  leaveFamily,
  transferFamilyAdmin,
  rotateInviteCode,
  deleteFamily,
  uploadMedicineCover,
  deleteCloudFiles
};
