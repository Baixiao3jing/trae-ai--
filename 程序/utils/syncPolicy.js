function chooseFamilyId(activeId, memberships) {
  const list = Array.isArray(memberships) ? memberships : [];
  if (activeId && list.some(item => item.familyId === activeId)) return activeId;
  return list.length ? list[0].familyId : '';
}

function shouldClearMissingFamily(activeId, memberships) {
  if (!activeId) return false;
  const list = Array.isArray(memberships) ? memberships : [];
  return !list.some(item => item.familyId === activeId);
}

function isMembershipGoneError(error) {
  const message = String((error && error.message) || error || '');
  return /无权访问该家庭|家庭不存在|目标家庭不存在|成员关系已失效/.test(message);
}

module.exports = {
  chooseFamilyId,
  shouldClearMissingFamily,
  isMembershipGoneError
};
