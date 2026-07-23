// 云函数：getUpgradeCharge —— 客户扫码后拉取收款单详情（T20）
// 只读展示：金额、项目、状态；不泄露员工 openid。前端据此渲染支付确认页。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
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

  const expired = c.status === 'pending' && c.expireAt && Date.now() > new Date(c.expireAt).getTime()
  const status = c.status === 'pending' && expired ? 'expired' : c.status

  return {
    code: 0,
    msg: 'ok',
    data: {
      chargeId,
      amount: c.amount,
      itemLabel: c.itemLabel || '票种升级',
      staffName: c.staffName || '',
      status,                          // pending / paid / cancelled / expired
      paid: c.status === 'paid'
    }
  }
}
