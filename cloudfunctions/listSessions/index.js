// listSessions - 查询场次列表云函数
// 按日期查询场次余位，C端和员工端共用
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { date, status } = event

  try {
    // 构建查询条件
    const where = {}
    
    if (date) {
      // date 格式：'2024-01-15' 或 Date 对象
      const targetDate = typeof date === 'string' ? new Date(date) : date
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0))
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999))
      
      where.date = _.gte(startOfDay).and(_.lte(endOfDay))
    }
    
    if (status) {
      where.status = status
    }

    // 查询场次列表，按开始时间排序
    const sessions = await db.collection('sessions')
      .where(where)
      .orderBy('startTime', 'asc')
      .get()

    return {
      code: 0,
      msg: '查询成功',
      data: {
        sessions: sessions.data,
        total: sessions.data.length
      }
    }
  } catch (err) {
    console.error('[listSessions] 查询失败', err)
    return { code: 500, msg: '查询失败：' + err.message }
  }
}
