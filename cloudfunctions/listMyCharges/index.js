// 云函数：listMyCharges —— 员工查询自己的补差价收款（T20）
// 返回：今日合计 / 累计合计（笔数+金额）+ 最近明细。只统计 status='paid'。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '未登录' }

  const staffRes = await db.collection('staff')
    .where({ _openid: OPENID, status: 'approved' }).limit(1).get()
  if (!staffRes.data.length) return { code: 403, msg: '无员工权限' }

  const orders = db.collection('orders')
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  async function sumPaid(match) {
    const r = await orders.aggregate()
      .match(match)
      .group({ _id: null, total: $.sum('$amount'), count: $.sum(1) })
      .end()
    const g = r.list && r.list[0]
    return { total: g ? g.total : 0, count: g ? g.count : 0 }
  }

  const baseMatch = { type: 'ticket_upgrade', status: 'paid', staffOpenid: OPENID }
  const today = await sumPaid(Object.assign({}, baseMatch, { paidAt: _.gte(dayStart) }))
  const all = await sumPaid(baseMatch)

  const listRes = await orders
    .where(baseMatch)
    .orderBy('paidAt', 'desc')
    .limit(50)
    .field({ amount: true, itemLabel: true, paidAt: true, outTradeNo: true })
    .get()

  return { code: 0, msg: 'ok', data: { today, all, list: listRes.data } }
}
