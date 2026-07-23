// releaseSeat - 释放名额云函数
// 用于取消预约、改签、未到自动释放等场景
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { sessionId } = event

  if (!sessionId) {
    return { code: 400, msg: '缺少场次ID' }
  }

  try {
    // 释放名额：remaining +1, booked -1
    const res = await db.collection('sessions')
      .doc(sessionId)
      .update({
        data: {
          remaining: _.inc(1),
          booked: _.inc(-1),
          updatedAt: new Date()
        }
      })

    // 查询更新后的场次信息
    const session = await db.collection('sessions').doc(sessionId).get()
    
    return {
      code: 0,
      msg: '释放成功',
      data: {
        sessionId,
        remaining: session.data.remaining,
        booked: session.data.booked
      }
    }
  } catch (err) {
    console.error('[releaseSeat] 释放失败', err)
    return { code: 500, msg: '释放失败：' + err.message }
  }
}
