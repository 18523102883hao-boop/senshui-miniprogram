// 云函数：createSelfUpgrade —— 客户自助补差价升级下单（T26）
// 客户在「补差价升级」页选项目 → 填接待员工（选填）→ JSAPI 支付。
// 关键点：
//   ① 金额一律云端查 upgradeList 锁定，不信前端
//   ② 员工归属：按姓名或手机号匹配 staff 集合；匹配则写 staffOpenid，
//      直接计入现有 listMyCharges / getChargeSummary 员工业绩汇总
//   ③ 回调复用 payCallback 的 ticket_upgrade 分流（幂等置 paid）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const payConfig = require('./pay-config.js')
const CALLBACK_FN = 'payCallback'

function genOutTradeNo() {
  return ('U' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase()
}

exports.main = async (event) => {
  const SUB_MCH_ID = await payConfig.getSubMchId(db)
  if (!SUB_MCH_ID) return { code: 500, msg: payConfig.NOT_CONFIGURED_MSG }
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) return { code: 401, msg: '未登录' }

  const itemId = String(event.itemId || '')
  if (!itemId) return { code: 400, msg: '请选择升级项目' }

  // 1) 金额云端锁定
  const cfg = await db.collection('notices').where({ type: 'ticket_config' }).limit(1).get()
  const list = (cfg.data[0] && cfg.data[0].upgradeList) || []
  const item = list.find((i) => i.id === itemId && i.enabled !== false)
  if (!item || !Number.isInteger(item.price) || item.price <= 0) {
    return { code: 404, msg: '升级项不存在或已下架' }
  }

  // 2) 员工归属（选填）：按姓名或手机号匹配已登记员工
  const staffRef = String(event.staffRef || '').trim().slice(0, 20)
  let staffOpenid = ''
  let staffName = staffRef
  if (staffRef) {
    const s = await db.collection('staff')
      .where(_.or([{ name: staffRef, status: 'approved' }, { phone: staffRef, status: 'approved' }]))
      .limit(1).get()
    if (s.data.length) {
      staffOpenid = s.data[0]._openid
      staffName = s.data[0].name || staffRef
    }
  }

  // 3) 建单（source:'self' 区分自助购买）
  const outTradeNo = genOutTradeNo()
  const now = new Date()
  await db.collection('orders').add({
    data: {
      type: 'ticket_upgrade',
      outTradeNo,
      amount: item.price,
      status: 'pending',
      staffOpenid,
      staffName,
      staffNo: '',
      payerOpenid: OPENID,
      itemId: item.id,
      itemLabel: item.label || '票种升级',
      source: 'self',
      _openid: OPENID,
      createdAt: now,
      updatedAt: now,
      expireAt: new Date(now.getTime() + 30 * 60 * 1000)
    }
  })

  // 4) JSAPI 统一下单（付款人 = 当前客户）
  let res
  try {
    res = await cloud.cloudPay.unifiedOrder({
      body: '森水长河·票种升级',
      outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: SUB_MCH_ID,
      subAppid: wxContext.APPID, // 服务商模式子商户 APPID；若报"appid不匹配"可删
      totalFee: item.price,
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

  return { code: 0, msg: 'ok', data: { payment: res.payment, amount: item.price, itemLabel: item.label } }
}
