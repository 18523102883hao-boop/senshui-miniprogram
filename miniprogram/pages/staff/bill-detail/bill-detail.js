const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')
const { haptic } = require('../../../utils/haptics.js')

const PAGE_SIZE = 30
const EXPORT_PAGE_SIZE = 100
const EXPORT_LIMIT = 5000
const SEARCH_DELAY = 350
const TABS = [
  { key: 'summary', label: '账单统计' },
  { key: 'details', label: '账单明细' }
]
const EVENT_KINDS = [
  { key: '', label: '全部收支' },
  { key: 'payment', label: '支付' },
  { key: 'refund', label: '退款' }
]

function validRange(options) {
  const from = Number(options && options.from)
  const to = Number(options && options.to)
  return Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from
    ? { from, to }
    : null
}

function amountText(value) {
  return util.fen2yuan(Number(value) || 0)
}

function formatRange(range) {
  if (!range) return ''
  const fromText = util.formatDate(range.from)
  const toText = util.formatDate(range.to - 1)
  return fromText === toText ? fromText : `${fromText} 至 ${toText}`
}

function decorateSummary(data) {
  const source = data || {}
  const finance = source.finance || {}
  return {
    finance: Object.assign({}, finance, {
      grossText: amountText(finance.gross),
      refundsText: amountText(finance.refunds),
      netText: amountText(finance.net),
      orderIncomeText: amountText(finance.orderIncome),
      actualNetIncomeText: amountText(finance.actualNetIncome),
      pendingRefundAmountText: amountText(finance.pendingRefundAmount)
    }),
    incomeBreakdown: (
      source.verifiedIncomeBreakdown ||
      source.incomeBreakdown ||
      []
    ).map((item) => Object.assign({}, item, {
      amountText: amountText(item.amount)
    })),
    anomalies: Object.assign({ total: 0, list: [] }, source.anomalies || {}, {
      list: ((source.anomalies && source.anomalies.list) || []).map((item) => Object.assign({}, item, {
        amountText: amountText(item.amount),
        timeText: util.formatDate(item.eventAt, 'YYYY-MM-DD HH:mm')
      }))
    })
  }
}

function decorateDetail(item) {
  const source = item || {}
  return Object.assign({}, source, {
    amountText: amountText(source.amount),
    timeText: util.formatDate(source.eventAt, 'YYYY-MM-DD HH:mm'),
    staffName: source.staffName || '未记录',
    orderTradeNo: source.orderTradeNo || source.reference || ''
  })
}

function withAllStaff(list) {
  return [{ staffOpenid: '', staffName: '全部员工', staffNo: '' }].concat(list || [])
}

function withAllSubtypes(list) {
  return [{ key: '', label: '全部订单类型' }].concat(list || [])
}

function csvEscape(value) {
  const text = String(value == null ? '' : value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function buildCsv(input) {
  const source = input || {}
  const rows = source.rows || []
  const lines = [
    ['小程序业务账', '账单明细', source.rangeText || '', '支付与实际退款按发生时间统计'],
    ['发生时间', '收支类型', '订单类型', '项目', '订单号', '经办员工', '手机尾号', '金额（元）']
  ]
  rows.forEach((item) => {
    lines.push([
      item.timeText,
      item.eventKind === 'refund' ? '退款' : '支付',
      item.subtypeLabel || '',
      item.title || '',
      item.orderTradeNo || '',
      item.staffName || '未记录',
      item.phoneTail || '',
      amountText(item.amount)
    ])
  })
  return '\ufeff' + lines.map((row) => row.map(csvEscape).join(',')).join('\n')
}

const pageConfig = {
  data: {
    tabs: TABS,
    tab: 'summary',
    eventKinds: EVENT_KINDS,
    eventKind: '',
    range: null,
    rangeText: '',
    summary: null,
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
    staffOptions: withAllStaff([]),
    subtypeOptions: withAllSubtypes([]),
    staffIndex: 0,
    subtypeIndex: 0,
    keyword: '',
    loaded: false,
    loading: false,
    loadingMore: false,
    denied: false,
    hasError: false,
    truncated: false,
    exporting: false,
    updatedAtText: ''
  },

  onLoad(options) {
    const range = validRange(options)
    if (!range) {
      this.setData({ loaded: true, hasError: true })
      return Promise.resolve()
    }
    this.setData({
      range,
      rangeText: formatRange(range)
    })
    return this.loadSummary()
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
  },

  onPullDownRefresh() {
    const promise = this.data.tab === 'summary' ? this.loadSummary() : this.loadDetails(true)
    return promise.then(() => wx.stopPullDownRefresh())
  },

  loadSummary() {
    const range = this.data.range
    this.setData({ loading: true, loaded: false, denied: false, hasError: false })
    return request.call('adminOperationsLedger', {
      action: 'funds',
      from: range.from,
      to: range.to
    })
      .then((data) => {
        this.setData({
          summary: decorateSummary(data),
          loaded: true,
          loading: false,
          denied: false,
          hasError: false,
          truncated: !!(data && data.truncated),
          updatedAtText: util.formatDate(data && data.updatedAt, 'MM-DD HH:mm')
        })
      })
      .catch((error) => this.handleError(error, true))
  },

  detailQuery(page, pageSize) {
    const staff = this.data.staffOptions[this.data.staffIndex] || {}
    const subtype = this.data.subtypeOptions[this.data.subtypeIndex] || {}
    return {
      action: 'details',
      kind: 'funds',
      eventKind: this.data.eventKind,
      from: this.data.range.from,
      to: this.data.range.to,
      staffOpenid: staff.staffOpenid || '',
      subtype: subtype.key || '',
      keyword: String(this.data.keyword || '').trim(),
      page,
      pageSize
    }
  },

  loadDetails(reset) {
    const shouldReset = reset !== false
    if (shouldReset && this.data.loading) return this._loadPromise || Promise.resolve()
    if (!shouldReset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) {
      return Promise.resolve()
    }
    const page = shouldReset ? 1 : this.data.page + 1
    this.setData(shouldReset
      ? { loading: true, loaded: false, denied: false, hasError: false }
      : { loadingMore: true })
    const promise = request.call(
      'adminOperationsLedger',
      this.detailQuery(page, PAGE_SIZE)
    )
      .then((data) => {
        const incoming = ((data && data.list) || []).map(decorateDetail)
        const patch = {
          list: shouldReset ? incoming : this.data.list.concat(incoming),
          total: Number(data && data.total) || 0,
          page: Number(data && data.page) || page,
          hasMore: !!(data && data.hasMore),
          loaded: true,
          loading: false,
          loadingMore: false,
          denied: false,
          hasError: false,
          truncated: !!(data && data.truncated)
        }
        if (shouldReset) {
          patch.staffOptions = withAllStaff(data && data.staffOptions)
          patch.subtypeOptions = withAllSubtypes(data && data.subtypeOptions)
          patch.staffIndex = Math.min(this.data.staffIndex, patch.staffOptions.length - 1)
          patch.subtypeIndex = Math.min(this.data.subtypeIndex, patch.subtypeOptions.length - 1)
        }
        this.setData(patch)
      })
      .catch((error) => this.handleError(error, shouldReset))
    this._loadPromise = promise
    return promise
  },

  handleError(error, clearList) {
    const denied = !!error && error.code === 403
    this.setData({
      loaded: true,
      loading: false,
      loadingMore: false,
      denied,
      hasError: !denied,
      list: clearList ? [] : this.data.list
    })
  },

  onRetry() {
    return this.data.tab === 'summary' ? this.loadSummary() : this.loadDetails(true)
  },

  onTabTap(e) {
    const tab = e.currentTarget && e.currentTarget.dataset.tab
    if (!TABS.some((item) => item.key === tab) || tab === this.data.tab) {
      return Promise.resolve()
    }
    haptic('light')
    this.setData({ tab, loaded: false, hasError: false, denied: false })
    return tab === 'summary' ? this.loadSummary() : this.loadDetails(true)
  },

  onEventKindTap(e) {
    const eventKind = e.currentTarget && e.currentTarget.dataset.kind
    if (!EVENT_KINDS.some((item) => item.key === eventKind) || eventKind === this.data.eventKind) {
      return Promise.resolve()
    }
    haptic('light')
    this.setData({ eventKind })
    return this.loadDetails(true)
  },

  onStaffChange(e) {
    this.setData({ staffIndex: Number(e.detail.value) || 0 })
    return this.loadDetails(true)
  },

  onSubtypeChange(e) {
    this.setData({ subtypeIndex: Number(e.detail.value) || 0 })
    return this.loadDetails(true)
  },

  onKeywordInput(e) {
    this.setData({ keyword: (e.detail && e.detail.value) || '' })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      this._searchTimer = null
      this.loadDetails(true)
    }, SEARCH_DELAY)
  },

  onSearchConfirm() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
      this._searchTimer = null
    }
    return this.loadDetails(true)
  },

  onResetFilters() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = null
    this.setData({
      eventKind: '',
      staffIndex: 0,
      subtypeIndex: 0,
      keyword: ''
    })
    return this.loadDetails(true)
  },

  onReachBottom() {
    if (this.data.tab !== 'details') return Promise.resolve()
    return this.loadDetails(false)
  },

  navigateToOrder(orderNo) {
    if (!orderNo) return
    haptic('light')
    wx.navigateTo({
      url: '/pages/staff/order-detail/order-detail?orderNo=' + encodeURIComponent(orderNo)
    })
  },

  onDetailTap(e) {
    this.navigateToOrder(e.currentTarget && e.currentTarget.dataset.orderNo)
  },

  onAnomalyTap(e) {
    this.navigateToOrder(e.currentTarget && e.currentTarget.dataset.orderNo)
  },

  onExport() {
    if (this.data.exporting) return Promise.resolve()
    this.setData({ exporting: true })
    const rows = []
    const fetchPage = (page) => request.call(
      'adminOperationsLedger',
      this.detailQuery(page, EXPORT_PAGE_SIZE)
    ).then((data) => {
      rows.push(...((data && data.list) || []).map(decorateDetail))
      if (data && data.hasMore && rows.length < EXPORT_LIMIT) return fetchPage(page + 1)
      return { truncated: !!(data && data.truncated), limited: rows.length >= EXPORT_LIMIT }
    })
    return fetchPage(1)
      .then((flags) => new Promise((resolve, reject) => {
        wx.setClipboardData({
          data: buildCsv({ rangeText: this.data.rangeText, rows }),
          success: () => {
            wx.showToast({
              title: flags.truncated || flags.limited
                ? '已复制部分记录，请缩短日期范围'
                : 'CSV 已复制，可粘贴到表格',
              icon: 'none'
            })
            resolve()
          },
          fail: reject
        })
      }))
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || '导出失败，请重试', icon: 'none' })
      })
      .then(() => this.setData({ exporting: false }))
  }
}

if (typeof Page === 'function') Page(pageConfig)

module.exports = {
  TABS,
  EVENT_KINDS,
  validRange,
  formatRange,
  decorateSummary,
  decorateDetail,
  buildCsv,
  pageConfig
}
