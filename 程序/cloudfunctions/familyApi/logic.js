const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MEDICINE_FIELDS = [
  'name', 'shortName', 'genericName', 'specification', 'category', 'manufacturer',
  'barcode', 'barcodeAliases', 'targetMemberIds', 'targetMemberLabel',
  'customTargetMemberName', 'storageLocation', 'coverImage', 'coverImageCloudId',
  'coverSource', 'status'
];
const BATCH_FIELDS = [
  'expireDate', 'productionDate', 'totalQuantity', 'remainingQuantity', 'unit',
  'batchNo', 'note', 'imageSourceNote', 'source', 'confidence', 'status'
];
const PLAN_FIELDS = [
  'medicineId', 'memberId', 'dosePerTime', 'timesPerDay', 'reminderTimes',
  'doseQuantity', 'doseUnit', 'deductStock', 'stockWarningDays',
  'needGuardianConfirm', 'enabled', 'startDate', 'endDate', 'note', 'clientRequestId'
];

const REMINDER_EARLY_MINUTES = 15;
const REMINDER_LATE_MINUTES = 60;

function pick(source, fields) {
  const input = source || {};
  return fields.reduce((out, key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
    return out;
  }, {});
}

function generateInviteCode(randomFn) {
  const random = randomFn || Math.random;
  let body = '';
  for (let i = 0; i < 8; i++) {
    body += INVITE_ALPHABET[Math.floor(random() * INVITE_ALPHABET.length)];
  }
  return `YAO${body}`;
}

function inviteExpiresAtMs(nowMs) {
  return Number(nowMs || Date.now()) + 30 * 24 * 60 * 60 * 1000;
}

function recordKey(planId, date, time) {
  return `${planId}|${date}|${time}`;
}

function stableHash(text) {
  let hash = 2166136261;
  const source = String(text || '');
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function recordDocumentId(planId, date, time) {
  return `MR_${stableHash(recordKey(planId, date, time))}_${String(date || '').replace(/-/g, '')}${String(time || '').replace(':', '')}`;
}

function scheduledAtMs(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (!match) return NaN;
  return Date.parse(`${match[1]}T${match[2]}:00+08:00`);
}

function classifyReminder(record, nowMs, earlyMinutes, lateMinutes) {
  if (!record) return 'upcoming';
  if (record.status === 'done' || record.status === 'skipped' || record.status === 'missed') return record.status;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const snoozedAt = scheduledAtMs(record.snoozedUntil);
  if (Number.isFinite(snoozedAt) && snoozedAt > now) return 'snoozed';
  const scheduledAt = scheduledAtMs(record.scheduledTime);
  if (!Number.isFinite(scheduledAt)) return 'upcoming';
  const earlyMs = (Number(earlyMinutes) >= 0 ? Number(earlyMinutes) : REMINDER_EARLY_MINUTES) * 60000;
  const lateMs = (Number(lateMinutes) >= 0 ? Number(lateMinutes) : REMINDER_LATE_MINUTES) * 60000;
  if (scheduledAt > now + earlyMs) return 'upcoming';
  if (scheduledAt < now - lateMs) return 'overdue';
  return 'due';
}

function isReminderActionable(record, nowMs) {
  const state = classifyReminder(record, nowMs);
  return state === 'due' || state === 'overdue';
}

function planSignature(plan) {
  const dose = normalizeDose(plan || {});
  const times = Array.from(new Set((plan && plan.reminderTimes || []).map(String))).sort();
  return [
    plan && plan.medicineId || '', plan && plan.memberId || '',
    dose.quantity || 0, dose.unit || '', times.join(','),
    plan && plan.startDate || '', plan && plan.endDate || '',
    plan && plan.deductStock === false ? '0' : '1'
  ].join('|');
}

function isPlanActiveOn(plan, date) {
  if (!plan || plan.enabled === false) return false;
  if (plan.startDate && plan.startDate > date) return false;
  if (plan.endDate && plan.endDate < date) return false;
  return true;
}

function isInviteUsable(family, nowMs) {
  if (!family || family.inviteEnabled === false) return false;
  return !family.inviteExpiresAtMs || family.inviteExpiresAtMs >= Number(nowMs || Date.now());
}

function resolveInviteMembership(targetFamilyId, memberships) {
  const active = (memberships || []).filter(item => item && item.status === 'active');
  const same = active.find(item => item.familyId === targetFamilyId) || null;
  const other = active.find(item => item.familyId !== targetFamilyId) || null;
  return {
    alreadyJoined: !!same,
    conflict: !same && !!other,
    otherFamilyId: !same && other ? other.familyId : ''
  };
}

function canConfirmRecord(member, record) {
  if (!member || !record) return false;
  return member.role === 'admin' || record.memberId === (member.id || member._id);
}

function isDeleteConfirmationValid(familyName, confirmation) {
  return String(confirmation || '').trim() === String(familyName || '').trim() && String(familyName || '').trim().length > 0;
}

function normalizeDose(plan) {
  const quantity = Number(plan && plan.doseQuantity);
  const unit = String((plan && plan.doseUnit) || '').trim();
  if (Number.isFinite(quantity) && quantity > 0 && unit) return { quantity, unit, structured: true };
  const text = String((plan && plan.dosePerTime) || '').trim();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([^\d\s]+)$/);
  if (!match) return { quantity: 0, unit: '', structured: false };
  return { quantity: Number(match[1]), unit: match[2], structured: false };
}

function allocateStock(batches, quantity, unit, currentDate) {
  let need = Number(quantity) || 0;
  const todayText = currentDate || '';
  const candidates = (batches || []).filter(batch => {
    const active = batch && batch.status !== 'disabled' && batch.status !== 'inactive';
    const usable = !todayText || !batch.expireDate || batch.expireDate >= todayText;
    return active && usable && String(batch.unit || '').trim() === unit && Number(batch.remainingQuantity) > 0;
  }).slice().sort((a, b) => String(a.expireDate || '9999-12-31').localeCompare(String(b.expireDate || '9999-12-31')));
  const allocations = [];
  for (const batch of candidates) {
    if (need <= 0) break;
    const amount = Math.min(need, Number(batch.remainingQuantity));
    if (amount > 0) allocations.push({ batchId: batch.id || batch._id, quantity: amount });
    need = Math.max(0, need - amount);
  }
  return { allocations, deducted: Number(quantity) - need, shortage: need };
}

function isOptionalCollectionError(error) {
  const text = String((error && (error.message || error.errMsg)) || error || '');
  return /collection.*(not exist|不存在)|DATABASE_COLLECTION_NOT_EXIST|-502005/i.test(text);
}

module.exports = {
  MEDICINE_FIELDS,
  BATCH_FIELDS,
  PLAN_FIELDS,
  pick,
  generateInviteCode,
  inviteExpiresAtMs,
  recordKey,
  recordDocumentId,
  scheduledAtMs,
  classifyReminder,
  isReminderActionable,
  planSignature,
  REMINDER_EARLY_MINUTES,
  REMINDER_LATE_MINUTES,
  isPlanActiveOn,
  isInviteUsable,
  resolveInviteMembership,
  canConfirmRecord,
  isDeleteConfirmationValid,
  normalizeDose,
  allocateStock,
  isOptionalCollectionError
};
