// closeSession - 关闭场次云函数
// 用于天气/水位等原因停运，一键关闭场次
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { sessionId, note } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!sessionId) {
    return { code: 400, msg: '缺少场次ID' }
  }

  try {
    // TODO: 校验管理员权限（当前简化处理）
    
    // 关闭场次
    await db.collection('sessions')
      .doc(sessionId)
      .update({
        data: {
          status: 'closed',
          note: note || '天气/水位原因停运',
          updatedAt: new Date(),
          closedBy: openid
        }
      })

    // 查询该场次的所有 reserved bookings（用于后续发送停运通知）
    const bookings = await db.collection('bookings')
      .where({
        sessionId,
        status: 'reserved'
      })
      .get()

    return {
      code: 0,
      msg: '场次已关闭',
      data: {
        sessionId,
        affectedBookings: bookings.data.length,
        bookings: bookings.data.map(b => ({
          _id: b._id,
          _openid: b._openid,
          phone: b.phone
        }))
      }
    }
  } catch (err) {
    console.error('[closeSession] 关闭场次失败', err)
    return { code: 500, msg: '关闭场次失败：' + err.message }
  }
}
