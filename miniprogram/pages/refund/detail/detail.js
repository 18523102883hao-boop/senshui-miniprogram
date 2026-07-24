// 门票退款申请（功能扩展 Task 8）
// 只有未使用票可退；已核销票单独列出并说明原因，不给用户虚假期待。
const request = require('../../../utils/request.js')

const REFUNDABLE = ['unused', 'reserved']

function fenToYuan(fen) {
  const n = Number(fen)
  if (!Number.isInteger(n)) return '0.00'
  const cents = String(Math.abs(n) % 100)
  return Math.floor(Math.abs(n) / 100) + '.' + (cents.length === 1 ? '0' + cents : cents)
}

Page({
  data: {
    outTradeNo: '',
    order: null,
    refundable: [],
    blocked: [],
    refundFee: 0,
    refundText: '0.00',
    canSubmit: false,
    loading: false,
    hasError: false,
    submitting: false,
    reason: '',
    resultMode: '',
    resultMsg: ''
  },

  onLoad(options) {
    this.setData({ outTradeNo: (options && options.outTradeNo) || '' })
    return this.loadTickets()
  },

  loadTickets() {
    this.setData({ loading: true, hasError: false })
    return request.call('getMyTickets', { outTradeNo: this.data.outTradeNo })
      .then((d) => {
        const list = (d && d.list) || []
        const refundable = list.filter((t) => REFUNDABLE.indexOf(t.status) >= 0)
        const blocked = list.filter((t) => REFUNDABLE.indexOf(t.status) < 0)
        const fee = refundable.reduce((sum, t) => sum + (Number(t.unitPrice) || 0), 0)
        this.setData({
          order: (d && d.order) || null,
          refundable,
          blocked,
          refundFee: fee,
          refundText: fenToYuan(fee),
          canSubmit: refundable.length > 0,
          loading: false
        })
      })
      .catch(() => this.setData({ loading: false, hasError: true }))
  },

  onRetry() {
    return this.loadTickets()
  },

  onReasonInput(e) {
    this.setData({ reason: e.detail.value })
  },

  onSubmit() {
    if (!this.data.canSubmit || this.data.submitting) return Promise.resolve()
    return new Promise((resolve) => {
      wx.showModal({
        title: '确认申请退款',
        content: '将退回 ¥' + this.data.refundText + '，退款到账时间以微信支付为准。',
        success: (res) => {
          if (!res.confirm) return resolve()
          this.doRefund().then(resolve)
        },
        fail: () => resolve()
      })
    })
  },

  doRefund() {
    this.setData({ submitting: true })
    return request.call('requestTicketRefund', {
      outTradeNo: this.data.outTradeNo,
      ticketNos: this.data.refundable.map((t) => t.ticketNo),
      reason: this.data.reason
    })
      .then((d) => {
        const mode = (d && d.mode) || ''
        this.setData({
          submitting: false,
          resultMode: mode,
          resultMsg: (d && d.msg) || (mode === 'auto' ? '退款已发起，将原路退回' : ''),
          canSubmit: false
        })
        this.loadTickets()
      })
      .catch((err) => {
        // 失败不写 resultMode，避免误报成功；解锁按钮可重试
        this.setData({ submitting: false })
        wx.showToast({ title: (err && err.message) || '提交失败，请重试', icon: 'none' })
      })
  },

  goConcierge() {
    wx.navigateTo({
      url: '/pages/concierge/concierge',
      fail: () => wx.showToast({ title: '请联系前台', icon: 'none' })
    })
  }
})
