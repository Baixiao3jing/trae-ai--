const EARLY_MINUTES = 15;
const LATE_MINUTES = 60;

function scheduledAtMs(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (!match) return NaN;
  return Date.parse(`${match[1]}T${match[2]}:00+08:00`);
}

function classify(record, nowMs) {
  if (!record) return 'upcoming';
  if (record.status === 'done' || record.status === 'skipped' || record.status === 'missed') return record.status;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const snoozedAt = scheduledAtMs(record.snoozedUntil);
  if (Number.isFinite(snoozedAt) && snoozedAt > now) return 'snoozed';
  const scheduledAt = scheduledAtMs(record.scheduledTime);
  if (!Number.isFinite(scheduledAt)) return 'upcoming';
  if (scheduledAt > now + EARLY_MINUTES * 60000) return 'upcoming';
  if (scheduledAt < now - LATE_MINUTES * 60000) return 'overdue';
  return 'due';
}

function isActionable(record, nowMs) {
  const state = classify(record, nowMs);
  return state === 'due' || state === 'overdue';
}

module.exports = { EARLY_MINUTES, LATE_MINUTES, scheduledAtMs, classify, isActionable };
