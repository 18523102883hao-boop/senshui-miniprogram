// 门票核销纯逻辑（PRD §8.7 员工检票）
// 与 getTicketCode 共用 HMAC 方案：token = TK.<ticketNo>.<ts>.<sign>，90 秒有效。
const crypto = require('crypto')

const TTL = 90
// 只有这些角色能检票；酒吧/小卖部角色不负责入园核销
const VERIFY_ROLES = ['front', 'creek', 'admin']
// 可核销的票券状态（PRD §8.7：仅 unused/reserved）
const CONSUMABLE = ['unused', 'reserved']

const STATUS_MSG = {
  used: '该票券已核销',
  refund_pending: '该票券退款处理中，不可核销',
  refunded: '该票券已退款',
  expired: '该票券已过期',
  void: '该票券已作废'
}

function canVerify(staff) {
  if (!staff) return { ok: false, msg: '请先在员工模式登记' }
  if (staff.status !== 'approved') return { ok: false, msg: '员工身份待审核' }
  if (VERIFY_ROLES.indexOf(staff.role) < 0) return { ok: false, msg: '当前角色无检票权限' }
  return { ok: true }
}

function canConsume(ticket, now) {
  if (!ticket) return { ok: false, msg: '票券不存在' }
  if (CONSUMABLE.indexOf(ticket.status) < 0) {
    const msg = STATUS_MSG[ticket.status] || '该票券当前状态不可核销'
    return { ok: false, msg: ticket.status === 'used' && ticket.usedAt ? msg + '（' + ticket.usedAt + '）' : msg }
  }
  const time = now instanceof Date ? now : new Date()
  if (ticket.expireAt && new Date(ticket.expireAt).getTime() < time.getTime()) {
    return { ok: false, msg: '该票券已过期' }
  }
  return { ok: true }
}

function signToken(ticketNo, ts, secret) {
  const sign = crypto.createHmac('sha256', secret).update(ticketNo + '.' + ts).digest('hex').slice(0, 16)
  return 'TK.' + ticketNo + '.' + ts + '.' + sign
}

/**
 * 解析入园码。动态 token 验签 + 校验时效；非 token 视为员工手输票号（弱网兜底）。
 */
function resolveTicketNo(input, secret, now) {
  const raw = String(input || '').trim()
  if (!raw) return { error: '请扫码或输入票号' }
  if (raw.indexOf('TK.') !== 0) return { ticketNo: raw.slice(0, 40) }

  const parts = raw.split('.')
  if (parts.length !== 4) return { error: '入园码格式错误' }
  const ticketNo = parts[1]
  const ts = parts[2]
  const expect = crypto.createHmac('sha256', secret).update(ticketNo + '.' + ts).digest('hex').slice(0, 16)
  if (parts[3] !== expect) return { error: '入园码无效' }
  const nowSec = Math.floor((now instanceof Date ? now.getTime() : Date.now()) / 1000)
  if (nowSec - Number(ts) > TTL) return { error: '入园码已过期，请让游客刷新' }
  return { ticketNo }
}

function buildVerification(ticket, staff, now) {
  const t = ticket || {}
  const s = staff || {}
  return {
    type: 'ticket',
    ticketNo: t.ticketNo || '',
    orderId: t.orderId || '',
    productName: t.productName || '',
    customerOpenid: t._openid || '',
    staffOpenid: s._openid || '',
    staffName: s.name || '',
    staffRole: s.role || '',
    createdAt: now instanceof Date ? now : new Date()
  }
}

module.exports = { TTL, VERIFY_ROLES, CONSUMABLE, canVerify, canConsume, signToken, resolveTicketNo, buildVerification }
