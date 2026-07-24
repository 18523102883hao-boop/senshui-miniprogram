// Task 10 溪降预约闭环补齐
// 依据 PRD §9.5 与 .scratch/creek-booking/spec.md 中未实现项
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const core = require(path.join(projectRoot, 'cloudfunctions/createBooking/booking-core.js'))
const createPath = path.join(projectRoot, 'miniprogram/pages/booking/create/create.js')
const creekPath = path.join(projectRoot, 'miniprogram/pages/staff/creek/creek.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')
const envPath = path.join(projectRoot, 'miniprogram/env.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], redirect: [], toast: [], modal: [], subscribe: [], scan: [] }
  let pageConfig

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }

  const requestImpl = {
    call(name, data) {
      calls.request.push({ name, data })
      const responder = options.responders && options.responders[name]
      if (typeof responder === 'function') return responder(data, calls.request.filter((c) => c.name === name).length)
      if (responder) return Promise.resolve(responder)
      return Promise.reject(new Error('no responder: ' + name))
    }
  }
  requestImpl.callWithLoading = (name, data) => requestImpl.call(name, data)
  stub(requestPath, requestImpl)
  stub(hapticsPath, { haptic() {} })
  // 订阅消息模板 ID 是业务配置；测试里注入，模拟后台已申请到模板的状态
  if (options.env !== false) {
    stub(envPath, Object.assign({
      cloudEnv: 'test', frontDeskPhone: '19112040740',
      subscribeTmplIds: { booking: ['TMPL_BOOKING_REMIND'] }
    }, options.env || {}))
  }

  global.wx = {
    navigateTo(o) { calls.navigate.push(o.url) },
    redirectTo(o) { calls.redirect.push(o.url) },
    navigateBack() {},
    showToast(o) { calls.toast.push(o) },
    showModal(o) { calls.modal.push(o); if (o.success) o.success({ confirm: options.modalConfirm !== false }) },
    showLoading() {}, hideLoading() {},
    setStorageSync() {}, getStorageSync() { return null },
    setNavigationBarTitle() {}, stopPullDownRefresh() {},
    scanCode(o) { calls.scan.push(o); if (options.scanResult) o.success({ result: options.scanResult }); else if (o.fail) o.fail({}) },
    requestSubscribeMessage(o) {
      calls.subscribe.push(o.tmplIds)
      const res = {}
      ;(o.tmplIds || []).forEach((id) => { res[id] = options.subscribeReject ? 'reject' : 'accept' })
      if (o.success) o.success(res)
      if (o.complete) o.complete(res)
    }
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

// ============ 购票凭证校验（PRD §9.5 核心）============

test('持有小程序溪降票时自动关联真实票号', () => {
  const r = core.resolveTicketRef({
    nativeTickets: [
      { ticketNo: 'T100', status: 'unused', sku: 'creek_single' },
      { ticketNo: 'T101', status: 'used', sku: 'creek_single' }
    ]
  })
  assert.equal(r.ok, true)
  assert.equal(r.ref.source, 'native')
  assert.equal(r.ref.ticketNo, 'T100', '应选中未使用的那张')
  assert.equal(r.ref.verified, true)
})

test('云端不得凭空生成票号冒充购票凭证', () => {
  const r = core.resolveTicketRef({ nativeTickets: [], externalTicketNo: '' })
  assert.equal(r.ok, false, '无任何凭证时必须拒绝，不能自造票号')
  assert.match(r.msg, /票|凭证/)
})

test('外部渠道购票可手输券号，但明确标记为未经系统核验', () => {
  const r = core.resolveTicketRef({ nativeTickets: [], externalTicketNo: ' DY-8899 ' })
  assert.equal(r.ok, true)
  assert.equal(r.ref.source, 'external')
  assert.equal(r.ref.ticketNo, 'DY-8899')
  assert.equal(r.ref.verified, false, '外部券号未经系统核验，不能标为已验证')
})

test('小程序票优先于手输券号，避免重复占用', () => {
  const r = core.resolveTicketRef({
    nativeTickets: [{ ticketNo: 'T100', status: 'unused', sku: 'creek_single' }],
    externalTicketNo: 'DY-8899'
  })
  assert.equal(r.ref.source, 'native')
  assert.equal(r.ref.ticketNo, 'T100')
})

test('已核销或已退款的票不能用于预约', () => {
  const r = core.resolveTicketRef({
    nativeTickets: [
      { ticketNo: 'T1', status: 'used', sku: 'creek_single' },
      { ticketNo: 'T2', status: 'refunded', sku: 'creek_single' }
    ]
  })
  assert.equal(r.ok, false)
})

test('预约单号与购票凭证是两个概念，命名不得混淆', () => {
  const no = core.buildBookingNo(new Date('2026-08-09T10:00:00+08:00'))
  assert.ok(no.startsWith('BK'), '预约单号用 BK 前缀，避免与门票 T/CK 号混淆')
  assert.notEqual(no, core.buildBookingNo(new Date('2026-08-09T10:00:00+08:00')))
})

// ============ 截止时间规则 ============

const SESSION = { date: '2026-08-09', startTime: '14:00', status: 'open' }
const CUTOFF_MIN = 60

test('开场前超过截止时间可改签/取消', () => {
  const now = new Date('2026-08-09T12:00:00+08:00')
  assert.equal(core.checkCutoff(SESSION, now, CUTOFF_MIN).ok, true)
})

test('进入截止时间内不可改签/取消', () => {
  const now = new Date('2026-08-09T13:30:00+08:00')
  const r = core.checkCutoff(SESSION, now, CUTOFF_MIN)
  assert.equal(r.ok, false)
  assert.match(r.msg, /开场|截止/)
})

test('已开场后一律不可改签/取消', () => {
  const now = new Date('2026-08-09T15:00:00+08:00')
  assert.equal(core.checkCutoff(SESSION, now, CUTOFF_MIN).ok, false)
})

test('改签限一次', () => {
  assert.equal(core.canChange({ status: 'reserved', changeCount: 0 }).ok, true)
  const r = core.canChange({ status: 'reserved', changeCount: 1 })
  assert.equal(r.ok, false)
  assert.match(r.msg, /一次|已改签/)
  assert.equal(core.canChange({ status: 'verified', changeCount: 0 }).ok, false, '已核销不可改签')
})

// ============ 儿童安全确认 ============

test('未确认安全条件不允许提交预约', () => {
  const r = core.validateBookingForm({ phone: '13800138000', safetyConfirmed: false })
  assert.equal(r.ok, false)
  assert.match(r.msg, /安全|须知/)
})

test('携带儿童时必须额外确认监护与身高条件', () => {
  const withChild = { phone: '13800138000', safetyConfirmed: true, withChild: true, childConfirmed: false }
  const r = core.validateBookingForm(withChild)
  assert.equal(r.ok, false)
  assert.match(r.msg, /儿童|身高|监护/)
  assert.equal(core.validateBookingForm(Object.assign({}, withChild, { childConfirmed: true })).ok, true)
})

test('手机号格式仍然校验', () => {
  assert.equal(core.validateBookingForm({ phone: '123', safetyConfirmed: true }).ok, false)
  assert.equal(core.validateBookingForm({ phone: '13800138000', safetyConfirmed: true }).ok, true)
})

// ============ 员工插单与台账 ============

test('插单占用与线上同一库存池', () => {
  const r = core.buildBooking({
    openid: 'staff-openid', sessionId: 's1', phone: '13800138000',
    ticketRef: { source: 'front', ticketNo: 'FRONT-01', verified: true },
    source: 'front', boardingNo: '12', operatorOpenid: 'staff-1'
  }, new Date('2026-08-09T10:00:00+08:00'))
  assert.equal(r.source, 'front')
  assert.equal(r.boardingNo, '12')
  assert.equal(r.operatorOpenid, 'staff-1')
  assert.equal(r.status, 'reserved', '插单同样占位，走同一库存池')
})

test('台账按场次汇总预约与核销人数', () => {
  const ledger = core.buildLedger([
    { sessionId: 's1', status: 'reserved', source: 'customer' },
    { sessionId: 's1', status: 'verified', source: 'customer' },
    { sessionId: 's1', status: 'verified', source: 'front' },
    { sessionId: 's1', status: 'cancelled', source: 'customer' },
    { sessionId: 's2', status: 'reserved', source: 'customer' }
  ])
  assert.equal(ledger.s1.reserved, 1)
  assert.equal(ledger.s1.verified, 2)
  assert.equal(ledger.s1.front, 1)
  assert.equal(ledger.s1.total, 3, '已取消不计入应到人数')
  assert.equal(ledger.s2.total, 1)
})

// ============ 创建页 ============

const SESSION_LIST = [
  { _id: 's1', date: '2026-08-09', startTime: '10:00', remaining: 5, capacity: 20, status: 'open' },
  { _id: 's2', date: '2026-08-09', startTime: '14:00', remaining: 0, capacity: 20, status: 'open' }
]

test('创建页按所选场次的日期查询，而不是只查当天', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    responders: {
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getMyTickets: () => Promise.resolve({ list: [] })
    }
  })
  await page.onLoad({ sessionId: 's1', date: '2026-08-09' })
  const q = calls.request.filter((c) => c.name === 'listSessions')[0]
  assert.equal(q.data.date, '2026-08-09', '必须按传入日期查询，否则预约次日场次会失败')
  assert.equal(page.data.session._id, 's1')
})

test('创建页展示是否已持有小程序溪降票', async (t) => {
  const { page } = mountPage(t, createPath, {
    responders: {
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getMyTickets: () => Promise.resolve({ list: [{ ticketNo: 'T100', status: 'unused', sku: 'creek_single' }] })
    }
  })
  await page.onLoad({ sessionId: 's1', date: '2026-08-09' })
  assert.equal(page.data.hasNativeTicket, true)
  assert.equal(page.data.nativeTicketNo, 'T100')
})

test('无小程序票时要求手输券号，不静默放行', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    responders: {
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getMyTickets: () => Promise.resolve({ list: [] })
    }
  })
  await page.onLoad({ sessionId: 's1', date: '2026-08-09' })
  page.setData({ phone: '13800138000', safetyConfirmed: true })
  await page.onSubmit()
  assert.equal(calls.request.filter((c) => c.name === 'createBooking').length, 0)
  assert.ok(calls.toast.length > 0)
})

test('未勾选安全须知不允许提交', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    responders: {
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getMyTickets: () => Promise.resolve({ list: [{ ticketNo: 'T100', status: 'unused', sku: 'creek_single' }] })
    }
  })
  await page.onLoad({ sessionId: 's1', date: '2026-08-09' })
  page.setData({ phone: '13800138000', safetyConfirmed: false })
  await page.onSubmit()
  assert.equal(calls.request.filter((c) => c.name === 'createBooking').length, 0)
})

test('预约成功后申请订阅消息授权', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    responders: {
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getMyTickets: () => Promise.resolve({ list: [{ ticketNo: 'T100', status: 'unused', sku: 'creek_single' }] }),
      createBooking: () => Promise.resolve({ bookingId: 'b1', bookingNo: 'BK1', code: '123456' }),
      saveSubscribeGrant: () => Promise.resolve({})
    }
  })
  await page.onLoad({ sessionId: 's1', date: '2026-08-09' })
  page.setData({ phone: '13800138000', safetyConfirmed: true })
  await page.onSubmit()
  assert.equal(calls.subscribe.length, 1, '预约成功应申请订阅消息')
  assert.ok(calls.redirect.length > 0)
})

test('用户拒绝订阅消息不影响预约成功', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    subscribeReject: true,
    responders: {
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getMyTickets: () => Promise.resolve({ list: [{ ticketNo: 'T100', status: 'unused', sku: 'creek_single' }] }),
      createBooking: () => Promise.resolve({ bookingId: 'b1', bookingNo: 'BK1', code: '123456' }),
      saveSubscribeGrant: () => Promise.resolve({})
    }
  })
  await page.onLoad({ sessionId: 's1', date: '2026-08-09' })
  page.setData({ phone: '13800138000', safetyConfirmed: true })
  await page.onSubmit()
  assert.ok(calls.redirect.length > 0, '拒绝订阅仍要跳详情页')
})

test('连点提交不会重复预约', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    responders: {
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getMyTickets: () => Promise.resolve({ list: [{ ticketNo: 'T100', status: 'unused', sku: 'creek_single' }] }),
      createBooking: () => new Promise((r) => setTimeout(() => r({ bookingId: 'b1', code: '1' }), 10)),
      saveSubscribeGrant: () => Promise.resolve({})
    }
  })
  await page.onLoad({ sessionId: 's1', date: '2026-08-09' })
  page.setData({ phone: '13800138000', safetyConfirmed: true })
  await Promise.all([page.onSubmit(), page.onSubmit()])
  assert.equal(calls.request.filter((c) => c.name === 'createBooking').length, 1)
})

// ============ 员工余位 / 插单 / 台账页 ============

test('员工页展示各场次余位与台账', async (t) => {
  const { page } = mountPage(t, creekPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'creek', name: '小李' }),
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getSessionLedger: () => Promise.resolve({ ledger: { s1: { reserved: 3, verified: 2, front: 1, total: 5 } } })
    }
  })
  await page.onShow()
  assert.equal(page.data.allowed, true)
  assert.equal(page.data.sessions.length, 2)
  assert.equal(page.data.sessions[0].remaining, 5)
})

test('非检票角色不能进入员工核销台', async (t) => {
  const { page } = mountPage(t, creekPath, {
    responders: { checkStaff: () => Promise.resolve({ role: null }) }
  })
  await page.onShow()
  assert.equal(page.data.allowed, false)
})

test('前台插单调用 frontInsertBooking 并带上车号', async (t) => {
  const { page, calls } = mountPage(t, creekPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'front', name: '小王' }),
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getSessionLedger: () => Promise.resolve({ ledger: {} }),
      frontInsertBooking: () => Promise.resolve({ bookingId: 'b9', bookingNo: 'BK9' })
    }
  })
  await page.onShow()
  page.setData({
    insertSessionId: 's1',
    insertPhone: '13800138000',
    insertBoardingNo: '12',
    insertTicketNo: 'DY-77'
  })
  await page.onInsertSubmit()
  const req = calls.request.filter((c) => c.name === 'frontInsertBooking')[0]
  assert.ok(req, '应调用 frontInsertBooking')
  assert.equal(req.data.boardingNo, '12')
  assert.equal(req.data.sessionId, 's1')
})

test('插单缺少必填项时前端拦截', async (t) => {
  const { page, calls } = mountPage(t, creekPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'front', name: '小王' }),
      listSessions: () => Promise.resolve({ sessions: SESSION_LIST }),
      getSessionLedger: () => Promise.resolve({ ledger: {} })
    }
  })
  await page.onShow()
  page.setData({ insertSessionId: '', insertPhone: '', insertBoardingNo: '' })
  await page.onInsertSubmit()
  assert.equal(calls.request.filter((c) => c.name === 'frontInsertBooking').length, 0)
  assert.ok(calls.toast.length > 0)
})
