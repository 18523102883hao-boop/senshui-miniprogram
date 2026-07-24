// 云函数：getMyReservations —— 我的预约（团队预约；溪降沿用 getMyBookings）（PRD §9.6 / §18.3）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const TAB_STATUS = {
  upcoming: ['pending', 'confirmed'],
  done: ['completed'],
  cancelled: ['cancelled', 'rejected']
}

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const tab = String((event && event.tab) || '').trim()
  const where = { _openid: OPENID }
  if (TAB_STATUS[tab]) where.status = _.in(TAB_STATUS[tab])

  try {
    const r = await db.collection('visit_reservations')
      .where(where).orderBy('visitDate', 'asc').limit(100).get()
    const list = r.data.map((x) => ({
      reservationId: x._id,
      visitDate: x.visitDate,
      teamType: x.teamType,
      teamName: x.teamName,
      partySize: x.partySize,
      contactName: x.contactName,
      status: x.status,
      needsManual: !!x.needsManual
    }))
    return { code: 0, msg: 'ok', data: { list } }
  } catch (e) {
    return { code: 0, msg: 'ok', data: { list: [] } }
  }
}
