// 云函数：getMyOrders —— 统一订单中心（PRD §14.4 / §18.6）
// 会员卡、补差价、门票三类订单归一后按时间倒序返回。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./order-core.js')

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const tab = String((event && event.tab) || '').trim()
  const where = { _openid: OPENID }
  const allow = core.TAB_STATUS[tab]
  if (allow) where.status = _.in(allow)

  try {
    const r = await db.collection('orders')
      .where(where).orderBy('createdAt', 'desc').limit(100).get()
    const list = core.sortOrders(r.data).map(core.toDisplayOrder)
    return { code: 0, msg: 'ok', data: { list } }
  } catch (e) {
    return { code: 0, msg: 'ok', data: { list: [] } }
  }
}
