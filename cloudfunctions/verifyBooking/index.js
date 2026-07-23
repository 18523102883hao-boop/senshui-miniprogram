// 云函数：verifyBooking —— 溪降检票核销（一次性 + 留痕）（T12）
// 员工扫游客二维码（内容为 ticketNo）或手输 ticketNo 核销；原子更新保证重复扫码被拦截。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ALLOW_ROLES = ['creek', 'front', 'admin']

async function requireStaff(openid) {
  const r = await db.collection('staff').where({ _openid: openid, status: 'approved' }).limit(1).get()
  return r.data.length ? r.data[0] : null
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const staff = await requireStaff(OPENID)
  if (!staff || ALLOW_ROLES.indexOf(staff.role) === -1) return { code: 403, msg: '无检票权限' }

  const { ticketNo, bookingId } = event
  if (!ticketNo && !bookingId) return { code: 400, msg: '缺少核销标识' }

  const bookings = db.collection('bookings')

  // 定位预约（优先 bookingId，其次唯一票号）
  let b = null
  if (bookingId) {
    const r = await bookings.doc(bookingId).get().catch(() => null)
    if (r && r.data) b = Object.assign({ _id: bookingId }, r.data)
  } else {
    const r = await bookings.where({ ticketNo }).limit(1).get()
    if (r.data.length) b = r.data[0]
  }
  if (!b) return { code: 404, msg: '预约不存在' }
  if (b.status === 'verified') return { code: 409, msg: '该预约已核销' }
  if (b.status === 'cancelled') return { code: 400, msg: '该预约已取消' }
  if (b.status !== 'reserved') return { code: 400, msg: '预约状态异常：' + b.status }

  const now = new Date()
  // 原子核销：仅 reserved → verified，重复扫码 updated===0 拦截
  const upd = await bookings.where({ _id: b._id, status: 'reserved' }).update({
    data: { status: 'verified', verifiedAt: now, verifiedBy: OPENID, updatedAt: now }
  })
  if (upd.stats.updated === 0) return { code: 409, msg: '该预约已被核销' }

  // 全量留痕
  await db.collection('verifications').add({
    data: {
      type: 'creek_ticket',
      bookingId: b._id,
      sessionId: b.sessionId,
      ticketNo: b.ticketNo,
      userOpenid: b._openid,
      staffOpenid: OPENID,
      staffName: staff.name,
      createdAt: now
    }
  })

  return { code: 0, msg: 'ok', data: { ticketNo: b.ticketNo, phone: b.phone } }
}
