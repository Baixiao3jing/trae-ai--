// app.js
App({
  onLaunch() {
    console.log('药无忧小程序启动');
  },
  globalData: {
    // 正式产品默认不预填任何家庭/成员示例名，
    // 所有显示数据均从本地 appStore 读取（wx.Storage）。
    // 想一键体验完整示例可在 appStore.ENABLE_DEMO_TOOLS=true 时通过开发体验区加载。
  }
});
