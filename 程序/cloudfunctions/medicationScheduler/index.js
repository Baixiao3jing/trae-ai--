const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function pad(n) { return n < 10 ? '0' + n : String(n); }
function minuteText(date) {
  const china = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${china.getUTCFullYear()}-${pad(china.getUTCMonth() + 1)}-${pad(china.getUTCDate())} ${pad(china.getUTCHours())}:${pad(china.getUTCMinutes())}`;
}

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  return `${pad(hour)}:${pad(minute)}`;
}

function stableHash(text) {
  let hash = 2166136261;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function recordIdFor(key, date, time) {
  return `MR_${stableHash(key)}_${date.replace(/-/g, '')}${time.replace(':', '')}`;
}

async function ensureTodayRecords() {
  const date = minuteText(new Date()).slice(0, 10);
  const [plans, todayRecords] = await Promise.all([
    db.collection('medication_plans').get(),
    db.collection('medication_records').where({ scheduledTime: _.gte(`${date} 00:00`).and(_.lte(`${date} 23:59`)) }).get()
  ]);
  const existingKeys = new Set(todayRecords.data.map(record => record.recordKey).filter(Boolean));
  const legacyKeys = new Map(todayRecords.data.map(record => [`${record.planId}|${record.scheduledTime}`, record]));
  let created = 0;
  for (const plan of plans.data) {
    if (plan.enabled === false || (plan.startDate && plan.startDate > date) || (plan.endDate && plan.endDate < date)) continue;
    const planId = plan._id;
    const times = Array.from(new Set((plan.reminderTimes || []).map(normalizeTime).filter(Boolean)));
    for (const time of times) {
      const scheduledTime = `${date} ${time}`;
      const recordKey = `${planId}|${date}|${time}`;
      if (existingKeys.has(recordKey)) continue;
      const legacy = legacyKeys.get(`${planId}|${scheduledTime}`);
      if (legacy) {
        await db.collection('medication_records').doc(legacy._id).update({ data: { recordKey } });
        existingKeys.add(recordKey);
        continue;
      }
      await db.collection('medication_records').doc(recordIdFor(recordKey, date, time)).set({ data: {
        familyId: plan.familyId,
        planId,
        memberId: plan.memberId,
        medicineId: plan.medicineId,
        doseQuantity: Number(plan.doseQuantity) || 0,
        doseUnit: plan.doseUnit || '',
        scheduledTime,
        recordKey,
        status: 'pending',
        confirmedAt: null,
        skippedAt: null,
        createdAt: db.serverDate()
      } });
      existingKeys.add(recordKey);
      created += 1;
    }
  }
  return created;
}

async function sendMedicationReminders() {
  const templateId = String(process.env.MEDICATION_TEMPLATE_ID || '').trim();
  if (!templateId) return { sent: 0, skipped: 'MEDICATION_TEMPLATE_ID 未配置' };
  const now = new Date();
  now.setMinutes(Math.floor(now.getMinutes() / 5) * 5, 0, 0);
  const targets = [];
  for (let offset = 0; offset < 5; offset += 1) {
    const d = new Date(now.getTime() + offset * 60000);
    targets.push(minuteText(d));
  }
  const [scheduled, snoozed] = await Promise.all([
    db.collection('medication_records').where({ scheduledTime: db.command.in(targets) }).get(),
    db.collection('medication_records').where({ snoozedUntil: db.command.in(targets) }).get()
  ]);
  const rows = [];
  const ids = new Set();
  scheduled.data.concat(snoozed.data).forEach(row => {
    if (!ids.has(row._id)) { ids.add(row._id); rows.push(row); }
  });
  let sent = 0;
  for (const record of rows.filter(row => row.status === 'pending' || row.status === 'upcoming')) {
    const jobKey = `${record._id}|medication`;
    const existing = await db.collection('notification_jobs').where({ jobKey }).limit(1).get();
    if (existing.data.length) continue;
    const [memberRes, planRes] = await Promise.all([
      db.collection('family_members').doc(record.memberId).get(),
      db.collection('medication_plans').doc(record.planId).get()
    ]);
    const member = memberRes.data;
    const plan = planRes.data;
    if (!member || !member.openid || !plan) continue;
    const settingRes = await db.collection('notification_settings').where({ familyId: record.familyId, openid: member.openid, medicationStatus: 'accept' }).limit(1).get();
    if (!settingRes.data.length) continue;
    const medicineRes = await db.collection('medicines').doc(plan.medicineId).get();
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: member.openid,
        templateId,
        page: `/pages/elder/elder`,
        miniprogramState: 'trial',
        lang: 'zh_CN',
        data: {
          thing1: { value: String((medicineRes.data && medicineRes.data.name) || '家庭药品').slice(0, 20) },
          time2: { value: record.scheduledTime },
          thing3: { value: String(plan.dosePerTime || `${plan.doseQuantity || ''}${plan.doseUnit || ''}`).slice(0, 20) }
        }
      });
      await db.collection('notification_jobs').add({ data: { familyId: record.familyId, recordId: record._id, jobKey, type: 'medication', status: 'sent', sentAt: db.serverDate() } });
      await db.collection('notification_settings').doc(settingRes.data[0]._id).update({ data: { medicationStatus: 'consumed', updatedAt: db.serverDate() } });
      sent += 1;
    } catch (err) {
      await db.collection('notification_jobs').add({ data: { familyId: record.familyId, recordId: record._id, jobKey, type: 'medication', status: 'failed', error: err.message || String(err), createdAt: db.serverDate() } });
    }
  }
  return { sent };
}

async function sendInventoryAuditReminders() {
  const templateId = String(process.env.INVENTORY_AUDIT_TEMPLATE_ID || '').trim();
  if (!templateId) return { sent: 0, skipped: 'INVENTORY_AUDIT_TEMPLATE_ID 未配置' };
  const now = new Date();
  const date = minuteText(now).slice(0, 10);
  const time = minuteText(now).slice(-5);
  const audits = await db.collection('inventory_audits').where({ scheduledDate: date, status: 'pending' }).get();
  let sent = 0;
  for (const audit of audits.data) {
    const auditSettingRes = await db.collection('inventory_audit_settings').where({ familyId: audit.familyId }).limit(1).get();
    const auditSetting = auditSettingRes.data[0] || { reminderTime: '19:00' };
    if (auditSetting.reminderTime !== time) continue;
    const members = await db.collection('family_members').where({ familyId: audit.familyId, role: 'admin', status: 'active' }).get();
    const familyRes = await db.collection('families').doc(audit.familyId).get();
    for (const member of members.data) {
      const jobKey = `${audit._id}|inventoryAudit|${member.openid}`;
      const existing = await db.collection('notification_jobs').where({ jobKey }).limit(1).get();
      if (existing.data.length) continue;
      const settingRes = await db.collection('notification_settings').where({ familyId: audit.familyId, openid: member.openid, auditStatus: 'accept' }).limit(1).get();
      if (!settingRes.data.length) continue;
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: member.openid,
          templateId,
          page: '/pages/inventory-audit/inventory-audit',
          miniprogramState: 'trial',
          lang: 'zh_CN',
          data: {
            thing1: { value: String((familyRes.data && familyRes.data.name) || '家庭药箱').slice(0, 20) },
            thing2: { value: `${audit.totalItems || 0} 项药品待核对` },
            time3: { value: `${audit.period}-01 19:00` }
          }
        });
        await db.collection('notification_jobs').add({ data: { familyId: audit.familyId, auditId: audit._id, jobKey, type: 'inventory_audit', status: 'sent', sentAt: db.serverDate() } });
        await db.collection('notification_settings').doc(settingRes.data[0]._id).update({ data: { auditStatus: 'consumed', updatedAt: db.serverDate() } });
        sent += 1;
      } catch (err) {
        await db.collection('notification_jobs').add({ data: { familyId: audit.familyId, auditId: audit._id, jobKey, type: 'inventory_audit', status: 'failed', error: err.message || String(err), createdAt: db.serverDate() } });
      }
    }
  }
  return { sent };
}

exports.main = async () => ({
  generatedMedicationRecords: await ensureTodayRecords(),
  medication: await sendMedicationReminders(),
  inventoryAudit: await sendInventoryAuditReminders()
});
