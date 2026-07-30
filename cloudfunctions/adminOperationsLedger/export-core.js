const DATASET_ORDER = [
  'funds_summary',
  'payment_details',
  'refund_details',
  'verification_summary',
  'verification_details',
  'ticket_breakdown',
  'business_summary',
  'business_details'
]

const EVENT_FIELDS = [
  { key: 'eventAt', label: '发生时间', required: true, width: 20 },
  { key: 'reference', label: '业务编号', required: true, width: 22 },
  { key: 'secondaryReference', label: '关联编号', width: 22 },
  { key: 'subtypeLabel', label: '业务类型', width: 18 },
  { key: 'title', label: '项目名称', width: 24 },
  { key: 'amount', label: '金额（元）', width: 14, numFmt: '¥0.00' },
  { key: 'quantity', label: '数量', width: 12 },
  { key: 'ticketCount', label: '核销票数', width: 12 },
  { key: 'admissionCount', label: '实际人数', width: 12 },
  { key: 'admissionStatus', label: '人数状态', width: 14 },
  { key: 'staffName', label: '经办员工', width: 14 },
  { key: 'phoneTail', label: '手机尾号', width: 12 },
  { key: 'definition', label: '统计口径', required: true, width: 34 }
]

const VERIFICATION_FIELDS = EVENT_FIELDS.map((field) => (
  field.key === 'amount'
    ? Object.assign({}, field, { label: '实际净收入（元）', width: 18 })
    : field
))

const DEFINITIONS = {
  funds_summary: {
    name: '收入与资金汇总',
    definition: '订单收入为已支付未核销票款；实际净收入按核销确认；支付和退款按资金发生时间统计',
    fields: [
      { key: 'date', label: '日期', required: true, width: 14 },
      { key: 'orderIncome', label: '订单收入（元）', width: 18, numFmt: '¥0.00' },
      { key: 'actualNetIncome', label: '实际净收入（元）', width: 18, numFmt: '¥0.00' },
      { key: 'gross', label: '支付金额（元）', width: 16, numFmt: '¥0.00' },
      { key: 'refunds', label: '退款金额（元）', width: 16, numFmt: '¥0.00' },
      { key: 'net', label: '资金流水净额（元）', width: 20, numFmt: '¥0.00' },
      { key: 'orderIncomeCount', label: '未核销订单', width: 14 },
      { key: 'paidCount', label: '支付订单', width: 12 },
      { key: 'refundCount', label: '退款笔数', width: 12 },
      { key: 'definition', label: '统计口径', required: true, width: 34 }
    ],
    defaults: [
      'orderIncome',
      'actualNetIncome',
      'gross',
      'refunds',
      'net',
      'orderIncomeCount',
      'paidCount',
      'refundCount'
    ]
  },
  payment_details: {
    name: '支付明细',
    definition: '按订单支付成功时间统计实际收款',
    fields: EVENT_FIELDS,
    defaults: ['secondaryReference', 'subtypeLabel', 'title', 'amount', 'staffName', 'phoneTail']
  },
  refund_details: {
    name: '退款明细',
    definition: '按门票或会员卡实际退款时间统计',
    fields: EVENT_FIELDS,
    defaults: ['secondaryReference', 'subtypeLabel', 'title', 'amount', 'staffName', 'phoneTail']
  },
  verification_summary: {
    name: '核销汇总',
    definition: '按门票核销时间统计履约数据',
    fields: [
      { key: 'date', label: '日期', required: true, width: 14 },
      { key: 'ticketCount', label: '核销票数', width: 12 },
      { key: 'admissionCount', label: '实际人数', width: 12 },
      { key: 'unknownTicketCount', label: '待核对票数', width: 14 },
      { key: 'faceValue', label: '实际净收入（元）', width: 20, numFmt: '¥0.00' },
      { key: 'relatedOrderCount', label: '关联订单', width: 12 },
      { key: 'definition', label: '统计口径', required: true, width: 34 }
    ],
    defaults: [
      'ticketCount',
      'admissionCount',
      'unknownTicketCount',
      'faceValue',
      'relatedOrderCount'
    ]
  },
  verification_details: {
    name: '核销明细',
    definition: '按门票核销时间统计；核销票数与实际人数分别记录',
    fields: VERIFICATION_FIELDS,
    defaults: [
      'secondaryReference',
      'subtypeLabel',
      'title',
      'ticketCount',
      'admissionCount',
      'admissionStatus',
      'amount',
      'staffName',
      'phoneTail'
    ]
  },
  ticket_breakdown: {
    name: '票种统计',
    definition: '按票种汇总所选日期范围内的门票核销',
    fields: [
      { key: 'subtypeLabel', label: '票种', required: true, width: 24 },
      { key: 'ticketCount', label: '核销票数', width: 12 },
      { key: 'admissionCount', label: '实际人数', width: 12 },
      { key: 'unknownTicketCount', label: '待核对票数', width: 14 },
      { key: 'faceValue', label: '实际净收入（元）', width: 20, numFmt: '¥0.00' },
      { key: 'priceMissingCount', label: '票价缺失票数', width: 16 },
      { key: 'definition', label: '统计口径', required: true, width: 34 }
    ],
    defaults: [
      'ticketCount',
      'admissionCount',
      'unknownTicketCount',
      'faceValue',
      'priceMissingCount'
    ]
  },
  business_summary: {
    name: '业务汇总',
    definition: '按兑换或会员卡发放发生时间汇总业务数据',
    fields: [
      { key: 'subtypeLabel', label: '业务类型', required: true, width: 20 },
      { key: 'recordCount', label: '记录数', width: 12 },
      { key: 'quantity', label: '长河令数量', width: 14 },
      { key: 'definition', label: '统计口径', required: true, width: 34 }
    ],
    defaults: ['recordCount', 'quantity']
  },
  business_details: {
    name: '业务明细',
    definition: '按实体兑电子、电子兑实体或会员卡兑换发生时间统计',
    fields: EVENT_FIELDS,
    defaults: ['subtypeLabel', 'title', 'quantity', 'staffName']
  }
}

function exportError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)))
}

function normalizeSelection(input) {
  const source = input || {}
  const datasets = uniqueStrings(source.datasets)
  if (!datasets.length) throw exportError('INVALID_EXPORT_SELECTION', '请至少选择一种导出数据')
  datasets.forEach((key) => {
    if (!DEFINITIONS[key]) throw exportError('INVALID_EXPORT_SELECTION', `不支持的数据类型：${key}`)
  })

  const fields = {}
  datasets.forEach((key) => {
    const definition = DEFINITIONS[key]
    const allowed = new Set(definition.fields.map((field) => field.key))
    const requested = source.fields && Array.isArray(source.fields[key])
      ? uniqueStrings(source.fields[key])
      : definition.defaults.slice()
    requested.forEach((field) => {
      if (!allowed.has(field)) {
        throw exportError('INVALID_EXPORT_SELECTION', `不支持的导出字段：${key}.${field}`)
      }
    })
    const selected = new Set(requested)
    fields[key] = definition.fields
      .filter((field) => field.required || selected.has(field.key))
      .map((field) => field.key)
  })

  return {
    datasets: DATASET_ORDER.filter((key) => datasets.includes(key)),
    fields
  }
}

function fenToYuan(value) {
  return Number((Math.max(0, Math.round(Number(value) || 0)) / 100).toFixed(2))
}

function toMillis(value) {
  if (value instanceof Date) return value.getTime()
  const time = typeof value === 'number' ? value : new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function beijingParts(value) {
  const date = new Date(toMillis(value) + 8 * 60 * 60 * 1000)
  const pad = (part) => String(part).padStart(2, '0')
  return {
    date: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  }
}

function beijingDate(value) {
  return beijingParts(value).date
}

function beijingDateTime(value) {
  const parts = beijingParts(value)
  return `${parts.date} ${parts.time}`
}

function compactDate(value) {
  return beijingDate(value).replace(/-/g, '')
}

function eventSource(event, definition) {
  const ticketCount = Number(event.ticketCount || event.quantity) || 0
  return {
    eventAt: beijingDateTime(event.eventAt),
    reference: event.reference || '',
    secondaryReference: event.secondaryReference || '',
    subtypeLabel: event.subtypeLabel || '',
    title: event.title || '',
    amount: fenToYuan(event.amount),
    quantity: Number(event.quantity) || 0,
    ticketCount,
    admissionCount: Number(event.admissionCount) || 0,
    admissionStatus: event.admissionCountUnknown ? '待核对' : '已确认',
    staffName: event.staffName || '未记录',
    phoneTail: String(event.phoneTail || '').slice(-4),
    definition
  }
}

function selectColumns(dataset, selectedFields) {
  const definition = DEFINITIONS[dataset]
  const selected = new Set(selectedFields)
  return definition.fields
    .filter((field) => selected.has(field.key))
    .map((field) => ({
      key: field.label,
      label: field.label,
      width: field.width,
      numFmt: field.numFmt || ''
    }))
}

function selectRow(dataset, selectedFields, source) {
  const definition = DEFINITIONS[dataset]
  const labels = new Map(definition.fields.map((field) => [field.key, field.label]))
  const row = {}
  selectedFields.forEach((key) => {
    row[labels.get(key)] = source[key] == null ? '' : source[key]
  })
  return row
}

function groupVerificationByDay(events, definition) {
  const map = new Map()
  events.forEach((event) => {
    const date = beijingDate(event.eventAt)
    if (!map.has(date)) {
      map.set(date, {
        date,
        ticketCount: 0,
        admissionCount: 0,
        unknownTicketCount: 0,
        faceValue: 0,
        orders: new Set(),
        definition
      })
    }
    const row = map.get(date)
    const ticketCount = Number(event.ticketCount || event.quantity) || 1
    row.ticketCount += ticketCount
    row.admissionCount += Number(event.admissionCount) || 0
    if (event.admissionCountUnknown) row.unknownTicketCount += ticketCount
    row.faceValue += fenToYuan(event.amount)
    if (event.orderTradeNo) row.orders.add(event.orderTradeNo)
  })
  return Array.from(map.values())
    .map((row) => Object.assign({}, row, { relatedOrderCount: row.orders.size, orders: undefined }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

function datasetRows(key, report, events) {
  const definition = DEFINITIONS[key].definition
  const funds = (events || []).filter((event) => event.kind === 'funds')
  const tickets = (events || []).filter((event) => event.kind === 'ticket_verifications')
  const business = (events || []).filter((event) => event.kind === 'business_data')

  if (key === 'funds_summary') {
    const daily = (report && report.reconciliation && report.reconciliation.daily) ||
      (report && report.daily) || []
    return daily.map((row) => ({
      date: row.date,
      orderIncome: fenToYuan(row.orderIncome),
      actualNetIncome: fenToYuan(row.actualNetIncome),
      gross: fenToYuan(row.gross),
      refunds: fenToYuan(row.refunds),
      net: fenToYuan(row.net),
      orderIncomeCount: Number(row.orderIncomeCount) || 0,
      paidCount: Number(row.paidCount) || 0,
      refundCount: Number(row.refundCount) || 0,
      definition
    }))
  }
  if (key === 'payment_details') {
    return funds
      .filter((event) => event.eventKind === 'payment')
      .map((event) => eventSource(event, definition))
  }
  if (key === 'refund_details') {
    return funds
      .filter((event) => event.eventKind === 'refund')
      .map((event) => eventSource(event, definition))
  }
  if (key === 'verification_summary') {
    return groupVerificationByDay(tickets, definition)
  }
  if (key === 'verification_details') {
    return tickets.map((event) => eventSource(event, definition))
  }
  if (key === 'ticket_breakdown') {
    return ((report && report.ticketBreakdown) || []).map((row) => ({
      subtypeLabel: row.label || '',
      ticketCount: Number(row.ticketCount || row.count) || 0,
      admissionCount: Number(row.admissionCount) || 0,
      unknownTicketCount: Number(row.unknownAdmissionTicketCount) || 0,
      faceValue: fenToYuan(row.faceValue),
      priceMissingCount: Number(row.priceMissingCount) || 0,
      definition
    }))
  }
  if (key === 'business_summary') {
    const rows = (report && report.operations && report.operations.businessBreakdown) || []
    return rows.map((row) => ({
      subtypeLabel: row.label || '',
      recordCount: Number(row.count) || 0,
      quantity: Number(row.quantity) || 0,
      definition
    }))
  }
  if (key === 'business_details') {
    return business.map((event) => eventSource(event, definition))
  }
  return []
}

function notesSheet(input, selection) {
  const range = input.range || {}
  const exportedAt = input.exportedAt || new Date()
  const datasetNames = selection.datasets.map((key) => DEFINITIONS[key].name)
  const rows = [
    { 项目: '文件用途', 内容: '森水长河小程序经营数据导出' },
    { 项目: '导出人', 内容: String(input.exportedBy || '管理员').slice(0, 32) },
    { 项目: '导出时间', 内容: beijingDateTime(exportedAt) },
    { 项目: '数据范围', 内容: `${beijingDate(range.from)} 至 ${beijingDate(range.to - 1)}` },
    { 项目: '工作表', 内容: datasetNames.join('、') },
    { 项目: '订单收入口径', 内容: '订单收入为已支付、尚未核销且未退款的有效门票金额' },
    { 项目: '实际净收入口径', 内容: '实际净收入按门票核销时间确认，与已核销票面金额是同一个指标' },
    { 项目: '资金流水口径', 内容: '支付金额、退款金额和资金流水净额按支付或退款实际发生时间统计' },
    { 项目: '业务口径', 内容: '实体兑电子、电子兑实体与会员卡兑换按业务实际发生时间统计' },
    { 项目: '隐私说明', 内容: '不导出 openid；手机号仅保留后四位' },
    { 项目: '完整性', 内容: '服务端已完成数据上限检查；本文件未截断' }
  ]
  return {
    key: 'export_notes',
    name: '导出说明',
    columns: [
      { key: '项目', label: '项目', width: 18 },
      { key: '内容', label: '内容', width: 72 }
    ],
    rows
  }
}

function buildExportPlan(input) {
  const source = input || {}
  if (source.truncated || (source.report && source.report.truncated)) {
    throw exportError('EXPORT_TRUNCATED', '数据量超过导出上限，请缩短日期范围后重试')
  }
  const selection = normalizeSelection(source.selection)
  const range = source.range || {}
  if (!Number.isFinite(Number(range.from)) || !Number.isFinite(Number(range.to))) {
    throw exportError('INVALID_EXPORT_RANGE', '请选择完整的导出日期')
  }
  const sheets = [notesSheet(source, selection)]
  selection.datasets.forEach((key) => {
    const selectedFields = selection.fields[key]
    const rows = datasetRows(key, source.report || {}, source.events || [])
      .map((row) => selectRow(key, selectedFields, row))
    sheets.push({
      key,
      name: DEFINITIONS[key].name,
      columns: selectColumns(key, selectedFields),
      rows
    })
  })
  return {
    fileName: `森水长河-经营数据-${compactDate(range.from)}-${compactDate(range.to - 1)}.xlsx`,
    sheets
  }
}

function publicCatalog() {
  return DATASET_ORDER.map((key) => {
    const definition = DEFINITIONS[key]
    return {
      key,
      name: definition.name,
      fields: definition.fields.map((field) => ({
        key: field.key,
        label: field.label,
        required: !!field.required,
        defaultSelected: !!field.required || definition.defaults.includes(field.key)
      }))
    }
  })
}

module.exports = {
  DATASET_ORDER,
  DEFINITIONS,
  normalizeSelection,
  buildExportPlan,
  publicCatalog
}
