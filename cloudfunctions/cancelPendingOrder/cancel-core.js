const SUPPORTED_TYPES = ['member_card', 'ticket_order', 'ticket_upgrade']

function reject(code, msg) {
  return { ok: false, code, msg }
}

function resolve(order) {
  if (!order) return reject(404, '订单不存在')
  if (!SUPPORTED_TYPES.includes(order.type)) {
    return reject(400, '该订单类型暂不支持取消')
  }
  if (order.status === 'pending') return { ok: true }

  const statusMessages = {
    paid: '订单已支付，不能取消',
    paid_dup: '订单已支付，不能取消',
    refunding: '订单正在退款，不能取消',
    refunded: '订单已退款，不能取消',
    expired: '订单已过期并关闭',
    cancelled: '订单已取消'
  }

  return reject(409, statusMessages[order.status] || '当前订单状态不能取消')
}

function buildPatch(now = new Date()) {
  const cancelledAt = now instanceof Date ? now : new Date(now)
  return {
    status: 'cancelled',
    cancelReason: 'user_cancelled',
    cancelledAt,
    updatedAt: cancelledAt
  }
}

module.exports = {
  SUPPORTED_TYPES,
  resolve,
  buildPatch
}
