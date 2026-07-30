const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 366
const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 100

const INCOME_LABELS = {
  member_card: '会员卡',
  ticket_order: '门票',
  ticket_upgrade: '补差价'
}

const BENEFIT_LABELS = {
  ling: '会员长河令发放',
  birthday: '生日 85 折'
}

const LING_LABELS = {
  physical_to_digital: '实体转电子',
  digital_to_physical: '电子兑实体'
}

const BUSINESS_LABELS = {
  physical_to_digital: '实体兑电子',
  digital_to_physical: '电子兑实体',
  member_card_exchange: '会员卡兑换'
}

const INVOICE_STATUS_LABELS = {
  submitted: '申请已提交',
  reviewing: '商家审核中',
  issued: '已开票',
  rejected: '已驳回',
  cancelled_refund: '已因退款关闭'
}

const KNOWN_SINGLE_SKUS = [
  'creek_single',
  'creek_child',
  'camp_adult',
  'camp_child',
  'camp_senior',
  'combo_single'
]

function toMillis(value) {
  if (value instanceof Date) return value.getTime()
  if (value && typeof value.getTime === 'function') return value.getTime()
  const millis = typeof value === 'number' ? value : new Date(value).getTime()
  return Number.isFinite(millis) ? millis : 0
}

function validateRange(input) {
  const from = Number(input && input.from)
  const to = Number(input && input.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { ok: false, msg: '请选择完整的查询时间' }
  }
  if (from >= to) return { ok: false, msg: '结束时间必须晚于开始时间' }
  if (to - from > MAX_RANGE_DAYS * DAY_MS) {
    return { ok: false, msg: '单次查询最多支持 366 天' }
  }
  return { ok: true, from, to }
}

function inRange(value, range) {
  const time = toMillis(value)
  return time >= range.from && time < range.to
}

function beijingDate(value) {
  const d = new Date(toMillis(value) + 8 * 60 * 60 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength || 80)
}

function phoneTail(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : ''
}

function maskName(value) {
  const name = cleanText(value, 20)
  return name ? name.slice(0, 1) + '**' : ''
}

function resolveAdmissionSnapshot(row) {
  const value = Number(row && row.admissionCount)
  if (Number.isInteger(value) && value >= 1 && value <= 20) {
    return { count: value, unknown: false }
  }
  const ticketCount = Math.max(1, Math.round(Number(row && row.ticketCount) || 1))
  // 旧数据可能在票种规则上线前写入了 unknown=true。已知 SKU 的确定规则
  // 优先级高于旧标记，避免儿童票显示 1 张 / 0 人、双人票显示 1 张 / 0 人。
  if (row && row.sku === 'creek_double') return { count: ticketCount * 2, unknown: false }
  if (row && KNOWN_SINGLE_SKUS.indexOf(row.sku) >= 0) {
    return { count: ticketCount, unknown: false }
  }
  if (row && row.admissionCountUnknown === true) return { count: 0, unknown: true }
  return { count: 0, unknown: true }
}

function orderAmount(order) {
  const value = Number(order && (order.amount != null ? order.amount : order.totalFee))
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function eventBase(input) {
  const time = toMillis(input.eventAt)
  const tail = phoneTail(input.phone)
  const values = [
    input.title,
    input.reference,
    input.secondaryReference,
    input.staffName,
    input.subtypeLabel,
    tail
  ]
  return {
    kind: input.kind,
    eventKind: input.eventKind || '',
    subtype: cleanText(input.subtype, 40),
    subtypeLabel: cleanText(input.subtypeLabel, 40),
    title: cleanText(input.title, 80),
    reference: cleanText(input.reference, 48),
    secondaryReference: cleanText(input.secondaryReference, 48),
    amount: Math.max(0, Math.round(Number(input.amount) || 0)),
    quantity: Math.max(0, Math.round(Number(input.quantity) || 0)),
    ticketCount: Math.max(0, Math.round(Number(input.ticketCount) || 0)),
    orderIncomeAmount: Math.max(0, Math.round(Number(input.orderIncomeAmount) || 0)),
    orderIncomeTicketCount: Math.max(
      0,
      Math.round(Number(input.orderIncomeTicketCount) || 0)
    ),
    admissionCount: Math.max(0, Math.round(Number(input.admissionCount) || 0)),
    admissionCountUnknown: !!input.admissionCountUnknown,
    orderTradeNo: cleanText(input.orderTradeNo, 48),
    orderExists: typeof input.orderExists === 'boolean' ? input.orderExists : null,
    refundStatus: cleanText(input.refundStatus, 32),
    refundedAfterVerification: !!input.refundedAfterVerification,
    status: cleanText(input.status, 32),
    staffOpenid: cleanText(input.staffOpenid, 80),
    staffName: cleanText(input.staffName, 32) || '未记录',
    phoneTail: tail,
    eventTime: time,
    eventAt: time ? new Date(time).toISOString() : '',
    priceMissing: !!input.priceMissing,
    searchText: values.map((x) => cleanText(x, 100).toLowerCase()).join(' ')
  }
}

function buildPaymentEvents(orders, range) {
  return (orders || [])
    .filter((order) => order && order.paidAt && inRange(order.paidAt, range))
    .map((order) => {
      const subtype = cleanText(order.type, 40) || 'other'
      const title = order.productName || order.itemLabel || INCOME_LABELS[subtype] || '其他收入'
      return eventBase({
        kind: 'funds',
        eventKind: 'payment',
        subtype,
        subtypeLabel: INCOME_LABELS[subtype] || '其他收入',
        title,
        reference: order.outTradeNo,
        amount: orderAmount(order),
        orderIncomeAmount: order.type === 'ticket_order' ? order.unverifiedAmount : 0,
        orderIncomeTicketCount: order.type === 'ticket_order'
          ? order.unverifiedTicketCount
          : 0,
        status: order.status,
        staffOpenid: order.staffOpenid,
        staffName: order.staffName,
        phone: order.contact && order.contact.phone,
        eventAt: order.paidAt
      })
    })
}

function buildTicketRefundEvents(tickets, range) {
  return (tickets || [])
    .filter((ticket) => ticket && ticket.refundedAt && inRange(ticket.refundedAt, range))
    .map((ticket) => eventBase({
      kind: 'funds',
      eventKind: 'refund',
      subtype: 'ticket_refund',
      subtypeLabel: '门票退款',
      title: ticket.productName || '门票退款',
      reference: ticket.ticketNo,
      secondaryReference: ticket.orderId,
      amount: ticket.unitPrice,
      phone: ticket.contact && ticket.contact.phone,
      eventAt: ticket.refundedAt
    }))
}

function buildMemberRefundEvents(members, range) {
  return (members || [])
    .filter((member) => member && member.refundedAt && inRange(member.refundedAt, range))
    .map((member) => eventBase({
      kind: 'funds',
      eventKind: 'refund',
      subtype: 'member_refund',
      subtypeLabel: '会员卡退款',
      title: '会员卡退款',
      reference: member.memberCode,
      secondaryReference: member.orderId,
      amount: member.refundAmount,
      eventAt: member.refundedAt
    }))
}

function buildTicketVerificationEvents(tickets, legacy, range) {
  const current = (tickets || [])
    .filter((ticket) => ticket && ticket.usedAt && inRange(ticket.usedAt, range))
    .map((ticket) => {
      const admission = resolveAdmissionSnapshot(ticket)
      return eventBase({
        kind: 'ticket_verifications',
        eventKind: 'ticket_verification',
        subtype: ticket.sku || 'ticket',
        subtypeLabel: ticket.productName || '门票',
        title: ticket.productName || '门票核销',
        reference: ticket.ticketNo,
        secondaryReference: ticket.orderId,
        orderTradeNo: ticket.orderId,
        orderExists: ticket.orderExists,
        amount: ticket.unitPrice,
        quantity: 1,
        ticketCount: 1,
        admissionCount: admission.count,
        admissionCountUnknown: admission.unknown,
        status: ticket.status,
        refundStatus: ticket.refundedAt ? (ticket.status || 'refunded') : '',
        refundedAfterVerification: !!ticket.refundedAt,
        staffOpenid: ticket.verifiedBy || ticket.staffOpenid,
        staffName: ticket.staffName,
        phone: ticket.contact && ticket.contact.phone,
        eventAt: ticket.usedAt,
        priceMissing: !(Number(ticket.unitPrice) > 0)
      })
    })

  const historical = (legacy || [])
    .filter((row) => row && row.type === 'creek_ticket' && row.createdAt && inRange(row.createdAt, range))
    .map((row) => {
      const admission = resolveAdmissionSnapshot(row)
      const ticketCount = Math.max(1, Math.round(Number(row.ticketCount) || 1))
      return eventBase({
        kind: 'ticket_verifications',
        eventKind: 'ticket_verification',
        subtype: row.sku || 'legacy_creek_booking',
        subtypeLabel: row.productName || '历史溪降预约',
        title: row.productName || '历史溪降预约核销',
        reference: row.ticketNo,
        secondaryReference: row.orderId || row.bookingId,
        orderTradeNo: row.orderId,
        orderExists: row.orderExists,
        amount: row.unitPrice,
        quantity: ticketCount,
        ticketCount,
        admissionCount: admission.count,
        admissionCountUnknown: admission.unknown,
        staffOpenid: row.staffOpenid,
        staffName: row.staffName,
        eventAt: row.createdAt,
        priceMissing: !(Number(row.unitPrice) > 0)
      })
    })

  return current.concat(historical)
}

function buildMemberVerificationEvents(rows, range) {
  return (rows || [])
    .filter((row) => row && row.type === 'member_benefit' && row.createdAt && inRange(row.createdAt, range))
    .map((row) => {
      const subtype = row.benefitType || 'other'
      return eventBase({
        kind: 'member_verifications',
        eventKind: 'member_verification',
        subtype,
        subtypeLabel: BENEFIT_LABELS[subtype] || '其他会员权益',
        title: BENEFIT_LABELS[subtype] || '会员权益核销',
        reference: row.memberCode,
        quantity: 1,
        staffOpenid: row.staffOpenid,
        staffName: row.staffName,
        eventAt: row.createdAt
      })
    })
}

function buildLingExchangeEvents(rows, range) {
  return (rows || [])
    .filter((row) => row && LING_LABELS[row.type] && row.createdAt && inRange(row.createdAt, range))
    .map((row) => eventBase({
      kind: 'ling_exchanges',
      eventKind: 'ling_exchange',
      subtype: row.type,
      subtypeLabel: LING_LABELS[row.type],
      title: LING_LABELS[row.type],
      reference: row.memberCode || '',
      quantity: Math.abs(Number(row.change) || 0),
      staffOpenid: row.staffOpenid,
      staffName: row.staffName,
      eventAt: row.createdAt
    }))
}

function buildMemberGrantEvents(rows, range) {
  return (rows || [])
    .filter((row) => row && row.type === 'member_grant' && row.createdAt && inRange(row.createdAt, range))
    .map((row) => eventBase({
      kind: 'member_grants',
      eventKind: 'member_card_exchange',
      subtype: 'member_card_exchange',
      subtypeLabel: BUSINESS_LABELS.member_card_exchange,
      title: BUSINESS_LABELS.member_card_exchange,
      reference: row.memberCode || '',
      quantity: Math.abs(Number(row.change) || 0),
      staffOpenid: row.staffOpenid,
      staffName: row.staffName,
      eventAt: row.createdAt
    }))
}

function buildBusinessEvents(events) {
  return (events || [])
    .filter((event) => (
      event.kind === 'ling_exchanges' &&
      ['physical_to_digital', 'digital_to_physical'].includes(event.subtype)
    ) || event.kind === 'member_grants')
    .map((event) => Object.assign({}, event, {
      kind: 'business_data',
      subtypeLabel: BUSINESS_LABELS[event.subtype] || event.subtypeLabel,
      title: BUSINESS_LABELS[event.subtype] || event.title,
      searchText: `${event.searchText || ''} ${BUSINESS_LABELS[event.subtype] || ''}`.trim()
    }))
}

function buildBusinessBreakdown(events) {
  const business = buildBusinessEvents(events)
  return Object.keys(BUSINESS_LABELS).map((key) => {
    const rows = business.filter((event) => event.subtype === key)
    return {
      key,
      label: BUSINESS_LABELS[key],
      count: rows.length,
      quantity: rows.reduce((sum, event) => sum + event.quantity, 0)
    }
  })
}

function buildEvents(input, rangeInput) {
  const range = validateRange(rangeInput)
  if (!range.ok) return []
  return []
    .concat(buildPaymentEvents(input && input.orders, range))
    .concat(buildTicketRefundEvents(input && input.refundedTickets, range))
    .concat(buildMemberRefundEvents(input && input.refundedMembers, range))
    .concat(buildTicketVerificationEvents(
      input && input.usedTickets,
      input && input.legacyTicketVerifications,
      range
    ))
    .concat(buildMemberVerificationEvents(input && input.memberVerifications, range))
    .concat(buildLingExchangeEvents(input && input.lingLedger, range))
    .concat(buildMemberGrantEvents(input && input.lingLedger, range))
    .sort((a, b) => b.eventTime - a.eventTime)
}

function groupSum(rows, keyFn, initialFn, addFn) {
  const map = new Map()
  rows.forEach((row) => {
    const key = keyFn(row)
    if (!map.has(key)) map.set(key, initialFn(row, key))
    addFn(map.get(key), row)
  })
  return Array.from(map.values())
}

function buildIncomeBreakdown(payments) {
  return groupSum(
    payments,
    (event) => event.subtype,
    (event, key) => ({ key, label: event.subtypeLabel, amount: 0, count: 0 }),
    (group, event) => {
      group.amount += event.amount
      group.count += 1
    }
  ).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
}

function buildVerifiedIncomeBreakdown(tickets) {
  return groupSum(
    tickets,
    (event) => event.subtype,
    (event, key) => ({ key, label: event.subtypeLabel, amount: 0, count: 0 }),
    (group, event) => {
      group.amount += event.amount
      group.count += event.ticketCount || event.quantity || 1
    }
  ).sort((a, b) => b.amount - a.amount || b.count - a.count || a.label.localeCompare(b.label))
}

function buildTicketBreakdown(tickets) {
  const rows = groupSum(
    tickets,
    (event) => event.subtype,
    (event, key) => ({
      key,
      label: event.subtypeLabel,
      count: 0,
      ticketCount: 0,
      admissionCount: 0,
      unknownAdmissionTicketCount: 0,
      admissionShare: 0,
      faceValue: 0,
      priceMissingCount: 0
    }),
    (group, event) => {
      const ticketCount = event.ticketCount || event.quantity || 1
      group.count += ticketCount
      group.ticketCount += ticketCount
      group.admissionCount += event.admissionCount
      if (event.admissionCountUnknown) group.unknownAdmissionTicketCount += ticketCount
      group.faceValue += event.amount
      if (event.priceMissing) group.priceMissingCount += ticketCount
    }
  )
  const totalAdmissionCount = rows.reduce((sum, row) => sum + row.admissionCount, 0)
  rows.forEach((row) => {
    row.admissionShare = totalAdmissionCount ? row.admissionCount / totalAdmissionCount : 0
  })
  return rows.sort((a, b) => b.faceValue - a.faceValue || b.count - a.count)
}

function buildStaffBreakdown(events) {
  const scoped = events.filter((event) => event.staffOpenid || event.staffName !== '未记录')
  return groupSum(
    scoped,
    (event) => event.staffOpenid || `name:${event.staffName}`,
    (event) => ({
      staffOpenid: event.staffOpenid,
      staffName: event.staffName,
      upgradeAmount: 0,
      ticketVerifiedCount: 0,
      admittedPeopleCount: 0,
      unknownAdmissionTicketCount: 0,
      memberVerificationCount: 0,
      lingExchangeCount: 0
    }),
    (group, event) => {
      if (event.kind === 'funds' && event.eventKind === 'payment' && event.subtype === 'ticket_upgrade') {
        group.upgradeAmount += event.amount
      }
      if (event.kind === 'ticket_verifications') {
        const ticketCount = event.ticketCount || event.quantity || 1
        group.ticketVerifiedCount += ticketCount
        group.admittedPeopleCount += event.admissionCount
        if (event.admissionCountUnknown) group.unknownAdmissionTicketCount += ticketCount
      }
      if (event.kind === 'member_verifications') group.memberVerificationCount += 1
      if (event.kind === 'ling_exchanges') group.lingExchangeCount += 1
    }
  ).sort((a, b) => {
    const aTotal = a.upgradeAmount + a.ticketVerifiedCount + a.memberVerificationCount + a.lingExchangeCount
    const bTotal = b.upgradeAmount + b.ticketVerifiedCount + b.memberVerificationCount + b.lingExchangeCount
    return bTotal - aTotal
  })
}

function buildDaily(events) {
  return groupSum(
    events,
    (event) => beijingDate(event.eventTime),
    (_event, date) => ({
      date,
      gross: 0,
      refunds: 0,
      net: 0,
      orderIncome: 0,
      orderIncomeCount: 0,
      actualNetIncome: 0,
      paidCount: 0,
      refundCount: 0,
      ticketVerifiedCount: 0,
      verifiedTicketCount: 0,
      admittedPeopleCount: 0,
      unknownAdmissionTicketCount: 0,
      memberVerificationCount: 0,
      lingPhysicalToDigital: 0,
      lingDigitalToPhysical: 0
    }),
    (group, event) => {
      if (event.kind === 'funds' && event.eventKind === 'payment') {
        group.gross += event.amount
        group.paidCount += 1
        group.orderIncome += event.orderIncomeAmount
        if (event.orderIncomeAmount > 0) group.orderIncomeCount += 1
      }
      if (event.kind === 'funds' && event.eventKind === 'refund') {
        group.refunds += event.amount
        group.refundCount += 1
      }
      if (event.kind === 'ticket_verifications') {
        const ticketCount = event.ticketCount || event.quantity || 1
        group.ticketVerifiedCount += ticketCount
        group.verifiedTicketCount += ticketCount
        group.admittedPeopleCount += event.admissionCount
        if (event.admissionCountUnknown) group.unknownAdmissionTicketCount += ticketCount
        group.actualNetIncome += event.amount
      }
      if (event.kind === 'member_verifications') group.memberVerificationCount += 1
      if (event.kind === 'ling_exchanges' && event.subtype === 'physical_to_digital') {
        group.lingPhysicalToDigital += event.quantity
      }
      if (event.kind === 'ling_exchanges' && event.subtype === 'digital_to_physical') {
        group.lingDigitalToPhysical += event.quantity
      }
      group.net = group.gross - group.refunds
    }
  ).sort((a, b) => b.date.localeCompare(a.date))
}

function buildMonthly(events) {
  return groupSum(
    events,
    (event) => beijingDate(event.eventTime).slice(0, 7),
    (_event, month) => ({
      month,
      gross: 0,
      refunds: 0,
      net: 0,
      orderIncome: 0,
      orderIncomeCount: 0,
      actualNetIncome: 0,
      paidCount: 0,
      refundCount: 0,
      verifiedTicketCount: 0,
      admittedPeopleCount: 0,
      unknownAdmissionTicketCount: 0,
      memberVerificationCount: 0,
      lingPhysicalToDigital: 0,
      lingDigitalToPhysical: 0
    }),
    (group, event) => {
      if (event.kind === 'funds' && event.eventKind === 'payment') {
        group.gross += event.amount
        group.paidCount += 1
        group.orderIncome += event.orderIncomeAmount
        if (event.orderIncomeAmount > 0) group.orderIncomeCount += 1
      }
      if (event.kind === 'funds' && event.eventKind === 'refund') {
        group.refunds += event.amount
        group.refundCount += 1
      }
      if (event.kind === 'ticket_verifications') {
        const ticketCount = event.ticketCount || event.quantity || 1
        group.verifiedTicketCount += ticketCount
        group.admittedPeopleCount += event.admissionCount
        if (event.admissionCountUnknown) group.unknownAdmissionTicketCount += ticketCount
        group.actualNetIncome += event.amount
      }
      if (event.kind === 'member_verifications') group.memberVerificationCount += 1
      if (event.kind === 'ling_exchanges' && event.subtype === 'physical_to_digital') {
        group.lingPhysicalToDigital += event.quantity
      }
      if (event.kind === 'ling_exchanges' && event.subtype === 'digital_to_physical') {
        group.lingDigitalToPhysical += event.quantity
      }
      group.net = group.gross - group.refunds
    }
  ).sort((a, b) => b.month.localeCompare(a.month))
}

function buildAnomalies(events) {
  const labels = {
    duplicate_payment: '重复支付回调',
    verified_then_refunded: '已核销后退款',
    missing_admission_snapshot: '实际人数待核对',
    missing_price: '核销票价缺失',
    missing_order: '关联订单缺失'
  }
  const list = []
  function append(type, event) {
    list.push({
      type,
      label: labels[type],
      reference: event.reference,
      orderTradeNo: event.orderTradeNo || event.reference,
      amount: event.amount,
      eventAt: event.eventAt
    })
  }
  ;(events || []).forEach((event) => {
    if (event.kind === 'funds' && event.eventKind === 'payment' && event.status === 'paid_dup') {
      append('duplicate_payment', event)
    }
    if (event.kind !== 'ticket_verifications') return
    if (event.refundedAfterVerification) append('verified_then_refunded', event)
    if (event.admissionCountUnknown) append('missing_admission_snapshot', event)
    if (event.priceMissing) append('missing_price', event)
    if (event.orderTradeNo && event.orderExists === false) append('missing_order', event)
  })
  const byType = {}
  list.forEach((row) => {
    byType[row.type] = (byType[row.type] || 0) + 1
  })
  return { total: list.length, byType, list }
}

function pendingRefundStats(rows, rangeInput) {
  const range = validateRange(rangeInput)
  if (!range.ok) return { count: 0, amount: 0 }
  return (rows || [])
    .filter((row) => {
      const status = row && row.status
      return ['pending', 'reviewing'].includes(status) && row.createdAt && inRange(row.createdAt, range)
    })
    .reduce((result, row) => {
      result.count += 1
      result.amount += Math.max(0, Math.round(Number(row.refundFee) || 0))
      return result
    }, { count: 0, amount: 0 })
}

function buildSummary(input, rangeInput) {
  const range = validateRange(rangeInput)
  if (!range.ok) {
    return { error: range.msg }
  }
  const events = buildEvents(input || {}, range)
  const payments = events.filter((event) => event.kind === 'funds' && event.eventKind === 'payment')
  const refunds = events.filter((event) => event.kind === 'funds' && event.eventKind === 'refund')
  const tickets = events.filter((event) => event.kind === 'ticket_verifications')
  const memberVerifications = events.filter((event) => event.kind === 'member_verifications')
  const ling = events.filter((event) => event.kind === 'ling_exchanges')
  const gross = payments.reduce((sum, event) => sum + event.amount, 0)
  const refunded = refunds.reduce((sum, event) => sum + event.amount, 0)
  const anomalies = payments.filter((event) => event.status === 'paid_dup')
  const pending = pendingRefundStats(input && input.pendingRefunds, range)
  const anomalySummary = buildAnomalies(events)
  const verifiedTicketCount = tickets.reduce(
    (sum, event) => sum + (event.ticketCount || event.quantity || 1),
    0
  )
  const admittedPeopleCount = tickets.reduce((sum, event) => sum + event.admissionCount, 0)
  const unknownAdmissionTicketCount = tickets.reduce(
    (sum, event) => sum + (event.admissionCountUnknown
      ? (event.ticketCount || event.quantity || 1)
      : 0),
    0
  )
  const relatedOrderCount = new Set(tickets.map((event) => event.orderTradeNo).filter(Boolean)).size
  const verifiedRevenue = tickets.reduce((sum, event) => sum + event.amount, 0)
  const orderIncome = payments.reduce((sum, event) => sum + event.orderIncomeAmount, 0)
  const orderIncomeCount = payments.filter((event) => event.orderIncomeAmount > 0).length
  const daily = buildDaily(events)
  const monthly = buildMonthly(events)
  const businessBreakdown = buildBusinessBreakdown(events)

  return {
    finance: {
      gross,
      paidCount: payments.length,
      refunds: refunded,
      refundCount: refunds.length,
      net: gross - refunded,
      orderIncome,
      orderIncomeCount,
      actualNetIncome: verifiedRevenue,
      pendingRefundCount: pending.count,
      pendingRefundAmount: pending.amount,
      anomalyCount: anomalies.length,
      anomalyAmount: anomalies.reduce((sum, event) => sum + event.amount, 0)
    },
    verificationFinance: {
      gross: verifiedRevenue,
      paidCount: relatedOrderCount,
      refunds: 0,
      refundCount: 0,
      net: verifiedRevenue,
      actualNetIncome: verifiedRevenue,
      verifiedTicketCount,
      pendingRefundCount: pending.count,
      pendingRefundAmount: pending.amount,
      anomalyCount: anomalySummary.total,
      anomalyAmount: anomalies.reduce((sum, event) => sum + event.amount, 0)
    },
    operations: {
      ticketVerifiedCount: verifiedTicketCount,
      verifiedTicketCount,
      admittedPeopleCount,
      unknownAdmissionTicketCount,
      relatedOrderCount,
      actualNetIncome: verifiedRevenue,
      ticketPriceMissingCount: tickets.reduce(
        (sum, event) => sum + (event.priceMissing
          ? (event.ticketCount || event.quantity || 1)
          : 0),
        0
      ),
      memberVerificationCount: memberVerifications.length,
      lingPhysicalToDigital: ling
        .filter((event) => event.subtype === 'physical_to_digital')
        .reduce((sum, event) => sum + event.quantity, 0),
      lingDigitalToPhysical: ling
        .filter((event) => event.subtype === 'digital_to_physical')
        .reduce((sum, event) => sum + event.quantity, 0),
      businessRecordCount: businessBreakdown.reduce((sum, row) => sum + row.count, 0),
      businessBreakdown
    },
    incomeBreakdown: buildIncomeBreakdown(payments),
    verifiedIncomeBreakdown: buildVerifiedIncomeBreakdown(tickets),
    ticketBreakdown: buildTicketBreakdown(tickets),
    staffBreakdown: buildStaffBreakdown(events),
    daily,
    reconciliation: { daily, monthly },
    anomalies: anomalySummary,
    truncated: !!(input && input.truncated)
  }
}

function publicEvent(event) {
  return {
    kind: event.kind,
    eventKind: event.eventKind,
    subtype: event.subtype,
    subtypeLabel: event.subtypeLabel,
    title: event.title,
    reference: event.reference,
    secondaryReference: event.secondaryReference,
    amount: event.amount,
    orderIncomeAmount: event.orderIncomeAmount,
    orderIncomeTicketCount: event.orderIncomeTicketCount,
    quantity: event.quantity,
    ticketCount: event.ticketCount,
    admissionCount: event.admissionCount,
    admissionCountUnknown: event.admissionCountUnknown,
    orderTradeNo: event.orderTradeNo,
    refundStatus: event.refundStatus,
    status: event.status,
    staffOpenid: event.staffOpenid,
    staffName: event.staffName,
    phoneTail: event.phoneTail,
    eventAt: event.eventAt,
    priceMissing: event.priceMissing
  }
}

function isoDate(value) {
  const time = toMillis(value)
  return time ? new Date(time).toISOString() : ''
}

function latestByTime(rows, fields) {
  return (rows || []).slice().sort((a, b) => {
    const aTime = Math.max(...fields.map((field) => toMillis(a && a[field])))
    const bTime = Math.max(...fields.map((field) => toMillis(b && b[field])))
    return bTime - aTime
  })[0] || null
}

function orderHistory(order, tickets, refundRequests, invoiceRequests) {
  const source = order || {}
  const history = []
  function append(type, label, at, note) {
    const timestamp = isoDate(at)
    if (!timestamp) return
    history.push({
      type,
      label,
      at: timestamp,
      note: cleanText(note, 120)
    })
  }

  append('order_created', '订单创建', source.createdAt)
  append('payment_received', '支付成功', source.paidAt, `¥${(orderAmount(source) / 100).toFixed(2)}`)
  ;(tickets || []).forEach((ticket) => {
    const admission = resolveAdmissionSnapshot(ticket)
    append(
      'ticket_verified',
      '门票核销',
      ticket.usedAt,
      `${cleanText(ticket.ticketNo, 48)} · ${admission.unknown ? '实际人数待核对' : `${admission.count} 人`}`
    )
    append('ticket_refunded', '票券已退款', ticket.refundedAt, cleanText(ticket.ticketNo, 48))
  })
  ;(refundRequests || []).forEach((refund) => {
    append(
      'refund_requested',
      '提交退款申请',
      refund.createdAt,
      cleanText(refund.reason, 80)
    )
    if (refund.updatedAt && toMillis(refund.updatedAt) !== toMillis(refund.createdAt)) {
      append(
        'refund_updated',
        refund.status === 'refunded' ? '退款完成' : '退款状态更新',
        refund.updatedAt,
        cleanText(refund.status, 32)
      )
    }
  })
  ;(invoiceRequests || []).forEach((invoice) => {
    append('invoice_submitted', '提交开票申请', invoice.submittedAt || invoice.createdAt)
    append('invoice_reviewing', '开票审核中', invoice.reviewedAt)
    append('invoice_issued', '电子发票已开具', invoice.issuedAt, invoice.invoiceFile && invoice.invoiceFile.fileName)
    if (invoice.status === 'rejected') {
      append('invoice_rejected', '开票申请已驳回', invoice.updatedAt, invoice.rejectReason)
    }
    if (invoice.status === 'cancelled_refund') {
      append('invoice_cancelled', '开票申请因退款关闭', invoice.updatedAt)
    }
  })

  return history.sort((a, b) => toMillis(a.at) - toMillis(b.at))
}

function buildRefundSummary(order, tickets, rows) {
  const latest = latestByTime(rows, ['updatedAt', 'createdAt'])
  if (latest) {
    return {
      status: cleanText(latest.status, 32),
      refundFee: Math.max(0, Math.round(Number(latest.refundFee) || 0)),
      reason: cleanText(latest.reason, 100),
      ticketNos: (latest.ticketNos || []).slice(0, 50).map((value) => cleanText(value, 48)),
      createdAt: isoDate(latest.createdAt),
      updatedAt: isoDate(latest.updatedAt)
    }
  }
  const refundedTickets = (tickets || []).filter((ticket) => ticket && ticket.refundedAt)
  if (refundedTickets.length) {
    const latestTicket = latestByTime(refundedTickets, ['refundedAt'])
    return {
      status: 'refunded',
      refundFee: refundedTickets.reduce(
        (sum, ticket) => sum + Math.max(0, Math.round(Number(ticket.unitPrice) || 0)),
        0
      ),
      reason: '',
      ticketNos: refundedTickets.map((ticket) => cleanText(ticket.ticketNo, 48)),
      createdAt: isoDate(latestTicket.refundedAt),
      updatedAt: isoDate(latestTicket.refundedAt)
    }
  }
  if (order && order.status === 'refunded') {
    return {
      status: 'refunded',
      refundFee: orderAmount(order),
      reason: '',
      ticketNos: [],
      createdAt: isoDate(order.updatedAt),
      updatedAt: isoDate(order.updatedAt)
    }
  }
  return null
}

function buildInvoiceSummary(rows) {
  const latest = latestByTime(rows, ['updatedAt', 'submittedAt', 'createdAt'])
  if (!latest) return null
  return {
    status: cleanText(latest.status, 32),
    statusText: INVOICE_STATUS_LABELS[latest.status] || cleanText(latest.status, 32) || '未记录',
    invoiceAmount: Math.max(0, Math.round(Number(latest.invoiceAmount) || 0)),
    fileName: cleanText(latest.invoiceFile && latest.invoiceFile.fileName, 160),
    submittedAt: isoDate(latest.submittedAt || latest.createdAt),
    reviewedAt: isoDate(latest.reviewedAt),
    issuedAt: isoDate(latest.issuedAt),
    updatedAt: isoDate(latest.updatedAt)
  }
}

function buildOrderDetail(order, tickets, extras) {
  const source = order || {}
  const related = extras || {}
  const refundRequests = related.refundRequests || []
  const invoiceRequests = related.invoiceRequests || []
  const ticketList = (tickets || []).map((ticket) => {
    const admission = resolveAdmissionSnapshot(ticket)
    return {
      ticketNo: cleanText(ticket.ticketNo, 48),
      sku: cleanText(ticket.sku, 40),
      productName: cleanText(ticket.productName, 80),
      status: cleanText(ticket.status, 32),
      unitPrice: Math.max(0, Math.round(Number(ticket.unitPrice) || 0)),
      admissionCount: admission.count,
      admissionCountUnknown: admission.unknown,
      usedAt: isoDate(ticket.usedAt),
      refundedAt: isoDate(ticket.refundedAt)
    }
  })
  const inferredPeople = ticketList.reduce(
    (sum, ticket) => sum + (ticket.usedAt && !ticket.admissionCountUnknown ? ticket.admissionCount : 0),
    0
  )
  return {
    outTradeNo: cleanText(source.outTradeNo, 48),
    type: cleanText(source.type, 40),
    title: cleanText(source.productName || source.itemLabel || INCOME_LABELS[source.type] || '订单', 80),
    amount: orderAmount(source),
    status: cleanText(source.status, 32),
    quantity: Math.max(0, Math.round(Number(source.quantity) || 0)),
    admissionCountPerTicket: Math.max(0, Math.round(Number(source.admissionCountPerTicket) || 0)),
    admittedPeopleCount: Math.max(
      0,
      Math.round(Number(source.admittedPeopleCount) || inferredPeople || 0)
    ),
    visitDate: cleanText(source.visitDate, 20),
    contact: {
      name: maskName(source.contact && source.contact.name),
      phoneTail: phoneTail(source.contact && source.contact.phone)
    },
    staff: {
      name: cleanText(source.staffName, 32),
      staffNo: cleanText(source.staffNo, 32)
    },
    createdAt: isoDate(source.createdAt),
    paidAt: isoDate(source.paidAt),
    updatedAt: isoDate(source.updatedAt),
    payment: {
      status: source.paidAt ? 'paid' : cleanText(source.status, 32),
      amount: orderAmount(source),
      paidAt: isoDate(source.paidAt)
    },
    refund: buildRefundSummary(source, tickets, refundRequests),
    invoice: buildInvoiceSummary(invoiceRequests),
    tickets: ticketList,
    history: orderHistory(source, tickets, refundRequests, invoiceRequests)
  }
}

function buildDetails(events, query) {
  const q = query || {}
  const kind = ['funds', 'ticket_verifications', 'member_verifications', 'ling_exchanges', 'business_data']
    .includes(q.kind) ? q.kind : 'funds'
  const keyword = cleanText(q.keyword, 40).toLowerCase()
  const staffOpenid = cleanText(q.staffOpenid, 80)
  const subtype = cleanText(q.subtype, 40)
  const eventKind = ['payment', 'refund'].includes(q.eventKind) ? q.eventKind : ''
  const page = Math.max(1, Math.floor(Number(q.page) || 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(q.pageSize) || DEFAULT_PAGE_SIZE)))

  const sourceEvents = kind === 'business_data' ? buildBusinessEvents(events) : (events || [])
  const filtered = sourceEvents
    .filter((event) => event.kind === kind)
    .filter((event) => !eventKind || event.eventKind === eventKind)
    .filter((event) => !staffOpenid || event.staffOpenid === staffOpenid)
    .filter((event) => !subtype || event.subtype === subtype)
    .filter((event) => !keyword || event.searchText.includes(keyword))
    .sort((a, b) => b.eventTime - a.eventTime)

  const start = (page - 1) * pageSize
  const list = filtered.slice(start, start + pageSize).map(publicEvent)
  return {
    kind,
    eventKind,
    page,
    pageSize,
    total: filtered.length,
    hasMore: start + list.length < filtered.length,
    list
  }
}

module.exports = {
  DAY_MS,
  MAX_RANGE_DAYS,
  validateRange,
  beijingDate,
  phoneTail,
  resolveAdmissionSnapshot,
  buildEvents,
  buildBusinessEvents,
  buildBusinessBreakdown,
  buildSummary,
  buildDetails,
  buildOrderDetail
}
