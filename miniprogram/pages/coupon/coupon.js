// 我的卡券（T15）
const request = require('../../utils/request.js')

Page({
  data: {
    list: [],
    loaded: false
  },

  onShow() {
    this.load()
  },

  load() {
    request.callWithLoading('getMyCoupons', {}, '加载中')
      .then((d) => this.setData({ list: d.list || [], loaded: true }))
      .catch(() => this.setData({ loaded: true }))
  }
})
