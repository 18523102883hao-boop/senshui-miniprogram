// 云函数：createVisitReservation —— 创建团队预约（PRD §9.2 / §9.3 / §18.3）
// 要点：云端二次校验全部规则；幂等键防重复；周末转人工时仍然落库保住意向。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./reservation-core.js')

const DEFAULT_CONFIG = {
  minPartySize: 10, maxPartySize: 200, advanceDays: 30, dailyCapacity: 0,
  blockedDates: [], weekdayPolicy: 'self', weekendPolicy: 'manual'
}

async function loadConfig() {
  try {
    const r = await db.collection('notices').where({ type: 'config', key: 'visitReservation' }).limit(1).get()
    if (r.data.length && r.data[0].value) return Object.assign({}, DEFAULT_CONFIG, r.data[0].value)
  } catch (e) { /* ignore */ }
  return DEFAULT_CONFIG
}

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const idempotencyKey = String((event && event.idempotencyKey) || '').trim().slice(0, 64)
  if (!idempotencyKey) return { code: 400, msg: '缺少幂等键' }

  const form = (event && event.form) || event || {}
  const config = await loadConfig()
  const now = new Date()

  // 云端二次校验（前端校验只是体验，规则以这里为准）
  const formCheck = core.validateForm(form, config)
  if (!formCheck.ok) return { code: 400, msg: formCheck.msg }
  const dateCheck = core.checkDate(form.visitDate, config, now)
  if (!dateCheck.ok) return { code: 400, msg: dateCheck.msg }

  // 幂等：同键已有有效预约直接返回
  const mine = await db.collection('visit_reservations')
    .where({ _openid: OPENID, idempotencyKey }).limit(5).get()
    .catch(() => ({ data: [] }))
  const reused = core.pickReusable(mine.data, idempotencyKey)
  if (reused) {
    return {
      code: 0, msg: 'ok',
      data: { reservationId: reused._id, status: reused.status, needsManual: !!reused.needsManual, reused: true }
    }
  }

  // 同日期 + 同手机 + 同团队的重复预约提示
  const sameDay = await db.collection('visit_reservations')
    .where({ visitDate: form.visitDate, status: _.in(core.ACTIVE_STATUS) }).limit(200).get()
    .catch(() => ({ data: [] }))
  const dup = core.findDuplicate(sameDay.data, form)
  if (dup) {
    return {
      code: 409,
      msg: '该团队当天已有预约，请勿重复提交',
      data: { reservationId: dup._id, duplicate: true }
    }
  }

  // 容量
  const booked = sameDay.data.reduce((sum, x) => sum + (x.partySize || 0), 0)
  const cap = core.checkCapacity({ dailyCapacity: config.dailyCapacity, booked, partySize: form.partySize })
  if (!cap.ok) return { code: 400, msg: cap.msg }

  const doc = core.buildReservation(form, config, { openid: OPENID, idempotencyKey, mode: dateCheck.mode }, now)
  try {
    const add = await db.collection('visit_reservations').add({ data: doc })
    return {
      code: 0, msg: 'ok',
      data: {
        reservationId: add._id,
        status: doc.status,
        needsManual: doc.needsManual,
        shareToken: doc.shareToken
      }
    }
  } catch (e) {
    return { code: 500, msg: '提交失败，请稍后重试' }
  }
}
