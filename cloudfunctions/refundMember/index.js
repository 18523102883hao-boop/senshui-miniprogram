// 云函数：refundMember —— 会员卡 7 天无理由退款（未核销任一权益）（T13）
// 说明：真实退款走 cloudPay.refund；退款结果建议再配退款回调更新终态，此处先置 refunding。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SEVEN_DAYS = 7 * 24 * 3600 * 1000
const payConfig = require('./pay-config.js')
const invoiceRefund = require('./invoice-refund.js')

async function getInvoiceForRefund(openid, outTradeNo) {
  const result = await db.collection('invoice_requests')
    .where({ _openid: openid, outTradeNo })
    .limit(1)
    .get()
  return result.data[0] || null
}

async function cancelInvoiceForRefund(invoice, order, now) {
  const decision = invoiceRefund.resolve(invoice)
  if (!decision.shouldCancel || !invoice || !invoice._id) return false
  const patch = invoiceRefund.buildCancellationPatch(invoice, now)
  // 先关闭订单摘要，确保即使明细同步异常，管理员也不能继续完成开票。
  await db.collection('orders').doc(order._id).update({
    data: {
      invoiceStatus: 'cancelled_refund',
      invoiceRevision: Number(invoice.revision) || 1,
      updatedAt: now
    }
  })
  await db.collection('invoice_requests').doc(invoice._id).update({ data: patch })
  return true
}

exports.main = async () => {
  const SUB_MCH_ID = await payConfig.getSubMchId(db)
  if (!SUB_MCH_ID) return { code: 500, msg: payConfig.NOT_CONFIGURED_MSG }
  const { OPENID } = cloud.getWXContext()
  const r = await db.collection('members').where({ _openid: OPENID, status: 'active' }).limit(1).get()
  if (r.data.length === 0) return { code: 404, msg: '无有效会员卡' }

  const m = r.data[0]
  const b = m.benefits || {}
  // 未核销任一权益才可退：已发令 或 有过任何核销留痕（含生日 85 折使用）
  const verifCount = await db.collection('verifications').where({ memberCode: m.memberCode }).count()
  const anyGranted = (b.ling && b.ling.granted) || verifCount.total > 0
  if (anyGranted) return { code: 400, msg: '已核销权益，不支持退款' }
  if (Date.now() - new Date(m.createdAt).getTime() >= SEVEN_DAYS) return { code: 400, msg: '超过 7 天无理由期限' }

  // 定位支付订单
  const orderRes = await db.collection('orders').where({ outTradeNo: m.orderId }).limit(1).get()
  if (orderRes.data.length === 0) return { code: 404, msg: '订单不存在' }
  const order = orderRes.data[0]
  const invoice = await getInvoiceForRefund(OPENID, m.orderId)
  const invoiceDecision = invoiceRefund.resolve(invoice || { status: order.invoiceStatus })
  if (!invoiceDecision.ok) {
    return { code: invoiceDecision.code, msg: invoiceDecision.msg }
  }

  // 发起退款
  try {
    await cloud.cloudPay.refund({
      subMchId: SUB_MCH_ID,
      outTradeNo: m.orderId,
      outRefundNo: 'R' + m.orderId,
      totalFee: order.amount,
      refundFee: order.amount
    })
  } catch (e) {
    return { code: 500, msg: '退款发起失败：' + (e.errMsg || e.message || '') }
  }

  // 退款为异步到账，此处乐观置 refunded：会员卡立即失效、权益不再展示（如需严格终态可另配退款回调）
  const now = new Date()
  await db.collection('members').doc(m._id).update({ data: { status: 'refunded', refundedAt: now, updatedAt: now } })
  await db.collection('orders').doc(order._id).update({ data: { status: 'refunded', updatedAt: now } })
  let invoiceSyncPending = false
  try {
    await cancelInvoiceForRefund(invoice, order, now)
  } catch (e) {
    invoiceSyncPending = true
    console.error('[refundMember] 开票申请关闭失败', e)
  }

  return { code: 0, msg: 'ok', data: { status: 'refunded', invoiceSyncPending } }
}

exports._private = { getInvoiceForRefund, cancelInvoiceForRefund }
