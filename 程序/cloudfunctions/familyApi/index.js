const cloud = require('wx-server-sdk');
const logic = require('./logic.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const FUNCTION_VERSION = '2026.07.13-reminder-v2';
const SUPPORTED_ACTIONS = [
  'healthCheck', 'userLogin', 'createFamily', 'getInvitePreview', 'joinFamilyByInvite',
  'getFamilySnapshot', 'saveMedicine', 'updateMedicine', 'addOrUpdateBatch', 'setBatchStatus',
  'saveMedicationPlan', 'ensureTodayMedicationRecords', 'confirmMedicationRecord',
  'snoozeMedicationRecord', 'repairMedicationReminders', 'ensureMonthlyInventoryAudit',
  'saveInventoryAuditSettings', 'saveInventoryAuditItem', 'completeInventoryAudit',
  'saveNotificationSubscription', 'updateFamilyMember', 'removeFamilyMember', 'leaveFamily',
  'transferFamilyAdmin', 'rotateInviteCode', 'deleteFamily'
];

const COL = {
  users: 'users',
  families: 'families',
  members: 'family_members',
  medicines: 'medicines',
  batches: 'medicine_batches',
  plans: 'medication_plans',
  records: 'medication_records',
  movements: 'inventory_movements',
  audits: 'inventory_audits',
  auditItems: 'inventory_audit_items',
  auditSettings: 'inventory_audit_settings',
  notificationSettings: 'notification_settings',
  notificationJobs: 'notification_jobs',
  logs: 'access_logs'
};

function ok(data) {
  return { ok: true, data };
}

function fail(message) {
  return { ok: false, message };
}

async function optionalQuery(promise, emptyValue) {
  try {
    return await promise;
  } catch (err) {
    console.warn('[optional-feature-query]', err && (err.message || err.errMsg) || err);
    return emptyValue;
  }
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowText() {
  const d = new Date();
  return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function chinaDateTimeText(ms) {
  const d = new Date(Number(ms || Date.now()) + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function normalizeBarcode(code) {
  return String(code || '').trim().replace(/[^0-9A-Za-z]/g, '');
}

function normalizeTime(time) {
  const t = String(time || '').trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return '';
  return `${pad(h)}:${pad(min)}`;
}

function validateBatch(batch) {
  if (!batch.expireDate) throw new Error('有效期必填');
  const total = Number(batch.totalQuantity);
  const remaining = Number(batch.remainingQuantity);
  if (!Number.isFinite(total) || total <= 0) throw new Error('总数量必须大于 0');
  if (!Number.isFinite(remaining) || remaining < 0) throw new Error('剩余数量不能小于 0');
  if (remaining > total) throw new Error('剩余数量不能大于总数量');
  batch.totalQuantity = total;
  batch.remainingQuantity = remaining;
  batch.unit = String(batch.unit || '').trim();
  if (!batch.unit) throw new Error('单位必填');
}

async function addLog(familyId, openid, action, target, actionType) {
  await db.collection(COL.logs).add({
    data: { familyId, openid, action, target, actionType, time: nowText(), createdAt: db.serverDate() }
  });
}

async function getMember(familyId, openid) {
  const res = await db.collection(COL.members).where({ familyId, openid, status: 'active' }).limit(1).get();
  return res.data[0] || null;
}

function canEdit(member) {
  return member && (member.role === 'admin' || member.canEdit === true);
}

async function requireMember(familyId, openid) {
  const member = await getMember(familyId, openid);
  if (!member) throw new Error('无权访问该家庭');
  return member;
}

async function requireEditor(familyId, openid) {
  const member = await requireMember(familyId, openid);
  if (!canEdit(member)) throw new Error('当前成员没有编辑权限');
  return member;
}

async function requireAdmin(familyId, openid) {
  const member = await requireMember(familyId, openid);
  if (member.role !== 'admin') throw new Error('仅家庭管理员可执行此操作');
  return member;
}

async function requireOwnedDocument(collectionName, id, familyId) {
  if (!id) throw new Error('缺少目标记录 ID');
  const res = await db.collection(collectionName).doc(id).get();
  const row = res && res.data;
  if (!row || row.familyId !== familyId) throw new Error('目标记录不属于当前家庭');
  return row;
}

async function createUniqueInvite() {
  let inviteCode = logic.generateInviteCode();
  for (let i = 0; i < 8; i++) {
    const exist = await db.collection(COL.families).where({ inviteCode }).limit(1).get();
    if (!exist.data.length) return inviteCode;
    inviteCode = logic.generateInviteCode();
  }
  throw new Error('邀请码生成失败，请重试');
}

async function userLogin(openid) {
  const users = db.collection(COL.users);
  const found = await users.where({ openid }).limit(1).get();
  if (found.data.length) {
    await users.doc(found.data[0]._id).update({ data: { lastActiveAt: db.serverDate() } });
  } else {
    await users.add({ data: { openid, createdAt: db.serverDate(), lastActiveAt: db.serverDate() } });
  }
  const families = await db.collection(COL.members).where({ openid, status: 'active' }).get();
  return ok({ openid, user: found.data[0] || { openid }, families: families.data });
}

async function createFamily(openid, event) {
  const familyName = String(event.familyName || '').trim();
  if (!familyName) throw new Error('家庭名称不能为空');
  const adminName = String(event.adminName || '当前用户').trim();
  const note = String(event.note || '').trim();
  const inviteCode = await createUniqueInvite();
  const familyData = {
    name: familyName,
    note,
    inviteCode,
    inviteEnabled: true,
    inviteExpiresAtMs: logic.inviteExpiresAtMs(),
    createdByOpenid: openid,
    adminOpenids: [openid],
    memberCount: 1,
    createdAt: today(),
    updatedAt: db.serverDate()
  };
  const added = await db.collection(COL.families).add({ data: familyData });
  const familyId = added._id;
  const memberData = {
    familyId,
    openid,
    name: adminName,
    role: 'admin',
    roleLabel: '管理员',
    relation: '本人',
    avatar: '👤',
    canEdit: true,
    status: 'active',
    joinTime: today(),
    createdAt: db.serverDate()
  };
  await db.collection(COL.members).add({ data: memberData });
  await addLog(familyId, openid, '创建家庭', familyName, 'create');
  return ok({ family: Object.assign({ id: familyId }, familyData), member: memberData });
}

async function getInvitePreview(openid, event) {
  const inviteCode = String(event.inviteCode || '').trim().toUpperCase();
  if (!inviteCode) throw new Error('缺少邀请码');
  const familyRes = await db.collection(COL.families).where({ inviteCode }).limit(1).get();
  const family = familyRes.data[0];
  if (!family) throw new Error('邀请码不存在');
  if (!logic.isInviteUsable(family)) throw new Error('邀请码已失效，请联系管理员重新邀请');

  const memberships = await db.collection(COL.members).where({ openid, status: 'active' }).get();
  const membershipState = logic.resolveInviteMembership(family._id, memberships.data);
  let currentFamily = null;
  if (membershipState.otherFamilyId) {
    try {
      const currentRes = await db.collection(COL.families).doc(membershipState.otherFamilyId).get();
      currentFamily = {
        id: membershipState.otherFamilyId,
        name: (currentRes.data && currentRes.data.name) || '当前家庭'
      };
    } catch (e) {
      currentFamily = { id: membershipState.otherFamilyId, name: '当前家庭' };
    }
  }

  return ok({
    family: { id: family._id, name: family.name },
    inviteExpiresAtMs: family.inviteExpiresAtMs || null,
    alreadyJoined: membershipState.alreadyJoined,
    conflict: membershipState.conflict,
    currentFamily
  });
}

async function joinFamilyByInvite(openid, event) {
  const inviteCode = String(event.inviteCode || '').trim().toUpperCase();
  const name = String(event.name || '').trim();
  if (!inviteCode) throw new Error('请填写邀请码');
  if (!name) throw new Error('请填写姓名或称呼');
  const familyRes = await db.collection(COL.families).where({ inviteCode }).limit(1).get();
  const family = familyRes.data[0];
  if (!family) throw new Error('邀请码不存在');
  if (!logic.isInviteUsable(family)) throw new Error('邀请码已失效，请联系管理员重新生成');
  const familyId = family._id;
  const activeMemberships = await db.collection(COL.members).where({ openid, status: 'active' }).get();
  const membershipState = logic.resolveInviteMembership(familyId, activeMemberships.data);
  if (membershipState.alreadyJoined) {
    const sameMembership = activeMemberships.data.find(item => item.familyId === familyId);
    return ok({ family: Object.assign({ id: familyId }, family), member: sameMembership });
  }
  if (membershipState.conflict) {
    throw new Error('你已加入其他家庭，暂不支持同时加入多个家庭');
  }
  const role = event.role === 'elder' ? 'elder' : 'member';
  const memberData = {
    familyId,
    openid,
    name,
    role,
    roleLabel: role === 'elder' ? '老人' : '家庭成员',
    relation: String(event.relation || (role === 'elder' ? '长辈' : '家人')).trim(),
    avatar: role === 'elder' ? '👴' : '👥',
    canEdit: false,
    status: 'active',
    joinTime: today(),
    createdAt: db.serverDate()
  };
  await db.collection(COL.members).add({ data: memberData });
  await db.collection(COL.families).doc(familyId).update({ data: { memberCount: _.inc(1), updatedAt: db.serverDate() } });
  await addLog(familyId, openid, '成员加入家庭', `${name}（${memberData.relation}）`, 'invite');
  return ok({ family: Object.assign({ id: familyId }, family), member: memberData });
}

async function getFamilySnapshot(openid, event) {
  const familyId = event.familyId;
  const currentMember = await requireMember(familyId, openid);
  const [familyRes, members, medicines, batches, plans, records, movements, audits, auditItems, auditSettings, notificationSettings, logs] = await Promise.all([
    db.collection(COL.families).doc(familyId).get(),
    db.collection(COL.members).where({ familyId, status: 'active' }).get(),
    db.collection(COL.medicines).where({ familyId }).get(),
    db.collection(COL.batches).where({ familyId }).get(),
    db.collection(COL.plans).where({ familyId }).get(),
    db.collection(COL.records).where({ familyId }).get(),
    optionalQuery(db.collection(COL.movements).where({ familyId }).limit(100).get(), { data: [] }),
    optionalQuery(db.collection(COL.audits).where({ familyId }).limit(24).get(), { data: [] }),
    optionalQuery(db.collection(COL.auditItems).where({ familyId }).get(), { data: [] }),
    optionalQuery(db.collection(COL.auditSettings).where({ familyId }).limit(1).get(), { data: [] }),
    optionalQuery(db.collection(COL.notificationSettings).where({ familyId, openid }).limit(1).get(), { data: [] }),
    db.collection(COL.logs).where({ familyId }).orderBy('createdAt', 'desc').limit(100).get()
  ]);
  const family = Object.assign({ id: familyId }, familyRes.data);
  const memberByOpenid = members.data.reduce((map, member) => {
    map[member.openid] = member;
    return map;
  }, {});
  const accessLogs = logs.data.map(log => Object.assign({}, log, {
    by: memberByOpenid[log.openid] ? memberByOpenid[log.openid].name : '家庭成员'
  }));
  return ok({
    openid,
    currentMember,
    family,
    members: members.data,
    medicines: medicines.data,
    medicineBatches: batches.data,
    medicationPlans: plans.data,
    medicationRecords: records.data,
    inventoryMovements: movements.data,
    inventoryAudits: audits.data,
    inventoryAuditItems: auditItems.data,
    inventoryAuditSettings: auditSettings.data[0] || { enabled: true, dayOfMonth: 1, reminderTime: '19:00' },
    notificationSettings: notificationSettings.data[0] || null,
    accessLogs: currentMember.role === 'admin' ? accessLogs : []
  });
}

async function saveMedicine(openid, event) {
  const familyId = event.familyId;
  await requireEditor(familyId, openid);
  const med = logic.pick(event.medicine, logic.MEDICINE_FIELDS);
  const batch = logic.pick(event.batch, logic.BATCH_FIELDS);
  if (!med.name) throw new Error('药品名称必填');
  if (!med.specification) throw new Error('药品规格必填');
  validateBatch(batch);
  const barcode = normalizeBarcode(med.barcode);
  let match = null;
  if (barcode) {
    const byCode = await db.collection(COL.medicines).where({ familyId, barcode }).limit(1).get();
    match = byCode.data[0] || null;
  }
  if (!match) {
    const byName = await db.collection(COL.medicines).where({ familyId, name: String(med.name).trim() }).limit(1).get();
    match = byName.data[0] || null;
  }
  let medicineId;
  if (match) {
    medicineId = match._id;
    const patch = {};
    Object.keys(med).forEach(k => {
      if (!match[k] && med[k]) patch[k] = med[k];
    });
    if (barcode && !match.barcode) patch.barcode = barcode;
    if (Object.keys(patch).length) {
      patch.updatedAt = db.serverDate();
      await db.collection(COL.medicines).doc(medicineId).update({ data: patch });
    }
  } else {
    const added = await db.collection(COL.medicines).add({
      data: Object.assign({}, med, {
        familyId,
        barcode,
        status: 'active',
        createdAt: today(),
        createdByOpenid: openid,
        updatedAt: db.serverDate()
      })
    });
    medicineId = added._id;
  }
  const batchData = Object.assign({}, batch, {
    familyId,
    medicineId,
    status: 'active',
    addedAt: today(),
    addedByOpenid: openid,
    updatedAt: db.serverDate()
  });
  const batchAdded = await db.collection(COL.batches).add({ data: batchData });
  await addLog(familyId, openid, match ? '新增批次' : '新增药品主档+批次', `${med.name} · ${batch.batchNo || batchAdded._id}`, 'create');
  return ok({ medicineId, batchId: batchAdded._id });
}

async function updateMedicine(openid, event) {
  const familyId = event.familyId;
  await requireEditor(familyId, openid);
  await requireOwnedDocument(COL.medicines, event.medicineId, familyId);
  const patch = logic.pick(event.patch, logic.MEDICINE_FIELDS);
  if (patch.barcode) patch.barcode = normalizeBarcode(patch.barcode);
  patch.updatedAt = db.serverDate();
  await db.collection(COL.medicines).doc(event.medicineId).update({ data: patch });
  await addLog(familyId, openid, '修改药品主档', event.medicineId, 'update');
  return ok({ medicineId: event.medicineId });
}

async function addOrUpdateBatch(openid, event) {
  const familyId = event.familyId;
  await requireEditor(familyId, openid);
  await requireOwnedDocument(COL.medicines, event.medicineId, familyId);
  const incoming = event.batch || {};
  const batch = Object.assign(logic.pick(incoming, logic.BATCH_FIELDS), { familyId, medicineId: event.medicineId, updatedAt: db.serverDate() });
  validateBatch(batch);
  if (incoming.id || incoming._id) {
    const id = incoming.id || incoming._id;
    await requireOwnedDocument(COL.batches, id, familyId);
    await db.collection(COL.batches).doc(id).update({ data: batch });
    await addLog(familyId, openid, '修改批次', id, 'update');
    return ok({ batchId: id });
  }
  batch.status = batch.status || 'active';
  batch.addedAt = today();
  batch.addedByOpenid = openid;
  const added = await db.collection(COL.batches).add({ data: batch });
  await addLog(familyId, openid, '新增批次', added._id, 'create');
  return ok({ batchId: added._id });
}

async function setBatchStatus(openid, event) {
  const familyId = event.familyId;
  await requireEditor(familyId, openid);
  await requireOwnedDocument(COL.batches, event.batchId, familyId);
  const status = event.status === 'disabled' ? 'disabled' : 'active';
  await db.collection(COL.batches).doc(event.batchId).update({ data: { status, statusChangedAt: db.serverDate(), statusChangedByOpenid: openid } });
  await addLog(familyId, openid, status === 'disabled' ? '停用批次' : '恢复批次', event.batchId, status === 'disabled' ? 'disable' : 'update');
  return ok({ batchId: event.batchId, status });
}

function buildTodayRecords(plan) {
  const date = today();
  if (!logic.isPlanActiveOn(plan, date)) return [];
  return (plan.reminderTimes || []).map(normalizeTime).filter(Boolean).map(time => ({
    familyId: plan.familyId,
    planId: plan.id || plan._id,
    memberId: plan.memberId,
    medicineId: plan.medicineId,
    doseQuantity: Number(plan.doseQuantity) || 0,
    doseUnit: plan.doseUnit || '',
    scheduledTime: `${date} ${time}`,
    recordKey: logic.recordKey(plan.id || plan._id, date, time),
    status: 'pending',
    confirmedAt: null,
    skippedAt: null,
    createdAt: db.serverDate()
  }));
}

async function ensureReminderRecord(rec) {
  const byKey = await db.collection(COL.records).where({ familyId: rec.familyId, recordKey: rec.recordKey }).limit(1).get();
  if (byKey.data.length) return { created: false, recordId: byKey.data[0]._id };
  const legacy = await db.collection(COL.records).where({
    familyId: rec.familyId,
    planId: rec.planId,
    scheduledTime: rec.scheduledTime
  }).limit(1).get();
  if (legacy.data.length) {
    await db.collection(COL.records).doc(legacy.data[0]._id).update({ data: { recordKey: rec.recordKey } });
    return { created: false, recordId: legacy.data[0]._id };
  }
  const recordId = logic.recordDocumentId(rec.planId, rec.scheduledTime.slice(0, 10), rec.scheduledTime.slice(-5));
  try {
    await db.collection(COL.records).doc(recordId).set({ data: rec });
  } catch (err) {
    const raced = await db.collection(COL.records).where({ familyId: rec.familyId, recordKey: rec.recordKey }).limit(1).get();
    if (!raced.data.length) throw err;
    return { created: false, recordId: raced.data[0]._id };
  }
  return { created: true, recordId };
}

async function saveMedicationPlan(openid, event) {
  const familyId = event.familyId;
  await requireEditor(familyId, openid);
  const incoming = event.plan || {};
  const plan = Object.assign(logic.pick(incoming, logic.PLAN_FIELDS), { familyId, updatedAt: db.serverDate() });
  plan.reminderTimes = (plan.reminderTimes || []).map(normalizeTime).filter(Boolean);
  plan.timesPerDay = plan.reminderTimes.length;
  const dose = logic.normalizeDose(plan);
  plan.doseQuantity = dose.quantity;
  plan.doseUnit = dose.unit;
  plan.deductStock = plan.deductStock !== false;
  plan.stockWarningDays = Number(plan.stockWarningDays) > 0 ? Number(plan.stockWarningDays) : 7;
  plan.dosePerTime = plan.dosePerTime || (dose.quantity && dose.unit ? `${dose.quantity}${dose.unit}` : '');
  if (!plan.medicineId || !plan.memberId || !plan.dosePerTime || plan.reminderTimes.length === 0) {
    throw new Error('请完整填写用药计划');
  }
  await requireOwnedDocument(COL.medicines, plan.medicineId, familyId);
  const targetMember = await requireOwnedDocument(COL.members, plan.memberId, familyId);
  if (targetMember.status !== 'active') throw new Error('使用人已不在当前家庭');
  let planId = incoming.id || incoming._id;
  if (!planId && plan.clientRequestId) {
    const retry = await db.collection(COL.plans).where({ familyId, createdByOpenid: openid, clientRequestId: plan.clientRequestId }).limit(1).get();
    if (retry.data.length) planId = retry.data[0]._id;
  }
  if (planId) {
    await requireOwnedDocument(COL.plans, planId, familyId);
    await db.collection(COL.plans).doc(planId).update({ data: plan });
  } else {
    plan.enabled = plan.enabled !== false;
    plan.createdAt = db.serverDate();
    plan.createdByOpenid = openid;
    const added = await db.collection(COL.plans).add({ data: plan });
    planId = added._id;
  }
  const todayText = today();
  const existingToday = await db.collection(COL.records).where({ familyId, planId }).get();
  const desiredTimes = (plan.reminderTimes || []).map(normalizeTime).filter(Boolean);
  const desiredKeys = desiredTimes.map(time => logic.recordKey(planId, todayText, time));
  for (const row of existingToday.data) {
    if (!String(row.scheduledTime || '').startsWith(todayText + ' ')) continue;
    if (row.status === 'done' || row.status === 'skipped') continue;
    const key = row.recordKey || logic.recordKey(planId, todayText, String(row.scheduledTime).slice(-5));
    if (plan.enabled === false || desiredKeys.indexOf(key) === -1) {
      await db.collection(COL.records).doc(row._id).remove();
    }
  }
  const records = buildTodayRecords(Object.assign({}, plan, { id: planId }));
  for (const rec of records) {
    await ensureReminderRecord(rec);
  }
  await addLog(familyId, openid, '保存用药计划', planId, 'update');
  return ok({ planId });
}

async function confirmMedicationRecord(openid, event) {
  const familyId = event.familyId;
  const member = await requireMember(familyId, openid);
  const record = await requireOwnedDocument(COL.records, event.recordId, familyId);
  if (!logic.canConfirmRecord(member, record)) {
    throw new Error('只能确认自己的用药提醒');
  }
  if (event.action !== 'skipped' && record.status !== 'done' && !logic.isReminderActionable(record, Date.now())) {
    throw new Error('还没有到本次服药时间');
  }
  const status = event.action === 'skipped' ? 'skipped' : 'done';
  if (status === 'skipped') {
    await db.collection(COL.records).doc(event.recordId).update({ data: { status, skippedAt: nowText(), skippedByOpenid: openid } });
    await addLog(familyId, openid, '跳过本次服药', event.recordId, 'update');
    return ok({ recordId: event.recordId, status, stockDeductionStatus: 'not_applicable' });
  }
  if (record.status === 'done') {
    return ok({ recordId: event.recordId, status: 'done', stockDeductionStatus: record.stockDeductionStatus || 'done' });
  }
  let existingMovement;
  try {
    existingMovement = await db.collection(COL.movements).where({ familyId, recordId: event.recordId, type: 'medication' }).limit(1).get();
  } catch (err) {
    if (!logic.isOptionalCollectionError(err)) throw err;
    await db.collection(COL.records).doc(event.recordId).update({ data: {
      status: 'done', confirmedAt: nowText(), confirmedByOpenid: openid, stockDeductionStatus: 'feature_unavailable'
    } });
    await addLog(familyId, openid, '老人确认服药（库存流水未启用）', event.recordId, 'confirm');
    return ok({ recordId: event.recordId, status: 'done', stockDeductionStatus: 'feature_unavailable', deduction: { allocations: [], deducted: 0, shortage: 0 } });
  }
  if (existingMovement.data.length) {
    await db.collection(COL.records).doc(event.recordId).update({ data: { status: 'done', confirmedAt: nowText(), confirmedByOpenid: openid, stockDeductionStatus: 'done' } });
    return ok({ recordId: event.recordId, status: 'done', stockDeductionStatus: 'done', deduction: { allocations: [], deducted: 0, shortage: 0 } });
  }
  const plan = await requireOwnedDocument(COL.plans, record.planId, familyId);
  const dose = logic.normalizeDose(plan);
  let deduction = { allocations: [], deducted: 0, shortage: 0 };
  let deductionStatus = 'disabled';
  if (plan.deductStock !== false && dose.quantity > 0 && dose.unit) {
    const batchesRes = await db.collection(COL.batches).where({ familyId, medicineId: plan.medicineId }).get();
    deduction = logic.allocateStock(batchesRes.data, dose.quantity, dose.unit, today());
    for (const allocation of deduction.allocations) {
      await db.collection(COL.batches).doc(allocation.batchId).update({
        data: { remainingQuantity: _.inc(-allocation.quantity), updatedAt: db.serverDate() }
      });
    }
    await db.collection(COL.movements).add({ data: {
      familyId,
      medicineId: plan.medicineId,
      recordId: event.recordId,
      type: 'medication',
      quantity: -deduction.deducted,
      requestedQuantity: dose.quantity,
      shortage: deduction.shortage,
      unit: dose.unit,
      allocations: deduction.allocations,
      operatorOpenid: openid,
      createdAt: db.serverDate()
    } });
    deductionStatus = deduction.shortage > 0 ? 'shortage' : 'done';
  } else if (plan.deductStock !== false) {
    deductionStatus = 'needs_confirmation';
  }
  await db.collection(COL.records).doc(event.recordId).update({ data: {
    status: 'done',
    confirmedAt: nowText(),
    confirmedByOpenid: openid,
    medicineId: plan.medicineId,
    doseQuantity: dose.quantity,
    doseUnit: dose.unit,
    stockDeductionStatus: deductionStatus,
    deductedQuantity: deduction.deducted,
    stockShortage: deduction.shortage
  } });
  await addLog(familyId, openid, status === 'done' ? '老人确认服药' : '跳过本次服药', event.recordId, status === 'done' ? 'confirm' : 'update');
  return ok({ recordId: event.recordId, status, stockDeductionStatus: deductionStatus, doseUnit: dose.unit, deduction });
}

async function snoozeMedicationRecord(openid, event) {
  const familyId = event.familyId;
  const member = await requireMember(familyId, openid);
  const record = await requireOwnedDocument(COL.records, event.recordId, familyId);
  if (!logic.canConfirmRecord(member, record)) throw new Error('只能操作自己的用药提醒');
  if (record.status === 'done' || record.status === 'skipped') throw new Error('本次提醒已经处理');
  if (!logic.isReminderActionable(record, Date.now())) throw new Error('当前提醒暂不能稍后处理');
  const minutes = Math.max(5, Math.min(120, Number(event.minutes) || 10));
  const snoozedUntil = chinaDateTimeText(Date.now() + minutes * 60000);
  await db.collection(COL.records).doc(event.recordId).update({ data: {
    status: 'pending', snoozedUntil, snoozedAt: db.serverDate(), snoozedByOpenid: openid
  } });
  await addLog(familyId, openid, `稍后 ${minutes} 分钟提醒`, event.recordId, 'update');
  return ok({ recordId: event.recordId, snoozedUntil, minutes });
}

async function ensureTodayMedicationRecords(openid, event) {
  const familyId = event.familyId;
  await requireMember(familyId, openid);
  const plans = await db.collection(COL.plans).where({ familyId }).get();
  let createdCount = 0;
  for (const plan of plans.data) {
    const records = buildTodayRecords(Object.assign({ id: plan._id }, plan));
    for (const rec of records) {
      const ensured = await ensureReminderRecord(rec);
      if (ensured.created) createdCount += 1;
    }
  }
  return ok({ createdCount });
}

async function repairMedicationReminders(openid, event) {
  const familyId = event.familyId;
  await requireAdmin(familyId, openid);
  const [plansRes, recordsRes] = await Promise.all([
    db.collection(COL.plans).where({ familyId }).get(),
    db.collection(COL.records).where({ familyId }).get()
  ]);
  const execute = event.execute === true;
  const canonicalByPlan = {};
  const planGroups = {};
  for (const plan of plansRes.data) {
    const signature = logic.planSignature(plan);
    planGroups[signature] = planGroups[signature] || [];
    planGroups[signature].push(plan);
  }
  const duplicatePlans = [];
  Object.keys(planGroups).forEach(signature => {
    const group = planGroups[signature];
    const keeper = group[0];
    group.forEach(plan => { canonicalByPlan[plan._id] = keeper._id; });
    duplicatePlans.push(...group.slice(1));
  });

  const pendingGroups = {};
  for (const record of recordsRes.data) {
    if (record.status === 'done' || record.status === 'skipped') continue;
    const canonicalPlanId = canonicalByPlan[record.planId] || record.planId;
    const key = logic.recordKey(canonicalPlanId, String(record.scheduledTime || '').slice(0, 10), String(record.scheduledTime || '').slice(-5));
    pendingGroups[key] = pendingGroups[key] || [];
    pendingGroups[key].push(record);
  }
  const duplicateRecords = [];
  const keepers = [];
  Object.keys(pendingGroups).forEach(key => {
    const group = pendingGroups[key];
    const canonicalPlanId = key.split('|')[0];
    const keeper = group.find(row => row.planId === canonicalPlanId) || group[0];
    keepers.push({ row: keeper, canonicalPlanId, key });
    duplicateRecords.push(...group.filter(row => row._id !== keeper._id));
  });

  if (execute) {
    for (const plan of duplicatePlans) {
      await db.collection(COL.plans).doc(plan._id).update({ data: {
        enabled: false, duplicateOf: canonicalByPlan[plan._id], disabledReason: 'duplicate_repair', updatedAt: db.serverDate()
      } });
    }
    for (const item of keepers) {
      await db.collection(COL.records).doc(item.row._id).update({ data: { planId: item.canonicalPlanId, recordKey: item.key } });
    }
    for (const record of duplicateRecords) await db.collection(COL.records).doc(record._id).remove();
    await addLog(familyId, openid, '修复重复用药提醒', `${duplicatePlans.length} 个计划，${duplicateRecords.length} 条提醒`, 'update');
  }
  return ok({ execute, duplicatePlanCount: duplicatePlans.length, duplicateRecordCount: duplicateRecords.length });
}

async function ensureMonthlyInventoryAudit(openid, event) {
  const familyId = event.familyId;
  await requireMember(familyId, openid);
  const period = today().slice(0, 7);
  const existing = await db.collection(COL.audits).where({ familyId, period }).limit(1).get();
  if (existing.data.length) return ok({ audit: Object.assign({ id: existing.data[0]._id }, existing.data[0]), created: false });
  const settingsRes = await db.collection(COL.auditSettings).where({ familyId }).limit(1).get();
  const settings = settingsRes.data[0] || { enabled: true, dayOfMonth: 1, reminderTime: '19:00' };
  if (settings.enabled === false && event.force !== true) return ok({ audit: null, created: false });
  const day = Number(today().slice(-2));
  if (day < Number(settings.dayOfMonth || 1) && event.force !== true) return ok({ audit: null, created: false });
  const batches = await db.collection(COL.batches).where({ familyId }).get();
  const activeBatches = batches.data.filter(batch => batch.status !== 'disabled' && batch.status !== 'inactive');
  const auditData = {
    familyId,
    period,
    status: 'pending',
    totalItems: activeBatches.length,
    completedItems: 0,
    scheduledDate: `${period}-${pad(Number(settings.dayOfMonth || 1))}`,
    createdBy: 'system',
    createdAt: db.serverDate()
  };
  const added = await db.collection(COL.audits).add({ data: auditData });
  for (const batch of activeBatches) {
    await db.collection(COL.auditItems).add({ data: {
      familyId,
      auditId: added._id,
      medicineId: batch.medicineId,
      batchId: batch._id,
      systemQuantity: Number(batch.remainingQuantity) || 0,
      actualQuantity: null,
      difference: null,
      unit: batch.unit || '',
      status: 'pending',
      createdAt: db.serverDate()
    } });
  }
  await addLog(familyId, openid, '生成每月药箱盘点', period, 'create');
  return ok({ audit: Object.assign({ id: added._id }, auditData), created: true });
}

async function saveInventoryAuditSettings(openid, event) {
  const familyId = event.familyId;
  await requireAdmin(familyId, openid);
  const dayOfMonth = Math.max(1, Math.min(28, Number(event.dayOfMonth) || 1));
  const reminderTime = normalizeTime(event.reminderTime) || '19:00';
  const data = { familyId, enabled: event.enabled !== false, dayOfMonth, reminderTime, updatedAt: db.serverDate(), updatedByOpenid: openid };
  const found = await db.collection(COL.auditSettings).where({ familyId }).limit(1).get();
  if (found.data.length) await db.collection(COL.auditSettings).doc(found.data[0]._id).update({ data });
  else await db.collection(COL.auditSettings).add({ data: Object.assign(data, { createdAt: db.serverDate() }) });
  return ok(data);
}

async function saveInventoryAuditItem(openid, event) {
  const familyId = event.familyId;
  await requireEditor(familyId, openid);
  const item = await requireOwnedDocument(COL.auditItems, event.itemId, familyId);
  const actual = Number(event.actualQuantity);
  if (!Number.isFinite(actual) || actual < 0) throw new Error('实际数量不能小于 0');
  const difference = actual - Number(item.systemQuantity || 0);
  await db.collection(COL.auditItems).doc(event.itemId).update({ data: {
    actualQuantity: actual,
    difference,
    status: 'confirmed',
    updatedAt: db.serverDate(),
    updatedByOpenid: openid
  } });
  return ok({ itemId: event.itemId, actualQuantity: actual, difference });
}

async function completeInventoryAudit(openid, event) {
  const familyId = event.familyId;
  await requireEditor(familyId, openid);
  const audit = await requireOwnedDocument(COL.audits, event.auditId, familyId);
  if (audit.status === 'completed') return ok({ auditId: event.auditId, status: 'completed' });
  const items = await db.collection(COL.auditItems).where({ familyId, auditId: event.auditId }).get();
  if (items.data.some(item => item.actualQuantity === null || item.actualQuantity === undefined)) throw new Error('请先完成全部药品盘点');
  for (const item of items.data) {
    const batch = await requireOwnedDocument(COL.batches, item.batchId, familyId);
    const actual = Number(item.actualQuantity);
    const before = Number(batch.remainingQuantity) || 0;
    const difference = actual - before;
    if (difference !== 0) {
      await db.collection(COL.batches).doc(item.batchId).update({ data: { remainingQuantity: actual, updatedAt: db.serverDate() } });
      await db.collection(COL.movements).add({ data: {
        familyId,
        medicineId: item.medicineId,
        batchId: item.batchId,
        auditId: event.auditId,
        type: 'inventory_audit',
        quantity: difference,
        beforeQuantity: before,
        afterQuantity: actual,
        unit: item.unit || batch.unit || '',
        operatorOpenid: openid,
        createdAt: db.serverDate()
      } });
    }
  }
  await db.collection(COL.audits).doc(event.auditId).update({ data: {
    status: 'completed', completedItems: items.data.length, completedAt: db.serverDate(), completedByOpenid: openid
  } });
  await addLog(familyId, openid, '完成每月药箱盘点', audit.period, 'update');
  return ok({ auditId: event.auditId, status: 'completed' });
}

async function saveNotificationSubscription(openid, event) {
  const familyId = event.familyId;
  await requireMember(familyId, openid);
  const templateId = String(event.templateId || '').trim();
  const status = ['accept', 'reject', 'ban'].indexOf(event.status) >= 0 ? event.status : 'reject';
  if (!templateId) throw new Error('缺少订阅消息模板 ID');
  const found = await db.collection(COL.notificationSettings).where({ familyId, openid }).limit(1).get();
  const auditKind = event.kind === 'inventoryAudit';
  const data = { familyId, openid, updatedAt: db.serverDate() };
  data[auditKind ? 'auditTemplateId' : 'medicationTemplateId'] = templateId;
  data[auditKind ? 'auditStatus' : 'medicationStatus'] = status;
  if (found.data.length) await db.collection(COL.notificationSettings).doc(found.data[0]._id).update({ data });
  else await db.collection(COL.notificationSettings).add({ data: Object.assign(data, { createdAt: db.serverDate() }) });
  return ok({ templateId, status, kind: auditKind ? 'inventoryAudit' : 'medication' });
}

async function updateFamilyMember(openid, event) {
  const familyId = event.familyId;
  const admin = await requireAdmin(familyId, openid);
  const target = await requireOwnedDocument(COL.members, event.memberId, familyId);
  const patch = event.patch || {};
  const nextRole = patch.role === 'elder' ? 'elder' : 'member';
  if (target._id === admin._id) throw new Error('不能在这里修改自己的管理员身份');
  const data = {
    role: nextRole,
    roleLabel: nextRole === 'elder' ? '老人' : '家庭成员',
    canEdit: nextRole === 'member' && patch.canEdit === true,
    updatedAt: db.serverDate()
  };
  await db.collection(COL.members).doc(target._id).update({ data });
  await addLog(familyId, openid, '修改成员权限', target.name, 'update');
  return ok({ memberId: target._id });
}

async function removeFamilyMember(openid, event) {
  const familyId = event.familyId;
  const admin = await requireAdmin(familyId, openid);
  const target = await requireOwnedDocument(COL.members, event.memberId, familyId);
  if (target._id === admin._id) throw new Error('不能移除自己');
  await db.collection(COL.members).doc(target._id).update({ data: { status: 'removed', removedAt: db.serverDate(), removedByOpenid: openid } });
  await db.collection(COL.families).doc(familyId).update({ data: { memberCount: _.inc(-1), updatedAt: db.serverDate() } });
  await addLog(familyId, openid, '移除家庭成员', target.name, 'disable');
  return ok({ memberId: target._id });
}

async function leaveFamily(openid, event) {
  const familyId = event.familyId;
  const member = await requireMember(familyId, openid);
  if (member.role === 'admin') throw new Error('管理员请先转让管理员身份');
  await db.collection(COL.members).doc(member._id).update({ data: { status: 'left', leftAt: db.serverDate() } });
  await db.collection(COL.families).doc(familyId).update({ data: { memberCount: _.inc(-1), updatedAt: db.serverDate() } });
  await addLog(familyId, openid, '成员退出家庭', member.name, 'disable');
  return ok({ familyId });
}

async function transferFamilyAdmin(openid, event) {
  const familyId = event.familyId;
  const current = await requireAdmin(familyId, openid);
  const target = await requireOwnedDocument(COL.members, event.memberId, familyId);
  if (target.status !== 'active') throw new Error('目标成员状态不可用');
  if (target._id === current._id) throw new Error('该成员已经是管理员');
  await db.collection(COL.members).doc(target._id).update({ data: { role: 'admin', roleLabel: '管理员', canEdit: true, updatedAt: db.serverDate() } });
  await db.collection(COL.members).doc(current._id).update({ data: { role: 'member', roleLabel: '家庭成员', canEdit: true, updatedAt: db.serverDate() } });
  await db.collection(COL.families).doc(familyId).update({ data: { adminOpenids: [target.openid], updatedAt: db.serverDate() } });
  await addLog(familyId, openid, '转让管理员', target.name, 'update');
  return ok({ memberId: target._id });
}

async function rotateInviteCode(openid, event) {
  const familyId = event.familyId;
  await requireAdmin(familyId, openid);
  const inviteCode = await createUniqueInvite();
  const inviteExpiresAtMs = logic.inviteExpiresAtMs();
  await db.collection(COL.families).doc(familyId).update({ data: { inviteCode, inviteEnabled: true, inviteExpiresAtMs, updatedAt: db.serverDate() } });
  await addLog(familyId, openid, '重新生成邀请码', inviteCode, 'update');
  return ok({ inviteCode, inviteExpiresAtMs });
}

async function listAllFamilyRows(collectionName, familyId) {
  const rows = [];
  let offset = 0;
  while (true) {
    const res = await db.collection(collectionName).where({ familyId }).skip(offset).limit(100).get();
    rows.push(...res.data);
    if (res.data.length < 100) break;
    offset += res.data.length;
  }
  return rows;
}

async function removeAllFamilyRows(collectionName, familyId) {
  let removed = 0;
  while (true) {
    const res = await db.collection(collectionName).where({ familyId }).limit(100).get();
    if (!res.data.length) break;
    await Promise.all(res.data.map(row => db.collection(collectionName).doc(row._id).remove()));
    removed += res.data.length;
  }
  return removed;
}

async function deleteFamily(openid, event) {
  const familyId = event.familyId;
  await requireAdmin(familyId, openid);
  const familyRes = await db.collection(COL.families).doc(familyId).get();
  const family = familyRes && familyRes.data;
  if (!family) throw new Error('家庭不存在');
  if (!logic.isDeleteConfirmationValid(family.name, event.confirmation)) {
    throw new Error('家庭名称不匹配，已取消删除');
  }

  const medicines = await listAllFamilyRows(COL.medicines, familyId);
  const fileIds = [...new Set(medicines
    .map(item => item.coverImageCloudId || (String(item.coverImage || '').indexOf('cloud://') === 0 ? item.coverImage : ''))
    .filter(Boolean))];
  const fileWarnings = [];
  for (let i = 0; i < fileIds.length; i += 50) {
    try {
      await cloud.deleteFile({ fileList: fileIds.slice(i, i + 50) });
    } catch (err) {
      fileWarnings.push((err && err.message) || '部分封面文件清理失败');
    }
  }

  const removed = {};
  removed.medicationRecords = await removeAllFamilyRows(COL.records, familyId);
  removed.medicationPlans = await removeAllFamilyRows(COL.plans, familyId);
  removed.inventoryMovements = await removeAllFamilyRows(COL.movements, familyId);
  removed.inventoryAuditItems = await removeAllFamilyRows(COL.auditItems, familyId);
  removed.inventoryAudits = await removeAllFamilyRows(COL.audits, familyId);
  removed.inventoryAuditSettings = await removeAllFamilyRows(COL.auditSettings, familyId);
  removed.notificationSettings = await removeAllFamilyRows(COL.notificationSettings, familyId);
  removed.notificationJobs = await removeAllFamilyRows(COL.notificationJobs, familyId);
  removed.medicineBatches = await removeAllFamilyRows(COL.batches, familyId);
  removed.medicines = await removeAllFamilyRows(COL.medicines, familyId);
  removed.accessLogs = await removeAllFamilyRows(COL.logs, familyId);
  removed.members = await removeAllFamilyRows(COL.members, familyId);
  await db.collection(COL.families).doc(familyId).remove();

  return ok({ familyId, removed, deletedFileCount: fileIds.length, fileWarnings });
}

exports.main = async (event) => {
  const context = cloud.getWXContext();
  const { OPENID } = context;
  try {
    switch (event.action) {
      case 'healthCheck': return ok({ version: FUNCTION_VERSION, envId: context.ENV || '', supportedActions: SUPPORTED_ACTIONS });
      case 'userLogin': return await userLogin(OPENID);
      case 'createFamily': return await createFamily(OPENID, event);
      case 'getInvitePreview': return await getInvitePreview(OPENID, event);
      case 'joinFamilyByInvite': return await joinFamilyByInvite(OPENID, event);
      case 'getFamilySnapshot': return await getFamilySnapshot(OPENID, event);
      case 'saveMedicine': return await saveMedicine(OPENID, event);
      case 'updateMedicine': return await updateMedicine(OPENID, event);
      case 'addOrUpdateBatch': return await addOrUpdateBatch(OPENID, event);
      case 'setBatchStatus': return await setBatchStatus(OPENID, event);
      case 'saveMedicationPlan': return await saveMedicationPlan(OPENID, event);
      case 'confirmMedicationRecord': return await confirmMedicationRecord(OPENID, event);
      case 'snoozeMedicationRecord': return await snoozeMedicationRecord(OPENID, event);
      case 'ensureTodayMedicationRecords': return await ensureTodayMedicationRecords(OPENID, event);
      case 'repairMedicationReminders': return await repairMedicationReminders(OPENID, event);
      case 'ensureMonthlyInventoryAudit': return await ensureMonthlyInventoryAudit(OPENID, event);
      case 'saveInventoryAuditSettings': return await saveInventoryAuditSettings(OPENID, event);
      case 'saveInventoryAuditItem': return await saveInventoryAuditItem(OPENID, event);
      case 'completeInventoryAudit': return await completeInventoryAudit(OPENID, event);
      case 'saveNotificationSubscription': return await saveNotificationSubscription(OPENID, event);
      case 'updateFamilyMember': return await updateFamilyMember(OPENID, event);
      case 'removeFamilyMember': return await removeFamilyMember(OPENID, event);
      case 'leaveFamily': return await leaveFamily(OPENID, event);
      case 'transferFamilyAdmin': return await transferFamilyAdmin(OPENID, event);
      case 'rotateInviteCode': return await rotateInviteCode(OPENID, event);
      case 'deleteFamily': return await deleteFamily(OPENID, event);
      default: return fail('未知云函数 action');
    }
  } catch (err) {
    return fail(err.message || '云函数执行失败');
  }
};
