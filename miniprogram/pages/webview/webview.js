// 外链承载页（web-view）
// 目前只用于打开森水长河公众号文章。微信对 mp.weixin.qq.com 下的公众号文章
// 有特殊放行，但如果后台限制了业务域名仍可能打不开，因此保留失败兜底。
Page({
  data: {
    url: '',
    loaded: false,
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
    // 域名不在白名单时 web-view 可能既不渲染也不报错，只留一片空白。
    // 给一个超时兜底，别让用户对着白屏干等。
    this._timer = setTimeout(() => {
      if (!this.data.loaded) this.setData({ failed: true })
    }, 4000)
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer)
  },

  onLoadSuccess() {
    this.setData({ loaded: true })
    if (this._timer) clearTimeout(this._timer)
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
