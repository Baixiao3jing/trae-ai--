// app.js
const cloudConfig = require('./utils/cloudConfig.js');
const syncManager = require('./utils/syncManager.js');

App({
  onLaunch() {
    console.log('药无忧小程序启动');
    if (cloudConfig.ENABLE_CLOUD_SYNC && cloudConfig.CLOUD_ENV_ID && wx.cloud) {
      wx.cloud.init({
        env: cloudConfig.CLOUD_ENV_ID,
        traceUser: true
      });
      this.globalData.cloudReady = true;
      this.globalData.cloudBootstrap = syncManager.bootstrap();
    } else {
      this.globalData.cloudReady = false;
    }
  },
  globalData: {
    // 正式产品默认不预填任何家庭/成员示例名，
    // 所有显示数据均从本地 appStore 读取（wx.Storage）。
    // 想一键体验完整示例可在 appStore.ENABLE_DEMO_TOOLS=true 时通过开发体验区加载。
    cloudReady: false,
    cloudBootstrap: null
  }
});
