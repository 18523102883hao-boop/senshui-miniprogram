// 团队预约纯逻辑（PRD §9.2 日期规则 / §9.3 防重复 / §17.6）
// 不依赖云 SDK，前端与云函数共用同一套校验，避免两边规则不一致。

const ACTIVE_STATUS = ['pending', 'confirmed'] // 参与重复判断与容量占用的状态
const CANCELLABLE = ['pending', 'confirmed']

function parseDate(str) {
  const s = String(str || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00+08:00')
  return isNaN(d.getTime()) ? null : d
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 日期与周末策略校验。
 * @returns {{ok:boolean, mode?:'self'|'manual', msg?:string}}
 */
function checkDate(visitDate, config, now) {
  const cfg = config || {}
  const d = parseDate(visitDate)
  if (!d) return { ok: false, msg: '请选择到访日期' }

  const today = startOfDay(now instanceof Date ? now : new Date())
  if (d.getTime() < today.getTime()) return { ok: false, msg: '不能预约过去的日期' }

  const advanceDays = cfg.advanceDays || 30
  const maxTs = today.getTime() + advanceDays * 24 * 3600 * 1000
  if (d.getTime() > maxTs) return { ok: false, msg: '最多可预约 ' + advanceDays + ' 天内的日期' }

  const blocked = cfg.blockedDates || []
  if (blocked.indexOf(String(visitDate)) >= 0) {
    return { ok: false, msg: '该日期暂不开放团队预约，请换个日期或咨询管家' }
  }

  const day = d.getDay() // 0=周日 6=周六
  const isWeekend = day === 0 || day === 6
  const policy = isWeekend ? (cfg.weekendPolicy || 'manual') : (cfg.weekdayPolicy || 'self')

  if (policy === 'blocked') {
    return { ok: false, msg: isWeekend ? '周末不可自助预约，请联系管家安排' : '该日期不可约' }
  }
  return { ok: true, mode: policy === 'manual' ? 'manual' : 'self' }
}

function validateForm(form, config) {
  const f = form || {}
  const cfg = config || {}

  if (!parseDate(f.visitDate)) return { ok: false, msg: '请选择到访日期' }
  if (!String(f.teamName || '').trim()) return { ok: false, msg: '请填写团队名称' }
  if (!String(f.contactName || '').trim()) return { ok: false, msg: '请填写联系人姓名' }
  if (!/^1\d{10}$/.test(String(f.contactPhone || '').trim())) return { ok: false, msg: '请填写正确的联系手机号' }

  const size = Number(f.partySize)
  const min = cfg.minPartySize || 1
  const max = cfg.maxPartySize || 999
  if (!Number.isInteger(size) || size < min) return { ok: false, msg: '团队预约人数不少于 ' + min + ' 人' }
  if (size > max) return { ok: false, msg: '单次预约人数不超过 ' + max + ' 人，超出请联系管家' }

  if (!f.privacyAgreed) return { ok: false, msg: '请先阅读并同意隐私政策' }

  return { ok: true }
}

/**
 * 当日容量校验。dailyCapacity 为 0/未配置时不限制。
 */
function checkCapacity(input) {
  const src = input || {}
  const cap = Number(src.dailyCapacity) || 0
  if (cap <= 0) return { ok: true }
  const left = cap - (Number(src.booked) || 0)
  if (left < (Number(src.partySize) || 0)) {
    return { ok: false, msg: '当日团队余位不足（剩余约 ' + Math.max(0, left) + ' 人），请换日期或联系管家' }
  }
  return { ok: true }
}

// 幂等：同一键的有效预约直接复用
function pickReusable(reservations, key) {
  const k = String(key || '').trim()
  if (!k) return null
  const hit = (Array.isArray(reservations) ? reservations : [])
    .filter((r) => r && r.idempotencyKey === k && ACTIVE_STATUS.indexOf(r.status) >= 0)[0]
  return hit || null
}

/**
 * 重复预约识别：同日期 + 同手机号 + 同团队名，且仍有效。
 */
function findDuplicate(reservations, form) {
  const f = form || {}
  const phone = String(f.contactPhone || '').trim()
  const name = String(f.teamName || '').trim()
  const hit = (Array.isArray(reservations) ? reservations : []).filter((r) =>
    r &&
    ACTIVE_STATUS.indexOf(r.status) >= 0 &&
    r.visitDate === f.visitDate &&
    String(r.contactPhone || '').trim() === phone &&
    String(r.teamName || '').trim() === name
  )[0]
  return hit || null
}

// 分享 token：随机串，不含任何隐私信息
function genShareToken() {
  return 'st' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function buildReservation(form, config, ctx, now) {
  const f = form || {}
  const c = ctx || {}
  const time = now instanceof Date ? now : new Date()
  return {
    _openid: c.openid || '',
    idempotencyKey: String(c.idempotencyKey || ''),
    visitDate: f.visitDate,
    teamType: f.teamType || 'other',
    teamName: String(f.teamName || '').trim().slice(0, 40),
    partySize: Number(f.partySize) || 0,
    contactName: String(f.contactName || '').trim().slice(0, 20),
    contactPhone: String(f.contactPhone || '').trim().slice(0, 20),
    remark: String(f.remark || '').slice(0, 200),
    relatedOrderNo: String(f.relatedOrderNo || '').slice(0, 32),
    privacyAgreed: !!f.privacyAgreed,
    // 转人工也先落库，保住用户意向（PRD §9.2）
    needsManual: c.mode === 'manual',
    status: 'pending',
    shareToken: genShareToken(),
    source: c.mode === 'manual' ? 'manual' : 'self',
    createdAt: time,
    updatedAt: time
  }
}

/**
 * 分享摘要：去掉手机号、openid、备注等隐私字段（PRD §9.3）。
 */
function toShareSummary(reservation) {
  const r = reservation || {}
  return {
    visitDate: r.visitDate || '',
    teamName: r.teamName || '',
    teamType: r.teamType || '',
    partySize: r.partySize || 0,
    contactName: r.contactName || '',
    status: r.status || ''
  }
}

function canCancel(reservation) {
  const r = reservation || {}
  if (CANCELLABLE.indexOf(r.status) < 0) {
    return { ok: false, msg: '当前状态不可取消，如需变更请联系管家' }
  }
  return { ok: true }
}

module.exports = {
  ACTIVE_STATUS, CANCELLABLE,
  checkDate, validateForm, checkCapacity,
  pickReusable, findDuplicate,
  buildReservation, toShareSummary, canCancel, genShareToken
}
