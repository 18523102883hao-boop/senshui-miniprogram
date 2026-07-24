// 云函数：cancelVisitReservation —— 取消团队预约（PRD §9.4 / §18.3）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./reservation-core.js')

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const id = String((event && event.reservationId) || '').trim().slice(0, 64)
  if (!id) return { code: 400, msg: '缺少预约标识' }

  const r = await db.collection('visit_reservations').doc(id).get().catch(() => null)
  const doc = r && r.data
  if (!doc) return { code: 404, msg: '预约不存在' }
  if (doc._openid !== OPENID) return { code: 403, msg: '无权操作该预约' }

  const check = core.canCancel(doc)
  if (!check.ok) return { code: 400, msg: check.msg }

  const now = new Date()
  // 条件更新：并发下只有一次生效
  const upd = await db.collection('visit_reservations')
    .where({ _id: id, status: _.in(core.CANCELLABLE) })
    .update({ data: { status: 'cancelled', cancelledAt: now, cancelReason: String((event && event.reason) || '').slice(0, 100), updatedAt: now } })

  if (!upd.stats.updated) return { code: 400, msg: '该预约状态已变更，请刷新后重试' }
  return { code: 0, msg: 'ok', data: { status: 'cancelled' } }
}
