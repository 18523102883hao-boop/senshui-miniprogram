// 门票下单页（功能扩展 Task 7）
// PRD §8.5：选数量/日期 → 确认联系人 → 建单 → 支付。
// 幂等键在进入页面时生成一次：同一次下单意图无论重试几次都复用它，云端据此不重复建单。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

function fenToYuan(fen) {
  const n = Number(fen)
  if (!Number.isInteger(n)) return ''
  const cents = String(Math.abs(n) % 100)
  return Math.floor(Math.abs(n) / 100) + '.' + (cents.length === 1 ? '0' + cents : cents)
}

function genIdempotencyKey() {
  return 'ck-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

function today() {
  const d = new Date()
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

// 最早可约日 = 今天 + 提前天数（营地需提前 1 天，溪降为 0）。
// 云端 createTicketOrder 会再校验一次，这里只是别让用户白选。
function earliestDate(leadDays) {
  const d = new Date()
  d.setDate(d.getDate() + (Number(leadDays) || 0))
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

Page({
  data: {
    productId: '',
    product: null,
    quantity: 1,
    maxQuantity: 1,
    visitDate: '',
    minDate: today(),
    leadTimeDays: 0,
    contactName: '',
    contactPhone: '',
    totalFee: 0,
    totalText: '',
    idempotencyKey: '',
    loading: false,
    submitting: false,
    hasError: false
  },

  onLoad(options) {
    this.setData({
      productId: (options && options.productId) || '',
      idempotencyKey: genIdempotencyKey()
    })
    return this.loadProduct()
  },

  loadProduct() {
    this.setData({ loading: true, hasError: false })
    return request.call('getTicketProduct', { productId: this.data.productId })
      .then((d) => {
        const p = d && d.product
        if (!p) throw new Error('empty')
        this.setData({
          product: p,
          maxQuantity: p.purchaseLimit || 1,
          visitDate: p.reservationRequired ? earliestDate(p.leadTimeDays) : '',
          minDate: earliestDate(p.leadTimeDays),
          leadTimeDays: Number(p.leadTimeDays) || 0,
          loading: false
        })
        this.recalc()
      })
      .catch(() => this.setData({ loading: false, hasError: true }))
  },

  onRetry() {
    return this.loadProduct()
  },

  recalc() {
    const p = this.data.product || {}
    const total = (p.salePrice || 0) * this.data.quantity
    this.setData({ totalFee: total, totalText: fenToYuan(total) })
  },

  onPlus() {
    if (this.data.quantity >= this.data.maxQuantity) {
      wx.showToast({ title: '每单限购 ' + this.data.maxQuantity + ' 份', icon: 'none' })
      return
    }
    haptic('light')
    this.setData({ quantity: this.data.quantity + 1 })
    this.recalc()
  },

  onMinus() {
    if (this.data.quantity <= 1) return
    haptic('light')
    this.setData({ quantity: this.data.quantity - 1 })
    this.recalc()
  },

  onDateChange(e) {
    this.setData({ visitDate: e.detail.value })
  },

  onNameInput(e) {
    this.setData({ contactName: e.detail.value })
  },

  onPhoneInput(e) {
    this.setData({ contactPhone: e.detail.value })
  },

  onSubmit() {
    if (this.data.submitting) return Promise.resolve() // 连点保护
    const p = this.data.product
    if (!p) return Promise.resolve()
    if (p.reservationRequired && !this.data.visitDate) {
      wx.showToast({ title: '请选择使用日期', icon: 'none' })
      return Promise.resolve()
    }

    this.setData({ submitting: true })
    return request.call('createTicketOrder', {
      productId: this.data.productId,
      quantity: this.data.quantity,
      visitDate: this.data.visitDate,
      contact: { name: this.data.contactName, phone: this.data.contactPhone },
      idempotencyKey: this.data.idempotencyKey // 重试复用，云端据此不重复建单
    })
      .then((d) => this.pay(d))
      .catch((err) => {
        this.setData({ submitting: false })
        wx.showToast({ title: (err && err.message) || '下单失败', icon: 'none' })
      })
  },

  pay(order) {
    const outTradeNo = (order && order.outTradeNo) || ''
    return new Promise((resolve) => {
      wx.requestPayment(Object.assign({}, (order && order.payment) || {}, {
        success: () => {
          this.setData({ submitting: false })
          wx.redirectTo({ url: '/pages/ticket/result/result?outTradeNo=' + encodeURIComponent(outTradeNo) })
          resolve()
        },
        fail: () => {
          // 用户取消或支付失败：订单仍是待支付，留在本页可再次支付
          this.setData({ submitting: false })
          wx.showToast({ title: '支付未完成，可重新支付', icon: 'none' })
          resolve()
        }
      }))
    })
  }
})
