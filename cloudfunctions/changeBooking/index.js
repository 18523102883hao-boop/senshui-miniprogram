// changeBooking - 改签预约云函数
// 允许改签一次，组合事务：释放原场次 + 占位新场次 + 更新预约记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./booking-core.js')

// 开场前多少分钟截止改签/取消（业务可调）
const CUTOFF_MINUTES = Number(process.env.BOOKING_CUTOFF_MINUTES || 60)

exports.main = async (event, context) => {
  const { bookingId, newSessionId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!bookingId || !newSessionId) {
    return { code: 400, msg: '缺少必要参数' }
  }

  try {
    // 1. 查询原预约记录
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
      return { code: 409, msg: '当前状态不可改签' }
    }

    // 3.5 开场前截止校验：太接近开场不允许改签（PRD §9.5）
    const oldSessionRes0 = await db.collection('sessions').doc(booking.sessionId).get().catch(() => null)
    if (oldSessionRes0 && oldSessionRes0.data) {
      const cut = core.checkCutoff(oldSessionRes0.data, new Date(), CUTOFF_MINUTES)
      if (!cut.ok) return { code: 409, msg: cut.msg }
    }

    // 4. 改签次数校验
    if (booking.changeCount >= 1) {
      return { code: 409, msg: '改签次数已用完（最多改签 1 次）' }
    }

    // 5. 查询新场次信息
    const newSessionRes = await db.collection('sessions').doc(newSessionId).get()
    if (!newSessionRes.data) {
      return { code: 404, msg: '新场次不存在' }
    }
    const newSession = newSessionRes.data

    if (newSession.status !== 'open') {
      return { code: 409, msg: '新场次已关闭' }
    }

    // 6. 释放原场次名额
    await db.collection('sessions')
      .doc(booking.sessionId)
      .update({
        data: {
          remaining: _.inc(1),
          booked: _.inc(-1),
          updatedAt: new Date()
        }
      })

    // 7. 占位新场次（条件更新防超卖）
    const holdRes = await db.collection('sessions')
      .where({
        _id: newSessionId,
        status: 'open',
        remaining: _.gt(0)
      })
      .update({
        data: {
          remaining: _.inc(-1),
          booked: _.inc(1),
          updatedAt: new Date()
        }
      })

    if (holdRes.stats.updated === 0) {
      // 回滚：恢复原场次名额
      await db.collection('sessions')
        .doc(booking.sessionId)
        .update({
          data: {
            remaining: _.inc(-1),
            booked: _.inc(1),
            updatedAt: new Date()
          }
        })
      return { code: 409, msg: '新场次已满，改签失败' }
    }

    // 8. 更新预约记录
    await db.collection('bookings')
      .doc(bookingId)
      .update({
        data: {
          sessionId: newSessionId,
          changeCount: booking.changeCount + 1,
          updatedAt: new Date()
        }
      })

    return {
      code: 0,
      msg: '改签成功',
      data: {
        bookingId: bookingId,
        newSession: {
          date: newSession.date,
          startTime: newSession.startTime
        },
        changeCount: booking.changeCount + 1
      }
    }
  } catch (err) {
    console.error('[changeBooking] 改签失败', err)
    return { code: 500, msg: '改签失败：' + err.message }
  }
}
