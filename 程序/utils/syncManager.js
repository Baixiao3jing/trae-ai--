// utils/syncManager.js
// 云端是家庭共享数据的事实来源；wx.Storage 只保存最近一次成功快照。
const appStore = require('./appStore.js');
const cloudStore = require('./cloudStore.js');
const syncPolicy = require('./syncPolicy.js');

let state = {
  status: 'idle', // idle | syncing | synced | offline | failed
  text: '等待同步',
  lastSyncedAt: '',
  error: '',
  cloudVersion: '',
  cloudCompatible: null
};
let refreshPromise = null;
let syncEpoch = 0;

function nowText() {
  const d = new Date();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setState(patch) {
  state = Object.assign({}, state, patch || {});
  return getState();
}

function getState() {
  return Object.assign({}, state);
}

function failState(err) {
  const message = (err && err.message) || '云同步失败';
  return setState({
    status: 'failed',
    text: '同步失败，当前显示上次缓存',
    error: message
  });
}

function invalidate(patch) {
  syncEpoch += 1;
  refreshPromise = null;
  return setState(Object.assign({ status: 'idle', text: '等待同步', error: '' }, patch || {}));
}

function bootstrap() {
  if (!cloudStore.isCloudEnabled()) {
    setState({ status: 'offline', text: '本地模式', error: '' });
    return Promise.resolve(null);
  }
  setState({ status: 'syncing', text: '正在连接云家庭...', error: '' });
  const epoch = syncEpoch;
  return cloudStore.healthCheck()
    .then(health => {
      if (!health.compatible) {
        throw new Error(`云服务版本需要更新（当前 ${health.version || '未知'}，需要 ${health.requiredVersion}）`);
      }
      setState({ cloudVersion: health.version, cloudCompatible: true });
      return cloudStore.userLogin();
    })
    .then(login => {
      if (epoch !== syncEpoch) return null;
      const activeId = appStore.getActiveFamilyId();
      const memberships = (login && login.families) || [];
      if (syncPolicy.shouldClearMissingFamily(activeId, memberships)) {
        appStore.clearFamilyCache();
      }
      const familyId = syncPolicy.chooseFamilyId(appStore.getActiveFamilyId(), memberships);
      if (!familyId) {
        setState({ status: 'synced', text: '云同步已连接', lastSyncedAt: nowText(), error: '' });
        return null;
      }
      return refreshFamily(familyId, { ensureToday: true });
    })
    .catch(err => {
      failState(err);
      return null;
    });
}

function refreshFamily(familyId, options) {
  if (!familyId || !cloudStore.isCloudEnabled()) return Promise.resolve(null);
  if (refreshPromise) return refreshPromise;
  setState({ status: 'syncing', text: '正在同步...', error: '' });
  const opts = options || {};
  const epoch = syncEpoch;
  const ensure = opts.ensureToday
    ? cloudStore.ensureTodayMedicationRecords(familyId)
    : Promise.resolve(null);
  const currentPromise = ensure
    .then(() => opts.ensureMonthly ? cloudStore.ensureMonthlyInventoryAudit(familyId).catch(() => null) : null)
    .then(() => cloudStore.getFamilySnapshot(familyId))
    .then(snapshot => {
      if (epoch !== syncEpoch) return null;
      appStore.syncFromCloudSnapshot(snapshot);
      setState({ status: 'synced', text: `已同步 ${nowText()}`, lastSyncedAt: nowText(), error: '' });
      return snapshot;
    })
    .catch(err => {
      if (epoch !== syncEpoch) return null;
      if (syncPolicy.isMembershipGoneError(err)) {
        appStore.clearFamilyCache();
        invalidate({ status: 'synced', text: '家庭已退出或删除', lastSyncedAt: nowText(), error: '' });
        return null;
      }
      failState(err);
      throw err;
    })
    .finally(() => {
      if (refreshPromise === currentPromise) refreshPromise = null;
    });
  refreshPromise = currentPromise;
  return refreshPromise;
}

function refreshCurrentFamily(options) {
  const familyId = appStore.getActiveFamilyId();
  if (!familyId) return bootstrap();
  return refreshFamily(familyId, options);
}

function rebuildLocalCache() {
  invalidate();
  appStore.resetLocalData();
  if (!cloudStore.isCloudEnabled()) return Promise.resolve(null);
  return bootstrap().then(result => {
    const current = getState();
    if (current.status === 'failed') throw new Error(current.error || '云同步失败');
    return result;
  });
}

// 云模式下先写云端，再用快照替换缓存；本地模式才调用 localWrite。
function write(cloudWrite, localWrite, options) {
  if (!cloudStore.isCloudEnabled()) {
    return Promise.resolve(typeof localWrite === 'function' ? localWrite() : null);
  }
  const familyId = appStore.getActiveFamilyId();
  if (!familyId) return Promise.reject(new Error('请先创建云家庭'));
  setState({ status: 'syncing', text: '正在保存到云端...', error: '' });
  return Promise.resolve()
    .then(() => cloudWrite(familyId))
    .then(result => refreshFamily(familyId, options).then(() => result))
    .catch(err => {
      failState(err);
      throw err;
    });
}

module.exports = {
  getState,
  invalidate,
  bootstrap,
  refreshFamily,
  refreshCurrentFamily,
  rebuildLocalCache,
  write
};
