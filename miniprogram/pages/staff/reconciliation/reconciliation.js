const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')
const { haptic } = require('../../../utils/haptics.js')

const DAY_MS = 24 * 60 * 60 * 1000
const MODES = [
  { key: 'daily', label: '日汇总' },
  { key: 'monthly', label: '月汇总' },
  { key: 'custom', label: '自定义汇总' }
]

function dayStart(input) {
  const value = input instanceof Date ? input : new Date(input)
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function parseDate(value) {
  const parts = String(value || '').split('-').map(Number)
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null
  const date = new Date(parts[0], parts[1] - 1, parts[2])
  if (
    date.getFullYear() !== parts[0] ||
    date.getMonth() !== parts[1] - 1 ||
    date.getDate() !== parts[2]
  ) return null
  return date
}

function initialAnchor(options, now) {
  const to = Number(options && options.to)
  const from = Number(options && options.from)
  if (Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from) {
    return dayStart(new Date(to - 1))
  }
  return dayStart(now instanceof Date ? now : new Date())
}

function dailyRange(anchor) {
  const endDay = dayStart(anchor)
  return {
    from: new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - 30).getTime(),
    to: new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 1).getTime()
  }
}

function monthlyRange(anchor) {
  const endMonth = dayStart(anchor)
  return {
    from: new Date(endMonth.getFullYear(), endMonth.getMonth() - 11, 1).getTime(),
    to: new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 1).getTime()
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

function eventDateKey(eventAt) {
  return util.formatDate(eventAt, 'YYYY-MM-DD')
}

function eventMonthKey(eventAt) {
  return util.formatDate(eventAt, 'YYYY-MM')
}

function riskCounts(anomalies, mode) {
  const counts = {}
  ;((anomalies && anomalies.list) || []).forEach((item) => {
    const key = mode === 'monthly' ? eventMonthKey(item.eventAt) : eventDateKey(item.eventAt)
    if (key) counts[key] = (counts[key] || 0) + 1
  })
  return counts
}

function periodRange(key, mode) {
  if (mode === 'monthly') {
    const parts = String(key).split('-').map(Number)
    const from = new Date(parts[0], parts[1] - 1, 1)
    return {
      from: from.getTime(),
      to: new Date(parts[0], parts[1], 1).getTime()
    }
  }
  const from = parseDate(key)
  return {
    from: from.getTime(),
    to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1).getTime()
  }
}

function amountText(value) {
  return util.fen2yuan(Number(value) || 0)
}

function decoratePeriod(row, mode, riskCount) {
  const source = row || {}
  const key = mode === 'monthly' ? source.month : source.date
  const range = periodRange(key, mode)
  const verifiedTicketCount = Number(
    source.verifiedTicketCount != null
      ? source.verifiedTicketCount
      : source.ticketVerifiedCount
  ) || 0
  const admittedPeopleCount = Number(source.admittedPeopleCount) || 0
  const lingCount = (Number(source.lingPhysicalToDigital) || 0) +
    (Number(source.lingDigitalToPhysical) || 0)
  const hasBusiness = !!(
    source.gross ||
    source.refunds ||
    source.orderIncome ||
    source.actualNetIncome ||
    source.paidCount ||
    source.refundCount ||
    verifiedTicketCount ||
    admittedPeopleCount ||
    source.memberVerificationCount ||
    lingCount
  )
  return Object.assign({}, source, range, {
    key,
    displayLabel: mode === 'monthly' ? `${key} 月账单` : `${key} 到店账单`,
    grossText: amountText(source.gross),
    refundsText: amountText(source.refunds),
    netText: amountText(source.net),
    orderIncomeText: amountText(source.orderIncome),
    actualNetIncomeText: amountText(source.actualNetIncome),
    verifiedTicketCount,
    admittedPeopleCount,
    unknownAdmissionTicketCount: Number(source.unknownAdmissionTicketCount) || 0,
    riskCount: Number(riskCount) || 0,
    hasBusiness
  })
}

function customEntry(data, range, fromText, toText) {
  const source = data || {}
  const finance = source.finance || {}
  const operations = source.operations || {}
  return Object.assign(
    decoratePeriod(Object.assign({}, finance, operations, { date: fromText }), 'daily', source.anomalies && source.anomalies.total),
    {
      key: `${fromText}_${toText}`,
      displayLabel: fromText === toText ? `${fromText} 自定义账单` : `${fromText} 至 ${toText}`,
      from: range.from,
      to: range.to
    }
  )
}

const pageConfig = {
  data: {
    modes: MODES,
    mode: 'daily',
    range: null,
    focusDate: '',
    focusMonth: '',
    customFrom: '',
    customTo: '',
    hideEmpty: true,
    allEntries: [],
    entries: [],
    loaded: false,
    loading: false,
    denied: false,
    hasError: false,
    truncated: false,
    updatedAtText: ''
  },

  onLoad(options) {
    const anchor = initialAnchor(options)
    const dateText = util.formatDate(anchor, 'YYYY-MM-DD')
    this.setData({
      focusDate: dateText,
      focusMonth: util.formatDate(anchor, 'YYYY-MM'),
      customFrom: dateText,
      customTo: dateText,
      range: dailyRange(anchor)
    })
    return this.load()
  },

  onPullDownRefresh() {
    return this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    const range = this.data.range
    if (!range) return Promise.resolve()
    this.setData({ loading: true, hasError: false, denied: false })
    return request.call('adminOperationsLedger', {
      action: 'summary',
      from: range.from,
      to: range.to
    })
      .then((data) => {
        const mode = this.data.mode
        let allEntries
        if (mode === 'custom') {
          allEntries = [customEntry(data, range, this.data.customFrom, this.data.customTo)]
        } else {
          const risks = riskCounts(data && data.anomalies, mode)
          const rows = data && data.reconciliation && data.reconciliation[mode]
          allEntries = (rows || [])
            .map((row) => {
              const key = mode === 'monthly' ? row.month : row.date
              return decoratePeriod(row, mode, risks[key])
            })
            .sort((a, b) => b.from - a.from)
        }
        this.setData({
          loaded: true,
          loading: false,
          denied: false,
          hasError: false,
          truncated: !!(data && data.truncated),
          updatedAtText: util.formatDate(data && data.updatedAt, 'MM-DD HH:mm'),
          allEntries,
          entries: this.data.hideEmpty ? allEntries.filter((item) => item.hasBusiness) : allEntries
        })
      })
      .catch((error) => {
        const denied = !!error && error.code === 403
        this.setData({
          loaded: true,
          loading: false,
          denied,
          hasError: !denied,
          allEntries: [],
          entries: []
        })
      })
  },

  onRetry() {
    return this.load()
  },

  onModeTap(e) {
    const mode = e.currentTarget && e.currentTarget.dataset.mode
    if (!MODES.some((item) => item.key === mode) || mode === this.data.mode) {
      return Promise.resolve()
    }
    haptic('light')
    if (mode === 'custom') {
      this.setData({ mode, allEntries: [], entries: [], hasError: false })
      return Promise.resolve()
    }
    const anchor = mode === 'monthly'
      ? parseDate(`${this.data.focusMonth}-01`)
      : parseDate(this.data.focusDate)
    this.setData({
      mode,
      range: mode === 'monthly' ? monthlyRange(anchor) : dailyRange(anchor),
      allEntries: [],
      entries: []
    })
    return this.load()
  },

  onFocusDateChange(e) {
    const focusDate = e.detail.value
    this.setData({ focusDate, range: dailyRange(parseDate(focusDate)) })
    return this.load()
  },

  onFocusMonthChange(e) {
    const focusMonth = e.detail.value
    this.setData({
      focusMonth,
      range: monthlyRange(parseDate(`${focusMonth}-01`))
    })
    return this.load()
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
    this.setData({
      mode: 'custom',
      range: { from: result.from, to: result.to },
      allEntries: [],
      entries: []
    })
    return this.load()
  },

  onToggleEmpty() {
    const hideEmpty = !this.data.hideEmpty
    this.setData({
      hideEmpty,
      entries: hideEmpty
        ? this.data.allEntries.filter((item) => item.hasBusiness)
        : this.data.allEntries.slice()
    })
  },

  onEntryTap(e) {
    const index = Number(e.currentTarget && e.currentTarget.dataset.index)
    const entry = this.data.entries[index]
    if (!entry) return
    haptic('light')
    wx.navigateTo({
      url: '/pages/staff/bill-detail/bill-detail' +
        `?from=${encodeURIComponent(entry.from)}&to=${encodeURIComponent(entry.to)}`
    })
  }
}

if (typeof Page === 'function') Page(pageConfig)

module.exports = {
  DAY_MS,
  MODES,
  parseDate,
  initialAnchor,
  dailyRange,
  monthlyRange,
  customRange,
  decoratePeriod,
  customEntry,
  pageConfig
}
