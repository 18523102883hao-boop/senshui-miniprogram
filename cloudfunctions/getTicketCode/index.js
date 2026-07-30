// 云函数：getTicketCode —— 票券入园码（动态 token，防截图转发）
// 与会员码同一套 HMAC 方案：无状态签名 + 90 秒有效，核销端 verifyTicket 验签。
// ⚠️ 必须与 verifyTicket 配置相同的环境变量 TICKET_QR_SECRET。
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SECRET = process.env.TICKET_QR_SECRET || 'sr-dev-ticket-secret-change-me'
const TTL = 90

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const ticketNo = String((event && event.ticketNo) || '').trim().slice(0, 40)
  if (!ticketNo) return { code: 400, msg: '缺少票号' }

  const r = await db.collection('tickets').where({ _openid: OPENID, ticketNo }).limit(1).get()
  if (!r.data.length) return { code: 404, msg: '票券不存在' }
  const ticket = r.data[0]

  // 只有未使用/已占用的票可以出码
  if (ticket.status !== 'unused' && ticket.status !== 'reserved') {
    return { code: 400, msg: '该票券当前状态不可入园' }
  }
  if (ticket.expireAt && new Date(ticket.expireAt).getTime() < Date.now()) {
    return { code: 400, msg: '票券已过期' }
  }

  const ts = Math.floor(Date.now() / 1000)
  const sign = crypto.createHmac('sha256', SECRET).update(ticketNo + '.' + ts).digest('hex').slice(0, 16)
  return {
    code: 0,
    msg: 'ok',
    data: {
      token: 'TK.' + ticketNo + '.' + ts + '.' + sign,
      expiresIn: TTL,
      ticketNo,
      productName: ticket.productName || ''
    }
  }
}
