// pages/privacy/privacy.js
const appStore = require('../../utils/appStore.js');
const cloudStore = require('../../utils/cloudStore.js');
const syncManager = require('../../utils/syncManager.js');

function buildAuthList(hasFamily) {
  return [
    { key: 'wxLogin', icon: '💚', label: '微信云身份', status: cloudStore.isCloudEnabled() ? '已启用' : '本地模式', statusColor: '#27ae60', desc: '用于识别家庭账户与成员身份' },
    { key: 'cover', icon: '📷', label: '药盒封面', status: '由用户主动选择', statusColor: '#2e7d6a', desc: '选择后保存到家庭云空间，家庭成员可见' },
    { key: 'family', icon: '👪', label: '家庭共享', status: hasFamily ? '已加入家庭' : '尚未加入', statusColor: hasFamily ? '#2980b9' : '#7f8c8d', desc: '药品台账仅对当前家庭成员开放' },
    { key: 'location', icon: '📍', label: '位置信息', status: '未采集', statusColor: '#7f8c8d', desc: '不采集设备定位；存放位置由用户手填' },
    { key: 'phone', icon: '📱', label: '手机号', status: '未采集', statusColor: '#7f8c8d', desc: '当前不采集手机号' },
    { key: 'idcard', icon: '🛡️', label: '身份证/病历', status: '未采集', statusColor: '#7f8c8d', desc: '不采集身份证、病历等非必要信息' }
  ];
}

Page({
  data: {
    familyName: '',
    authList: [],
    canLeave: false,
    canDeleteFamily: false,
    canAccessLogs: false,
    isDeletingFamily: false
  },

  onShow() {
    this.refresh();
    syncManager.refreshCurrentFamily().then(() => this.refresh()).catch(() => {});
  },

  refresh() {
    const family = appStore.getCurrentFamily();
    const user = appStore.getCurrentUser();
    this.setData({
      familyName: family ? family.name : '',
      authList: buildAuthList(!!family),
      canLeave: !!family && user && user.role !== 'admin',
      canDeleteFamily: !!family && user && user.role === 'admin',
      canAccessLogs: !!family && user && user.role === 'admin'
    });
  },

  onClearPersonal() {
    wx.showModal({
      title: '清除本机缓存',
      content: '只清理当前手机上的缓存，不会退出家庭，也不会删除云端药品。清理后会立即重新同步。',
      confirmText: '清理并同步',
      confirmColor: '#e67e22',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '重新同步中...' });
        syncManager.rebuildLocalCache().then(() => {
          wx.hideLoading();
          this.refresh();
          wx.showToast({ title: '缓存已刷新', icon: 'success' });
        }).catch(err => {
          wx.hideLoading();
          this.refresh();
          wx.showToast({ title: err.message || '云同步暂不可用', icon: 'none' });
        });
      }
    });
  },

  onLeaveFamily() {
    if (!this.data.canLeave) return;
    wx.showModal({
      title: '退出当前家庭',
      content: `确认退出「${this.data.familyName}」吗？退出后需要新的有效邀请码才能再次加入。`,
      confirmText: '确认退出',
      confirmColor: '#e74c3c',
      success: res => {
        if (!res.confirm) return;
        const familyId = appStore.getActiveFamilyId();
        wx.showLoading({ title: '正在退出...' });
        cloudStore.leaveFamily(familyId).then(() => {
          appStore.clearFamilyCache();
          wx.hideLoading();
          wx.showToast({ title: '已退出家庭', icon: 'success' });
          setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 500);
        }).catch(err => {
          wx.hideLoading();
          wx.showToast({ title: err.message || '退出失败', icon: 'none' });
        });
      }
    });
  },

  onDeleteFamily() {
    if (!this.data.canDeleteFamily || this.data.isDeletingFamily) return;
    const familyName = this.data.familyName;
    wx.showModal({
      title: '删除家庭空间',
      content: `删除「${familyName}」后，所有成员、药品、批次、提醒、服药记录和药盒封面都将永久删除，无法恢复。`,
      confirmText: '继续删除',
      confirmColor: '#c0392b',
      success: first => {
        if (!first.confirm) return;
        wx.showModal({
          title: '输入家庭名称确认',
          content: '',
          editable: true,
          placeholderText: familyName,
          confirmText: '永久删除',
          confirmColor: '#c0392b',
          success: second => {
            if (!second.confirm) return;
            const confirmation = String(second.content || '').trim();
            if (confirmation !== familyName) {
              wx.showToast({ title: '家庭名称不匹配', icon: 'none' });
              return;
            }
            const familyId = appStore.getActiveFamilyId();
            this.setData({ isDeletingFamily: true });
            wx.showLoading({ title: '正在删除...' });
            cloudStore.deleteFamily(familyId, confirmation).then(() => {
              syncManager.invalidate({ status: 'synced', text: '家庭已删除' });
              appStore.resetLocalData();
              wx.hideLoading();
              this.setData({ isDeletingFamily: false });
              wx.showToast({ title: '家庭已彻底删除', icon: 'success' });
              setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 600);
            }).catch(err => {
              wx.hideLoading();
              this.setData({ isDeletingFamily: false });
              wx.showToast({ title: err.message || '删除失败，请重试', icon: 'none' });
            });
          }
        });
      }
    });
  },

  goAccessLogs() {
    wx.navigateTo({ url: '/pages/access-logs/access-logs' });
  }
});
