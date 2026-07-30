const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')
const { haptic } = require('../../../utils/haptics.js')

const EVENT_FIELDS = [
  ['eventAt', '发生时间', true],
  ['reference', '业务编号', true],
  ['secondaryReference', '关联编号'],
  ['subtypeLabel', '业务类型'],
  ['title', '项目名称'],
  ['amount', '金额'],
  ['quantity', '数量'],
  ['ticketCount', '核销票数'],
  ['admissionCount', '实际人数'],
  ['admissionStatus', '人数状态'],
  ['staffName', '经办员工'],
  ['phoneTail', '手机尾号'],
  ['definition', '统计口径', true]
]

function fields(items, selectedKeys) {
  const selected = new Set(selectedKeys || [])
  return items.map((item) => ({
    key: item[0],
    label: item[1],
    required: !!item[2],
    selected: !!item[2] || selected.has(item[0])
  }))
}

function eventFields(selectedKeys, amountLabel) {
  return fields(EVENT_FIELDS.map((item) => (
    item[0] === 'amount' && amountLabel
      ? [item[0], amountLabel, item[2]]
      : item
  )), selectedKeys)
}

function makeDatasets() {
  return [
    {
      key: 'funds_summary',
      label: '收入与资金汇总',
      desc: '订单收入、实际净收入及支付退款流水',
      selected: true,
      fields: fields([
        ['date', '日期', true],
        ['orderIncome', '订单收入'],
        ['actualNetIncome', '实际净收入'],
        ['gross', '支付金额'],
        ['refunds', '退款金额'],
        ['net', '资金流水净额'],
        ['orderIncomeCount', '未核销订单'],
        ['paidCount', '支付订单'],
        ['refundCount', '退款笔数'],
        ['definition', '统计口径', true]
      ], [
        'orderIncome',
        'actualNetIncome',
        'gross',
        'refunds',
        'net',
        'orderIncomeCount',
        'paidCount',
        'refundCount'
      ])
    },
    {
      key: 'payment_details',
      label: '支付明细',
      desc: '按支付成功时间记录订单收款',
      selected: false,
      fields: eventFields([
        'secondaryReference',
        'subtypeLabel',
        'title',
        'amount',
        'staffName',
        'phoneTail'
      ])
    },
    {
      key: 'refund_details',
      label: '退款明细',
      desc: '按退款发生时间记录退款',
      selected: false,
      fields: eventFields([
        'secondaryReference',
        'subtypeLabel',
        'title',
        'amount',
        'staffName',
        'phoneTail'
      ])
    },
    {
      key: 'verification_summary',
      label: '核销汇总',
      desc: '按日期汇总实际净收入、票数与人数',
      selected: true,
      fields: fields([
        ['date', '日期', true],
        ['ticketCount', '核销票数'],
        ['admissionCount', '实际人数'],
        ['unknownTicketCount', '待核对票数'],
        ['faceValue', '实际净收入'],
        ['relatedOrderCount', '关联订单'],
        ['definition', '统计口径', true]
      ], [
        'ticketCount',
        'admissionCount',
        'unknownTicketCount',
        'faceValue',
        'relatedOrderCount'
      ])
    },
    {
      key: 'verification_details',
      label: '核销明细',
      desc: '逐笔核销记录，票数与实际人数分列',
      selected: true,
      fields: eventFields([
        'secondaryReference',
        'subtypeLabel',
        'title',
        'ticketCount',
        'admissionCount',
        'admissionStatus',
        'amount',
        'staffName',
        'phoneTail'
      ], '实际净收入')
    },
    {
      key: 'ticket_breakdown',
      label: '票种统计',
      desc: '按票种汇总核销票数、人数与收入',
      selected: true,
      fields: fields([
        ['subtypeLabel', '票种', true],
        ['ticketCount', '核销票数'],
        ['admissionCount', '实际人数'],
        ['unknownTicketCount', '待核对票数'],
        ['faceValue', '实际净收入'],
        ['priceMissingCount', '票价缺失票数'],
        ['definition', '统计口径', true]
      ], [
        'ticketCount',
        'admissionCount',
        'unknownTicketCount',
        'faceValue',
        'priceMissingCount'
      ])
    },
    {
      key: 'business_summary',
      label: '业务汇总',
      desc: '长河令及会员卡兑换汇总',
      selected: false,
      fields: fields([
        ['subtypeLabel', '业务类型', true],
        ['recordCount', '记录数'],
        ['quantity', '长河令数量'],
        ['definition', '统计口径', true]
      ], ['recordCount', 'quantity'])
    },
    {
      key: 'business_details',
      label: '业务明细',
      desc: '实体兑电子、电子兑实体及会员卡兑换',
      selected: false,
      fields: eventFields(['subtypeLabel', 'title', 'quantity', 'staffName'])
    }
  ]
}

function startOfDay(input) {
  const date = input instanceof Date ? input : new Date(input)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function todayRange(now) {
  const from = startOfDay(now || new Date())
  return { from, to: from + 24 * 60 * 60 * 1000 }
}

function monthRange(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now())
  return {
    from: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
    to: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
  }
}

function formatRange(range) {
  if (!range) return ''
  const inclusiveTo = Math.max(range.from, range.to - 1)
  const from = util.formatDate(range.from)
  const to = util.formatDate(inclusiveTo)
  return from === to ? from : `${from} 至 ${to}`
}

function promiseDownload(fileID) {
  return new Promise((resolve, reject) => {
    wx.cloud.downloadFile({
      fileID,
      success: resolve,
      fail: reject
    })
  })
}

function promiseOpen(filePath) {
  return new Promise((resolve, reject) => {
    wx.openDocument({
      filePath,
      fileType: 'xlsx',
      showMenu: true,
      success: resolve,
      fail: reject
    })
  })
}

const initialRange = todayRange()
const pageConfig = {
  data: {
    modes: [
      { key: 'today', label: '今天' },
      { key: 'month', label: '本月' },
      { key: 'custom', label: '自定义' }
    ],
    mode: 'today',
    range: initialRange,
    rangeText: formatRange(initialRange),
    customFrom: util.formatDate(initialRange.from),
    customTo: util.formatDate(initialRange.to - 1),
    datasets: makeDatasets(),
    exporting: false
  },

  onLoad(options) {
    const from = Number(options && options.from)
    const to = Number(options && options.to)
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
      const range = { from, to }
      this.setData({
        mode: 'custom',
        range,
        rangeText: formatRange(range),
        customFrom: util.formatDate(from),
        customTo: util.formatDate(to - 1)
      })
    }
    return Promise.resolve()
  },

  onModeTap(event) {
    const mode = event.currentTarget.dataset.mode
    if (mode === 'custom') {
      this.setData({ mode })
      return
    }
    const range = mode === 'month' ? monthRange() : todayRange()
    haptic('light')
    this.setData({
      mode,
      range,
      rangeText: formatRange(range),
      customFrom: util.formatDate(range.from),
      customTo: util.formatDate(range.to - 1)
    })
  },

  onCustomFromChange(event) {
    this.setData({ customFrom: event.detail.value })
  },

  onCustomToChange(event) {
    this.setData({ customTo: event.detail.value })
  },

  onCustomQuery() {
    const from = startOfDay(`${this.data.customFrom}T00:00:00`)
    const inclusiveTo = startOfDay(`${this.data.customTo}T00:00:00`)
    const to = inclusiveTo + 24 * 60 * 60 * 1000
    if (!from || !inclusiveTo || to <= from) {
      wx.showToast({ title: '请选择有效日期范围', icon: 'none' })
      return false
    }
    if (to - from > 366 * 24 * 60 * 60 * 1000) {
      wx.showToast({ title: '单次最多导出 366 天', icon: 'none' })
      return false
    }
    const range = { from, to }
    this.setData({ range, rangeText: formatRange(range) })
    return true
  },

  onDatasetToggle(event) {
    const key = event.currentTarget.dataset.key
    const datasets = this.data.datasets.map((item) => Object.assign({}, item))
    const target = datasets.find((item) => item.key === key)
    if (!target) return
    if (target.selected && datasets.filter((item) => item.selected).length === 1) {
      wx.showToast({ title: '至少选择一种数据', icon: 'none' })
      return
    }
    target.selected = !target.selected
    haptic('selection')
    this.setData({ datasets })
  },

  onFieldToggle(event) {
    const datasetKey = event.currentTarget.dataset.dataset
    const fieldKey = event.currentTarget.dataset.field
    const datasets = this.data.datasets.map((item) => Object.assign({}, item, {
      fields: item.fields.map((field) => Object.assign({}, field))
    }))
    const dataset = datasets.find((item) => item.key === datasetKey)
    const field = dataset && dataset.fields.find((item) => item.key === fieldKey)
    if (!field) return
    if (field.required) {
      wx.showToast({ title: '该字段为审计必需项', icon: 'none' })
      return
    }
    field.selected = !field.selected
    haptic('selection')
    this.setData({ datasets })
  },

  buildSelection() {
    const selected = this.data.datasets.filter((item) => item.selected)
    const fieldsByDataset = {}
    selected.forEach((dataset) => {
      fieldsByDataset[dataset.key] = dataset.fields
        .filter((field) => field.selected)
        .map((field) => field.key)
    })
    return {
      datasets: selected.map((item) => item.key),
      fields: fieldsByDataset
    }
  },

  onExport() {
    if (this.data.exporting) return Promise.resolve()
    if (this.data.mode === 'custom' && !this.onCustomQuery()) return Promise.resolve()
    const selection = this.buildSelection()
    const range = this.data.range
    this.setData({ exporting: true })
    haptic('medium')
    return request.call('adminOperationsLedger', {
      action: 'export',
      from: range.from,
      to: range.to,
      datasets: selection.datasets,
      fields: selection.fields
    })
      .then((result) => {
        if (!result || !result.fileId) throw new Error('导出文件生成失败')
        return promiseDownload(result.fileId)
      })
      .then((download) => promiseOpen(download.tempFilePath))
      .then(() => {
        wx.showToast({ title: 'Excel 已生成', icon: 'success' })
        this.setData({ exporting: false })
      })
      .catch((error) => {
        this.setData({ exporting: false })
        wx.showToast({
          title: (error && error.message) || '导出失败，请重试',
          icon: 'none'
        })
      })
  }
}

if (typeof Page === 'function') Page(pageConfig)

module.exports = {
  makeDatasets,
  todayRange,
  monthRange,
  formatRange,
  pageConfig
}
