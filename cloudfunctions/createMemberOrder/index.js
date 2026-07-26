// 云函数：createMemberOrder —— 会员卡下单 + 微信云支付统一下单（T13 / T20 权益调整）
// 关键点：① 限购 1 张校验 ② 购卡必填生日（存入订单，发卡时写入会员卡）
//         ③ 5 分钟内复用未支付订单，避免重复下单 ④ 云支付回调指向 payCallback
//
// 前置条件（部署前）：
//   1. 云开发已开通微信支付、完成商户号关联
//   2. 环境变量 SUB_MCH_ID 配置为子商户号
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MEMBER_PRICE = 990 // 分（9.9 元）
const payConfig = require('./pay-config.js')
const CALLBACK_FN = 'payCallback' // 支付成功回调云函数
const REUSE_WINDOW = 5 * 60 * 1000 // 未支付订单复用窗口

function genOrderId() {
  return ('M' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase()
}

// 校验生日格式 MM-DD 且月日合法（只存月日：生日权益仅看月日，且不暴露年龄）
function normalizeBirthday(input) {
  if (!input || !/^\d{2}-\d{2}$/.test(input)) return null
  const mm = Number(input.slice(0, 2))
  const dd = Number(input.slice(3, 5))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return input
}

exports.main = async (event) => {
  const SUB_MCH_ID = await payConfig.getSubMchId(db)
  if (!SUB_MCH_ID) return { code: 500, msg: payConfig.NOT_CONFIGURED_MSG }
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) return { code: 401, msg: '未登录' }

  // 0) 购卡必填生日（生日权益依据，一经下单锁定）
  const birthday = normalizeBirthday(event && event.birthday)
  if (!birthday) return { code: 400, msg: '请先选择生日（MM-DD）' }

  const members = db.collection('members')
  const orders = db.collection('orders')

  // 1) 限购：已有有效卡直接拒绝
  const existedCard = await members
    .where({ _openid: OPENID, status: _.in(['active', 'paid']) })
    .limit(1)
    .get()
  if (existedCard.data.length > 0) return { code: 409, msg: '每人限购 1 张会员卡' }

  // 2) 复用近 5 分钟内的未支付订单，避免用户连点生成多单（同时更新生日）
  const pending = await orders
    .where({ _openid: OPENID, type: 'member_card', status: 'pending' })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  let orderId
  const reusable =
    pending.data.length &&
    Date.now() - new Date(pending.data[0].createdAt).getTime() < REUSE_WINDOW
  if (reusable) {
    orderId = pending.data[0].outTradeNo
    await orders.doc(pending.data[0]._id).update({ data: { birthday, updatedAt: new Date() } })
  } else {
    orderId = genOrderId()
    await orders.add({
      data: {
        _openid: OPENID,
        type: 'member_card',
        outTradeNo: orderId,
        amount: MEMBER_PRICE,
        status: 'pending',
        birthday,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
  }

  // 3) 云支付统一下单
  let res
  try {
    res = await cloud.cloudPay.unifiedOrder({
      body: '森水会员卡',
      outTradeNo: orderId,
      spbillCreateIp: '127.0.0.1',
      subMchId: SUB_MCH_ID,
      subAppid: wxContext.APPID, // 子商户小程序 APPID（服务商模式要求；若报"appid不匹配"可删）
      totalFee: MEMBER_PRICE,
      envId: wxContext.ENV,
      functionName: CALLBACK_FN,
      nonceStr: Math.random().toString(36).slice(2),
      tradeType: 'JSAPI',
      openid: OPENID
    })
  } catch (e) {
    return { code: 500, msg: '下单异常：' + (e.errMsg || e.message || '') }
  }

  if (res.returnCode !== 'SUCCESS' || res.resultCode !== 'SUCCESS') {
    return { code: 500, msg: '下单失败：' + (res.returnMsg || res.errCodeDes || '未知') }
  }

  return { code: 0, msg: 'ok', data: { orderId, payment: res.payment } }
}
