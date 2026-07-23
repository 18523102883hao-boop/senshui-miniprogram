// 云函数：payCallback —— 微信支付结果回调，按订单类型分流（T13 会员卡 / T20 补差价收款）
// 由各下单函数的 unifiedOrder(functionName:'payCallback') 指定，支付成功后微信回调此函数。
// 关键点：
//   ① 幂等：回调可能重复，已处理订单直接 ack，绝不重复处理
//   ② 事务：状态更新（+ 会员卡发卡）原子完成
//   ③ 类型分流：type='ticket_upgrade' 仅置 paid 记账；其余（会员卡）走发卡逻辑
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function genMemberCode() {
  return 'SR' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase()
}

// 微信支付回调要求返回 { errcode:0, errmsg:'SUCCESS' } 表示已成功接收，否则微信会重试
const ACK = { errcode: 0, errmsg: 'SUCCESS' }

exports.main = async (event) => {
  // 仅处理支付成功的回调；非成功也要 ack，避免微信无意义重试
  if (event.returnCode !== 'SUCCESS' || event.resultCode !== 'SUCCESS') {
    return ACK
  }

  const outTradeNo = event.outTradeNo
  const callbackOpenid = event.openid || event.subOpenid || (event.userInfo && event.userInfo.openId) || ''
  if (!outTradeNo) return ACK

  const orders = db.collection('orders')
  const orderRes = await orders.where({ outTradeNo }).limit(1).get()
  if (orderRes.data.length === 0) return ACK // 找不到订单，ack 防重试
  const order = orderRes.data[0]

  // 幂等短路：已处理
  if (order.status === 'paid' || order.status === 'paid_dup') return ACK

  // 按订单类型分流
  if (order.type === 'ticket_upgrade') {
    return handleUpgrade(order, event)
  }
  return handleMemberCard(order, event, callbackOpenid)
}

// —— 补差价收款（T20）：仅幂等置 paid，不发任何权益 ——
async function handleUpgrade(order, event) {
  try {
    await db.runTransaction(async (t) => {
      const o = await t.collection('orders').doc(order._id).get()
      if (o.data.status === 'paid' || o.data.status === 'paid_dup') return
      const now = new Date()
      await t.collection('orders').doc(order._id).update({
        data: {
          status: 'paid',
          paidAt: now,
          transactionId: event.transactionId || '',
          updatedAt: now
        }
      })
    })
  } catch (e) {
    console.error('[payCallback] 补差价收款事务失败', order.outTradeNo, e)
    return { errcode: 1, errmsg: 'RETRY' }
  }
  return ACK
}

// —— 会员卡（T13）：幂等发卡，权益到店核销时发放 ——
async function handleMemberCard(order, event, callbackOpenid) {
  const oid = order._openid || callbackOpenid
  try {
    await db.runTransaction(async (t) => {
      // 事务内重读订单，锁定状态
      const o = await t.collection('orders').doc(order._id).get()
      if (o.data.status === 'paid' || o.data.status === 'paid_dup') return

      const now = new Date()

      // 二次限购保护
      const dup = await t.collection('members')
        .where({ _openid: oid, status: 'active' })
        .limit(1)
        .get()
      if (dup.data.length > 0) {
        // 已有卡却又支付成功 → 标记重复支付，交由人工/退款流程处理，不再发第二张卡
        await t.collection('orders').doc(order._id).update({
          data: { status: 'paid_dup', paidAt: now, transactionId: event.transactionId || '', updatedAt: now }
        })
        return
      }

      // 建会员卡（权益初始未发放，核销时发）
      // 权益（T20 调整）：长河令（一次性到店发放）+ 生日当天 85 折（生日当天可反复，绑定本人）
      const expireAt = new Date(now.getTime() + 365 * 24 * 3600 * 1000)
      await t.collection('members').add({
        data: {
          _openid: oid,
          memberCode: genMemberCode(),
          status: 'active',
          birthday: order.birthday || '', // MM-DD，购卡时录入
          benefits: {
            ling: { total: 1000, granted: false },
            birthday: { discount: 0.85 } // 生日当天 85 折，非一次性、无 granted
          },
          orderId: order.outTradeNo,
          activatedAt: now,
          expireAt,
          createdAt: now,
          updatedAt: now
        }
      })

      // 更新订单为已支付
      await t.collection('orders').doc(order._id).update({
        data: { status: 'paid', paidAt: now, transactionId: event.transactionId || '', updatedAt: now }
      })
    })
  } catch (e) {
    // 事务失败：不 ack 成功，返回错误让微信重试（下次幂等短路会兜住已成功的部分）
    console.error('[payCallback] 发卡事务失败', order.outTradeNo, e)
    return { errcode: 1, errmsg: 'RETRY' }
  }

  return ACK
}
