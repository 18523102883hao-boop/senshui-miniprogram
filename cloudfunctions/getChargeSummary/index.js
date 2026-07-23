// 云函数：getChargeSummary —— 管理员按员工汇总补差价收款（T20）
// 权限：仅 role='admin'。返回按员工分组的金额合计 + 明细（供前端导出 CSV 算提成）。
// 时间过滤：event.from / event.to 为毫秒时间戳（前端算好，避免时区歧义），可选。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const DETAIL_LIMIT = 500 // 明细上限，够线下补差价对账用

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '未登录' }

  const staffRes = await db.collection('staff')
    .where({ _openid: OPENID, status: 'approved' }).limit(1).get()
  if (!staffRes.data.length || staffRes.data[0].role !== 'admin') {
    return { code: 403, msg: '需要管理员权限' }
  }

  const orders = db.collection('orders')
  const match = { type: 'ticket_upgrade', status: 'paid' }
  const from = Number(event && event.from)
  const to = Number(event && event.to)
  if (from || to) {
    const range = {}
    if (from) range.gte = new Date(from)
    if (to) range.lt = new Date(to)
    match.paidAt = from && to ? _.gte(range.gte).and(_.lt(range.lt))
      : from ? _.gte(range.gte) : _.lt(range.lt)
  }

  // 按员工分组汇总
  const agg = await orders.aggregate()
    .match(match)
    .group({
      _id: { staffOpenid: '$staffOpenid', staffName: '$staffName', staffNo: '$staffNo' },
      total: $.sum('$amount'),
      count: $.sum(1)
    })
    .end()

  const byStaff = (agg.list || [])
    .map(g => ({
      staffOpenid: g._id.staffOpenid,
      staffName: g._id.staffName || '',
      staffNo: g._id.staffNo || '',
      total: g.total,
      count: g.count
    }))
    .sort((a, b) => b.total - a.total)

  const grandTotal = byStaff.reduce((s, x) => s + x.total, 0)
  const grandCount = byStaff.reduce((s, x) => s + x.count, 0)

  // 明细（供导出）
  const detailRes = await orders
    .where(match)
    .orderBy('paidAt', 'desc')
    .limit(DETAIL_LIMIT)
    .field({ staffName: true, staffNo: true, amount: true, itemLabel: true, paidAt: true, outTradeNo: true })
    .get()

  return {
    code: 0,
    msg: 'ok',
    data: { byStaff, grandTotal, grandCount, detail: detailRes.data }
  }
}
