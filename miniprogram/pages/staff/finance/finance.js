const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')
const { haptic } = require('../../../utils/haptics.js')

function todayRange(now) {
  const current = now instanceof Date ? now : new Date()
  const from = new Date(current.getFullYear(), current.getMonth(), current.getDate())
  const to = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)
  return { from: from.getTime(), to: to.getTime() }
}

function normalizeRange(options) {
  const from = Number(options && options.from)
  const to = Number(options && options.to)
  if (Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from) {
    return { from, to }
  }
  return todayRange()
}

function amountText(value) {
  return util.fen2yuan(Number(value) || 0)
}

function decorateReport(data) {
  const source = data || {}
  const finance = source.finance || {}
  return {
    finance: Object.assign({}, finance, {
      grossText: amountText(finance.gross),
      refundsText: amountText(finance.refunds),
      netText: amountText(finance.net),
      actualNetIncomeText: amountText(finance.actualNetIncome),
      pendingRefundAmountText: amountText(finance.pendingRefundAmount),
      anomalyAmountText: amountText(finance.anomalyAmount)
    }),
    incomeBreakdown: (source.incomeBreakdown || []).map((item) => Object.assign({}, item, {
      amountText: amountText(item.amount)
    })),
    anomalies: source.anomalies || { total: 0, byType: {}, list: [] }
  }
}

const pageConfig = {
  data: {
    range: null,
    loaded: false,
    loading: false,
    denied: false,
    hasError: false,
    hasData: false,
    showRisk: false,
    riskCount: 0,
    pendingRefundAmountText: '0.00',
    truncated: false,
    updatedAtText: '',
    report: null
  },

  onLoad(options) {
    this.setData({ range: normalizeRange(options) })
    return this.load()
  },

  onPullDownRefresh() {
    return this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    const range = this.data.range || todayRange()
    this.setData({
      range,
      loading: true,
      hasError: false,
      denied: false
    })
    return request.call('adminOperationsLedger', {
      action: 'finance',
      from: range.from,
      to: range.to
    })
      .then((data) => {
        const report = decorateReport(data)
        const finance = report.finance
        const anomalyCount = Number(report.anomalies.total) || Number(finance.anomalyCount) || 0
        const pendingRefundCount = Number(finance.pendingRefundCount) || 0
        this.setData({
          loaded: true,
          loading: false,
          denied: false,
          hasError: false,
          hasData: !!(
            finance.paidCount ||
            finance.verifiedTicketCount ||
            finance.refundCount ||
            pendingRefundCount ||
            anomalyCount
          ),
          showRisk: pendingRefundCount + anomalyCount > 0,
          riskCount: pendingRefundCount + anomalyCount,
          pendingRefundAmountText: amountText(finance.pendingRefundAmount),
          truncated: !!(data && data.truncated),
          updatedAtText: util.formatDate(data && data.updatedAt, 'MM-DD HH:mm'),
          report
        })
      })
      .catch((error) => {
        const denied = !!error && error.code === 403
        this.setData({
          loaded: true,
          loading: false,
          denied,
          hasError: !denied,
          hasData: false,
          showRisk: false,
          report: null
        })
      })
  },

  onRetry() {
    return this.load()
  },

  goReconciliation() {
    this.navigateWithRange('/pages/staff/reconciliation/reconciliation')
  },

  goAnomalies() {
    if (!this.data.showRisk) return
    this.navigateWithRange('/pages/staff/bill-detail/bill-detail', { risk: 1 })
  },

  goVerifiedIncome() {
    this.navigateWithRange('/pages/staff/operation-details/operation-details', {
      kind: 'ticket_verifications'
    })
  },

  navigateWithRange(path, extra) {
    const range = this.data.range
    if (!range) return
    haptic('light')
    const params = Object.assign({ from: range.from, to: range.to }, extra || {})
    const query = Object.keys(params)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&')
    wx.navigateTo({ url: `${path}?${query}` })
  }
}

if (typeof Page === 'function') Page(pageConfig)

module.exports = {
  todayRange,
  normalizeRange,
  decorateReport,
  pageConfig
}
