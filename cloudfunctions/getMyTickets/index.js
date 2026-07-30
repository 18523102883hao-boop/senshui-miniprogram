// 云函数：getMyTickets —— 我的票券（PRD §18.2）
// 也用于支付结果页轮询：传 outTradeNo 时一并返回该订单状态。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ALLOWED_STATUS = ['unused', 'reserved', 'used', 'refund_pending', 'refunded', 'expired', 'void']

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const status = String((event && event.status) || '').trim()
  const outTradeNo = String((event && event.outTradeNo) || '').trim().slice(0, 32)

  const where = { _openid: OPENID }
  if (status && ALLOWED_STATUS.indexOf(status) >= 0) where.status = status
  if (outTradeNo) where.orderId = outTradeNo

  let list = []
  try {
    const r = await db.collection('tickets').where(where).orderBy('createdAt', 'desc').limit(100).get()
    list = r.data.map((t) => ({
      ticketNo: t.ticketNo,
      orderId: t.orderId,
      productId: t.productId,
      productName: t.productName,
      unitPrice: t.unitPrice,
      visitDate: t.visitDate,
      status: t.status,
      seq: t.seq,
      total: t.total,
      expireAt: t.expireAt,
      usedAt: t.usedAt || null
    }))
  } catch (e) { /* 集合不存在时返回空 */ }

  // 结果页轮询用：回调可能延迟，前端据此显示「确认中」
  let order = null
  if (outTradeNo) {
    try {
      const o = await db.collection('orders').where({ _openid: OPENID, outTradeNo }).limit(1).get()
      if (o.data.length) {
        order = { outTradeNo, status: o.data[0].status, totalFee: o.data[0].totalFee, quantity: o.data[0].quantity }
      }
    } catch (e) { /* ignore */ }
  }

  return { code: 0, msg: 'ok', data: { list, order } }
}
