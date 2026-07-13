const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../程序/utils/syncPolicy.js');

test('keeps the active family when membership is still active', () => {
  assert.equal(policy.chooseFamilyId('F1', [{ familyId: 'F1' }, { familyId: 'F2' }]), 'F1');
  assert.equal(policy.shouldClearMissingFamily('F1', [{ familyId: 'F1' }]), false);
});

test('selects the first cloud family when local cache was cleared', () => {
  assert.equal(policy.chooseFamilyId('', [{ familyId: 'F2' }]), 'F2');
});

test('clears a cached family after its active membership disappears', () => {
  assert.equal(policy.shouldClearMissingFamily('F1', []), true);
  assert.equal(policy.isMembershipGoneError(new Error('无权访问该家庭')), true);
});
