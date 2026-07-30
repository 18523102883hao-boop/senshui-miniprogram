const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')
const { haptic } = require('../../../utils/haptics.js')

const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 30
const SEARCH_DELAY = 350
const MODES = [
  { key: 'day', label: '按日' },
  { key: 'month', label: '按月' },
  { key: 'custom', label: '自定义' }
]
const TABS = [
  { key: 'summary', label: '验证统计' },
  { key: 'details', label: '验证明细' }
]

function parseDate(value) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!matched) return null
  const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function dayRange(value) {
  const source = value instanceof Date ? value : new Date()
  const from = new Date(source.getFullYear(), source.getMonth(), source.getDate())
  const to = new Date(source.getFullYear(), source.getMonth(), source.getDate() + 1)
  return { from: from.getTime(), to: to.getTime() }
}

function monthRange(value) {
  const source = value instanceof Date ? value : new Date()
  return {
    from: new Date(source.getFullYear(), source.getMonth(), 1).getTime(),
    to: new Date(source.getFullYear(), source.getMonth() + 1, 1).getTime()
  }
}

function customRange(fromText, toText) {
  const fromDate = parseDate(fromText)
  const toDate = parseDate(toText)
  if (!fromDate || !toDate) return { ok: false, msg: '请选择完整日期' }
  if (fromDate.getTime() > toDate.getTime()) {
    return { ok: false, msg: '开始日期不能晚于结束日期' }
  }
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1).getTime()
  if (to - fromDate.getTime() > 366 * DAY_MS) {
    return { ok: false, msg: '单次最多查询 366 天' }
  }
  return { ok: true, from: fromDate.getTime(), to }
}

function initialRange(options) {
  const from = Number(options && options.from)
  const to = Number(options && options.to)
  return Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from
    ? { from, to }
    : dayRange()
}

function amountText(value) {
  return util.fen2yuan(Number(value) || 0)
}

function countText(ticketCount, admissionCount, unknown) {
  const tickets = Math.max(0, Number(ticketCount) || 0)
  const people = Math.max(0, Number(admissionCount) || 0)
  return unknown
    ? `${tickets} 张 / 实际人数待核对`
    : `${tickets} 张 / ${people} 人`
}

function decorateSummary(data) {
  const source = data || {}
  const operations = source.operations || {}
  return {
    operations: Object.assign({}, operations, {
      verifiedTicketCount: Number(
        operations.verifiedTicketCount != null
          ? operations.verifiedTicketCount
          : operations.ticketVerifiedCount
      ) || 0,
      admittedPeopleCount: Number(operations.admittedPeopleCount) || 0,
      unknownAdmissionTicketCount: Number(operations.unknownAdmissionTicketCount) || 0,
      relatedOrderCount: Number(operations.relatedOrderCount) || 0,
      actualNetIncomeText: amountText(operations.actualNetIncome)
    }),
    ticketBreakdown: (source.ticketBreakdown || []).map((item) => Object.assign({}, item, {
      ticketCount: Number(item.ticketCount != null ? item.ticketCount : item.count) || 0,
      admissionCount: Number(item.admissionCount) || 0,
      faceValueText: amountText(item.faceValue),
      shareText: `${Math.round((Number(item.admissionShare) || 0) * 100)}%`,
      countText: countText(
        item.ticketCount != null ? item.ticketCount : item.count,
        item.admissionCount,
        Number(item.unknownAdmissionTicketCount) > 0
      )
    })),
    anomalies: Object.assign({ total: 0, list: [] }, source.anomalies || {})
  }
}

function decorateDetail(item) {
  const source = item || {}
  const ticketCount = Number(source.ticketCount || source.quantity) || 1
  return Object.assign({}, source, {
    ticketCount,
    admissionCount: Number(source.admissionCount) || 0,
    amountText: amountText(source.amount),
    timeText: util.formatDate(source.eventAt, 'YYYY-MM-DD HH:mm'),
    staffName: source.staffName || '未记录',
    orderTradeNo: source.orderTradeNo || source.secondaryReference || '',
    countText: countText(ticketCount, source.admissionCount, source.admissionCountUnknown)
  })
}

function withAllStaff(list) {
  return [{ staffOpenid: '', staffName: '全部员工', staffNo: '' }].concat(list || [])
}

function withAllSubtypes(list) {
  return [{ key: '', label: '全部票种' }].concat(list || [])
}

function rangeText(range) {
  if (!range) return ''
  const first = util.formatDate(range.from)
  const last = util.formatDate(range.to - 1)
  return first === last ? first : `${first} 至 ${last}`
}

const now = new Date()
const initial = dayRange(now)
const pageConfig = {
  data: {
    modes: MODES,
    mode: 'day',
    tabs: TABS,
    tab: 'summary',
    focusDate: util.formatDate(now, 'YYYY-MM-DD'),
    focusMonth: util.formatDate(now, 'YYYY-MM'),
    customFrom: util.formatDate(now, 'YYYY-MM-DD'),
    customTo: util.formatDate(now, 'YYYY-MM-DD'),
    range: initial,
    rangeText: rangeText(initial),
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
    updatedAtText: ''
  },

  onLoad(options) {
    const range = initialRange(options)
    const anchor = new Date(range.from)
    this.setData({
      range,
      rangeText: rangeText(range),
      focusDate: util.formatDate(anchor, 'YYYY-MM-DD'),
      focusMonth: util.formatDate(anchor, 'YYYY-MM'),
      customFrom: util.formatDate(anchor, 'YYYY-MM-DD'),
      customTo: util.formatDate(range.to - 1, 'YYYY-MM-DD')
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
      action: 'verification',
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

  detailQuery(page) {
    const staff = this.data.staffOptions[this.data.staffIndex] || {}
    const subtype = this.data.subtypeOptions[this.data.subtypeIndex] || {}
    return {
      action: 'details',
      kind: 'ticket_verifications',
      from: this.data.range.from,
      to: this.data.range.to,
      staffOpenid: staff.staffOpenid || '',
      subtype: subtype.key || '',
      keyword: String(this.data.keyword || '').trim(),
      page,
      pageSize: PAGE_SIZE
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
    const promise = request.call('adminOperationsLedger', this.detailQuery(page))
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

  reloadCurrent() {
    return this.data.tab === 'summary' ? this.loadSummary() : this.loadDetails(true)
  },

  onRetry() {
    return this.reloadCurrent()
  },

  onTabTap(e) {
    const tab = e.currentTarget && e.currentTarget.dataset.tab
    if (!TABS.some((item) => item.key === tab) || tab === this.data.tab) return Promise.resolve()
    haptic('light')
    this.setData({ tab, loaded: false, denied: false, hasError: false })
    return this.reloadCurrent()
  },

  onModeTap(e) {
    const mode = e.currentTarget && e.currentTarget.dataset.mode
    if (!MODES.some((item) => item.key === mode) || mode === this.data.mode) return Promise.resolve()
    haptic('light')
    if (mode === 'custom') {
      this.setData({ mode })
      return Promise.resolve()
    }
    const range = mode === 'month'
      ? monthRange(parseDate(`${this.data.focusMonth}-01`))
      : dayRange(parseDate(this.data.focusDate))
    this.setData({ mode, range, rangeText: rangeText(range), list: [] })
    return this.reloadCurrent()
  },

  onFocusDateChange(e) {
    const focusDate = e.detail.value
    const range = dayRange(parseDate(focusDate))
    this.setData({ focusDate, range, rangeText: rangeText(range), list: [] })
    return this.reloadCurrent()
  },

  onFocusMonthChange(e) {
    const focusMonth = e.detail.value
    const range = monthRange(parseDate(`${focusMonth}-01`))
    this.setData({ focusMonth, range, rangeText: rangeText(range), list: [] })
    return this.reloadCurrent()
  },

  onCustomFromChange(e) {
    this.setData({ customFrom: e.detail.value })
  },

  onCustomToChange(e) {
    this.setData({ customTo: e.detail.value })
  },

  onCustomQuery() {
    const result = customRange(this.data.customFrom, this.data.customTo)
    if (!result.ok) {
      wx.showToast({ title: result.msg, icon: 'none' })
      return Promise.resolve()
    }
    const range = { from: result.from, to: result.to }
    this.setData({ mode: 'custom', range, rangeText: rangeText(range), list: [] })
    return this.reloadCurrent()
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
    this.setData({ staffIndex: 0, subtypeIndex: 0, keyword: '' })
    return this.loadDetails(true)
  },

  onReachBottom() {
    if (this.data.tab !== 'details') return Promise.resolve()
    return this.loadDetails(false)
  },

  onDetailTap(e) {
    const orderNo = e.currentTarget && e.currentTarget.dataset.orderNo
    if (!orderNo) return
    haptic('light')
    wx.navigateTo({
      url: '/pages/staff/order-detail/order-detail?orderNo=' + encodeURIComponent(orderNo)
    })
  }
}

if (typeof Page === 'function') Page(pageConfig)

module.exports = {
  DAY_MS,
  MODES,
  TABS,
  parseDate,
  dayRange,
  monthRange,
  customRange,
  countText,
  decorateSummary,
  decorateDetail,
  pageConfig
}
