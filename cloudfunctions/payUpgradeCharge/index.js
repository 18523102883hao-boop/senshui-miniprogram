// 云函数：payUpgradeCharge —— 客户发起补差价支付（JSAPI 统一下单）（T20）
// 关键点：
//   ① 付款人 openid = getWXContext().OPENID（客户本人），不信前端
//   ② 金额从收款单读取（已由 createUpgradeCharge 云端锁定），不信前端传入
//   ③ 已支付 / 已取消 / 已过期的单拒绝再次下单
//   ④ 回调复用现有 payCallback，通过 outTradeNo 关联，type 分流处理
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SUB_MCH_ID = process.env.SUB_MCH_ID || '' // 与会员卡同一子商户号
const CALLBACK_FN = 'payCallback'

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) return { code: 401, msg: '未登录' }
  const chargeId = event.chargeId
  if (!chargeId) return { code: 400, msg: '参数缺失' }

  let doc
  try {
    doc = await db.collection('orders').doc(chargeId).get()
  } catch (e) {
    return { code: 404, msg: '收款单不存在' }
  }
  const c = doc.data
  if (!c || c.type !== 'ticket_upgrade') return { code: 404, msg: '收款单不存在' }
  if (c.status === 'paid' || c.status === 'paid_dup') return { code: 409, msg: '该收款单已支付' }
  if (c.status === 'cancelled') return { code: 409, msg: '该收款单已取消' }
  if (c.expireAt && Date.now() > new Date(c.expireAt).getTime()) {
    return { code: 409, msg: '收款单已过期，请让员工重新生成' }
  }

  // 记录付款客户（首次写入，不覆盖）
  if (!c.payerOpenid) {
    await db.collection('orders').doc(chargeId).update({
      data: { payerOpenid: OPENID, updatedAt: new Date() }
    })
  }

  // 云支付统一下单（付款人 = 客户 OPENID，金额 = 单据金额）
  let res
  try {
    res = await cloud.cloudPay.unifiedOrder({
      body: '森水长河·票种升级',
      outTradeNo: c.outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: SUB_MCH_ID,
      subAppid: wxContext.APPID, // 子商户小程序 APPID（服务商模式要求；若报"appid不匹配"可删）
      totalFee: c.amount,
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

  return { code: 0, msg: 'ok', data: { payment: res.payment, amount: c.amount } }
}
