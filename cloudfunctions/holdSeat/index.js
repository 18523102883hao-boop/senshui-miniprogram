// holdSeat - 原子占位云函数
// 使用条件更新防超卖，确保并发安全
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { sessionId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!sessionId) {
    return { code: 400, msg: '缺少场次ID' }
  }

  try {
    // 原子条件更新：只有 remaining > 0 且 status = 'open' 时才能扣减
    const res = await db.collection('sessions')
      .where({
        _id: sessionId,
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

    // updated === 0 表示条件不满足（满员/已关闭/被并发抢占）
    if (res.stats.updated === 0) {
      return { code: 409, msg: '该场次已满或已关闭' }
    }

    // 查询更新后的场次信息
    const session = await db.collection('sessions').doc(sessionId).get()
    
    return {
      code: 0,
      msg: '占位成功',
      data: {
        sessionId,
        remaining: session.data.remaining,
        booked: session.data.booked,
        openid
      }
    }
  } catch (err) {
    console.error('[holdSeat] 占位失败', err)
    return { code: 500, msg: '占位失败：' + err.message }
  }
}
