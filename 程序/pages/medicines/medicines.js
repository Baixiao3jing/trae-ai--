// pages/medicines/medicines.js
// 第二阶段：使用正式药品主档 + 批次汇总；新增 4 组筛选器（状态/使用人/类别/位置）
const {
  family,
  medicines,
  medicationRecords,
  getMedicineSummary,
  getMemberNames,
  categoryColor,
  FILTER_META
} = require('../../utils/mockData.js');

Page({
  data: {
    familyName: '',
    // 4 组筛选器（保留当前选中值）
    filterGroups: FILTER_META,
    activeStatus: 'all',
    activeMember: 'all',
    activeCategory: 'all',
    activeLocation: 'all',
    // 药品卡片列表（主档 + 汇总后数据）
    medicineCards: [],
    filteredCards: [],
    totalCount: 0
  },

  onLoad() {
    const cards = medicines
      .filter(m => m.status === 'active')
      .map(m => this._buildCard(m));

    this.setData({
      familyName: family.name,
      medicineCards: cards,
      filteredCards: cards,
      totalCount: cards.length
    });
    this._applyFilters();
  },

  onShow() {
    // 重新汇总（未来批次变化后会生效）
    const cards = this.data.medicineCards.map(card => {
      const m = medicines.find(x => x.id === card.id) || card;
      return this._buildCard(m);
    });
    this.setData({ medicineCards: cards });
    this._applyFilters();
  },

  /**
   * 把单个药品主档 + 批次汇总 构建成卡片数据
   */
  _buildCard(m) {
    const summary = getMedicineSummary(m.id);
    return {
      id: m.id,
      name: m.name,
      shortName: m.shortName,
      category: m.category,
      categoryColor: categoryColor(m.category),
      forMember: getMemberNames(m.targetMemberIds),
      targetMemberIds: m.targetMemberIds,
      storageLocation: m.storageLocation,
      // 汇总信息
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

    let list = medicineCards.slice();

    // 1. 状态筛选（特殊处理：pendingConfirm 时，看有无未确认记录）
    if (activeStatus !== 'all') {
      if (activeStatus === 'pendingConfirm') {
        const pending = medicationRecords.filter(r => r.status === 'pending');
        const planMemberIdsMap = {}; // 未来：从 plan 拿到 medicineId，这里简化
        const pendingMedIds = medicines
          .filter(m => m.targetMemberIds.some(uid => pending.some(r => r.memberId === uid)))
          .map(m => m.id);
        list = list.filter(c => pendingMedIds.includes(c.id));
      } else {
        list = list.filter(c => c.status === activeStatus);
      }
    }

    // 2. 使用人筛选
    if (activeMember !== 'all') {
      if (activeMember === 'family') {
        list = list.filter(c => c.targetMemberIds && c.targetMemberIds.length >= 3);
      } else {
        list = list.filter(c =>
          c.targetMemberIds && c.targetMemberIds.includes(activeMember)
        );
      }
    }

    // 3. 类别筛选
    if (activeCategory !== 'all') {
      list = list.filter(c => c.category === activeCategory);
    }

    // 4. 位置筛选
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
  goAddMedicine() {
    wx.navigateTo({
      url: '/pages/add-medicine/add-medicine'
    });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/medicine-detail/medicine-detail?id=${id}`
    });
  }
});
