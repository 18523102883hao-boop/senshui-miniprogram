// Task 9 通用团队预约测试
// PRD §9.2 团队预约、§9.3 防重复、§9.4 结果详情、§17.6 visit_reservations
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const rcore = require(path.join(projectRoot, 'cloudfunctions/createVisitReservation/reservation-core.js'))
const entryPath = path.join(projectRoot, 'miniprogram/pages/reservation/entry/entry.js')
const detailPath = path.join(projectRoot, 'miniprogram/pages/reservation/detail/detail.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], redirect: [], toast: [], modal: [], clipboard: [], phone: [] }
  let pageConfig

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }

  stub(requestPath, {
    call(name, data) {
      calls.request.push({ name, data })
      const responder = options.responders && options.responders[name]
      if (typeof responder === 'function') return responder(data, calls.request.filter((c) => c.name === name).length)
      if (responder) return Promise.resolve(responder)
      return Promise.reject(new Error('no responder: ' + name))
    },
    callWithLoading(name, data) { return this.call(name, data) }
  })
  stub(hapticsPath, { haptic() {} })

  global.wx = {
    navigateTo(o) { calls.navigate.push(o.url); if (options.navigateFail && o.fail) o.fail({}) },
    redirectTo(o) { calls.redirect.push(o.url) },
    switchTab(o) { calls.navigate.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    makePhoneCall(o) { calls.phone.push(o.phoneNumber) },
    showModal(o) { calls.modal.push(o); if (o.success) o.success({ confirm: options.modalConfirm !== false }) },
    showLoading() {}, hideLoading() {},
    setClipboardData(o) { calls.clipboard.push(o.data); if (o.success) o.success() },
    getStorageSync() { return null }, setStorageSync() {},
    setNavigationBarTitle() {}, stopPullDownRefresh() {}
  }
  global.Page = (config) => { pageConfig = config }

  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
    if (typeof page.onUnload === 'function') page.onUnload()
    delete require.cache[pagePath]
    Object.keys(originals).forEach((p) => {
      if (originals[p]) require.cache[p] = originals[p]
      else delete require.cache[p]
    })
    global.Page = originalPage
    global.wx = originalWx
  })

  return { page, calls }
}

const CONFIG = {
  minPartySize: 10,
  maxPartySize: 200,
  advanceDays: 30,
  dailyCapacity: 300,
  blockedDates: ['2026-08-15'],
  weekendPolicy: 'manual', // self | blocked | manual
  weekdayPolicy: 'self'
}

// 2026-08-05 是周三，2026-08-08 是周六
const WED = '2026-08-05'
const SAT = '2026-08-08'
const NOW = new Date('2026-08-01T10:00:00+08:00')

function baseForm(patch) {
  return Object.assign({
    visitDate: WED,
    teamType: 'company',
    teamName: '某某公司',
    partySize: 20,
    contactName: '张三',
    contactPhone: '13800138000',
    remark: '',
    privacyAgreed: true
  }, patch)
}

// ============ 日期与规则 ============

test('周中按自助预约放行', () => {
  const r = rcore.checkDate(WED, CONFIG, NOW)
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'self')
})

test('周末按配置转人工管家，而不是直接拒绝', () => {
  const r = rcore.checkDate(SAT, CONFIG, NOW)
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'manual')
})

test('周末策略配置为禁止时明确拒绝', () => {
  const r = rcore.checkDate(SAT, Object.assign({}, CONFIG, { weekendPolicy: 'blocked' }), NOW)
  assert.equal(r.ok, false)
  assert.match(r.msg, /周末|不可约/)
})

test('不可约日期被拦截', () => {
  const r = rcore.checkDate('2026-08-15', CONFIG, NOW)
  assert.equal(r.ok, false)
  assert.match(r.msg, /不可约|暂不开放/)
})

test('过去日期与超出可约范围的日期都拒绝', () => {
  assert.equal(rcore.checkDate('2026-07-20', CONFIG, NOW).ok, false)
  assert.equal(rcore.checkDate('2026-12-01', CONFIG, NOW).ok, false, '超过 advanceDays 应拒绝')
})

test('人数低于下限或高于上限都拒绝', () => {
  assert.equal(rcore.validateForm(baseForm({ partySize: 5 }), CONFIG).ok, false)
  assert.equal(rcore.validateForm(baseForm({ partySize: 500 }), CONFIG).ok, false)
  assert.equal(rcore.validateForm(baseForm({ partySize: 10 }), CONFIG).ok, true)
  assert.equal(rcore.validateForm(baseForm({ partySize: 200 }), CONFIG).ok, true)
})

test('必填字段缺失时拒绝并指明缺什么', () => {
  assert.match(rcore.validateForm(baseForm({ teamName: '' }), CONFIG).msg, /团队名称/)
  assert.match(rcore.validateForm(baseForm({ contactName: '' }), CONFIG).msg, /联系人/)
  assert.match(rcore.validateForm(baseForm({ contactPhone: '' }), CONFIG).msg, /手机号/)
  assert.match(rcore.validateForm(baseForm({ contactPhone: '123' }), CONFIG).msg, /手机号/)
  assert.match(rcore.validateForm(baseForm({ visitDate: '' }), CONFIG).msg, /日期/)
})

test('未勾选隐私同意不允许提交', () => {
  const r = rcore.validateForm(baseForm({ privacyAgreed: false }), CONFIG)
  assert.equal(r.ok, false)
  assert.match(r.msg, /同意|隐私/)
})

test('当日剩余容量不足时拒绝', () => {
  const r = rcore.checkCapacity({ dailyCapacity: 300, booked: 290, partySize: 20 })
  assert.equal(r.ok, false)
  assert.match(r.msg, /容量|余位/)
  assert.equal(rcore.checkCapacity({ dailyCapacity: 300, booked: 280, partySize: 20 }).ok, true)
})

test('未配置容量上限时不做容量拦截', () => {
  assert.equal(rcore.checkCapacity({ dailyCapacity: 0, booked: 9999, partySize: 20 }).ok, true)
})

// ============ 防重复 ============

test('相同幂等键复用已有预约，不重复创建', () => {
  const existing = [{ _id: 'r1', idempotencyKey: 'k1', status: 'pending' }]
  assert.equal(rcore.pickReusable(existing, 'k1')._id, 'r1')
  assert.equal(rcore.pickReusable(existing, 'k2'), null)
})

test('已取消的同幂等键预约不复用', () => {
  const existing = [{ _id: 'r1', idempotencyKey: 'k1', status: 'cancelled' }]
  assert.equal(rcore.pickReusable(existing, 'k1'), null)
})

test('同日期同手机同团队的有效预约被识别为重复', () => {
  const existing = [
    { _id: 'r1', visitDate: WED, contactPhone: '13800138000', teamName: '某某公司', status: 'confirmed' }
  ]
  const dup = rcore.findDuplicate(existing, baseForm())
  assert.ok(dup, '应识别为重复预约')

  const cancelled = [Object.assign({}, existing[0], { status: 'cancelled' })]
  assert.equal(rcore.findDuplicate(cancelled, baseForm()), null, '已取消的不算重复')

  const otherDay = [Object.assign({}, existing[0], { visitDate: '2026-08-06' })]
  assert.equal(rcore.findDuplicate(otherDay, baseForm()), null)
})

// ============ 状态与分享 ============

test('转人工的预约仍然落库为待确认，不是只弹二维码', () => {
  const r = rcore.buildReservation(baseForm({ visitDate: SAT }), CONFIG, { openid: 'u1', idempotencyKey: 'k1', mode: 'manual' }, NOW)
  assert.equal(r.status, 'pending')
  assert.equal(r.needsManual, true)
  assert.equal(r._openid, 'u1')
  assert.ok(r.shareToken, '详情分享需要 token')
})

test('自助预约直接进入待确认状态并记录来源', () => {
  const r = rcore.buildReservation(baseForm(), CONFIG, { openid: 'u1', idempotencyKey: 'k1', mode: 'self' }, NOW)
  assert.equal(r.status, 'pending')
  assert.equal(r.needsManual, false)
  assert.equal(r.visitDate, WED)
  assert.equal(r.partySize, 20)
})

test('分享 token 不含手机号，且每条预约不同', () => {
  const a = rcore.buildReservation(baseForm(), CONFIG, { openid: 'u1', idempotencyKey: 'k1', mode: 'self' }, NOW)
  const b = rcore.buildReservation(baseForm(), CONFIG, { openid: 'u1', idempotencyKey: 'k2', mode: 'self' }, NOW)
  assert.notEqual(a.shareToken, b.shareToken)
  assert.equal(a.shareToken.includes('13800138000'), false, 'token 不得包含手机号')
})

test('分享摘要隐藏手机号等隐私字段', () => {
  const summary = rcore.toShareSummary({
    visitDate: WED, teamName: '某某公司', partySize: 20, status: 'confirmed',
    contactName: '张三', contactPhone: '13800138000', _openid: 'u1', remark: '内部备注'
  })
  const text = JSON.stringify(summary)
  assert.equal(text.includes('13800138000'), false, '分享摘要不得暴露手机号')
  assert.equal(text.includes('u1'), false, '不得暴露 openid')
  assert.equal(summary.visitDate, WED)
  assert.equal(summary.partySize, 20)
})

test('可取消状态判断：待确认/已确认可取消，已完成不可', () => {
  assert.equal(rcore.canCancel({ status: 'pending' }).ok, true)
  assert.equal(rcore.canCancel({ status: 'confirmed' }).ok, true)
  assert.equal(rcore.canCancel({ status: 'completed' }).ok, false)
  assert.equal(rcore.canCancel({ status: 'cancelled' }).ok, false)
  assert.equal(rcore.canCancel({ status: 'rejected' }).ok, false)
})

// ============ 预约入口页 ============

test('预约中心只走企微直连，不再提供自助表单', (t) => {
  // 业主 2026-07-25：自助预约不好管理容易漏单，统一由管家登记
  const { page } = mountPage(t, entryPath)
  assert.equal(page.data.contactFirst, true)
  assert.equal(page.data.entries, undefined, '不再有自助入口列表')
  assert.ok(page.data.scenes.length > 0, '仍需说明可安排哪些场景')
})

test('预约中心可直接拨打预约电话', (t) => {
  const { page, calls } = mountPage(t, entryPath)
  page.onCall()
  assert.deepEqual(calls.phone, ['19112040740'])
})

// ============ 详情页 ============

const RESERVATION = {
  reservationId: 'r1', visitDate: WED, teamType: 'company', teamName: '某某公司',
  partySize: 20, contactName: '张三', contactPhone: '138****8000',
  status: 'pending', needsManual: false, shareToken: 'st-abc'
}

test('详情页展示预约信息与状态', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: { getVisitReservation: () => Promise.resolve({ reservation: RESERVATION }) }
  })
  await page.onLoad({ id: 'r1' })
  assert.equal(page.data.reservation.teamName, '某某公司')
  assert.equal(page.data.canCancel, true)
})

test('已完成的预约不显示取消入口', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: {
      getVisitReservation: () => Promise.resolve({ reservation: Object.assign({}, RESERVATION, { status: 'completed' }) })
    }
  })
  await page.onLoad({ id: 'r1' })
  assert.equal(page.data.canCancel, false)
})

test('取消需二次确认，确认后状态变为已取消', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      getVisitReservation: (d, n) => Promise.resolve({
        reservation: Object.assign({}, RESERVATION, { status: n > 1 ? 'cancelled' : 'pending' })
      }),
      cancelVisitReservation: () => Promise.resolve({ status: 'cancelled' })
    }
  })
  await page.onLoad({ id: 'r1' })
  await page.onCancel()
  assert.equal(calls.modal.length, 1)
  assert.ok(calls.request.some((c) => c.name === 'cancelVisitReservation'))
  assert.equal(page.data.canCancel, false)
})

test('分享路径使用 token，不带手机号', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: { getVisitReservation: () => Promise.resolve({ reservation: RESERVATION }) }
  })
  await page.onLoad({ id: 'r1' })
  const share = page.onShareAppMessage()
  assert.ok(share.path.includes('st-abc'))
  assert.equal(share.path.includes('138'), false, '分享链接不得包含手机号')
})
