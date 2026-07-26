// 云函数：requestTicketRefund —— 门票退款（PRD §8.5 / 业务参数 §4）
// 原则：能自动退就走 cloudPay.refund；不能就落人工售后单，绝不伪造"退款成功"。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./refund-core.js')

const payConfig = require('./pay-config.js')

exports.main = async (event) => {
  // 子商户号可能来自数据库，只能在运行时求值（原本在模块顶层算，配置改了要等容器回收才生效）
  const SUB_MCH_ID = await payConfig.getSubMchId(db)
  const PAY_REFUND_ENABLED = !!SUB_MCH_ID && process.env.PAY_REFUND_ENABLED !== 'false'
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const outTradeNo = String((event && event.outTradeNo) || '').trim().slice(0, 32)
  if (!outTradeNo) return { code: 400, msg: '缺少订单号' }
  const wanted = Array.isArray(event && event.ticketNos) ? event.ticketNos.slice(0, 50) : []
  const reason = String((event && event.reason) || '').slice(0, 100)

  const o = await db.collection('orders').where({ _openid: OPENID, outTradeNo, type: 'ticket_order' }).limit(1).get()
  if (!o.data.length) return { code: 404, msg: '订单不存在' }
  const order = o.data[0]

  const t = await db.collection('tickets').where({ _openid: OPENID, orderId: outTradeNo }).get()
  const scoped = wanted.length ? t.data.filter((x) => wanted.indexOf(x.ticketNo) >= 0) : t.data

  const plan = core.planRefund({
    tickets: scoped,
    order,
    partial: wanted.length > 0 && wanted.length < t.data.length,
    payRefundEnabled: PAY_REFUND_ENABLED
  })

  if (plan.mode === 'reject') return { code: 400, msg: plan.msg }

  const now = new Date()
  const ticketNos = plan.ticketNos || []

  // 先把票置为退款中，避免退款处理期间被核销
  if (ticketNos.length) {
    await db.collection('tickets')
      .where({ orderId: outTradeNo, ticketNo: _.in(ticketNos), status: _.in(core.REFUNDABLE) })
      .update({ data: { status: 'refund_pending', updatedAt: now } })
  }

  if (plan.mode === 'manual') {
    // 人工售后单：明确告知用户需要客服处理，不动订单支付状态
    await db.collection('refund_requests').add({
      data: {
        _openid: OPENID, outTradeNo, ticketNos, reason,
        refundFee: plan.refundFee || 0, status: 'pending',
        createdAt: now, updatedAt: now
      }
    }).catch(() => {})
    return { code: 0, msg: 'ok', data: { mode: 'manual', msg: plan.msg, ticketNos } }
  }

  // 自动退款：退款单号稳定，失败可原样重试而不会退两次
  const outRefundNo = core.buildOutRefundNo(outTradeNo, ticketNos)
  try {
    await cloud.cloudPay.refund({
      subMchId: SUB_MCH_ID,
      outTradeNo,
      outRefundNo,
      totalFee: plan.totalFee,
      refundFee: plan.refundFee
    })
  } catch (e) {
    // 退款没成功就把票放回可用状态，让用户能重试或改走人工
    await db.collection('tickets')
      .where({ orderId: outTradeNo, ticketNo: _.in(ticketNos), status: 'refund_pending' })
      .update({ data: { status: 'unused', updatedAt: new Date() } })
    return { code: 500, msg: '退款发起失败，请稍后重试或联系客服' }
  }

  await db.collection('tickets')
    .where({ orderId: outTradeNo, ticketNo: _.in(ticketNos), status: 'refund_pending' })
    .update({ data: { status: 'refunded', refundedAt: now, updatedAt: now } })

  // 整单全退才把订单置为已退款，部分退保持 paid
  const left = await db.collection('tickets')
    .where({ orderId: outTradeNo, status: _.in(['unused', 'reserved', 'used']) })
    .count()
  if (!left.total) {
    await db.collection('orders').doc(order._id).update({ data: { status: 'refunded', updatedAt: now } })
  }

  return { code: 0, msg: 'ok', data: { mode: 'auto', refundFee: plan.refundFee, ticketNos, outRefundNo } }
}
