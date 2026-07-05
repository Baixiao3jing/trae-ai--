// pages/medicine-detail/medicine-detail.js
// 第二阶段：正式主档 + 批次列表（按规则排序）+ 汇总信息 + 安全提示
const {
  medicines,
  members,
  getMedicineSummary,
  getMedicineBatches,
  getMemberNames,
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
    batches: []
  },

  onLoad(options) {
    const id = options.id || 'M001';
    const medicine = medicines.find(m => m.id === id) || medicines[0];
    const summary = getMedicineSummary(medicine.id);
    const batches = getMedicineBatches(medicine.id).map(b => {
      const sc = statusColor(b.status);
      const expireDays = daysBetween(b.expireDate);
      return {
        ...b,
        statusLabel: statusLabel(b.status),
        statusColor: sc,
        batchBorderColor: sc,
        remainPercent: b.totalQuantity > 0
          ? Math.max(0, Math.min(100, Math.round(b.remainingQuantity / b.totalQuantity * 100)))
          : 0,
        confidencePercent: Math.round((b.confidence || 0) * 100),
        expireDaysText: b.status === 'expired'
          ? `已过期 ${Math.abs(expireDays)} 天`
          : `还有 ${expireDays} 天`
      };
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
      forMemberText: getMemberNames(medicine.targetMemberIds),
      categoryColor: categoryColor(medicine.category),
      batches
    });
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key });
  },

  // ========== 操作按钮（第二阶段模拟 Toast，不真正改数据） ==========
  goAddBatch() {
    wx.showToast({ title: '新增批次（第三阶段接入）', icon: 'none' });
  },
  goEditBatch(e) {
    const no = (e.currentTarget.dataset.batch || {}).batchNo;
    wx.showToast({ title: `编辑批次 ${no}（开发中）`, icon: 'none' });
  },
  goDisableBatch(e) {
    const no = (e.currentTarget.dataset.batch || {}).batchNo;
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
  }
});
