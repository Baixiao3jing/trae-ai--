const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../程序/cloudfunctions/familyApi/logic.js');

test('pick only keeps whitelisted fields', () => {
  assert.deepEqual(
    logic.pick({ name: 'A', familyId: 'other', createdByOpenid: 'bad' }, logic.MEDICINE_FIELDS),
    { name: 'A' }
  );
});

test('invite code is long and avoids ambiguous characters', () => {
  assert.equal(logic.generateInviteCode(() => 0), 'YAOAAAAAAAA');
  assert.equal(logic.generateInviteCode(() => 0.999999).length, 11);
});

test('record key is deterministic', () => {
  assert.equal(logic.recordKey('P1', '2026-07-10', '08:00'), 'P1|2026-07-10|08:00');
  assert.equal(logic.recordDocumentId('P1', '2026-07-10', '08:00'), logic.recordDocumentId('P1', '2026-07-10', '08:00'));
  assert.notEqual(logic.recordDocumentId('P1', '2026-07-10', '08:00'), logic.recordDocumentId('P1', '2026-07-10', '20:00'));
});

test('reminders are classified by the due window and future records are not actionable', () => {
  const now = Date.parse('2026-07-13T11:45:00+08:00');
  assert.equal(logic.classifyReminder({ scheduledTime: '2026-07-13 08:00', status: 'pending' }, now), 'overdue');
  assert.equal(logic.classifyReminder({ scheduledTime: '2026-07-13 11:30', status: 'pending' }, now), 'due');
  assert.equal(logic.classifyReminder({ scheduledTime: '2026-07-13 20:00', status: 'pending' }, now), 'upcoming');
  assert.equal(logic.isReminderActionable({ scheduledTime: '2026-07-13 20:00', status: 'pending' }, now), false);
  assert.equal(logic.isReminderActionable({ scheduledTime: '2026-07-13 08:00', status: 'pending' }, now), true);
});

test('snoozed reminder stays unavailable until its snooze time', () => {
  const now = Date.parse('2026-07-13T11:45:00+08:00');
  const record = { scheduledTime: '2026-07-13 11:30', status: 'pending', snoozedUntil: '2026-07-13 11:55' };
  assert.equal(logic.classifyReminder(record, now), 'snoozed');
  assert.equal(logic.isReminderActionable(record, now), false);
});

test('equivalent plan forms have the same duplicate signature', () => {
  const first = { medicineId: 'MED1', memberId: 'MEM1', doseQuantity: 1, doseUnit: '片', reminderTimes: ['20:00', '08:00'], startDate: '2026-07-13' };
  const second = { medicineId: 'MED1', memberId: 'MEM1', doseQuantity: '1', doseUnit: '片', reminderTimes: ['08:00', '20:00'], startDate: '2026-07-13' };
  assert.equal(logic.planSignature(first), logic.planSignature(second));
});

test('plan active date respects enabled and date range', () => {
  assert.equal(logic.isPlanActiveOn({ enabled: true, startDate: '2026-07-01' }, '2026-07-10'), true);
  assert.equal(logic.isPlanActiveOn({ enabled: false }, '2026-07-10'), false);
  assert.equal(logic.isPlanActiveOn({ enabled: true, endDate: '2026-07-09' }, '2026-07-10'), false);
});

test('expired or disabled invites are rejected', () => {
  assert.equal(logic.isInviteUsable({ inviteEnabled: false }, 100), false);
  assert.equal(logic.isInviteUsable({ inviteEnabled: true, inviteExpiresAtMs: 99 }, 100), false);
  assert.equal(logic.isInviteUsable({ inviteEnabled: true, inviteExpiresAtMs: 101 }, 100), true);
});

test('invite membership distinguishes same family from another family', () => {
  assert.deepEqual(
    logic.resolveInviteMembership('F1', [{ familyId: 'F1', status: 'active' }]),
    { alreadyJoined: true, conflict: false, otherFamilyId: '' }
  );
  assert.deepEqual(
    logic.resolveInviteMembership('F1', [{ familyId: 'F2', status: 'active' }]),
    { alreadyJoined: false, conflict: true, otherFamilyId: 'F2' }
  );
  assert.deepEqual(
    logic.resolveInviteMembership('F1', [{ familyId: 'F2', status: 'inactive' }]),
    { alreadyJoined: false, conflict: false, otherFamilyId: '' }
  );
});

test('only an admin or the assigned member can confirm a record', () => {
  assert.equal(logic.canConfirmRecord({ _id: 'M1', role: 'elder' }, { memberId: 'M1' }), true);
  assert.equal(logic.canConfirmRecord({ _id: 'M2', role: 'member' }, { memberId: 'M1' }), false);
  assert.equal(logic.canConfirmRecord({ _id: 'M2', role: 'admin' }, { memberId: 'M1' }), true);
});

test('family deletion requires the exact family name', () => {
  assert.equal(logic.isDeleteConfirmationValid('白晓井的家', '白晓井的家'), true);
  assert.equal(logic.isDeleteConfirmationValid('白晓井的家', '白晓井'), false);
  assert.equal(logic.isDeleteConfirmationValid('', ''), false);
});

test('structured dose and FEFO stock allocation are deterministic', () => {
  assert.deepEqual(logic.normalizeDose({ doseQuantity: 1.5, doseUnit: '片' }), { quantity: 1.5, unit: '片', structured: true });
  const result = logic.allocateStock([
    { id: 'late', unit: '片', remainingQuantity: 10, expireDate: '2027-01-01', status: 'active' },
    { id: 'soon', unit: '片', remainingQuantity: 1, expireDate: '2026-08-01', status: 'active' }
  ], 2, '片', '2026-07-01');
  assert.deepEqual(result, {
    allocations: [{ batchId: 'soon', quantity: 1 }, { batchId: 'late', quantity: 1 }],
    deducted: 2,
    shortage: 0
  });
});

test('missing optional collections are recognized without hiding unrelated errors', () => {
  assert.equal(logic.isOptionalCollectionError(new Error('DATABASE_COLLECTION_NOT_EXIST: collection not exist')), true);
  assert.equal(logic.isOptionalCollectionError(new Error('permission denied')), false);
});
