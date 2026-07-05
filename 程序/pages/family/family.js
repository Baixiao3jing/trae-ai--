// pages/family/family.js
// 药无忧第五阶段：增强家庭管理页
// 新增：家庭概览卡、角色权限说明、成员卡增强（关系/可编辑/权限摘要）、老人加入预览

const {
  mockFamily,
  mockMembers,
  mockCurrentUser,
  medicines,
  medicineBatches
} = require('../../utils/mockData.js');

// 角色权限说明（用于展示区域）
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
    who: '爸爸、妈妈等被照护的长辈'
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

// 权限摘要（给成员卡片用）
function buildPermissionSummary(mem) {
  if (mem.role === 'admin') return '新增 · 编辑 · 删除 · 设置提醒 · 查看记录';
  if (mem.role === 'elder') return '只读提醒 · 点击已服用 · 不能编辑药品';
  return '查看提醒 · 查看台账 · 可协助录入 · 不能删除';
}

Page({
  data: {
    family: {},
    members: [],
    rolePermissions: ROLE_PERMISSIONS,
    showInvite: false,
    showElderAgreement: false, // 老人加入预览弹窗
    // 家庭概览
    overview: {
      totalMemberCount: 0,
      elderCount: 0,
      medicineCount: 0,
      batchCount: 0,
      createdText: ''
    },
    // 老人加入预览展示内容
    elderAgreementContent: {}
  },

  onLoad() {
    const elderCount = mockMembers.filter(m => m.role === 'elder').length;
    const members = mockMembers.map(m => Object.assign({}, m, {
      editable: !!m.canEdit,
      editableText: m.canEdit ? '可编辑' : '只读',
      permissionSummary: buildPermissionSummary(m)
    }));

    this.setData({
      family: mockFamily,
      members,
      overview: {
        totalMemberCount: members.length,
        elderCount,
        medicineCount: medicines.length,
        batchCount: medicineBatches.length,
        createdText: mockFamily.createdAt
      },
      elderAgreementContent: {
        inviterName: mockCurrentUser.name,
        inviterRelation: mockCurrentUser.relation || '家人',
        familyName: mockFamily.name,
        inviteCode: mockFamily.inviteCode
      }
    });
  },

  openInvite() {
    this.setData({ showInvite: true });
  },

  closeInvite() {
    this.setData({ showInvite: false });
  },

  // 打开老人加入预览（大字版授权说明）
  openElderAgreement() {
    this.setData({
      showInvite: false,
      showElderAgreement: true
    });
  },

  closeElderAgreement() {
    this.setData({ showElderAgreement: false });
  },

  // 老人点击"同意加入"
  onAgreeJoin() {
    this.setData({ showElderAgreement: false });
    wx.showToast({
      title: '已模拟加入家庭',
      icon: 'success',
      duration: 1800
    });
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.family.inviteCode,
      success: () => {
        wx.showToast({ title: '邀请码已复制', icon: 'success' });
      }
    });
  },

  shareInvite() {
    wx.showModal({
      title: '微信分享',
      content: `已生成分享卡片：邀请「${this.data.family.name}」\n邀请码：${this.data.family.inviteCode}\n（演示版本：请点击右上角"..."选择分享）`,
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  onMemberTap(e) {
    const member = e.currentTarget.dataset.member;
    if (member.id === mockCurrentUser.id) {
      wx.showToast({ title: '这是你自己', icon: 'none' });
    } else {
      wx.showActionSheet({
        itemList: ['查看资料', member.role === 'admin' ? '取消管理员' : '设为管理员', '移除成员'],
        success: (res) => {
          if (res.tapIndex === 0) {
            wx.showModal({
              title: `${member.avatar} ${member.name}`,
              content: `关系：${member.relation}\n角色：${member.roleLabel}\n编辑权限：${member.editableText}\n加入时间：${member.joinTime}\n权限：${member.permissionSummary}`,
              showCancel: false
            });
          } else {
            wx.showToast({ title: '演示版本', icon: 'none' });
          }
        }
      });
    }
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  goAccessLogs() {
    wx.navigateTo({ url: '/pages/access-logs/access-logs' });
  }
});
