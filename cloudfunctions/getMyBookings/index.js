// getMyBookings - 查询我的预约列表云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { status } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const where = { _openid: openid }
    
    if (status) {
      where.status = status
    }

    // 查询预约列表，关联场次信息
    const bookings = await db.collection('bookings')
      .where(where)
      .orderBy('createdAt', 'desc')
      .get()

    // 查询关联的场次信息
    const sessionIds = [...new Set(bookings.data.map(b => b.sessionId))]
    const sessions = await db.collection('sessions')
      .where({
        _id: _.in(sessionIds)
      })
      .get()

    const sessionMap = {}
    sessions.data.forEach(s => {
      sessionMap[s._id] = s
    })

    // 组装返回数据
    const list = bookings.data.map(b => ({
      _id: b._id,
      ticketNo: b.ticketNo,
      code: b.code,
      phone: b.phone,
      status: b.status,
      changeCount: b.changeCount,
      source: b.source,
      createdAt: b.createdAt,
      session: sessionMap[b.sessionId] ? {
        date: sessionMap[b.sessionId].date,
        startTime: sessionMap[b.sessionId].startTime,
        status: sessionMap[b.sessionId].status
      } : null
    }))

    return {
      code: 0,
      msg: '查询成功',
      data: {
        bookings: list,
        total: list.length
      }
    }
  } catch (err) {
    console.error('[getMyBookings] 查询失败', err)
    return { code: 500, msg: '查询失败：' + err.message }
  }
}
