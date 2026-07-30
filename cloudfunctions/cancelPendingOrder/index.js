// 取消当前用户自己的待支付订单。
// 不删除订单：保留原始金额、商品和支付单号，仅写入取消状态与审计时间。
const cloud = require('wx-server-sdk')
const cancelCore = require('./cancel-core.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function fail(code, msg) {
  return { code, msg }
}

exports.main = async (event = {}) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return fail(401, '请先登录')

  const outTradeNo = String(event.outTradeNo || '').trim().slice(0, 64)
  if (!outTradeNo) return fail(400, '缺少订单号')

  try {
    // 先按订单号和用户归属定位，避免暴露或操作他人的订单。
    const found = await db.collection('orders')
      .where({ _openid: OPENID, outTradeNo })
      .limit(1)
      .get()
    if (!found.data.length) return fail(404, '订单不存在')

    const orderId = found.data[0]._id
    const result = await db.runTransaction(async (transaction) => {
      // 事务内重读并再次校验，防止支付回调和取消请求并发覆盖。
      const latest = await transaction.collection('orders').doc(orderId).get()
      const current = latest && latest.data
      if (!current || current._openid !== OPENID || current.outTradeNo !== outTradeNo) {
        return fail(404, '订单不存在')
      }

      const decision = cancelCore.resolve(current)
      if (!decision.ok) return fail(decision.code, decision.msg)

      const now = new Date()
      await transaction.collection('orders').doc(orderId).update({
        data: cancelCore.buildPatch(now)
      })
      return {
        code: 0,
        msg: 'ok',
        data: {
          outTradeNo,
          status: 'cancelled',
          cancelledAt: now
        }
      }
    })

    return result
  } catch (error) {
    console.error('[cancelPendingOrder] 取消订单失败', outTradeNo, error)
    return fail(500, '取消订单失败，请稍后重试')
  }
}

exports._private = { fail }
