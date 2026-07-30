// cancelBooking - 取消预约云函数
// 组合事务：更新预约状态 + 释放场次名额
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./booking-core.js')

// 开场前多少分钟截止取消（业务可调）
const CUTOFF_MINUTES = Number(process.env.BOOKING_CUTOFF_MINUTES || 60)

exports.main = async (event, context) => {
  const { bookingId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!bookingId) {
    return { code: 400, msg: '缺少预约ID' }
  }

  try {
    // 1. 查询预约记录
    const bookingRes = await db.collection('bookings').doc(bookingId).get()
    if (!bookingRes.data) {
      return { code: 404, msg: '预约记录不存在' }
    }
    const booking = bookingRes.data

    // 2. 权限校验
    if (booking._openid !== openid) {
      return { code: 403, msg: '无权操作此预约' }
    }

    // 3. 状态校验
    if (booking.status !== 'reserved') {
      return { code: 409, msg: '当前状态不可取消' }
    }

    // 3.5 开场前截止校验：太接近开场不允许取消（PRD §9.5）
    const sessionRes = await db.collection('sessions').doc(booking.sessionId).get().catch(() => null)
    if (sessionRes && sessionRes.data) {
      const cut = core.checkCutoff(sessionRes.data, new Date(), CUTOFF_MINUTES)
      if (!cut.ok) return { code: 409, msg: cut.msg }
    }

    // 4. 更新预约状态
    await db.collection('bookings')
      .doc(bookingId)
      .update({
        data: {
          status: 'cancelled',
          updatedAt: new Date()
        }
      })

    // 取消后释放占用的小程序票，让它能再次用于预约
    if (booking.ticketRef && booking.ticketRef.source === 'native' && booking.ticketRef.ticketNo) {
      await db.collection('tickets')
        .where({ ticketNo: booking.ticketRef.ticketNo, status: 'reserved' })
        .update({ data: { status: 'unused', updatedAt: new Date() } })
        .catch(() => {})
    }

    // 5. 释放场次名额
    await db.collection('sessions')
      .doc(booking.sessionId)
      .update({
        data: {
          remaining: _.inc(1),
          booked: _.inc(-1),
          updatedAt: new Date()
        }
      })

    return {
      code: 0,
      msg: '取消成功',
      data: {
        bookingId: bookingId
      }
    }
  } catch (err) {
    console.error('[cancelBooking] 取消失败', err)
    return { code: 500, msg: '取消失败：' + err.message }
  }
}
