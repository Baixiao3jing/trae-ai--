// pages/medicine-detail/medicine-detail.js
// 第六阶段：读取真实 appStore 数据，展示主档 + 批次 + （可选）用药计划
const appStore = require('../../utils/appStore.js');
const {
  categoryColor,
  statusLabel,
  statusColor,
  daysBetween
} = require('../../utils/mockData.js');

Page({
  data: {
    medicine: null,
    summary: null,
    // 附加展示字段
    forMemberText: '',
    categoryColor: '',
    // Tab
    tabs: [
      { key: 'info', label: '基础信息' },
      { key: 'batch', label: '批次库存' },
      { key: 'plan', label: '用药计划' }
    ],
    activeTab: 'info',
    batches: [],
    notFound: false,
    noFamily: false
  },

  onLoad(options) {
    this._load(options);
  },

  onShow() {
    const id = this.data.medicine && this.data.medicine.id;
    if (id) this._load({ id });
  },

  _load(options) {
    if (!appStore.hasFamily()) {
      this.setData({ noFamily: true, notFound: false });
      wx.setNavigationBarTitle({ title: '药品详情' });
      return;
    }
    const id = options.id || (this.data.medicine && this.data.medicine.id) || null;
    if (!id) {
      this.setData({ notFound: true, noFamily: false });
      wx.setNavigationBarTitle({ title: '药品详情' });
      return;
    }
    const medicine = appStore.getMedicineById(id);
    if (!medicine) {
      this.setData({ notFound: true, noFamily: false });
      wx.setNavigationBarTitle({ title: '药品详情' });
      return;
    }
    const summary = appStore.getMedicineSummary(id);
    const rawBatches = appStore.getMedicineBatches(id);
    const batches = rawBatches.map(b => {
      // 动态计算批次级状态（基于有效期 + 剩余库存）
      const bs = appStore.computeBatchStatus(b);
      // 存储级 b.status 若为 inactive / disabled，也覆盖
      const effectiveStatus = (b.status === 'inactive' || b.status === 'disabled') ? 'inactive' : bs;
      const sc = statusColor(effectiveStatus);
      const expireDays = daysBetween(b.expireDate);
      return {
        ...b,
        status: effectiveStatus,
        statusLabel: statusLabel(effectiveStatus),
        statusColor: sc,
        batchBorderColor: sc,
        remainPercent: b.totalQuantity > 0
          ? Math.max(0, Math.min(100, Math.round(b.remainingQuantity / b.totalQuantity * 100)))
          : 0,
        progressStyle: `width: ${
          b.totalQuantity > 0
            ? Math.max(0, Math.min(100, Math.round(b.remainingQuantity / b.totalQuantity * 100)))
            : 0
        }%; background: ${
          b.totalQuantity > 0 && Math.round(b.remainingQuantity / b.totalQuantity * 100) < 30
            ? '#e74c3c'
            : '#2e7d6a'
        };`,
        confidencePercent: Math.round((b.confidence || 0) * 100),
        expireDaysText: effectiveStatus === 'expired'
          ? `已过期 ${Math.abs(expireDays)} 天`
          : `还有 ${expireDays} 天`
      };
    }).sort((a, b) => {
      const order = { expired: 0, nearExpire: 1, warning: 1, lowStock: 2, normal: 3, inactive: 4, disabled: 5 };
      const aOrder = order[a.status] != null ? order[a.status] : 99;
      const bOrder = order[b.status] != null ? order[b.status] : 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aExpire = String(a.expireDate || '');
      const bExpire = String(b.expireDate || '');
      if (aExpire && bExpire) return aExpire < bExpire ? -1 : aExpire > bExpire ? 1 : 0;
      return (String(a.batchNo || '') < String(b.batchNo || '') ? -1 : 1);
    });

    wx.setNavigationBarTitle({
      title: medicine.name.length > 12 ? medicine.shortName || '药品详情' : medicine.name
    });

    this.setData({
      medicine: {
        ...medicine,
        categoryColor: categoryColor(medicine.category)
      },
      summary,
      forMemberText: appStore.getMemberNames(medicine.targetMemberIds, medicine.targetMemberLabel || medicine.customTargetMemberName || ''),
      categoryColor: categoryColor(medicine.category),
      batches,
      notFound: false,
      noFamily: false
    });
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key });
  },

  goAddBatch() {
    if (!appStore.hasFamily()) return;
    const mid = this.data.medicine && this.data.medicine.id;
    if (!mid) return;
    // 跳转到添加药品页，携带 medicineId 表示"新增批次"入口
    wx.navigateTo({
      url: `/pages/add-medicine/add-medicine?entryMode=manual&medicineId=${mid}`,
      fail: () => {
        wx.showToast({ title: '新增批次（暂未接入）', icon: 'none' });
      }
    });
  },

  goEditBatch(e) {
    const no = (e.currentTarget.dataset.batch || {}).batchNo;
    wx.showToast({ title: `编辑批次 ${no}（开发中）`, icon: 'none' });
  },

  goDisableBatch(e) {
    const batch = e.currentTarget.dataset.batch || {};
    const no = batch.batchNo;
    wx.showModal({
      title: '停用批次',
      content: `批次「${no}」停用时会被排除在可用库存与补货计算之外，确定吗？\n（演示版本：不实际修改数据）`,
      confirmColor: '#e74c3c',
      success: (r) => {
        if (r.confirm) wx.showToast({ title: '演示版本：已取消', icon: 'none' });
      }
    });
  },

  goSetReminder() {
    wx.showToast({ title: '用药提醒配置（开发中）', icon: 'none' });
  },

  goEdit() {
    wx.showToast({ title: '编辑主档（开发中）', icon: 'none' });
  },

  goBackMedicines() {
    wx.switchTab({ url: '/pages/medicines/medicines' });
  },

  goCreateFamily() {
    wx.navigateTo({ url: '/pages/family/family?autoCreate=1' });
  }
});
