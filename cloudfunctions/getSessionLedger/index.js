// 云函数：getSessionLedger —— 按日期返回各场次的预约/核销台账
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./booking-core.js')

const VIEW_ROLES = ['front', 'creek', 'admin']

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const s = await db.collection('staff').where({ _openid: OPENID }).limit(1).get()
  const staff = s.data[0]
  if (!staff || staff.status !== 'approved' || VIEW_ROLES.indexOf(staff.role) < 0) {
    return { code: 403, msg: '无查看权限' }
  }

  const date = String(event.date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { code: 400, msg: '日期格式不正确' }

  try {
    const start = new Date(date + 'T00:00:00+08:00')
    const end = new Date(start.getTime() + 24 * 3600 * 1000)
    const sess = await db.collection('sessions')
      .where({ date: _.gte(start).and(_.lt(end)) }).limit(50).get()
    const ids = sess.data.map((x) => x._id)
    if (!ids.length) return { code: 0, msg: 'ok', data: { ledger: {} } }

    const bookings = await db.collection('bookings')
      .where({ sessionId: _.in(ids) }).limit(1000).get()
    return { code: 0, msg: 'ok', data: { ledger: core.buildLedger(bookings.data) } }
  } catch (e) {
    return { code: 0, msg: 'ok', data: { ledger: {} } }
  }
}
