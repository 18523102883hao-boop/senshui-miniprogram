// 外链承载页（web-view）
// 目前只用于打开森水长河公众号文章（必须来自已与本小程序关联的公众号）。
//
// ⚠️ 失败判定只认 binderror，不要再加超时兜底：
//    web-view 的 bindload 在真机上未必触发（2026-07-26 实测：文章正常显示，
//    但 4 秒后超时兜底把内容盖成了失败页）。而 binderror 在域名不被放行时
//    会立刻触发，足够可靠。
Page({
  data: {
    url: '',
    failed: false
  },

  onLoad(options) {
    const url = decodeURIComponent((options && options.url) || '')
    const title = decodeURIComponent((options && options.title) || '')
    if (title) wx.setNavigationBarTitle({ title })
    // 只放行 https，避免被塞入任意跳转
    if (!/^https:\/\//.test(url)) {
      this.setData({ failed: true })
      return
    }
    this.setData({ url })
  },

  // web-view 加载失败：给用户一条复制链接、去微信里打开的出路
  onLoadError() {
    this.setData({ failed: true })
  },

  copyUrl() {
    if (!this.data.url) return
    wx.setClipboardData({
      data: this.data.url,
      success: () => wx.showToast({ title: '已复制，去微信里粘贴打开', icon: 'none' })
    })
  },

  goConcierge() {
    wx.navigateTo({
      url: '/pages/concierge/concierge',
      fail: () => wx.showToast({ title: '请联系前台', icon: 'none' })
    })
  }
})
