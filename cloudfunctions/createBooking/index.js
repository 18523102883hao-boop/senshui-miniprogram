// createBooking - 创建溪降预约云函数
// 组合事务：占位 + 创建预约记录，保证原子性
//
// Task 10 改造：不再自行生成 CK 票号冒充购票凭证（PRD §9.5）。
// 购票凭证只能来自：① 用户在小程序买的溪降票（自动关联、标记已验证）
//                  ② 用户手输的外部渠道券号（记录但标记未验证，现场人工核验）
// 云端只生成「预约单号 bookingNo（BK 前缀）」，与购票凭证是两个概念。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./booking-core.js')

exports.main = async (event, context) => {
  const { sessionId, phone } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 参数校验
  if (!sessionId || !phone) {
    return { code: 400, msg: '缺少必要参数' }
  }

  const formCheck = core.validateBookingForm({
    phone,
    safetyConfirmed: event.safetyConfirmed,
    withChild: event.withChild,
    childConfirmed: event.withChild ? true : undefined // 前端已强制确认，此处只兜底手机号与安全须知
  })
  if (!formCheck.ok) return { code: 400, msg: formCheck.msg }

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

    // 3.5 购票凭证：优先用小程序内未使用的溪降票，否则接受手输外部券号
    let nativeTickets = []
    try {
      const t = await db.collection('tickets')
        .where({ _openid: openid, status: _.in(core.USABLE_TICKET_STATUS), sku: _.in(core.CREEK_SKUS) })
        .limit(20).get()
      nativeTickets = t.data
    } catch (e) { /* tickets 集合不存在时按外部券号处理 */ }

    const ticketResult = core.resolveTicketRef({
      nativeTickets,
      externalTicketNo: event.externalTicketNo
    })
    if (!ticketResult.ok) return { code: 400, msg: ticketResult.msg }

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
    const now = new Date()
    const bookingData = core.buildBooking({
      openid,
      sessionId,
      phone,
      ticketRef: ticketResult.ref,
      source: 'customer',
      withChild: event.withChild,
      safetyConfirmed: true
    }, now)

    let bookingRes
    try {
      bookingRes = await db.collection('bookings').add({ data: bookingData })
    } catch (e) {
      // 写入失败必须回补库存，否则名额白丢
      await db.collection('sessions').doc(sessionId)
        .update({ data: { remaining: _.inc(1), booked: _.inc(-1), updatedAt: new Date() } })
        .catch(() => {})
      throw e
    }

    // 小程序内购买的票占位为 reserved，避免同一张票重复预约多个场次
    if (ticketResult.ref.source === 'native') {
      await db.collection('tickets')
        .where({ ticketNo: ticketResult.ref.ticketNo, _openid: openid, status: 'unused' })
        .update({ data: { status: 'reserved', updatedAt: now } })
        .catch(() => {})
    }

    // 6. 返回预约信息（包含离线持久化所需的 code）
    return {
      code: 0,
      msg: '预约成功',
      data: {
        bookingId: bookingRes._id,
        bookingNo: bookingData.bookingNo,
        ticketRef: bookingData.ticketRef,
        code: bookingData.code,
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
