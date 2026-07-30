// 云函数：verifyTicket —— 员工核销门票（PRD §8.7 / §18.2）
// 两段式：confirm=false 只查询预览；confirm=true 才真正核销，避免误扫直接销票。
// 幂等：条件更新（status 必须仍是 unused/reserved）防并发重复核销。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./verify-core.js')

// ⚠️ 必须与 getTicketCode 的 TICKET_QR_SECRET 一致，否则验签必失败
const SECRET = process.env.TICKET_QR_SECRET || 'sr-dev-ticket-secret-change-me'

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  // 员工权限校验（云端二次校验，不信任前端）
  const s = await db.collection('staff').where({ _openid: OPENID }).limit(1).get()
  const staff = s.data[0]
  const perm = core.canVerify(staff)
  if (!perm.ok) return { code: 403, msg: perm.msg }

  const now = new Date()
  const resolved = core.resolveTicketNo(event && (event.token || event.ticketNo), SECRET, now)
  if (resolved.error) return { code: 400, msg: resolved.error }

  const r = await db.collection('tickets').where({ ticketNo: resolved.ticketNo }).limit(1).get()
  if (!r.data.length) return { code: 404, msg: '票券不存在' }
  const ticket = r.data[0]
  const admissionCount = core.resolveAdmissionCount(ticket)
  const admissionCountUnknown = admissionCount === null

  const usable = core.canConsume(ticket, now)
  const preview = {
    ticketNo: ticket.ticketNo,
    productName: ticket.productName,
    status: ticket.status,
    visitDate: ticket.visitDate,
    seq: ticket.seq,
    total: ticket.total,
    admissionCount: admissionCount,
    admissionCountUnknown: admissionCountUnknown,
    usedAt: ticket.usedAt || null,
    expireAt: ticket.expireAt || null
  }

  // 预览：只回状态，不改数据
  if (!event || !event.confirm) {
    if (!usable.ok) return { code: 400, msg: usable.msg, data: { ticket: preview, verified: false } }
    return { code: 0, msg: 'ok', data: { ticket: preview, verified: false, canVerify: true } }
  }

  if (!usable.ok) return { code: 400, msg: usable.msg, data: { ticket: preview, verified: false } }

  const verificationPatch = {
    status: 'used',
    usedAt: now,
    verifiedBy: OPENID,
    updatedAt: now
  }
  if (!admissionCountUnknown) verificationPatch.admissionCount = admissionCount

  // 条件更新：并发下只有一次能命中，第二次 updated=0
  const upd = await db.collection('tickets')
    .where({ ticketNo: resolved.ticketNo, status: _.in(core.CONSUMABLE) })
    .update({ data: verificationPatch })

  if (!upd.stats.updated) {
    return { code: 400, msg: '该票券已核销', data: { ticket: preview, verified: false } }
  }

  await db.collection('verifications').add({
    data: core.buildVerification(Object.assign({}, ticket, { admissionCount }), staff, now)
  })

  return {
    code: 0,
    msg: 'ok',
    data: { ticket: Object.assign({}, preview, { status: 'used', usedAt: now }), verified: true }
  }
}
