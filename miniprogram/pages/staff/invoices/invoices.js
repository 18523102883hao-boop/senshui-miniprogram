const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

const FILTERS = [
  { key: '', title: '全部' },
  { key: 'submitted', title: '待审核' },
  { key: 'reviewing', title: '审核中' },
  { key: 'issued', title: '已开票' },
  { key: 'rejected', title: '已驳回' }
]

function fenToYuan(fen) {
  const value = Number(fen)
  return Number.isFinite(value) ? (Math.round(value) / 100).toFixed(2) : '0.00'
}

function decorate(item) {
  const source = item || {}
  return Object.assign({}, source, {
    amountText: fenToYuan(source.invoiceAmount),
    titleTypeText: source.titleType === 'company' ? '单位' : '个人'
  })
}

Page({
  data: {
    checked: false,
    allowed: false,
    filters: FILTERS,
    status: '',
    list: [],
    loading: false,
    hasError: false
  },

  onShow() {
    return this.checkPermission().then(() => {
      if (this.data.allowed) return this.load()
    })
  },

  onPullDownRefresh() {
    if (!this.data.allowed) {
      wx.stopPullDownRefresh()
      return Promise.resolve()
    }
    return this.load().then(() => wx.stopPullDownRefresh())
  },

  checkPermission() {
    return request.call('checkStaff', {})
      .then((data) => {
        this.setData({
          checked: true,
          allowed: !!data && data.role === 'admin'
        })
      })
      .catch(() => this.setData({ checked: true, allowed: false }))
  },

  load() {
    this.setData({ loading: true, hasError: false })
    return request.call('invoiceService', {
      action: 'listStaff',
      status: this.data.status
    })
      .then((data) => {
        this.setData({
          list: ((data && data.list) || []).map(decorate),
          loading: false,
          hasError: false
        })
      })
      .catch(() => this.setData({ list: [], loading: false, hasError: true }))
  },

  onRetry() {
    return this.load()
  },

  onFilterTap(e) {
    const status = e.currentTarget.dataset.key || 'submitted'
    if (status === this.data.status) return Promise.resolve()
    haptic('light')
    this.setData({ status, list: [] })
    return this.load()
  },

  onInvoiceTap(e) {
    const requestId = e.currentTarget.dataset.id
    if (!requestId) return
    haptic('light')
    wx.navigateTo({
      url: '/pages/staff/invoice-detail/invoice-detail?requestId=' + encodeURIComponent(requestId)
    })
  }
})

module.exports = { FILTERS, fenToYuan, decorate }
