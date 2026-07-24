// 溪降预约纯逻辑（PRD §9.5 / .scratch/creek-booking/spec.md）
// 核心原则：预约单号 ≠ 购票凭证。云端只生成预约单号（BK 前缀），
// 购票凭证必须来自真实票券或用户手输的外部券号，绝不凭空捏造。

const USABLE_TICKET_STATUS = ['unused', 'reserved']
const CREEK_SKUS = ['creek_single', 'creek_double', 'creek_child', 'combo_single']

/**
 * 解析本次预约使用的购票凭证。
 * 优先用小程序内购买的票（已验证）；没有则接受手输外部券号（标记未验证）。
 * @returns {{ok:boolean, ref?:{source:string, ticketNo:string, verified:boolean}, msg?:string}}
 */
function resolveTicketRef(input) {
  const src = input || {}
  const native = (Array.isArray(src.nativeTickets) ? src.nativeTickets : [])
    .filter((t) => t && USABLE_TICKET_STATUS.indexOf(t.status) >= 0)

  if (native.length) {
    return { ok: true, ref: { source: 'native', ticketNo: native[0].ticketNo, verified: true } }
  }

  const external = String(src.externalTicketNo || '').trim().slice(0, 40)
  if (external) {
    // 外部渠道（抖音/美团）券号无法在线校验，只记录，现场人工核验
    return { ok: true, ref: { source: 'external', ticketNo: external, verified: false } }
  }

  return { ok: false, msg: '请先购买溪降票，或填写已购渠道的券号' }
}

// 预约单号：BK 前缀，明确区别于门票号（T/CK）
function buildBookingNo(now) {
  const d = now instanceof Date ? now : new Date()
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  const date = String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate())
  return 'BK' + date + Math.random().toString(36).slice(2, 8).toUpperCase()
}

function sessionStartTime(session) {
  const s = session || {}
  const date = String(s.date || '').slice(0, 10)
  const time = String(s.startTime || '00:00')
  const t = new Date(date + 'T' + time + ':00+08:00')
  return isNaN(t.getTime()) ? null : t
}

/**
 * 开场前截止规则：距开场不足 cutoffMinutes 分钟即不可改签/取消。
 */
function checkCutoff(session, now, cutoffMinutes) {
  const start = sessionStartTime(session)
  if (!start) return { ok: true } // 场次时间异常时不拦截，交由业务侧处理
  const cutoff = start.getTime() - (Number(cutoffMinutes) || 0) * 60 * 1000
  const ts = (now instanceof Date ? now : new Date()).getTime()
  if (ts >= cutoff) {
    return { ok: false, msg: '距开场不足 ' + cutoffMinutes + ' 分钟，无法改签或取消，请联系前台' }
  }
  return { ok: true }
}

function canChange(booking) {
  const b = booking || {}
  if (b.status !== 'reserved') return { ok: false, msg: '当前状态不可改签' }
  if ((Number(b.changeCount) || 0) >= 1) return { ok: false, msg: '每个预约只能改签一次' }
  return { ok: true }
}

/**
 * 预约表单校验：安全须知必须确认；带儿童时额外确认监护与身高条件。
 */
function validateBookingForm(form) {
  const f = form || {}
  if (!/^1[3-9]\d{9}$/.test(String(f.phone || '').trim())) {
    return { ok: false, msg: '请填写正确的手机号' }
  }
  if (!f.safetyConfirmed) {
    return { ok: false, msg: '请先阅读并确认溪降安全须知' }
  }
  if (f.withChild && !f.childConfirmed) {
    return { ok: false, msg: '携带儿童需确认身高条件并由监护人全程陪同' }
  }
  return { ok: true }
}

function buildBooking(input, now) {
  const i = input || {}
  const time = now instanceof Date ? now : new Date()
  const ref = i.ticketRef || {}
  return {
    _openid: i.openid || '',
    sessionId: i.sessionId || '',
    bookingNo: buildBookingNo(time),
    // 购票凭证独立记录，明确来源与是否经系统核验
    ticketRef: { source: ref.source || '', ticketNo: ref.ticketNo || '', verified: !!ref.verified },
    phone: String(i.phone || '').trim(),
    code: String(Math.floor(100000 + Math.random() * 900000)),
    status: 'reserved',
    changeCount: 0,
    withChild: !!i.withChild,
    safetyConfirmed: !!i.safetyConfirmed,
    source: i.source || 'customer',
    boardingNo: i.boardingNo ? String(i.boardingNo).slice(0, 10) : '',
    operatorOpenid: i.operatorOpenid || '',
    createdAt: time,
    updatedAt: time
  }
}

/**
 * 按场次汇总台账：应到人数不含已取消。
 */
function buildLedger(bookings) {
  const out = {}
  for (const b of (Array.isArray(bookings) ? bookings : [])) {
    if (!b || !b.sessionId) continue
    const s = out[b.sessionId] || (out[b.sessionId] = { reserved: 0, verified: 0, cancelled: 0, front: 0, total: 0 })
    if (b.status === 'reserved') s.reserved += 1
    else if (b.status === 'verified') s.verified += 1
    else if (b.status === 'cancelled') s.cancelled += 1
    if (b.source === 'front' && b.status !== 'cancelled') s.front += 1
    if (b.status !== 'cancelled') s.total += 1
  }
  return out
}

module.exports = {
  USABLE_TICKET_STATUS, CREEK_SKUS,
  resolveTicketRef, buildBookingNo, checkCutoff, canChange,
  validateBookingForm, buildBooking, buildLedger, sessionStartTime
}
