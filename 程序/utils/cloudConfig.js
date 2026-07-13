// utils/cloudConfig.js
// 填入微信开发者工具「云开发」里的环境 ID 后，家庭同步会优先走云端。
// 为空时保留本地 appStore 流程，方便未开通云开发时继续调试。
module.exports = {
  ENABLE_CLOUD_SYNC: true,
  CLOUD_ENV_ID: 'cloud1-d6gy15bnu135ca73d'
};
