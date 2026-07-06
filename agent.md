# 药无忧 Agent Context

## Project
- 项目名：药无忧
- 形态：微信小程序
- 路径：`D:\桌面\trae ai大赛\程序`
- 当前目标：做一个真实可用的家庭药品管理小程序，不以演示为核心。

## Current State
- 已完成真实用户空状态：
  - 无家庭：引导创建家庭药箱。
  - 有家庭无药品：引导添加第一盒药。
  - 有药品：展示首页统计、药箱列表、今日关注。
- 已完成去演示化方向：
  - `ENABLE_DEMO_TOOLS = false`
  - 默认不加载“爸妈家的药箱”、小李、爸爸、妈妈、假药品。
- 已完成全局 UI token：
  - 文件：`程序/app.wxss`
  - 保留绿色健康、白卡片、轻阴影、老人端暖色视觉。
- 已完成添加药品流程重构：
  - 文件：`程序/pages/add-medicine/add-medicine.js`
  - 状态机：`choose -> form -> success`
  - 手动录入为主，扫码/OCR 只做辅助填充。
  - 保存使用 `appStore.addMedicineAndBatch`。

## Important Files
- `程序/utils/appStore.js`
  - 本地状态层，基于 `wx.Storage`。
  - 核心函数：`readAppState`、`createFamily`、`lookupBarcode`、`matchExistingMedicineByForm`、`addMedicineAndBatch`、`getMedicineSummary`、`getDashboardStats`、`getTodayAttention`。
- `程序/pages/add-medicine/`
  - 添加药品主流程。
  - 当前重点：扫码家庭自学习体验。
- `程序/pages/index/`
  - 首页状态判断和统计。
- `程序/pages/medicines/`
  - 药箱列表和筛选。
- `程序/pages/medicine-detail/`
  - 药品详情和批次展示。
- `程序/pages/family/`
  - 创建家庭、邀请成员、成员管理。
- `程序/pages/settings/`
  - 我的页、隐私入口、访问记录入口、清空本地数据。

## Barcode Strategy
- 不自建全国药品条码数据库。
- 不依赖外部 API。
- 使用“家庭自学习条码库”：
  1. 第一次扫码未命中，保留条码。
  2. 用户手动/OCR 补全药品信息。
  3. 保存后该药品主档保存 `barcode`。
  4. 下次同家庭再扫同条码，直接从本地药品库识别。
- `lookupBarcode` 应优先查真实家庭药品，再查内置 seed。
- 未命中时应返回结构化结果，不应简单返回 `null`。

## Product Boundaries
- 药无忧只做：家庭药品库存、批次、有效期、存放位置、家庭成员共享、后续提醒。
- 药无忧不做：医疗诊断、用药建议、疗效判断、自动替用户确认药品安全性。

## Next Planned Feature
- 完成家庭自学习条码库：
  - 未命中：“首次录入该条码，保存后下次扫码会自动识别。”
  - 命中家庭库：“已从家庭药箱识别。”
  - 命中内置 seed：“辅助识别结果，请核对。”
- 保持扫码结果可编辑，保存前必须人工确认。

## Validation Checklist
- 清空本地数据后：首页应显示创建家庭。
- 创建家庭后：药箱为空，添加药品可进入表单。
- 扫未知条码：保留条码，提示首次录入，保存后药箱出现药品。
- 再扫同一条码：自动填充药品信息，保存时新增批次，不重复创建药品主档。
