// 云函数：adminOperationsLedger —— 管理员小程序业务账（第一阶段）
// 口径：订单收入为已支付未核销票款；实际净收入按核销票面金额确认；
// 支付/退款按资金实际发生时间另行统计；长河令不折算现金。
// 权限：仅 approved admin。前端隐藏入口不能替代本鉴权。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./report-core.js')
const exportCore = require('./export-core.js')
const exportWorkbook = require('./export-workbook.js')

const BATCH_SIZE = 100
const READ_LIMIT = 5000
const IN_QUERY_SIZE = 20

async function requireAdmin(openid) {
  const result = await db.collection('staff')
    .where({ _openid: openid, status: 'approved' })
    .limit(1)
    .get()
  const staff = result.data[0]
  if (!staff || staff.role !== 'admin') return null
  return staff
}

async function fetchRange(collection, dateField, range, fields) {
  const result = []
  let offset = 0
  let truncated = false
  while (offset < READ_LIMIT) {
    let query = db.collection(collection)
      .where({
        [dateField]: _.gte(new Date(range.from)).and(_.lt(new Date(range.to)))
      })
      .orderBy(dateField, 'desc')
      .skip(offset)
      .limit(Math.min(BATCH_SIZE, READ_LIMIT - offset))
    if (fields) query = query.field(fields)
    const response = await query.get()
    const batch = response.data || []
    result.push(...batch)
    offset += batch.length
    if (batch.length < BATCH_SIZE) break
    if (offset >= READ_LIMIT) truncated = true
  }
  return { list: result, truncated }
}

async function fetchApprovedStaff() {
  const result = []
  let offset = 0
  while (offset < READ_LIMIT) {
    const response = await db.collection('staff')
      .where({ status: 'approved' })
      .skip(offset)
      .limit(BATCH_SIZE)
      .field({ _openid: true, name: true, staffNo: true, role: true })
      .get()
    const batch = response.data || []
    result.push(...batch)
    offset += batch.length
    if (batch.length < BATCH_SIZE) break
  }
  return result
}

async function fetchOrdersByTradeNos(tradeNos) {
  const ids = Array.from(new Set((tradeNos || []).filter(Boolean)))
  const result = []
  for (let i = 0; i < ids.length; i += IN_QUERY_SIZE) {
    const batch = ids.slice(i, i + IN_QUERY_SIZE)
    const response = await db.collection('orders')
      .where({ outTradeNo: _.in(batch) })
      .field({ outTradeNo: true, amount: true, totalFee: true, productName: true })
      .get()
    result.push(...(response.data || []))
  }
  return result
}

async function fetchTicketsByOrderIds(orderIds) {
  const ids = Array.from(new Set((orderIds || []).filter(Boolean)))
  const result = []
  for (let i = 0; i < ids.length; i += IN_QUERY_SIZE) {
    const batch = ids.slice(i, i + IN_QUERY_SIZE)
    const response = await db.collection('tickets')
      .where({ orderId: _.in(batch) })
      .field({
        orderId: true,
        status: true,
        unitPrice: true,
        usedAt: true,
        refundedAt: true
      })
      .get()
    result.push(...(response.data || []))
  }
  return result
}

async function fetchOrderDetail(orderNo) {
  const orderResult = await db.collection('orders')
    .where({ outTradeNo: orderNo })
    .limit(1)
    .field({
      outTradeNo: true,
      type: true,
      productName: true,
      itemLabel: true,
      amount: true,
      totalFee: true,
      status: true,
      quantity: true,
      admissionCountPerTicket: true,
      admittedPeopleCount: true,
      visitDate: true,
      contact: true,
      staffName: true,
      staffNo: true,
      createdAt: true,
      paidAt: true,
      updatedAt: true
    })
    .get()
  const order = orderResult.data && orderResult.data[0]
  if (!order) return null
  const [ticketResult, refundResult, invoiceResult] = await Promise.all([
    db.collection('tickets')
      .where({ orderId: orderNo })
      .field({
        ticketNo: true,
        sku: true,
        productName: true,
        status: true,
        unitPrice: true,
        admissionCount: true,
        usedAt: true,
        refundedAt: true
      })
      .get(),
    db.collection('refund_requests')
      .where({ outTradeNo: orderNo })
      .limit(50)
      .field({
        status: true,
        refundFee: true,
        reason: true,
        ticketNos: true,
        createdAt: true,
        updatedAt: true
      })
      .get(),
    db.collection('invoice_requests')
      .where({ outTradeNo: orderNo })
      .limit(10)
      .field({
        status: true,
        invoiceAmount: true,
        invoiceFile: true,
        rejectReason: true,
        submittedAt: true,
        reviewedAt: true,
        issuedAt: true,
        createdAt: true,
        updatedAt: true
      })
      .get()
  ])
  return core.buildOrderDetail(order, ticketResult.data || [], {
    refundRequests: refundResult.data || [],
    invoiceRequests: invoiceResult.data || []
  })
}

function enrichStaff(rows, staffMap, openidField) {
  return (rows || []).map((row) => {
    const openid = row && row[openidField]
    const staff = openid && staffMap.get(openid)
    if (!staff || row.staffName) return row
    return Object.assign({}, row, {
      staffName: staff.name || '',
      staffNo: staff.staffNo || ''
    })
  })
}

async function loadSources(range) {
  const [
    ordersResult,
    refundedTicketsResult,
    refundedMembersResult,
    usedTicketsResult,
    refundRequestsResult,
    verificationsResult,
    lingResult,
    staff
  ] = await Promise.all([
    fetchRange('orders', 'paidAt', range, {
      type: true, status: true, outTradeNo: true, productName: true, itemLabel: true,
      amount: true, totalFee: true, contact: true, staffOpenid: true, staffName: true, paidAt: true
    }),
    fetchRange('tickets', 'refundedAt', range, {
      ticketNo: true, orderId: true, sku: true, productName: true, unitPrice: true,
      contact: true, refundedAt: true
    }),
    fetchRange('members', 'refundedAt', range, {
      memberCode: true, orderId: true, refundedAt: true
    }),
    fetchRange('tickets', 'usedAt', range, {
      ticketNo: true, orderId: true, sku: true, productName: true, unitPrice: true,
      admissionCount: true, contact: true, status: true, refundedAt: true,
      verifiedBy: true, usedAt: true
    }),
    fetchRange('refund_requests', 'createdAt', range, {
      outTradeNo: true, ticketNos: true, refundFee: true, status: true, createdAt: true
    }),
    fetchRange('verifications', 'createdAt', range, {
      type: true, benefitType: true, memberCode: true, bookingId: true,
      ticketNo: true, orderId: true, sku: true, productName: true, unitPrice: true,
      ticketCount: true, admissionCount: true, admissionCountUnknown: true,
      staffOpenid: true, staffName: true, createdAt: true
    }),
    fetchRange('ling_ledger', 'createdAt', range, {
      type: true, change: true, memo: true, memberCode: true,
      staffOpenid: true, staffName: true, createdAt: true
    }),
    fetchApprovedStaff()
  ])

  const staffMap = new Map(staff.map((row) => [row._openid, row]))
  const memberOrders = await fetchOrdersByTradeNos(
    refundedMembersResult.list.map((member) => member.orderId)
  )
  const orderAmountMap = new Map(memberOrders.map((order) => [
    order.outTradeNo,
    Number(order.amount != null ? order.amount : order.totalFee) || 0
  ]))

  const refundedMembers = refundedMembersResult.list.map((member) => Object.assign({}, member, {
    refundAmount: orderAmountMap.get(member.orderId) || 0
  }))
  const ticketOrders = ordersResult.list.filter((order) => order.type === 'ticket_order')
  const paidOrderTickets = await fetchTicketsByOrderIds(
    ticketOrders.map((order) => order.outTradeNo)
  )
  const pendingTicketMap = new Map()
  paidOrderTickets.forEach((ticket) => {
    if (!ticket || !['unused', 'reserved'].includes(ticket.status)) return
    const current = pendingTicketMap.get(ticket.orderId) || { amount: 0, count: 0 }
    current.amount += Math.max(0, Math.round(Number(ticket.unitPrice) || 0))
    current.count += 1
    pendingTicketMap.set(ticket.orderId, current)
  })
  const orders = ordersResult.list.map((order) => {
    if (order.type !== 'ticket_order') return order
    const pending = pendingTicketMap.get(order.outTradeNo) || { amount: 0, count: 0 }
    return Object.assign({}, order, {
      unverifiedAmount: pending.amount,
      unverifiedTicketCount: pending.count
    })
  })
  const verifications = verificationsResult.list
  const verificationOrders = await fetchOrdersByTradeNos(
    usedTicketsResult.list.map((ticket) => ticket.orderId)
      .concat(verifications.map((row) => row.orderId))
  )
  const verificationOrderIds = new Set(verificationOrders.map((order) => order.outTradeNo))
  const usedTickets = enrichStaff(usedTicketsResult.list, staffMap, 'verifiedBy')
    .map((ticket) => Object.assign({}, ticket, {
      orderExists: ticket.orderId ? verificationOrderIds.has(ticket.orderId) : null
    }))
  const legacyTicketVerifications = verifications
    .filter((row) => row.type === 'creek_ticket')
    .map((row) => Object.assign({}, row, {
      orderExists: row.orderId ? verificationOrderIds.has(row.orderId) : null
    }))
  const sourceResults = [
    ordersResult,
    refundedTicketsResult,
    refundedMembersResult,
    usedTicketsResult,
    refundRequestsResult,
    verificationsResult,
    lingResult
  ]

  return {
    orders,
    refundedTickets: refundedTicketsResult.list,
    refundedMembers,
    usedTickets,
    legacyTicketVerifications,
    memberVerifications: verifications.filter((row) => row.type === 'member_benefit'),
    lingLedger: enrichStaff(lingResult.list, staffMap, 'staffOpenid'),
    pendingRefunds: refundRequestsResult.list,
    staff,
    truncated: sourceResults.some((result) => result.truncated)
  }
}

function staffOptions(staff) {
  return (staff || [])
    .map((row) => ({
      staffOpenid: row._openid,
      staffName: row.name || '未命名',
      staffNo: row.staffNo || '',
      role: row.role || ''
    }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName, 'zh-CN'))
}

function subtypeOptions(events, kind) {
  if (kind === 'business_data') {
    return [
      { key: 'physical_to_digital', label: '实体兑电子' },
      { key: 'digital_to_physical', label: '电子兑实体' },
      { key: 'member_card_exchange', label: '会员卡兑换' }
    ]
  }
  const map = new Map()
  events
    .filter((event) => event.kind === kind)
    .forEach((event) => {
      if (!map.has(event.subtype)) {
        map.set(event.subtype, { key: event.subtype, label: event.subtypeLabel })
      }
    })
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const admin = await requireAdmin(OPENID)
  if (!admin || admin.role !== 'admin') return { code: 403, msg: '需要管理员权限' }

  const action = event && event.action
  if (action === 'orderDetail') {
    const orderNo = String(event.orderNo || event.outTradeNo || '').trim().slice(0, 48)
    if (!orderNo) return { code: 400, msg: '缺少订单号' }
    try {
      const detail = await fetchOrderDetail(orderNo)
      if (!detail) return { code: 404, msg: '订单不存在' }
      return { code: 0, msg: 'ok', data: detail }
    } catch (error) {
      console.error('[adminOperationsLedger] 订单详情加载失败', error)
      return { code: 500, msg: '订单详情加载失败，请稍后重试' }
    }
  }

  const range = core.validateRange(event || {})
  if (!range.ok) return { code: 400, msg: range.msg }

  try {
    const sources = await loadSources(range)
    if (action === 'export') {
      if (sources.truncated) {
        return { code: 409, msg: '数据量超过导出上限，请缩短日期范围后重试' }
      }
      const events = core.buildEvents(sources, range)
      const report = core.buildSummary(sources, range)
      const plan = exportCore.buildExportPlan({
        report,
        events: events.concat(core.buildBusinessEvents(events)),
        range,
        exportedBy: admin.name || admin.staffNo || '管理员',
        exportedAt: new Date(),
        truncated: sources.truncated,
        selection: {
          datasets: event.datasets,
          fields: event.fields
        }
      })
      const fileContent = await exportWorkbook.writeBuffer(plan)
      const dateFolder = core.beijingDate(new Date()).replace(/-/g, '')
      const nonce = Math.random().toString(36).slice(2, 10)
      const cloudPath = `admin-exports/${dateFolder}/${Date.now()}-${nonce}.xlsx`
      const upload = await cloud.uploadFile({ cloudPath, fileContent })
      return {
        code: 0,
        msg: 'ok',
        data: {
          fileId: upload.fileID || upload.fileId,
          fileName: plan.fileName,
          sheetNames: plan.sheets.map((sheet) => sheet.name)
        }
      }
    }
    if (action === 'details') {
      const events = core.buildEvents(sources, range)
      const details = core.buildDetails(events, event)
      return {
        code: 0,
        msg: 'ok',
        data: Object.assign({}, details, {
          range: { from: range.from, to: range.to },
          staffOptions: staffOptions(sources.staff),
          subtypeOptions: subtypeOptions(events, details.kind),
          businessBreakdown: details.kind === 'business_data'
            ? core.buildBusinessBreakdown(events)
            : [],
          truncated: sources.truncated,
          updatedAt: new Date()
        })
      }
    }

    const report = core.buildSummary(sources, range)
    let selectedReport = report
    if (action === 'funds') {
      selectedReport = {
        finance: report.finance,
        incomeBreakdown: report.incomeBreakdown,
        verifiedIncomeBreakdown: report.verifiedIncomeBreakdown,
        reconciliation: report.reconciliation,
        anomalies: report.anomalies,
        truncated: report.truncated
      }
    } else if (action === 'finance') {
      selectedReport = {
        finance: report.verificationFinance,
        incomeBreakdown: report.verifiedIncomeBreakdown,
        reconciliation: report.reconciliation,
        anomalies: report.anomalies,
        truncated: report.truncated
      }
    } else if (action === 'verification') {
      selectedReport = {
        operations: report.operations,
        ticketBreakdown: report.ticketBreakdown,
        staffBreakdown: report.staffBreakdown,
        reconciliation: report.reconciliation,
        anomalies: report.anomalies,
        truncated: report.truncated
      }
    } else if (action === 'periods') {
      selectedReport = {
        reconciliation: report.reconciliation,
        anomalies: report.anomalies,
        truncated: report.truncated
      }
    } else if (action === 'anomalies') {
      selectedReport = { anomalies: report.anomalies }
    }
    return {
      code: 0,
      msg: 'ok',
      data: Object.assign({}, selectedReport, {
        range: { from: range.from, to: range.to },
        staffOptions: staffOptions(sources.staff),
        updatedAt: new Date()
      })
    }
  } catch (error) {
    if (error && error.code === 'INVALID_EXPORT_SELECTION') {
      return { code: 400, msg: error.message }
    }
    if (error && error.code === 'INVALID_EXPORT_RANGE') {
      return { code: 400, msg: error.message }
    }
    if (error && error.code === 'EXPORT_TRUNCATED') {
      return { code: 409, msg: error.message }
    }
    console.error('[adminOperationsLedger] 查询失败', error)
    return { code: 500, msg: '业务账加载失败，请稍后重试' }
  }
}

exports._private = {
  requireAdmin,
  fetchRange,
  fetchApprovedStaff,
  fetchOrdersByTradeNos,
  fetchTicketsByOrderIds,
  fetchOrderDetail,
  loadSources,
  subtypeOptions
}
