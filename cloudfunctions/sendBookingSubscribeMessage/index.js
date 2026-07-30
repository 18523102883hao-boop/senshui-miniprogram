// 云函数：sendBookingSubscribeMessage —— 发送预约提醒/停运通知
// 用法：定时触发器扫描即将开场的预约，或 closeSession 停运时调用。
// 注意：一次授权只能发一条，发送后扣减 quota；quota 为 0 时跳过（不报错）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const tmplId = String(event.tmplId || '').trim()
  const openids = Array.isArray(event.openids) ? event.openids.slice(0, 200) : []
  const data = event.data || {}
  const page = String(event.page || 'pages/booking/list/list')
  if (!tmplId || !openids.length) return { code: 400, msg: '缺少模板或接收人' }

  const result = { sent: 0, skipped: 0, failed: 0 }
  for (const openid of openids) {
    try {
      const g = await db.collection('subscribe_grants')
        .where({ _openid: openid, tmplId, quota: _.gt(0) }).limit(1).get()
      if (!g.data.length) { result.skipped += 1; continue }

      await cloud.openapi.subscribeMessage.send({ touser: openid, templateId: tmplId, page, data })
      await db.collection('subscribe_grants').doc(g.data[0]._id)
        .update({ data: { quota: _.inc(-1), lastSentAt: new Date() } })
      result.sent += 1
    } catch (e) {
      console.error('[sendBookingSubscribeMessage] 发送失败', openid, e && e.message)
      result.failed += 1
    }
  }
  return { code: 0, msg: 'ok', data: result }
}
