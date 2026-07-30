// 云函数：repayOrder —— 待支付订单重新拉起支付（三类订单统一入口）
//
// 背景：订单中心的「继续支付」原本跳门票支付结果页轮询，有两个错：
//   ① 结果页轮询的是 getMyTickets，会员卡/补差价订单永远查不到票，卡死在「支付确认中」
//   ② 待支付订单根本没付过钱，轮询本就不会成功——该做的是重新调起微信支付
//
// 安全要点：
//   ① 只能付自己的单：openid 取自 getWXContext，与订单 _openid 比对
//   ② 金额取云端已存的订单金额，完全不接受客户端传入
//   ③ 复用原 outTradeNo，微信侧视为同一笔，不会重复建单
//   ④ 只有 pending 才放行，已支付/已退款/已取消一律拒绝
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const payConfig = require('./pay-config.js')

const CALLBACK_FN = 'payCallback'

// 支付时展示的商品描述，按订单类型区分
const BODY_TEXT = {
  member_card: '森水长河·会员卡',
  ticket_upgrade: '森水长河·票种升级',
  ticket_order: '森水长河·门票'
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const outTradeNo = String((event && event.outTradeNo) || '').trim().slice(0, 64)
  if (!outTradeNo) return { code: 400, msg: '缺少订单号' }

  const SUB_MCH_ID = await payConfig.getSubMchId(db)
  if (!SUB_MCH_ID) return { code: 500, msg: payConfig.NOT_CONFIGURED_MSG }

  const res = await db.collection('orders').where({ outTradeNo }).limit(1).get().catch(() => null)
  const order = res && res.data && res.data[0]
  if (!order) return { code: 404, msg: '订单不存在' }

  // 补差价单的付款人字段是 payerOpenid（员工建单、客户扫码付），其余是下单人 _openid
  const owner = order.type === 'ticket_upgrade' ? (order.payerOpenid || order._openid) : order._openid
  if (owner && owner !== OPENID) return { code: 403, msg: '无权支付该订单' }

  if (order.status !== 'pending') {
    const done = order.status === 'paid' || order.status === 'paid_dup'
    return { code: 409, msg: done ? '该订单已支付' : '该订单已关闭', status: order.status }
  }
  if (order.expireAt && Date.now() > new Date(order.expireAt).getTime()) {
    return { code: 409, msg: '订单已过期，请重新下单', status: 'expired' }
  }

  // 金额字段历史上有两套：门票用 totalFee，会员卡/补差价用 amount
  const totalFee = typeof order.totalFee === 'number' ? order.totalFee : order.amount
  if (!Number.isFinite(totalFee) || totalFee <= 0) return { code: 500, msg: '订单金额异常，请联系前台' }

  // 补差价单首次由本人支付时补记付款人，与 payUpgradeCharge 行为一致
  if (order.type === 'ticket_upgrade' && !order.payerOpenid) {
    await db.collection('orders').doc(order._id).update({
      data: { payerOpenid: OPENID, updatedAt: new Date() }
    }).catch(() => null)
  }

  let payRes
  try {
    payRes = await cloud.cloudPay.unifiedOrder({
      body: BODY_TEXT[order.type] || '森水长河',
      outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: SUB_MCH_ID,
      subAppid: wxContext.APPID,
      totalFee,
      envId: wxContext.ENV,
      functionName: CALLBACK_FN,
      nonceStr: Math.random().toString(36).slice(2),
      tradeType: 'JSAPI',
      openid: OPENID
    })
  } catch (e) {
    return { code: 500, msg: '下单异常：' + (e.errMsg || e.message || '') }
  }

  if (!payRes || !payRes.payment) return { code: 500, msg: '拉起支付失败，请稍后重试' }

  return {
    code: 0,
    data: {
      outTradeNo,
      type: order.type,
      amount: totalFee,
      payment: payRes.payment
    }
  }
}
