// ============================================================
// 领域常量与纯函数（本轮功能扩展的稳定契约）
// 只放跨页面/跨云函数复用的取值与无副作用函数，不放页面状态。
// 依据 PRD：§8.6 票券、§14.4 订单类型、§15.2 反馈、§17.6 团队预约
// ============================================================

// 订单类型：前两个为线上已有业务，改动会破坏历史订单与支付回调分流
const ORDER_TYPES = Object.freeze({
  MEMBER_CARD: 'member_card', // 会员卡
  TICKET_UPGRADE: 'ticket_upgrade', // 补差价升级
  TICKET_ORDER: 'ticket_order', // 门票订单（本轮新增）
  RENTAL_ORDER: 'rental_order', // 租赁（预留，PRD §14.4）
  RETAIL_ORDER: 'retail_order' // 零售（预留，PRD §14.4）
})

// 票券状态（PRD §8.6）：仅 unused/reserved 可核销
const TICKET_STATUS = Object.freeze({
  UNUSED: 'unused', // 未使用
  RESERVED: 'reserved', // 已占用（关联预约）
  USED: 'used', // 已核销
  REFUND_PENDING: 'refund_pending', // 退款处理中
  REFUNDED: 'refunded', // 已退款
  EXPIRED: 'expired', // 已过期
  VOID: 'void' // 已作废
})

// 团队/研学预约状态（PRD §17.6）
const VISIT_RESERVATION_STATUS = Object.freeze({
  PENDING: 'pending', // 待确认
  CONFIRMED: 'confirmed', // 已确认
  COMPLETED: 'completed', // 已完成
  CANCELLED: 'cancelled', // 用户取消
  REJECTED: 'rejected' // 园区驳回
})

// 用户反馈状态（PRD §15.2）
const FEEDBACK_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  PROCESSING: 'processing',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
})

/**
 * 分 → 元的展示字符串，固定两位小数。
 * 全站金额一律以「整数分」在前后端流转，浮点元只允许出现在展示层，
 * 因此这里对非整数分直接抛错，防止 9.9 这类值被误当成分写进订单。
 * @param {number} fen 整数分，可为负（退款展示）
 * @returns {string} 如 990 → '9.90'
 */
function fenToYuan(fen) {
  if (typeof fen !== 'number' || !Number.isInteger(fen)) {
    throw new TypeError('金额必须是整数分，收到：' + String(fen))
  }
  const sign = fen < 0 ? '-' : ''
  const abs = Math.abs(fen)
  const cents = String(abs % 100)
  return sign + Math.floor(abs / 100) + '.' + (cents.length === 1 ? '0' + cents : cents)
}

module.exports = {
  ORDER_TYPES,
  TICKET_STATUS,
  VISIT_RESERVATION_STATUS,
  FEEDBACK_STATUS,
  fenToYuan
}
