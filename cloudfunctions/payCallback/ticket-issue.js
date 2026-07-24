// 门票出票纯逻辑（PRD §8.5）
// 供 payCallback 的 ticket_order 分支使用；不依赖云 SDK，便于本地验证幂等与数量。

// 票号：T + 时间戳36 + 随机，配合 tickets.ticketNo 唯一索引做第二道保险
function genTicketNo(seq) {
  return 'T' + Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    String(seq)
}

// 当日票有效期到使用日（或购买日）的 23:59:59
function computeExpireAt(order, now) {
  const base = order && order.visitDate ? new Date(order.visitDate) : new Date(now)
  if (isNaN(base.getTime())) return new Date(now.getTime() + 24 * 3600 * 1000)
  base.setHours(23, 59, 59, 999)
  // 使用日期早于当前时间时（脏数据），至少给到当天结束
  if (base.getTime() <= now.getTime()) {
    const fallback = new Date(now)
    fallback.setHours(23, 59, 59, 999)
    return fallback
  }
  return base
}

/**
 * 是否需要出票。
 * 订单已是 paid 说明回调处理过；已存在票券说明出过票 —— 两种情况都直接跳过（回调重放安全）。
 */
function shouldIssue(order, existingTicketCount) {
  if (!order) return false
  if (order.status === 'paid' || order.status === 'paid_dup') return false
  return (Number(existingTicketCount) || 0) === 0
}

/**
 * 按订单数量生成票券（一单多张）。
 */
function buildTickets(order, now) {
  const o = order || {}
  const quantity = Number(o.quantity) || 0
  const time = now instanceof Date ? now : new Date()
  const expireAt = computeExpireAt(o, time)
  const tickets = []
  for (let i = 0; i < quantity; i += 1) {
    tickets.push({
      _openid: o._openid || '',
      ticketNo: genTicketNo(i),
      orderId: o.outTradeNo || '',
      productId: o.productId || '',
      sku: o.sku || '',
      productName: o.productName || '',
      unitPrice: o.unitPrice || 0,
      visitDate: o.visitDate || '',
      contact: o.contact || null,
      status: 'unused',
      seq: i + 1,
      total: quantity,
      expireAt,
      createdAt: time,
      updatedAt: time
    })
  }
  return tickets
}

module.exports = { genTicketNo, computeExpireAt, shouldIssue, buildTickets }
