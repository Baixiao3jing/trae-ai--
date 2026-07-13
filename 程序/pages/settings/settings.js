// pages/settings/settings.js
// 第六阶段：基于真实 appStore 状态，区分"未创建家庭"和"已有家庭"两阶段
const appStore = require('../../utils/appStore.js');
const cloudStore = require('../../utils/cloudStore.js');
const syncManager = require('../../utils/syncManager.js');
const ENABLE_DEMO_TOOLS = appStore.ENABLE_DEMO_TOOLS === true;
const {
  setCurrentRoleId,
  getCurrentRole
} = require('../../utils/demoStore.js');

Page({
  data: {
    stage: 'noFamily', // noFamily / hasFamily
    user: {},
    family: null,
    members: [],
    memberCount: 0,
    medicineCount: 0,
    batchCount: 0,
    menuGroups: [],
    // 当 ENABLE_DEMO_TOOLS=true 时仍保留；否则演示开关全部关掉，不渲染
    currentRole: null,
    roleOptions: [],
    devToolsVisible: !!ENABLE_DEMO_TOOLS,
    dataLoadedAt: ''
  },

  onLoad() {
    this._refreshAll();
  },

  onShow() {
    this._refreshAll();
  },

  _refreshAll() {
    const s = appStore.readAppState();
    const hasFamily = !!s.currentFamily;
    const stage = hasFamily ? 'hasFamily' : 'noFamily';
    const user = appStore.getCurrentUser();
    const family = s.currentFamily;
    const members = appStore.getMembers();
    const meds = s.medicines || [];
    const batches = s.medicineBatches || [];

    // 演示角色切换：仅 ENABLE_DEMO_TOOLS=true 时展示，正式产品关闭
    let currentRole = null;
    let roleOptions = [];
    if (ENABLE_DEMO_TOOLS && hasFamily) {
      const storedRole = getCurrentRole();
      const stillExists = members.some(m => m.id === storedRole.id);
      let currentRoleObj = null;
      if (stillExists) {
        currentRoleObj = members.find(m => m.id === storedRole.id);
      }
      if (!currentRoleObj) {
        currentRoleObj = members.find(m => m.role === 'admin') || members[0];
        setCurrentRoleId(currentRoleObj.id);
      }
      currentRole = Object.assign({}, currentRoleObj, {
        roleLabel: currentRoleObj.role === 'admin' ? '管理员' : '老人'
      });
      roleOptions = members.map(m => ({
        id: m.id,
        name: m.name,
        roleLabel: m.role === 'admin' ? '管理员' : '老人',
        avatar: m.avatar || '👤',
        relation: m.relation || '',
        isActive: m.id === currentRoleObj.id
      }));
    }

    // 菜单分组：根据 stage 动态生成。开发演示功能仅当 ENABLE_DEMO_TOOLS=true 时加入
    let menuGroups = [];
    if (stage === 'hasFamily') {
      menuGroups = [
        {
          title: '家庭',
          items: [
            {
              key: 'family',
              icon: '👨‍👩‍👧‍👦',
              label: '家庭管理',
              desc: members.length > 1 ? `共 ${members.length} 位成员` : '1 位成员，可邀请家人',
              bg: '#e7f2ee',
              color: '#2e7d6a'
            },
            {
              key: 'elder',
              icon: '👴',
              label: '家人提醒（大字版）',
              desc: members.some(m => m.role === 'elder') ? '给老人看的大字版提醒界面' : '邀请长辈后可用于大字版服药提醒',
              bg: '#fff8e1',
              color: '#f39c12'
            }
          ]
        },
        {
          title: '隐私与数据',
          items: [
            {
              key: 'privacy',
              icon: '🔒',
              label: '隐私授权',
              desc: '查看与管理授权状态',
              bg: '#e8f4fd',
              color: '#3498db'
            },
            {
              key: 'logs',
              icon: '📋',
              label: '访问记录',
              desc: '查看近期操作记录',
              bg: '#f3e8fd',
              color: '#9b59b6'
            },
            {
              key: 'reset-local',
              icon: '🧹',
              label: '清理本机缓存',
              desc: '不会退出云家庭，清理后会重新同步最新数据',
              bg: '#fdecea',
              color: '#e74c3c'
            }
          ]
        },
        {
          title: '其他',
          items: [
            {
              key: 'leave',
              icon: '🚪',
              label: '退出家庭',
              desc: '退出当前家庭空间',
              bg: '#fdecea',
              color: '#e74c3c'
            }
          ]
        }
      ];
      if (ENABLE_DEMO_TOOLS) {
        menuGroups.push({
          title: '开发体验区',
          items: [
            {
              key: 'load-demo',
              icon: '🎬',
              label: '加载示例体验数据',
              desc: '开发或演示时使用：一键加载完整示例家庭和药品数据',
              bg: '#eafaf1',
              color: '#27ae60'
            }
          ]
        });
      }
    } else {
      // 未创建家庭：只显示最小必要入口
      menuGroups = [
        {
          title: '使用入门',
          items: [
            {
              key: 'create-family',
              icon: '🏠',
              label: '创建家庭药箱',
              desc: '创建后可录入药品、邀请家人',
              bg: '#e7f2ee',
              color: '#2e7d6a'
            }
          ]
        },
        {
          title: '隐私与数据',
          items: [
            {
              key: 'privacy',
              icon: '🔒',
              label: '隐私授权',
              desc: '查看与管理授权状态',
              bg: '#e8f4fd',
              color: '#3498db'
            },
            {
              key: 'reset-local',
              icon: '🧹',
              label: '清理本机缓存',
              desc: '清除本机缓存，不会删除云端家庭数据',
              bg: '#fdecea',
              color: '#e74c3c'
            }
          ]
        }
      ];
      if (ENABLE_DEMO_TOOLS) {
        menuGroups.push({
          title: '开发体验区',
          items: [
            {
              key: 'load-demo',
              icon: '🎬',
              label: '加载示例体验数据',
              desc: '开发或演示专用：一键加载完整示例',
              bg: '#eafaf1',
              color: '#27ae60'
            }
          ]
        });
      }
    }

    if (user && user.role !== 'admin') {
      menuGroups = menuGroups.map(group => Object.assign({}, group, {
        items: (group.items || []).filter(item => item.key !== 'logs')
      })).filter(group => group.items.length > 0);
    }

    let loadedAt = '';
    if (ENABLE_DEMO_TOOLS && s._meta && s._meta.demoLoadedAt) {
      const d = new Date(s._meta.demoLoadedAt);
      loadedAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    this.setData({
      stage,
      user,
      family,
      members,
      memberCount: members.length,
      medicineCount: meds.length,
      batchCount: batches.length,
      menuGroups,
      currentRole,
      roleOptions,
      dataLoadedAt: loadedAt
    });
  },

  // ==================== 创建家庭入口 ====================
  goCreateFamily() {
    wx.navigateTo({ url: '/pages/family/family?autoCreate=1' });
  },

  // ==================== 角色切换（仅 ENABLE_DEMO_TOOLS=true 时生效） ====================
  onRoleChange(e) {
    if (!ENABLE_DEMO_TOOLS) {
      wx.showToast({ title: '该功能仅在开发体验模式使用', icon: 'none' });
      return;
    }
    const userId = e.currentTarget.dataset.userId;
    if (!userId) return;
    if (this.data.currentRole && userId === this.data.currentRole.id) return;

    const members = appStore.getMembers();
    const mem = members.find(m => m.id === userId);
    if (!mem) return;

    setCurrentRoleId(userId);
    if (mem.role === 'admin') {
      wx.showToast({
        title: '已切换到管理员视角',
        icon: 'success',
        duration: 1600
      });
    } else {
      wx.showModal({
        title: '已切换长辈视角',
        content: `当前身份：${mem.name} / 长辈。\n\n可进入「家人提醒（大字版）」查看大字版提醒（仅显示该长辈自己的服药记录）。`,
        showCancel: false,
        confirmText: '好的'
      });
    }
    this._refreshAll();
  },

  // ==================== 加载示例体验数据（开发体验区专用） ====================
  onLoadDemoSeed() {
    if (!ENABLE_DEMO_TOOLS) {
      wx.showToast({ title: '该功能仅在开发体验模式使用', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '加载示例体验数据',
      content: '是否加载一组完整的示例家庭与药品数据？\n\n加载后可通过「清理本机缓存」移除本地示例数据。',
      confirmText: '确认加载',
      confirmColor: '#2e7d6a',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        appStore.loadDemoSeedData();
        wx.showToast({
          title: '已加载示例数据',
          icon: 'success',
          duration: 1800
        });
        setTimeout(() => this._refreshAll(), 300);
      }
    });
  },

  // ==================== 清理本机缓存 ====================
  onResetLocal() {
    wx.showModal({
      title: '清理本机缓存',
      content: '只清理当前手机上的缓存，不会退出家庭，也不会删除云端药品。清理后会重新同步最新家庭数据。',
      confirmText: '清理并同步',
      confirmColor: '#e74c3c',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        if (!cloudStore.isCloudEnabled()) {
          syncManager.rebuildLocalCache();
          this._refreshAll();
          wx.showToast({ title: '本机缓存已清理', icon: 'success' });
          return;
        }
        wx.showLoading({ title: '重新同步中...' });
        syncManager.rebuildLocalCache().then(() => {
          wx.hideLoading();
          this._refreshAll();
          wx.showToast({ title: appStore.hasFamily() ? '缓存已刷新' : '缓存已清理', icon: 'success' });
        }).catch(() => {
          wx.hideLoading();
          this._refreshAll();
          wx.showToast({ title: '缓存已清理，云同步暂不可用', icon: 'none' });
        });
      }
    });
  },

  onMenuTap(e) {
    const key = e.currentTarget.dataset.key;
    switch (key) {
      case 'family':
        wx.navigateTo({ url: '/pages/family/family' });
        break;
      case 'elder':
        if (!appStore.hasFamily()) {
          wx.showToast({ title: '请先创建家庭', icon: 'none' });
          break;
        }
        wx.navigateTo({ url: '/pages/elder/elder' });
        break;
      case 'create-family':
        this.goCreateFamily();
        break;
      case 'load-demo':
        this.onLoadDemoSeed();
        break;
      case 'reset-local':
        this.onResetLocal();
        break;
      case 'privacy':
        wx.navigateTo({ url: '/pages/privacy/privacy' });
        break;
      case 'logs':
        wx.navigateTo({ url: '/pages/access-logs/access-logs' });
        break;
      case 'export':
        this._showExportSummary();
        break;
      case 'leave': {
        const famName = (this.data.family && this.data.family.name) || '当前家庭';
        wx.showModal({
          title: '退出家庭',
          content: `确定退出「${famName}」吗？退出后需重新被邀请才能加入。`,
          confirmColor: '#e74c3c',
          success: (res) => {
            if (res.confirm) {
              const familyId = appStore.getActiveFamilyId();
              if (!cloudStore.isCloudEnabled()) {
                appStore.clearFamilyCache();
                this._refresh();
                return;
              }
              wx.showLoading({ title: '正在退出...' });
              cloudStore.leaveFamily(familyId).then(() => {
                appStore.clearFamilyCache();
                wx.hideLoading();
                wx.showToast({ title: '已退出家庭', icon: 'success' });
                this._refresh();
              }).catch(err => {
                wx.hideLoading();
                wx.showToast({ title: err.message || '退出失败', icon: 'none' });
              });
            }
          }
        });
        break;
      }
      default:
        wx.showToast({ title: '暂不支持此操作', icon: 'none' });
    }
  },

  // 第六阶段：导出摘要（基于真实 appStore 数据）
  _showExportSummary() {
    const s = appStore.readAppState();
    const medCount = (s.medicines || []).length;
    const batchCount = (s.medicineBatches || []).length;
    const memCount = appStore.getMembers().length;
    const planCount = (s.medicationPlans || []).length;

    wx.showModal({
      title: '导出药品台账',
      editable: false,
      content:
`【导出前摘要】
· 药品主档数量：${medCount} 条
· 批次数量：${batchCount} 条
· 家庭成员数量：${memCount} 位
· 用药提醒：${planCount} 条

【导出字段】
药品名 · 类别 · 使用人 · 批号 · 有效期 · 剩余数量 · 存放位置

已生成 CSV 台账预览，完整版写入文件服务后续可通过系统权限启用后使用。`,
      confirmText: '确认导出',
      confirmColor: '#2e7d6a',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '已生成 CSV 预览',
            icon: 'success',
            duration: 2000
          });
        }
      }
    });
  }
});
