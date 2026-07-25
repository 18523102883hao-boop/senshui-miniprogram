// 订单统一展示模型（PRD §14.4：底层不同类型由服务层适配）
// 三类订单历史字段并不统一（member_card/ticket_upgrade 用 amount，ticket_order 用 totalFee），
// 这里做一次归一，前端只认统一模型。

const TYPE_TEXT = {
  member_card: '森水会员卡',
  ticket_upgrade: '补差价升级',
  ticket_order: '门票',
  rental_order: '装备租赁',
  retail_order: '商品'
}

const STATUS_TEXT = {
  pending: '待支付',
  paid: '已完成',
  paid_dup: '已完成',   // 重复支付单对用户仍显示已完成，异常由后台处理
  refunding: '退款中',
  refunded: '已退款',
  cancelled: '已取消',
  expired: '已关闭'
}

// Tab → 状态集合
const TAB_STATUS = {
  pending: ['pending'],
  paid: ['paid', 'paid_dup'],
  refund: ['refunding', 'refunded']
}

function fenToYuan(fen) {
  const n = Number(fen)
  if (!Number.isFinite(n)) return '0.00'
  const cents = String(Math.abs(Math.round(n)) % 100)
  return (n < 0 ? '-' : '') + Math.floor(Math.abs(Math.round(n)) / 100) + '.' + (cents.length === 1 ? '0' + cents : cents)
}

function toTime(v) {
  if (!v) return 0
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime()
  return isNaN(t) ? 0 : t
}

/**
 * 原始订单 → 统一展示模型。
 */
function toDisplayOrder(order) {
  const o = order || {}
  const type = o.type || ''
  // 金额字段历史上有两套，优先 totalFee
  const fee = typeof o.totalFee === 'number' ? o.totalFee : (typeof o.amount === 'number' ? o.amount : 0)

  let title = TYPE_TEXT[type] || '订单'
  let subtitle = ''
  if (type === 'ticket_upgrade') {
    title = o.itemLabel || '补差价升级'
    if (o.staffName) subtitle = '收款：' + o.staffName
  } else if (type === 'ticket_order') {
    title = o.productName || '门票'
    if (o.quantity) subtitle = o.quantity + ' 张'
    if (o.visitDate) subtitle += (subtitle ? ' · ' : '') + o.visitDate
  }

  return {
    orderId: o._id || '',
    outTradeNo: o.outTradeNo || '',
    type,
    typeText: TYPE_TEXT[type] || '其他订单',
    title,
    subtitle,
    amount: fee,
    amountText: fenToYuan(fee),
    status: o.status || '',
    statusText: STATUS_TEXT[o.status] || o.status || '',
    createdAt: o.createdAt || null,
    paidAt: o.paidAt || null,
    canPay: canPay(o),
    canRefund: canRefund(o)
  }
}

function canPay(order) {
  return !!order && order.status === 'pending'
}

// 只有线上购买的门票支持自助退款；补差价是现场业务，退款走前台
function canRefund(order) {
  const o = order || {}
  return o.type === 'ticket_order' && (o.status === 'paid' || o.status === 'paid_dup')
}

function filterByTab(orders, tab) {
  const list = Array.isArray(orders) ? orders : []
  const allow = TAB_STATUS[tab]
  if (!allow) return list.slice()
  return list.filter((o) => o && allow.indexOf(o.status) >= 0)
}

function sortOrders(orders) {
  return (Array.isArray(orders) ? orders : []).slice()
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
}

module.exports = { TYPE_TEXT, STATUS_TEXT, TAB_STATUS, fenToYuan, toDisplayOrder, canPay, canRefund, filterByTab, sortOrders }
