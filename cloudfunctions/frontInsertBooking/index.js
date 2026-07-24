// 云函数：frontInsertBooking —— 前台为现场客人插单
// 与线上走同一库存池（同样的条件更新占位），不会超卖。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./booking-core.js')

const INSERT_ROLES = ['front', 'admin']

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const s = await db.collection('staff').where({ _openid: OPENID }).limit(1).get()
  const staff = s.data[0]
  if (!staff || staff.status !== 'approved' || INSERT_ROLES.indexOf(staff.role) < 0) {
    return { code: 403, msg: '当前角色无插单权限' }
  }

  const sessionId = String(event.sessionId || '').trim()
  const phone = String(event.phone || '').trim()
  const boardingNo = String(event.boardingNo || '').trim()
  if (!sessionId || !boardingNo) return { code: 400, msg: '缺少场次或上车号码' }
  if (!/^1[3-9]\d{9}$/.test(phone)) return { code: 400, msg: '手机号格式不正确' }

  // 与线上同一把锁：条件更新占位
  const hold = await db.collection('sessions')
    .where({ _id: sessionId, status: 'open', remaining: _.gt(0) })
    .update({ data: { remaining: _.inc(-1), booked: _.inc(1), updatedAt: new Date() } })
  if (!hold.stats.updated) return { code: 409, msg: '该场次已满或已关闭' }

  const now = new Date()
  const doc = core.buildBooking({
    openid: '', // 插单没有客人 openid，靠手机号与上车号识别
    sessionId,
    phone,
    ticketRef: { source: 'front', ticketNo: String(event.ticketNo || '').trim(), verified: true },
    source: 'front',
    boardingNo,
    operatorOpenid: OPENID,
    safetyConfirmed: true // 现场由员工口头确认
  }, now)

  try {
    const add = await db.collection('bookings').add({ data: doc })
    return { code: 0, msg: 'ok', data: { bookingId: add._id, bookingNo: doc.bookingNo, code: doc.code } }
  } catch (e) {
    // 写入失败要回补库存，否则名额白白丢失
    await db.collection('sessions').doc(sessionId)
      .update({ data: { remaining: _.inc(1), booked: _.inc(-1), updatedAt: new Date() } })
      .catch(() => {})
    return { code: 500, msg: '插单失败，请重试' }
  }
}
