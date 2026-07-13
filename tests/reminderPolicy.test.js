const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../程序/utils/reminderPolicy.js');

test('elder reminder policy exposes only due and overdue records as actionable', () => {
  const now = Date.parse('2026-07-13T11:45:00+08:00');
  assert.equal(policy.classify({ scheduledTime: '2026-07-13 11:40', status: 'pending' }, now), 'due');
  assert.equal(policy.classify({ scheduledTime: '2026-07-13 08:00', status: 'pending' }, now), 'overdue');
  assert.equal(policy.classify({ scheduledTime: '2026-07-13 20:00', status: 'pending' }, now), 'upcoming');
  assert.equal(policy.isActionable({ scheduledTime: '2026-07-13 20:00', status: 'pending' }, now), false);
});

test('snoozed reminder is not actionable before snoozedUntil', () => {
  const now = Date.parse('2026-07-13T11:45:00+08:00');
  assert.equal(policy.classify({ scheduledTime: '2026-07-13 11:30', snoozedUntil: '2026-07-13 11:55' }, now), 'snoozed');
});
