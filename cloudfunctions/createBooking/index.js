// createBooking - 创建溪降预约云函数
// 组合事务：占位 + 创建预约记录，保证原子性
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 生成 6 位预约码
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// 生成票号：日期 + 时间 + 随机数
function generateTicketNo(date, startTime) {
  const d = new Date(date)
  const dateStr = d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, '0') +
    d.getDate().toString().padStart(2, '0')
  const timeStr = startTime.replace(':', '')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `CK${dateStr}${timeStr}${random}`
}

exports.main = async (event, context) => {
  const { sessionId, phone } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 参数校验
  if (!sessionId || !phone) {
    return { code: 400, msg: '缺少必要参数' }
  }

  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, msg: '手机号格式不正确' }
  }

  try {
    // 1. 查询场次信息
    const sessionRes = await db.collection('sessions').doc(sessionId).get()
    if (!sessionRes.data) {
      return { code: 404, msg: '场次不存在' }
    }
    const session = sessionRes.data

    // 2. 检查场次状态
    if (session.status !== 'open') {
      return { code: 409, msg: '该场次已关闭' }
    }

    // 3. 检查是否已有未取消的预约
    const existingBooking = await db.collection('bookings')
      .where({
        _openid: openid,
        sessionId: sessionId,
        status: _.in(['reserved', 'verified'])
      })
      .get()

    if (existingBooking.data.length > 0) {
      return { code: 409, msg: '您已预约该场次，请勿重复预约' }
    }

    // 4. 原子占位（条件更新防超卖）
    const holdRes = await db.collection('sessions')
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

    if (holdRes.stats.updated === 0) {
      return { code: 409, msg: '该场次已满' }
    }

    // 5. 创建预约记录
    const code = generateCode()
    const ticketNo = generateTicketNo(session.date, session.startTime)
    
    const bookingData = {
      _openid: openid,
      sessionId: sessionId,
      ticketNo: ticketNo,
      phone: phone,
      code: code,
      status: 'reserved',
      changeCount: 0,
      source: 'customer',
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const bookingRes = await db.collection('bookings').add({ data: bookingData })

    // 6. 返回预约信息（包含离线持久化所需的 code）
    return {
      code: 0,
      msg: '预约成功',
      data: {
        bookingId: bookingRes._id,
        ticketNo: ticketNo,
        code: code,
        session: {
          date: session.date,
          startTime: session.startTime
        }
      }
    }
  } catch (err) {
    console.error('[createBooking] 预约失败', err)
    return { code: 500, msg: '预约失败：' + err.message }
  }
}
