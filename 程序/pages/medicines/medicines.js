// pages/medicines/medicines.js
// 药无忧第六阶段：真实流程药箱页
// 阶段：
// - noFamily：提示"请先创建家庭药箱"，按钮去创建家庭
// - emptyMedicine：有家庭但无药品，显示空状态
// - hasData：展示用户录入的药品，筛选正常工作

const appStore = require('../../utils/appStore.js');

function coverText(medicine) {
  const name = String((medicine && (medicine.shortName || medicine.name)) || '').trim();
  if (name) return name.slice(0, 1);
  const category = String((medicine && medicine.category) || '').trim();
  return category ? category.slice(0, 1) : '药';
}

// 构建筛选组（基于真实 members 动态，保留所有原状态/类别/位置选项）
function buildFilterGroups(members) {
  const statuses = [
    { key: 'all', label: '全部', hint: '所有药品' },
    { key: 'normal', label: '正常', hint: '无需关注' },
    { key: 'pendingConfirm', label: '待确认', hint: '家人有未确认服药' },
    { key: 'nearExpire', label: '临期', hint: '30 天内到期' },
    { key: 'expired', label: '已过期', hint: '请及时处理' },
    { key: 'lowStock', label: '库存不足', hint: '剩余 < 10' }
  ];
  const memberList = [
    { key: 'all', label: '全部', hint: '所有使用人' }
  ];
  if (members && members.length) {
    memberList.push({ key: 'family', label: '全家备用', hint: '≥ 3 位家人' });
    members.forEach(m => {
      memberList.push({ key: m.id, label: m.name, hint: m.relation || '家人' });
    });
  }
  const categories = [
    { key: 'all', label: '全部类别' },
    { key: '慢病用药', label: '慢病用药' },
    { key: '感冒发烧', label: '感冒发烧' },
    { key: '肠胃用药', label: '肠胃用药' },
    { key: '维生素/保健', label: '维生素/保健' },
    { key: '外用药', label: '外用药' },
    { key: '其他', label: '其他' }
  ];
  const locations = [
    { key: 'all', label: '全部位置' },
    { key: '客厅', label: '客厅' },
    { key: '厨房', label: '厨房' },
    { key: '卧室', label: '卧室' },
    { key: '老人房', label: '老人房' },
    { key: '卫生间', label: '卫生间' }
  ];
  return { statuses, members: memberList, categories, locations };
}

Page({
  data: {
    stage: 'noFamily', // noFamily | emptyMedicine | hasData
    familyName: '',
    filterGroups: buildFilterGroups([]),
    activeStatus: 'all',
    activeMember: 'all',
    activeCategory: 'all',
    activeLocation: 'all',
    medicineCards: [],
    filteredCards: [],
    totalCount: 0
  },

  _refresh() {
    const s = appStore.readAppState();
    if (!s.currentFamily) {
      this.setData({ stage: 'noFamily' });
      return;
    }
    const meds = (s.medicines || []).filter(m => !m.status || m.status === 'active');
    if (meds.length === 0) {
      this.setData({
        stage: 'emptyMedicine',
        familyName: s.currentFamily.name
      });
      return;
    }
    const cards = meds.map(m => this._buildCard(m));
    const groups = buildFilterGroups(s.members || []);
    this.setData({
      stage: 'hasData',
      familyName: s.currentFamily.name,
      filterGroups: groups,
      medicineCards: cards,
      filteredCards: cards,
      totalCount: cards.length
    });
    this._applyFilters();
  },

  onLoad() {
    this._refresh();
  },

  onShow() {
    // 切回时重算（药品录入/重置都会变）
    this._refresh();
  },

  _buildCard(m) {
    const summary = appStore.getMedicineSummary(m.id);
    return {
      id: m.id,
      name: m.name,
      shortName: m.shortName || m.name,
      category: m.category || '',
      categoryColor: appStore.categoryColor(m.category),
      coverImage: m.coverImage || '',
      coverSource: m.coverSource || 'none',
      coverText: m.coverText || coverText(m),
      coverColor: m.coverColor || appStore.categoryColor(m.category),
      forMember: appStore.getMemberNames(m.targetMemberIds, m.targetMemberLabel || m.customTargetMemberName || ''),
      targetMemberIds: m.targetMemberIds || [],
      targetMemberLabel: m.targetMemberLabel || m.customTargetMemberName || '',
      storageLocation: m.storageLocation || '',
      status: summary.status,
      statusLabel: summary.statusLabel,
      statusColor: summary.statusColor,
      batchCount: summary.batchCount,
      activeBatchCount: summary.activeBatchCount,
      availableStock: summary.availableStock,
      nearestExpire: summary.nearestExpire,
      needRestock: summary.needRestock
    };
  },

  // ========== 筛选器事件 ==========
  onStatusTap(e) {
    this.setData({ activeStatus: e.currentTarget.dataset.key });
    this._applyFilters();
  },
  onMemberTap(e) {
    this.setData({ activeMember: e.currentTarget.dataset.key });
    this._applyFilters();
  },
  onCategoryTap(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.key });
    this._applyFilters();
  },
  onLocationTap(e) {
    this.setData({ activeLocation: e.currentTarget.dataset.key });
    this._applyFilters();
  },
  onResetFilters() {
    this.setData({
      activeStatus: 'all',
      activeMember: 'all',
      activeCategory: 'all',
      activeLocation: 'all'
    });
    this._applyFilters();
  },

  _applyFilters() {
    const {
      medicineCards,
      activeStatus, activeMember, activeCategory, activeLocation
    } = this.data;
    const s = appStore.readAppState();
    const meds = s.medicines || [];
    const records = s.medicationRecords || [];

    let list = medicineCards.slice();

    if (activeStatus !== 'all') {
      if (activeStatus === 'pendingConfirm') {
        const pending = records.filter(r => r.status === 'pending');
        const pendingMedIds = meds
          .filter(m => (m.targetMemberIds || []).some(uid =>
            pending.some(r => r.memberId === uid)
          ))
          .map(m => m.id);
        list = list.filter(c => pendingMedIds.includes(c.id));
      } else {
        list = list.filter(c => c.status === activeStatus);
      }
    }

    if (activeMember !== 'all') {
      if (activeMember === 'family') {
        list = list.filter(c => c.targetMemberIds && c.targetMemberIds.length >= 3);
      } else {
        list = list.filter(c =>
          c.targetMemberIds && c.targetMemberIds.includes(activeMember)
        );
      }
    }

    if (activeCategory !== 'all') {
      list = list.filter(c => c.category === activeCategory);
    }

    if (activeLocation !== 'all') {
      list = list.filter(c =>
        c.storageLocation && c.storageLocation.indexOf(activeLocation) !== -1
      );
    }

    this.setData({
      filteredCards: list,
      totalCount: list.length
    });
  },

  // ========== 跳转 ==========
  goCreateFamily() {
    wx.navigateTo({ url: '/pages/family/family?autoCreate=1' });
  },
  goAddMedicine() {
    if (!appStore.hasFamily()) {
      this.goCreateFamily();
      return;
    }
    wx.navigateTo({ url: '/pages/add-medicine/add-medicine' });
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/medicine-detail/medicine-detail?id=${id}` });
  }
});
