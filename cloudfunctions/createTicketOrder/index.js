// 云函数：createTicketOrder —— 门票下单 + 拉起支付（PRD §8.5 / §18.2）
// 安全要点：
//   ① 金额只由云端商品快照计算，忽略客户端传入的任何价格
//   ② 幂等键复用未支付订单，避免连点重复建单
//   ③ openid 取自 getWXContext，不接受客户端传入
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const core = require('./order-core.js')

const SUB_MCH_ID = process.env.SUB_MCH_ID || ''
const NATIVE_PAY_READY = process.env.NATIVE_PAY_READY !== 'false'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }
  if (!NATIVE_PAY_READY) return { code: 503, msg: '在线购票暂未开放，请联系管家' }
  if (!SUB_MCH_ID) return { code: 500, msg: '支付未配置，请联系管理员' }

  const productId = String(event.productId || '').trim().slice(0, 64)
  const idempotencyKey = core.normalizeIdempotencyKey(event.idempotencyKey)
  if (!productId) return { code: 400, msg: '缺少商品' }
  if (!idempotencyKey) return { code: 400, msg: '缺少幂等键' }

  // 幂等：同一键已有待支付订单则直接复用，重新拉起支付
  const mine = await db.collection('orders')
    .where({ _openid: OPENID, idempotencyKey })
    .limit(5).get()
  const reusable = core.pickReusableOrder(mine.data, idempotencyKey)

  const prodRes = await db.collection('ticket_products').doc(productId).get().catch(() => null)
  const product = prodRes && prodRes.data
  const resolved = core.resolveOrder({
    product,
    quantity: event.quantity,
    visitDate: event.visitDate
  })
  if (!resolved.ok) return { code: 400, msg: resolved.msg }

  const now = new Date()
  let outTradeNo
  let orderId

  if (reusable) {
    outTradeNo = reusable.outTradeNo
    orderId = reusable._id
  } else {
    outTradeNo = core.buildOutTradeNo('TK')
    const contact = event.contact || {}
    const add = await db.collection('orders').add({
      data: {
        _openid: OPENID,
        type: 'ticket_order',
        outTradeNo,
        idempotencyKey,
        productId,
        sku: product.sku || '',
        productName: product.name || '',
        quantity: resolved.quantity,
        unitPrice: resolved.unitPrice,
        totalFee: resolved.totalFee,
        amount: resolved.totalFee, // 与既有订单字段对齐
        visitDate: resolved.visitDate,
        contact: {
          name: String(contact.name || '').slice(0, 20),
          phone: String(contact.phone || '').slice(0, 20)
        },
        status: 'pending',
        createdAt: now,
        updatedAt: now
      }
    })
    orderId = add._id
  }

  try {
    const res = await cloud.cloudPay.unifiedOrder({
      body: '森水长河 · ' + (product.name || '门票'),
      outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: SUB_MCH_ID,
      subAppid: wxContext.APPID,
      totalFee: resolved.totalFee,
      envId: wxContext.ENV,
      functionName: 'payCallback',
      nonceStr: Math.random().toString(36).slice(2),
      tradeType: 'JSAPI',
      openid: OPENID
    })
    return {
      code: 0,
      msg: 'ok',
      data: {
        payment: res.payment,
        outTradeNo,
        orderId,
        totalFee: resolved.totalFee,
        quantity: resolved.quantity
      }
    }
  } catch (e) {
    console.error('[createTicketOrder] 统一下单失败', outTradeNo, e)
    return { code: 500, msg: '发起支付失败，请稍后重试' }
  }
}
