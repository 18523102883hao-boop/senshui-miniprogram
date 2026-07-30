const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')
const { haptic } = require('../../../utils/haptics.js')

const PAGE_SIZE = 30
const EXPORT_PAGE_SIZE = 100
const EXPORT_LIMIT = 5000
const SEARCH_DELAY = 350
const DAY_MS = 24 * 60 * 60 * 1000
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 366
const KINDS = [
  { key: 'funds', label: '资金流水' },
  { key: 'ticket_verifications', label: '门票核销' },
  { key: 'business_data', label: '业务数据' }
]
const KIND_KEYS = KINDS.map((item) => item.key)
const DEDICATED_ENTRIES = {
  funds: {
    title: '账单详情',
    desc: '查看账单统计、收支筛选、异常项和订单下钻',
    path: '/pages/staff/bill-detail/bill-detail'
  },
  ticket_verifications: {
    title: '核销数据',
    desc: '分开查看核销票数、实际人数和按票种统计',
    path: '/pages/staff/verification-data/verification-data'
  }
}

function validRange(fromValue, toValue) {
  const from = Number(fromValue)
  const to = Number(toValue)
  return Number.isFinite(from) && Number.isFinite(to) && from < to
    ? { from, to }
    : null
}

function dateInputValue(timestamp) {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return ''
  const date = new Date(value + BEIJING_OFFSET_MS)
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function dateStart(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return NaN
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) -
    BEIJING_OFFSET_MS
}

function formatRange(from, to) {
  if (!validRange(from, to)) return ''
  const first = dateInputValue(from)
  const last = dateInputValue(to - 1)
  return first === last ? first : `${first} 至 ${last}`
}

function amountText(value) {
  return util.fen2yuan(Number(value) || 0)
}

function decorateItem(item) {
  const source = item || {}
  return Object.assign({}, source, {
    amountText: amountText(source.amount),
    timeText: util.formatDate(source.eventAt, 'YYYY-MM-DD HH:mm'),
    staffName: source.staffName || '未记录',
    reference: source.reference || '',
    secondaryReference: source.secondaryReference || ''
  })
}

function csvEscape(value) {
  const text = String(value == null ? '' : value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function kindLabel(kind) {
  const found = KINDS.find((item) => item.key === kind)
  return found ? found.label : '资金流水'
}

function buildCsv(input) {
  const source = input || {}
  const rows = source.rows || []
  const lines = [
    ['小程序业务账', kindLabel(source.kind), source.rangeText || '', '支付与退款按发生时间；核销金额为票面金额'],
    ['发生时间', '类型', '项目', '主编号', '关联编号', '员工', '手机尾号', '金额（元）', '数量', '备注']
  ]
  rows.forEach((item) => {
    const note = item.priceMissing
      ? '历史数据未记录票价'
      : (item.eventKind === 'refund' ? '实际退款' : '')
    lines.push([
      item.timeText || util.formatDate(item.eventAt, 'YYYY-MM-DD HH:mm'),
      item.subtypeLabel || '',
      item.title || '',
      item.reference || '',
      item.secondaryReference || '',
      item.staffName || '未记录',
      item.phoneTail || '',
      amountText(item.amount),
      Number(item.quantity) || '',
      note
    ])
  })
  return '\ufeff' + lines.map((row) => row.map(csvEscape).join(',')).join('\n')
}

function allStaffOptions(list) {
  return [{ staffOpenid: '', staffName: '全部员工', staffNo: '' }].concat(list || [])
}

function allSubtypeOptions(list) {
  return [{ key: '', label: '全部类型' }].concat(list || [])
}

const initialData = {
  kinds: KINDS,
  kind: 'funds',
  from: 0,
  to: 0,
  fromDate: '',
  toDate: '',
  rangeText: '',
  staffOptions: allStaffOptions([]),
  subtypeOptions: allSubtypeOptions([]),
  staffIndex: 0,
  subtypeIndex: 0,
  keyword: '',
  list: [],
  total: 0,
  page: 1,
  hasMore: false,
  loading: false,
  loadingMore: false,
  loaded: false,
  denied: false,
  hasError: false,
  truncated: false,
  exporting: false,
  businessBreakdown: [],
  dedicatedEntry: DEDICATED_ENTRIES.funds
}

const pageConfig = {
  data: initialData,

  onLoad(options) {
    const range = validRange(options && options.from, options && options.to)
    if (!range) {
      this.setData({ loaded: true, hasError: true })
      return Promise.resolve()
    }
    const candidate = String((options && options.kind) || '')
    const kind = KIND_KEYS.includes(candidate) ? candidate : 'funds'
    const fromDate = dateInputValue(range.from)
    const toDate = dateInputValue(range.to - 1)
    this._initialRange = {
      from: range.from,
      to: range.to,
      fromDate,
      toDate
    }
    this.setData({
      kind,
      from: range.from,
      to: range.to,
      fromDate,
      toDate,
      rangeText: formatRange(range.from, range.to),
      dedicatedEntry: DEDICATED_ENTRIES[kind] || null
    })
    return this.load(true)
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
  },

  onPullDownRefresh() {
    return this.load(true).then(() => wx.stopPullDownRefresh())
  },

  query(page, pageSize) {
    const staff = this.data.staffOptions[this.data.staffIndex] || {}
    const subtype = this.data.subtypeOptions[this.data.subtypeIndex] || {}
    return {
      action: 'details',
      kind: this.data.kind,
      from: this.data.from,
      to: this.data.to,
      staffOpenid: staff.staffOpenid || '',
      subtype: subtype.key || '',
      keyword: String(this.data.keyword || '').trim(),
      page,
      pageSize
    }
  },

  load(reset) {
    const shouldReset = reset !== false
    if (shouldReset && this.data.loading) return this._loadPromise || Promise.resolve()
    if (!shouldReset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) {
      return Promise.resolve()
    }

    const page = shouldReset ? 1 : this.data.page + 1
    this.setData(shouldReset
      ? { loading: true, loaded: false, denied: false, hasError: false }
      : { loadingMore: true })

    const promise = Promise.resolve(
      request.call('adminOperationsLedger', this.query(page, PAGE_SIZE))
    )
      .then((data) => {
        const incoming = ((data && data.list) || []).map(decorateItem)
        const list = shouldReset ? incoming : this.data.list.concat(incoming)
        const patch = {
          list,
          total: Number(data && data.total) || 0,
          page: Number(data && data.page) || page,
          hasMore: !!(data && data.hasMore),
          truncated: !!(data && data.truncated),
          businessBreakdown: (data && data.businessBreakdown) || [],
          loading: false,
          loadingMore: false,
          loaded: true,
          denied: false,
          hasError: false
        }
        if (shouldReset) {
          patch.staffOptions = allStaffOptions(data && data.staffOptions)
          patch.subtypeOptions = allSubtypeOptions(data && data.subtypeOptions)
          patch.staffIndex = Math.min(this.data.staffIndex, patch.staffOptions.length - 1)
          patch.subtypeIndex = Math.min(this.data.subtypeIndex, patch.subtypeOptions.length - 1)
        }
        this.setData(patch)
      })
      .catch((error) => {
        const denied = !!error && error.code === 403
        this.setData({
          loading: false,
          loadingMore: false,
          loaded: true,
          denied,
          hasError: !denied,
          list: shouldReset ? [] : this.data.list
        })
      })
    this._loadPromise = promise
    return promise
  },

  onRetry() {
    return this.load(true)
  },

  onKindTap(e) {
    const kind = e.currentTarget && e.currentTarget.dataset.kind
    if (!KIND_KEYS.includes(kind) || kind === this.data.kind) return Promise.resolve()
    haptic('light')
    this.setData({
      kind,
      subtypeIndex: 0,
      subtypeOptions: allSubtypeOptions([]),
      dedicatedEntry: DEDICATED_ENTRIES[kind] || null
    })
    return this.load(true)
  },

  goDedicatedPage() {
    const entry = this.data.dedicatedEntry
    if (!entry || !entry.path) return
    haptic('light')
    const query = `from=${encodeURIComponent(this.data.from)}&to=${encodeURIComponent(this.data.to)}`
    wx.navigateTo({ url: `${entry.path}?${query}` })
  },

  onStaffChange(e) {
    this.setData({ staffIndex: Number(e.detail.value) || 0 })
    return this.load(true)
  },

  onSubtypeChange(e) {
    this.setData({ subtypeIndex: Number(e.detail.value) || 0 })
    return this.load(true)
  },

  updateDateRange(nextFromDate, nextToDate, changedField) {
    let fromDate = nextFromDate
    let toDate = nextToDate
    let from = dateStart(fromDate)
    let toDay = dateStart(toDate)
    if (!Number.isFinite(from) || !Number.isFinite(toDay)) return Promise.resolve()

    if (from > toDay) {
      if (changedField === 'from') {
        toDate = fromDate
        toDay = from
      } else {
        fromDate = toDate
        from = toDay
      }
    }
    const to = toDay + DAY_MS
    if (to - from > MAX_RANGE_DAYS * DAY_MS) {
      wx.showToast({ title: '单次最多查询 366 天', icon: 'none' })
      return Promise.resolve()
    }

    this.setData({
      from,
      to,
      fromDate,
      toDate,
      rangeText: formatRange(from, to)
    })
    return this.load(true)
  },

  onFromDateChange(e) {
    const value = e.detail && e.detail.value
    return this.updateDateRange(value, this.data.toDate, 'from')
  },

  onToDateChange(e) {
    const value = e.detail && e.detail.value
    return this.updateDateRange(this.data.fromDate, value, 'to')
  },

  onBusinessSummaryTap(e) {
    const subtype = String(
      (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.subtype) || ''
    )
    const subtypeIndex = this.data.subtypeOptions.findIndex((item) => item.key === subtype)
    if (subtypeIndex < 1) return Promise.resolve()
    haptic('light')
    this.setData({ subtypeIndex })
    return this.load(true)
  },

  onKeywordInput(e) {
    this.setData({ keyword: (e.detail && e.detail.value) || '' })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      this._searchTimer = null
      this.load(true)
    }, SEARCH_DELAY)
  },

  onSearchConfirm() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
      this._searchTimer = null
    }
    return this.load(true)
  },

  onResetFilters() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
      this._searchTimer = null
    }
    haptic('light')
    const initialRange = this._initialRange || {}
    const from = Number(initialRange.from) || this.data.from
    const to = Number(initialRange.to) || this.data.to
    this.setData({
      staffIndex: 0,
      subtypeIndex: 0,
      keyword: '',
      from,
      to,
      fromDate: initialRange.fromDate || this.data.fromDate,
      toDate: initialRange.toDate || this.data.toDate,
      rangeText: formatRange(from, to)
    })
    return this.load(true)
  },

  onReachBottom() {
    return this.load(false)
  },

  onExport() {
    if (this.data.exporting) return Promise.resolve()
    this.setData({ exporting: true })
    haptic('light')
    const rows = []

    const fetchPage = (page) => Promise.resolve(request.call(
      'adminOperationsLedger',
      this.query(page, EXPORT_PAGE_SIZE)
    )).then((data) => {
      rows.push(...((data && data.list) || []).map(decorateItem))
      if (data && data.hasMore && rows.length < EXPORT_LIMIT) return fetchPage(page + 1)
      return { truncated: !!(data && data.truncated), limited: rows.length >= EXPORT_LIMIT }
    })

    return fetchPage(1)
      .then((flags) => {
        const csv = buildCsv({
          kind: this.data.kind,
          rangeText: this.data.rangeText,
          rows
        })
        return new Promise((resolve, reject) => {
          wx.setClipboardData({
            data: csv,
            success: () => {
              const limited = flags.truncated || flags.limited
              wx.showToast({
                title: limited ? '已复制部分记录，请缩短日期范围' : 'CSV 已复制，可粘贴到表格',
                icon: 'none'
              })
              resolve()
            },
            fail: reject
          })
        })
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || '导出失败，请重试', icon: 'none' })
      })
      .then(() => this.setData({ exporting: false }))
  }
}

if (typeof Page === 'function') Page(pageConfig)

module.exports = {
  KINDS,
  DEDICATED_ENTRIES,
  validRange,
  dateInputValue,
  dateStart,
  formatRange,
  decorateItem,
  csvEscape,
  buildCsv,
  pageConfig
}
