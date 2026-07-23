// 云函数：createUpgradeCharge —— 员工发起补差价收款单 + 生成小程序码（T20）
// 关键点：
//   ① 员工角色云函数内二次校验（front/admin），不信前端隐藏入口
//   ② 金额由云函数确定：预设项查 upgradeList 取价 / 手输走上限校验，绝不信前端传入的价格
//   ③ 收款单 staffOpenid 由 getWXContext().OPENID 写入 → 员工归属不可篡改
//   ④ 生成小程序码（云调用 wxacode.getUnlimited），scene 带 chargeId，客户扫码进支付页
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_AMOUNT = 1000000        // 单笔上限 100 万分（1 万元），防手输多打一个 0
const CHARGE_TTL = 30 * 60 * 1000 // pending 收款单有效期 30 分钟
const PAY_PAGE = 'pages/pay/upgrade/upgrade'
// 小程序码指向的版本：正式版填 'release'；体验版调试填 'trial'；开发版填 'develop'
const QR_ENV_VERSION = process.env.QR_ENV_VERSION || 'release'

function genOutTradeNo() {
  return ('U' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase()
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '未登录' }

  // 1) 员工角色校验（收款仅限 front / admin）
  const staffRes = await db.collection('staff')
    .where({ _openid: OPENID, status: 'approved' }).limit(1).get()
  if (!staffRes.data.length) return { code: 403, msg: '无员工权限' }
  const staff = staffRes.data[0]
  if (!['front', 'admin'].includes(staff.role)) return { code: 403, msg: '当前角色无收款权限' }

  // 2) 确定金额与项目（金额一律由云端决定）
  let amount, itemId = null, itemLabel = ''
  if (event.itemId) {
    // 预设升级项：从 notices.upgradeList 查价，杜绝前端篡改价格
    const cfg = await db.collection('notices').where({ type: 'ticket_config' }).limit(1).get()
    const list = (cfg.data[0] && cfg.data[0].upgradeList) || []
    const item = list.find(i => i.id === event.itemId && i.enabled !== false)
    if (!item || !Number.isInteger(item.price)) return { code: 404, msg: '升级项不存在或已下架' }
    amount = item.price
    itemId = item.id
    itemLabel = item.label || '票种升级'
  } else {
    // 手输金额兜底
    amount = parseInt(event.amount, 10)
    itemLabel = String(event.itemLabel || '票种升级').slice(0, 40)
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { code: 400, msg: '金额不合法（1 分 ~ 1 万元）' }
  }

  // 3) 建 pending 收款单
  const outTradeNo = genOutTradeNo()
  const now = new Date()
  const expireAt = new Date(now.getTime() + CHARGE_TTL)
  const addRes = await db.collection('orders').add({
    data: {
      type: 'ticket_upgrade',
      outTradeNo,
      amount,
      status: 'pending',
      staffOpenid: OPENID,
      staffName: staff.name || '',
      staffNo: staff.staffNo || '',
      payerOpenid: '',
      itemId,
      itemLabel,
      _openid: OPENID,
      createdAt: now,
      updatedAt: now,
      expireAt
    }
  })
  const chargeId = addRes._id

  // 4) 生成小程序码（云调用免鉴权）。失败不阻断建单，前端可降级重试。
  //    注意：getUnlimited 生成的码由 envVersion 决定指向哪个版本；未发布正式版时用 trial。
  let qrBase64 = ''
  try {
    const wxacode = await cloud.openapi.wxacode.getUnlimited({
      scene: chargeId,        // _id 为十六进制字符串，满足 scene ≤32 且字符集要求
      page: PAY_PAGE,
      checkPath: false,       // 页面未发布时跳过路径校验
      envVersion: QR_ENV_VERSION,
      width: 280
    })
    qrBase64 = 'data:image/png;base64,' + Buffer.from(wxacode.buffer).toString('base64')
  } catch (e) {
    console.error('[createUpgradeCharge] wxacode 失败', e && (e.errMsg || e.message))
  }

  return { code: 0, msg: 'ok', data: { chargeId, outTradeNo, amount, itemLabel, qrBase64, expireAt } }
}
