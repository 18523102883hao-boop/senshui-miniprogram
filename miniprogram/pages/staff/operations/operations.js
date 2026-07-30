const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')
const { haptic } = require('../../../utils/haptics.js')

function todayRange(now) {
  const current = now instanceof Date ? now : new Date()
  const from = new Date(current.getFullYear(), current.getMonth(), current.getDate())
  const to = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)
  return { from: from.getTime(), to: to.getTime() }
}

function amountText(value) {
  return util.fen2yuan(Number(value) || 0)
}

function decorateReport(data) {
  const source = data || {}
  const finance = source.finance || {}
  const operations = source.operations || {}
  const fallbackBusiness = [
    {
      key: 'physical_to_digital',
      label: '实体兑电子',
      count: 0,
      quantity: Number(operations.lingPhysicalToDigital) || 0
    },
    {
      key: 'digital_to_physical',
      label: '电子兑实体',
      count: 0,
      quantity: Number(operations.lingDigitalToPhysical) || 0
    },
    { key: 'member_card_exchange', label: '会员卡兑换', count: 0, quantity: 0 }
  ]
  const businessBreakdown = Array.isArray(operations.businessBreakdown) &&
    operations.businessBreakdown.length === 3
    ? operations.businessBreakdown
    : fallbackBusiness
  return {
    finance: Object.assign({}, finance, {
      grossText: amountText(finance.gross),
      refundsText: amountText(finance.refunds),
      netText: amountText(finance.net),
      orderIncomeText: amountText(finance.orderIncome),
      actualNetIncomeText: amountText(finance.actualNetIncome),
      pendingRefundAmountText: amountText(finance.pendingRefundAmount),
      anomalyAmountText: amountText(finance.anomalyAmount)
    }),
    operations: Object.assign({}, operations, {
      verifiedTicketCount: Number(operations.verifiedTicketCount != null
        ? operations.verifiedTicketCount
        : operations.ticketVerifiedCount) || 0,
      admittedPeopleCount: Number(operations.admittedPeopleCount) || 0,
      actualNetIncomeText: amountText(operations.actualNetIncome),
      businessBreakdown,
      businessRecordCount: Number(operations.businessRecordCount) ||
        businessBreakdown.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
      businessLingTotal: businessBreakdown.reduce(
        (sum, row) => sum + (Number(row.quantity) || 0),
        0
      )
    }),
    anomalies: source.anomalies || { total: 0, byType: {}, list: [] }
  }
}

const initialRange = todayRange()
const pageConfig = {
  data: {
    range: initialRange,
    loaded: false,
    loading: false,
    denied: false,
    hasError: false,
    hasData: false,
    showRisk: false,
    truncated: false,
    updatedAtText: '',
    report: null
  },

  onLoad() {
    return this.load()
  },

  onPullDownRefresh() {
    return this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    const range = todayRange()
    this.setData({
      range,
      loading: true,
      hasError: false,
      denied: false
    })
    return request.call('adminOperationsLedger', {
      action: 'summary',
      from: range.from,
      to: range.to
    })
      .then((data) => {
        const report = decorateReport(data)
        const finance = report.finance
        const operations = report.operations
        const hasData = !!(
          finance.paidCount ||
          finance.refundCount ||
          operations.verifiedTicketCount ||
          operations.memberVerificationCount ||
          operations.lingPhysicalToDigital ||
          operations.lingDigitalToPhysical ||
          operations.businessRecordCount
        )
        this.setData({
          loaded: true,
          loading: false,
          denied: false,
          hasError: false,
          hasData,
          showRisk: !!(
            finance.pendingRefundCount ||
            finance.anomalyCount ||
            report.anomalies.total
          ),
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
          report: null,
          hasData: false
        })
      })
  },

  onRetry() {
    return this.load()
  },

  goFunds() {
    this.navigateWithRange('/pages/staff/reconciliation/reconciliation')
  },

  goVerification() {
    this.navigateWithRange('/pages/staff/verification-data/verification-data')
  },

  goBusinessData() {
    this.navigateWithRange('/pages/staff/operation-details/operation-details', {
      kind: 'business_data'
    })
  },

  goExport() {
    this.navigateWithRange('/pages/staff/data-export/data-export')
  },

  navigateWithRange(path, extra) {
    const range = this.data.range
    if (!range) return
    haptic('light')
    const params = Object.assign({ from: range.from, to: range.to }, extra || {})
    const query = Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== '')
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&')
    wx.navigateTo({ url: `${path}?${query}` })
  }
}

if (typeof Page === 'function') Page(pageConfig)

module.exports = {
  todayRange,
  decorateReport,
  pageConfig
}
