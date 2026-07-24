// 支付结果页（功能扩展 Task 7）
// 微信支付回调可能延迟到账，因此这里只有「确认中 / 成功」两种正向状态，
// 绝不因为回调还没到就告诉用户失败（PRD §20）。
const request = require('../../../utils/request.js')

const POLL_INTERVAL = 2000
const MAX_POLL = 8 // 约 16 秒后露出客服入口，但状态仍是「确认中」

Page({
  data: {
    outTradeNo: '',
    state: 'confirming', // confirming | success
    tickets: [],
    pollCount: 0,
    showSupport: false
  },

  onLoad(options) {
    this.setData({ outTradeNo: (options && options.outTradeNo) || '' })
    return this.pollOnce().then(() => this.schedule())
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer)
  },

  schedule() {
    if (this.data.state === 'success') return
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      this.pollOnce().then(() => this.schedule())
    }, POLL_INTERVAL)
  },

  pollOnce() {
    return request.call('getMyTickets', { outTradeNo: this.data.outTradeNo })
      .then((d) => {
        const list = (d && d.list) || []
        const order = (d && d.order) || null
        const paid = order && (order.status === 'paid' || order.status === 'paid_dup')
        const count = this.data.pollCount + 1
        if (paid && list.length) {
          if (this._timer) clearTimeout(this._timer)
          this.setData({ state: 'success', tickets: list, pollCount: count, showSupport: false })
          return
        }
        this.setData({
          state: 'confirming',
          pollCount: count,
          showSupport: count >= MAX_POLL // 久未到账时露出客服，而不是判定失败
        })
      })
      .catch(() => {
        this.setData({ pollCount: this.data.pollCount + 1, showSupport: this.data.pollCount + 1 >= MAX_POLL })
      })
  },

  goWallet() {
    wx.redirectTo({ url: '/pages/ticket/wallet/wallet' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goConcierge() {
    wx.navigateTo({
      url: '/pages/concierge/concierge',
      fail: () => wx.showToast({ title: '请联系前台', icon: 'none' })
    })
  }
})
