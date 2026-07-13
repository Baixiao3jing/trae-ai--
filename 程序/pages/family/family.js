// pages/family/family.js
// 药无忧第六阶段：真实从零流程家庭管理
// - 无家庭 → 显示创建家庭表单（家庭名称、管理员姓名、家庭备注）
// - 有家庭 → 家庭概览 + 成员 + 微信分享 / 邀请码邀请
// - invite=1 参数：自动打开邀请弹窗
// - autoCreate=1 参数：默认无家庭时已自动显示创建表单，无需额外跳转

const appStore = require('../../utils/appStore.js');
const cloudStore = require('../../utils/cloudStore.js');
const syncManager = require('../../utils/syncManager.js');
const ENABLE_DEMO_TOOLS = appStore.ENABLE_DEMO_TOOLS === true;

const ROLE_PERMISSIONS = [
  {
    key: 'admin',
    roleLabel: '管理员',
    icon: '👨‍💼',
    color: '#2e7d6a',
    bgColor: '#e7f2ee',
    desc: '可新增、编辑、删除药品，设置提醒，查看所有状态与操作记录。',
    who: '通常是子女或家庭主要管理者'
  },
  {
    key: 'elder',
    roleLabel: '老人',
    icon: '👴',
    color: '#f39c12',
    bgColor: '#fff8e1',
    desc: '只可查看自己的提醒，点击已服用，不能编辑、删除或新增药品。',
    who: '家中需要照护的长辈'
  },
  {
    key: 'member',
    roleLabel: '家庭成员',
    icon: '👩',
    color: '#3498db',
    bgColor: '#e8f4fd',
    desc: '可查看关键提醒和家庭台账，不能删除药品，可协助录入信息。',
    who: '配偶、兄妹等协助管理者'
  }
];

function buildPermissionSummary(mem) {
  if (mem.role === 'admin') return '新增 · 编辑 · 删除 · 设置提醒 · 查看记录';
  if (mem.role === 'elder') return '只读提醒 · 点击已服用 · 不能编辑药品';
  return '查看提醒 · 查看台账 · 可协助录入 · 不能删除';
}

Page({
  data: {
    // 阶段
    stage: 'noFamily', // inviteLoading | inviteJoin | inviteInvalid | inviteConflict | noFamily | hasFamily
    // 创建家庭表单
    form: {
      familyName: '',
      adminName: '',
      note: ''
    },
    // 家庭状态
    family: null,
    members: [],
    cloudSyncText: '',
    cloudShareReady: false,
    cloudChecking: false,
    cloudMode: cloudStore.isCloudEnabled(),
    isAdmin: false,
    inviteCodeFromLink: '',
    invitePreview: null,
    inviteErrorText: '',
    existingFamilyName: '',
    existingFamilyId: '',
    joinForm: {
      name: '',
      relation: '',
      role: 'member'
    },
    rolePermissions: ROLE_PERMISSIONS,
    showInvite: false,
    showElderAgreement: false,
    overview: {
      totalMemberCount: 0,
      elderCount: 0,
      medicineCount: 0,
      batchCount: 0,
      createdText: '',
      adminName: ''
    },
    elderAgreementContent: {}
  },

  // ===== 生命周期 =====
  onLoad(options) {
    if (options && options.inviteCode) {
      this.setData({
        inviteCodeFromLink: String(options.inviteCode || '').trim().toUpperCase(),
        stage: 'inviteLoading'
      });
      this.validateInvitePreview();
    } else {
      this._refresh();
    }
    if (options && options.invite === '1') {
      // 有家庭才允许打开邀请
      const s = appStore.readAppState();
      if (s.currentFamily) {
        this.setData({ showInvite: true });
      }
    }
  },

  onShow() {
    if (this.data.inviteCodeFromLink) {
      if (this.data.stage === 'inviteLoading' && !this._inviteValidationPending) {
        this.validateInvitePreview();
      }
      return;
    }
    this._refresh();
    this.refreshCloudSnapshot();
  },
  validateInvitePreview() {
    const inviteCode = String(this.data.inviteCodeFromLink || '').trim().toUpperCase();
    if (!inviteCode || this._inviteValidationPending) return;
    if (!cloudStore.isCloudEnabled()) {
      this.setData({
        stage: 'inviteInvalid',
        inviteErrorText: '云同步暂不可用，无法验证这份邀请。'
      });
      return;
    }
    this._inviteValidationPending = true;
    this.setData({ stage: 'inviteLoading', inviteErrorText: '' });
    cloudStore.getInvitePreview(inviteCode).then(preview => {
      if (inviteCode !== this.data.inviteCodeFromLink) return;
      const family = preview.family || {};
      const invitePreview = {
        familyId: family.id || family._id || '',
        familyName: family.name || '家庭药箱',
        expiresText: preview.inviteExpiresAtMs ? this._formatInviteDate(preview.inviteExpiresAtMs) : ''
      };
      if (preview.alreadyJoined && invitePreview.familyId) {
        return cloudStore.getFamilySnapshot(invitePreview.familyId).then(snapshot => {
          appStore.syncFromCloudSnapshot(snapshot);
          this.setData({ inviteCodeFromLink: '', invitePreview: null });
          this._refresh();
        });
      }
      if (preview.conflict) {
        this.setData({
          stage: 'inviteConflict',
          invitePreview,
          existingFamilyName: (preview.currentFamily && preview.currentFamily.name) || '当前家庭',
          existingFamilyId: (preview.currentFamily && preview.currentFamily.id) || ''
        });
        return;
      }
      this.setData({ stage: 'inviteJoin', invitePreview, existingFamilyName: '' });
    }).catch(err => {
      const message = (err && err.message) || '暂时无法验证邀请';
      const invalid = /不存在|失效|过期|撤销|缺少邀请码/.test(message);
      this.setData({
        stage: 'inviteInvalid',
        inviteErrorText: invalid ? message : '暂时无法验证邀请，请检查网络后重试。'
      });
    }).finally(() => {
      this._inviteValidationPending = false;
    });
  },
  _formatInviteDate(timestamp) {
    const d = new Date(Number(timestamp));
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  retryInvitePreview() {
    this.validateInvitePreview();
  },
  cancelInvite() {
    this.setData({
      inviteCodeFromLink: '',
      invitePreview: null,
      inviteErrorText: '',
      existingFamilyName: '',
      existingFamilyId: ''
    });
    if (appStore.hasFamily()) {
      this._refresh();
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },
  viewCurrentFamily() {
    const familyId = this.data.existingFamilyId;
    if (!familyId) {
      this.cancelInvite();
      return;
    }
    wx.showLoading({ title: '正在打开家庭...' });
    cloudStore.getFamilySnapshot(familyId).then(snapshot => {
      appStore.syncFromCloudSnapshot(snapshot);
      wx.hideLoading();
      this.setData({ inviteCodeFromLink: '', invitePreview: null, existingFamilyId: '' });
      this._refresh();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '家庭加载失败', icon: 'none' });
    });
  },
  refreshCloudSnapshot() {
    const familyId = appStore.getActiveFamilyId();
    if (!familyId || !cloudStore.isCloudEnabled()) return;
    this.setData({ cloudChecking: true });
    syncManager.refreshFamily(familyId, { ensureToday: true }).then(() => {
      this.setData({
        cloudSyncText: '云同步已连接',
        cloudShareReady: true,
        cloudChecking: false
      });
      this._refresh();
    }).catch(() => {
      this.setData({
        cloudSyncText: '云同步暂不可用，当前显示本地缓存',
        cloudShareReady: false,
        cloudChecking: false
      });
    });
  },

  _refresh() {
    const s = appStore.readAppState();
    if (!s.currentFamily) {
      this.setData({
        stage: 'noFamily',
        form: {
          familyName: '',
          adminName: s.currentUser && s.currentUser.name && s.currentUser.name !== '当前用户' ? s.currentUser.name : '',
          note: ''
        },
        cloudSyncText: cloudStore.isCloudEnabled() ? '云同步已启用' : '当前为本地模式',
        cloudShareReady: false
      });
      return;
    }
    // 有家庭
    const family = s.currentFamily;
    const members = (s.members || []).map(m => Object.assign({}, m, {
      editable: !!m.canEdit,
      editableText: m.canEdit ? '可编辑' : '只读',
      permissionSummary: buildPermissionSummary(m)
    }));
    const meds = s.medicines || [];
    const batches = s.medicineBatches || [];
    const elderCount = members.filter(m => m.role === 'elder').length;
    const admin = members.find(m => m.role === 'admin') || s.currentUser;
    const isAdmin = !!(s.currentUser && s.currentUser.role === 'admin');
    this.setData({
      stage: 'hasFamily',
      family,
      members,
      isAdmin,
      overview: {
        totalMemberCount: members.length,
        elderCount,
        medicineCount: meds.length,
        batchCount: batches.length,
        createdText: family.createdAt || '',
        adminName: admin.name || ''
      },
      elderAgreementContent: {
        inviterName: s.currentUser.name,
        inviterRelation: s.currentUser.relation || '家人',
        familyName: family.name,
        inviteCode: family.inviteCode
      },
      cloudSyncText: this.data.cloudSyncText === '云同步已连接'
        ? '云同步已连接'
        : (cloudStore.isCloudEnabled() ? '云同步已启用' : '当前为本地模式'),
      cloudShareReady: this.data.cloudShareReady === true
    });
  },

  // ===== 创建家庭表单 =====
  onFamilyNameInput(e) {
    this.setData({ 'form.familyName': e.detail.value });
  },
  onAdminNameInput(e) {
    this.setData({ 'form.adminName': e.detail.value });
  },
  onNoteInput(e) {
    this.setData({ 'form.note': e.detail.value });
  },
  onSubmitCreate() {
    const { familyName, adminName, note } = this.data.form;
    if (!familyName || !String(familyName).trim()) {
      wx.showToast({ title: '请填写家庭名称', icon: 'none' });
      return;
    }
    if (cloudStore.isCloudEnabled()) {
      wx.showLoading({ title: '创建云家庭...' });
      cloudStore.createFamily({
        familyName: familyName.trim(),
        adminName: adminName ? adminName.trim() : '',
        note: note ? note.trim() : ''
      }).then(res => {
        const familyId = res.family && (res.family.id || res.family._id);
        if (!familyId) throw new Error('云端未返回家庭 ID');
        return cloudStore.getFamilySnapshot(familyId);
      }).then(snapshot => {
        appStore.syncFromCloudSnapshot(snapshot);
        wx.hideLoading();
        this.setData({
          cloudSyncText: '云同步已连接',
          cloudShareReady: true
        });
        wx.showToast({ title: '家庭创建成功', icon: 'success', duration: 1200 });
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 900);
      }).catch(err => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '云端创建失败，请检查云函数', icon: 'none' });
        this.setData({
          cloudSyncText: '云同步暂不可用，不能分享本地家庭',
          cloudShareReady: false
        });
      });
      return;
    }
    this._createFamilyLocal(familyName, adminName, note);
  },
  _createFamilyLocal(familyName, adminName, note) {
    try {
      appStore.createFamily({
        familyName: familyName.trim(),
        adminName: adminName ? adminName.trim() : '',
        note: note ? note.trim() : ''
      });
      wx.showToast({ title: '家庭创建成功', icon: 'success', duration: 1200 });
      setTimeout(() => {
        // 返回首页显示刚创建的家庭
        wx.switchTab({ url: '/pages/index/index' });
      }, 900);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '创建失败', icon: 'none' });
    }
  },
  onJoinNameInput(e) {
    this.setData({ 'joinForm.name': e.detail.value });
  },
  onJoinRelationInput(e) {
    this.setData({ 'joinForm.relation': e.detail.value });
  },
  chooseJoinRole(e) {
    this.setData({ 'joinForm.role': e.currentTarget.dataset.role });
  },
  submitJoinByInvite() {
    const inviteCode = this.data.inviteCodeFromLink;
    const name = String(this.data.joinForm.name || '').trim();
    if (!inviteCode) {
      wx.showToast({ title: '缺少邀请码', icon: 'none' });
      return;
    }
    if (!name) {
      wx.showToast({ title: '请填写姓名或称呼', icon: 'none' });
      return;
    }
    if (!cloudStore.isCloudEnabled()) {
      wx.showToast({ title: '请先配置云开发环境', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '加入家庭...' });
    cloudStore.joinFamilyByInvite({
      inviteCode,
      name,
      relation: String(this.data.joinForm.relation || '').trim(),
      role: this.data.joinForm.role
    }).then(res => {
      const familyId = res.family && (res.family.id || res.family._id);
      return cloudStore.getFamilySnapshot(familyId);
    }).then(snapshot => {
      appStore.syncFromCloudSnapshot(snapshot);
      wx.hideLoading();
      this.setData({
        cloudSyncText: '云同步已连接',
        cloudShareReady: true
      });
      wx.showToast({ title: '已加入家庭', icon: 'success' });
      this.setData({ inviteCodeFromLink: '' });
      this._refresh();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '加入失败', icon: 'none' });
    });
  },

  // ===== 邀请 =====
  openInvite() {
    if (!appStore.hasFamily()) {
      wx.showToast({ title: '请先创建家庭', icon: 'none' });
      return;
    }
    this.setData({ showInvite: true });
  },
  checkCloudSync() {
    if (!cloudStore.isCloudEnabled()) {
      wx.showToast({ title: '请先配置云环境 ID', icon: 'none' });
      this.setData({
        cloudSyncText: '当前为本地模式',
        cloudShareReady: false
      });
      return;
    }
    const familyId = appStore.getActiveFamilyId();
    if (familyId) {
      this.refreshCloudSnapshot();
      return;
    }
    this.setData({ cloudChecking: true });
    syncManager.bootstrap().then(() => {
      this.setData({
        cloudSyncText: '云同步已连接',
        cloudShareReady: false,
        cloudChecking: false
      });
      wx.showToast({ title: '云同步已连接', icon: 'success' });
    }).catch(err => {
      this.setData({
        cloudSyncText: '云同步暂不可用，当前显示本地缓存',
        cloudShareReady: false,
        cloudChecking: false
      });
      wx.showToast({ title: (err && err.message) || '云连接失败', icon: 'none' });
    });
  },
  closeInvite() {
    this.setData({ showInvite: false });
  },
  openElderAgreement() {
    this.setData({ showInvite: false, showElderAgreement: true });
  },
  closeElderAgreement() {
    this.setData({ showElderAgreement: false });
  },
  onAgreeJoin() {
    this.setData({ showElderAgreement: false, showInvite: true });
    this.copyInviteCode();
  },

  copyInviteCode() {
    if (!this.data.family) return;
    wx.setClipboardData({
      data: this.data.family.inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    });
  },
  shareInvite() {
    if (!this.data.cloudShareReady) {
      wx.showToast({ title: '请先确认云同步成功', icon: 'none' });
    }
  },
  onShareAppMessage() {
    const family = this.data.family || {};
    const inviteCode = family.inviteCode || '';
    if (!this.data.cloudShareReady || !inviteCode) {
      return {
        title: '药无忧家庭药箱',
        path: '/pages/family/family'
      };
    }
    return {
      title: `${family.name || '家庭药箱'}邀请你加入药无忧`,
      path: `/pages/family/family?inviteCode=${inviteCode}`
    };
  },

  // ===== 成员操作 =====
  onMemberTap(e) {
    const member = e.currentTarget.dataset.member;
    if (!member) return;
    const self = appStore.getCurrentUser();
    if (member.id === self.id) {
      wx.showToast({ title: '这是你自己', icon: 'none' });
      return;
    }
    const current = appStore.getCurrentUser();
    const canManage = current && current.role === 'admin';
    const actions = [{ key: 'view', label: '查看资料' }];
    if (canManage) {
      actions.push({ key: 'role', label: member.role === 'elder' ? '设为家庭成员' : '设为老人' });
      if (member.role !== 'elder') actions.push({ key: 'edit', label: member.canEdit ? '关闭编辑权限' : '开启编辑权限' });
      actions.push({ key: 'transfer', label: '转让管理员身份' });
      actions.push({ key: 'remove', label: '移除成员' });
    }
    wx.showActionSheet({
      itemList: actions.map(item => item.label),
      success: (res) => {
        const action = actions[res.tapIndex];
        if (!action) return;
        if (action.key === 'view') {
          wx.showModal({
            title: `${member.avatar || '👤'} ${member.name}`,
            content: `关系：${member.relation}\n角色：${member.roleLabel || member.role}\n编辑权限：${member.editableText}\n加入时间：${member.joinTime}\n权限：${member.permissionSummary}`,
            showCancel: false
          });
          return;
        }
        this.runMemberAction(action.key, member);
      }
    });
  },

  runMemberAction(action, member) {
    const familyId = appStore.getActiveFamilyId();
    const refresh = promise => promise
      .then(() => syncManager.refreshFamily(familyId))
      .then(() => this._refresh());
    if (action === 'role') {
      refresh(cloudStore.updateFamilyMember(familyId, member.id, {
        role: member.role === 'elder' ? 'member' : 'elder',
        canEdit: false
      })).then(() => wx.showToast({ title: '成员身份已更新', icon: 'success' }))
        .catch(err => wx.showToast({ title: err.message || '更新失败', icon: 'none' }));
      return;
    }
    if (action === 'edit') {
      refresh(cloudStore.updateFamilyMember(familyId, member.id, { role: 'member', canEdit: !member.canEdit }))
        .then(() => wx.showToast({ title: member.canEdit ? '已关闭编辑权限' : '已开启编辑权限', icon: 'success' }))
        .catch(err => wx.showToast({ title: err.message || '更新失败', icon: 'none' }));
      return;
    }
    if (action === 'transfer') {
      wx.showModal({
        title: '转让管理员',
        content: `确定将管理员身份转让给「${member.name}」吗？转让后你将成为普通家庭成员。`,
        confirmColor: '#e67e22',
        success: res => {
          if (!res.confirm) return;
          refresh(cloudStore.transferFamilyAdmin(familyId, member.id))
            .then(() => wx.showToast({ title: '管理员已转让', icon: 'success' }))
            .catch(err => wx.showToast({ title: err.message || '转让失败', icon: 'none' }));
        }
      });
      return;
    }
    if (action === 'remove') {
      wx.showModal({
        title: '移除成员',
        content: `确定将「${member.name}」移出家庭吗？`,
        confirmColor: '#e74c3c',
        success: res => {
          if (!res.confirm) return;
          refresh(cloudStore.removeFamilyMember(familyId, member.id))
            .then(() => wx.showToast({ title: '成员已移除', icon: 'success' }))
            .catch(err => wx.showToast({ title: err.message || '移除失败', icon: 'none' }));
        }
      });
    }
  },

  rotateInviteCode() {
    if (!this.data.isAdmin) return;
    const familyId = appStore.getActiveFamilyId();
    wx.showModal({
      title: '重新生成邀请码',
      content: '旧邀请码会立即失效，新邀请码有效期为 30 天。',
      confirmColor: '#2e7d6a',
      success: res => {
        if (!res.confirm) return;
        cloudStore.rotateInviteCode(familyId)
          .then(() => syncManager.refreshFamily(familyId))
          .then(() => { this._refresh(); wx.showToast({ title: '邀请码已更新', icon: 'success' }); })
          .catch(err => wx.showToast({ title: err.message || '更新失败', icon: 'none' }));
      }
    });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },
  goAccessLogs() {
    wx.navigateTo({ url: '/pages/access-logs/access-logs' });
  }
});
