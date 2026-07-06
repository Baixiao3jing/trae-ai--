// pages/family/family.js
// 药无忧第六阶段：真实从零流程家庭管理
// - 无家庭 → 显示创建家庭表单（家庭名称、管理员姓名、家庭备注）
// - 有家庭 → 家庭概览 + 成员 + 邀请（支持微信分享 / 邀请码 / 预设关系模板快速本地录入）
// - invite=1 参数：自动打开邀请弹窗
// - autoCreate=1 参数：默认无家庭时已自动显示创建表单，无需额外跳转

const appStore = require('../../utils/appStore.js');
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
    stage: 'noFamily', // noFamily | hasFamily
    // 创建家庭表单
    form: {
      familyName: '',
      adminName: '',
      note: ''
    },
    // 家庭状态
    family: null,
    members: [],
    rolePermissions: ROLE_PERMISSIONS,
    showInvite: false,
    showElderAgreement: false,
    showQuickAdd: false, // 预设关系模板快速本地录入
    selectedTemplateKey: '', // 当前已选中的模板 key（elder_male/elder_female/...），空则未选
    pendingTemplateKey: '', // 选中后未填姓名的模板键
    showCustomName: false, // 需要输入自定义姓名弹窗
    customMemberName: '',
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
    this._refresh();
    if (options && options.invite === '1') {
      // 有家庭才允许打开邀请
      const s = appStore.readAppState();
      if (s.currentFamily) {
        this.setData({ showInvite: true });
      }
    }
  },

  onShow() {
    this._refresh();
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
        }
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
    this.setData({
      stage: 'hasFamily',
      family,
      members,
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
      }
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

  // ===== 邀请 =====
  openInvite() {
    if (!appStore.hasFamily()) {
      wx.showToast({ title: '请先创建家庭', icon: 'none' });
      return;
    }
    this.setData({ showInvite: true });
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
    // 看了长辈授权说明后，选择添加一位长辈（需要填写姓名）
    this.setData({
      showElderAgreement: false,
      showQuickAdd: true,
      pendingTemplateKey: 'elder_male',
      showCustomName: true,
      customMemberName: ''
    });
  },

  copyInviteCode() {
    if (!this.data.family) return;
    wx.setClipboardData({
      data: this.data.family.inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    });
  },
  shareInvite() {
    if (!this.data.family) return;
    wx.showModal({
      title: '微信分享邀请',
      content: `已生成分享邀请：邀请「${this.data.family.name}」成员\n邀请码：${this.data.family.inviteCode}\n请点击右上角「···」选择分享给家人。`,
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  // ===== 预设关系模板快速本地录入 =====
  openQuickAdd() {
    this.setData({
      showInvite: false,
      showQuickAdd: true,
      pendingTemplateKey: '',
      showCustomName: false,
      customMemberName: ''
    });
  },
  closeQuickAdd() {
    this.setData({
      showQuickAdd: false,
      pendingTemplateKey: '',
      showCustomName: false,
      customMemberName: ''
    });
  },
  onTemplatePick(e) {
    const type = e.currentTarget.dataset.type; // elder_male | elder_female | spouse | child | other
    const templates = appStore.PRESET_MEMBER_TEMPLATES || {};
    const tpl = templates[type] || templates.other || {};
    // 如果模板已预填姓名（ENABLE_DEMO_TOOLS 时），直接加入；否则打开姓名输入
    const prefName = tpl.name && tpl.name.trim();
    if (prefName) {
      this.setData({ showQuickAdd: false });
      this._addMemberByTemplate(type);
      return;
    }
    this.setData({
      pendingTemplateKey: type,
      showCustomName: true,
      customMemberName: ''
    });
  },
  onCustomNameInput(e) {
    this.setData({ customMemberName: e.detail.value });
  },
  confirmCustomMember() {
    const key = this.data.pendingTemplateKey;
    const name = String(this.data.customMemberName || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写家人姓名或称呼', icon: 'none' });
      return;
    }
    this.setData({
      showQuickAdd: false,
      showCustomName: false,
      customMemberName: '',
      pendingTemplateKey: ''
    });
    this._addMemberByTemplate(key, name);
  },
  _addMemberByTemplate(templateKey, customName) {
    try {
      const m = appStore.addMemberFromTemplate(templateKey, customName);
      wx.showToast({
        title: `已添加：${m.name}`,
        icon: 'success',
        duration: 1400
      });
      setTimeout(() => this._refresh(), 250);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '添加失败', icon: 'none' });
    }
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
    const isAdmin = member.role === 'admin';
    wx.showActionSheet({
      itemList: ['查看资料', isAdmin ? '取消管理员' : '设为管理员', '移除成员'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: `${member.avatar || '👤'} ${member.name}`,
            content: `关系：${member.relation}\n角色：${member.roleLabel || member.role}\n编辑权限：${member.editableText}\n加入时间：${member.joinTime}\n权限：${member.permissionSummary}`,
            showCancel: false
          });
        } else {
          wx.showToast({ title: '家庭管理功能开发中', icon: 'none' });
        }
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
