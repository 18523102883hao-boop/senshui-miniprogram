const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/bill-detail/bill-detail.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const utilPath = path.join(projectRoot, 'miniprogram/utils/util.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, responder) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], clipboard: [], toast: [] }
  let config

  function stub(modulePath, exports) {
    originals[modulePath] = require.cache[modulePath]
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports }
  }
  stub(requestPath, {
    call(name, data) {
      calls.request.push({ name, data })
      return responder(name, data)
    }
  })
  stub(hapticsPath, { haptic() {} })
  delete require.cache[utilPath]

  global.wx = {
    navigateTo(o) { calls.navigate.push(o.url) },
    setClipboardData(o) {
      calls.clipboard.push(o.data)
      if (o.success) o.success()
    },
    showToast(o) { calls.toast.push(o.title) },
    stopPullDownRefresh() {}
  }
  global.Page = (pageConfig) => { config = pageConfig }
  delete require.cache[pagePath]
  require(pagePath)
  const page = Object.assign({}, config, {
    data: clone(config.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
    if (page._searchTimer) clearTimeout(page._searchTimer)
    delete require.cache[pagePath]
    Object.keys(originals).forEach((modulePath) => {
      if (originals[modulePath]) require.cache[modulePath] = originals[modulePath]
      else delete require.cache[modulePath]
    })
    global.Page = originalPage
    global.wx = originalWx
  })
  return { page, calls }
}

const FROM = new Date(2026, 6, 28).getTime()
const TO = new Date(2026, 6, 29).getTime()
const SUMMARY = {
  finance: {
    gross: 328600,
    paidCount: 25,
    refunds: 47262,
    refundCount: 2,
    net: 281338,
    orderIncome: 182000,
    orderIncomeCount: 12,
    actualNetIncome: 127800,
    pendingRefundCount: 1,
    pendingRefundAmount: 8312
  },
  incomeBreakdown: [{ key: 'ticket_order', label: '门票', amount: 328600, count: 25 }],
  anomalies: {
    total: 1,
    list: [{
      type: 'duplicate_payment',
      label: '重复支付',
      reference: 'TK001',
      orderTradeNo: 'TK001',
      amount: 16800,
      eventAt: '2026-07-28T03:00:00.000Z'
    }]
  },
  updatedAt: '2026-07-28T10:20:00.000Z'
}
const DETAILS = {
  page: 1,
  total: 1,
  hasMore: false,
  truncated: false,
  staffOptions: [{ staffOpenid: 'staff-secret', staffName: '张浩', staffNo: 'A01' }],
  subtypeOptions: [{ key: 'ticket_order', label: '门票' }],
  list: [{
    kind: 'funds',
    eventKind: 'payment',
    subtype: 'ticket_order',
    subtypeLabel: '门票',
    title: '单人溪降票',
    reference: 'TK001',
    orderTradeNo: 'TK001',
    amount: 16800,
    staffName: '张浩',
    staffOpenid: 'staff-secret',
    phoneTail: '8000',
    eventAt: '2026-07-28T03:00:00.000Z'
  }]
}

test('账单统计展示支付、退款、净收入、业务构成与异常', async (t) => {
  const { page, calls } = mountPage(t, (name, data) => {
    assert.equal(name, 'adminOperationsLedger')
    assert.equal(data.action, 'funds')
    return Promise.resolve(SUMMARY)
  })
  await page.onLoad({ from: String(FROM), to: String(TO) })

  assert.equal(page.data.tab, 'summary')
  assert.equal(page.data.summary.finance.grossText, '3286.00')
  assert.equal(page.data.summary.finance.refundsText, '472.62')
  assert.equal(page.data.summary.finance.netText, '2813.38')
  assert.equal(page.data.summary.finance.orderIncomeText, '1820.00')
  assert.equal(page.data.summary.finance.actualNetIncomeText, '1278.00')
  assert.equal(page.data.summary.incomeBreakdown[0].amountText, '3286.00')
  assert.equal(page.data.summary.anomalies.total, 1)
  assert.equal(calls.request.length, 1)
})

test('账单明细支持收支、订单类型、员工与关键词筛选', async (t) => {
  const { page, calls } = mountPage(t, (_name, data) => {
    if (data.action === 'funds') return Promise.resolve(SUMMARY)
    return Promise.resolve(DETAILS)
  })
  await page.onLoad({ from: String(FROM), to: String(TO) })
  await page.onTabTap({ currentTarget: { dataset: { tab: 'details' } } })
  await page.onEventKindTap({ currentTarget: { dataset: { kind: 'refund' } } })
  await page.onStaffChange({ detail: { value: 1 } })
  await page.onSubtypeChange({ detail: { value: 1 } })
  page.setData({ keyword: 'TK001' })
  await page.onSearchConfirm()

  const query = calls.request[calls.request.length - 1].data
  assert.equal(query.action, 'details')
  assert.equal(query.kind, 'funds')
  assert.equal(query.eventKind, 'refund')
  assert.equal(query.staffOpenid, 'staff-secret')
  assert.equal(query.subtype, 'ticket_order')
  assert.equal(query.keyword, 'TK001')
})

test('明细支持分页并可进入脱敏订单详情', async (t) => {
  const { page, calls } = mountPage(t, (_name, data) => {
    if (data.action === 'funds') return Promise.resolve(SUMMARY)
    return Promise.resolve(Object.assign({}, DETAILS, {
      page: data.page,
      total: 31,
      hasMore: data.page === 1,
      list: [Object.assign({}, DETAILS.list[0], {
        reference: data.page === 1 ? 'TK001' : 'TK002',
        orderTradeNo: data.page === 1 ? 'TK001' : 'TK002'
      })]
    }))
  })
  await page.onLoad({ from: String(FROM), to: String(TO) })
  await page.onTabTap({ currentTarget: { dataset: { tab: 'details' } } })
  await page.onReachBottom()
  assert.deepEqual(page.data.list.map((item) => item.orderTradeNo), ['TK001', 'TK002'])

  page.onDetailTap({ currentTarget: { dataset: { orderNo: 'TK002' } } })
  assert.match(calls.navigate[0], /pages\/staff\/order-detail\/order-detail/)
  assert.match(calls.navigate[0], /orderNo=TK002/)
})

test('CSV 导出沿用当前筛选且不包含完整 openid 或手机号', async (t) => {
  const { page, calls } = mountPage(t, (_name, data) => {
    if (data.action === 'funds') return Promise.resolve(SUMMARY)
    return Promise.resolve(DETAILS)
  })
  await page.onLoad({ from: String(FROM), to: String(TO) })
  await page.onTabTap({ currentTarget: { dataset: { tab: 'details' } } })
  await page.onExport()

  assert.equal(calls.clipboard.length, 1)
  assert.match(calls.clipboard[0], /账单明细/)
  assert.match(calls.clipboard[0], /8000/)
  assert.doesNotMatch(calls.clipboard[0], /staff-secret|13800138000/)
})

test('异常与资金明细均可进入对应订单详情', async (t) => {
  const { page, calls } = mountPage(t, (_name, data) => {
    if (data.action === 'funds') return Promise.resolve(SUMMARY)
    return Promise.resolve(DETAILS)
  })
  await page.onLoad({ from: String(FROM), to: String(TO) })
  page.onAnomalyTap({ currentTarget: { dataset: { orderNo: 'TK001' } } })
  assert.match(calls.navigate[0], /orderNo=TK001/)
})

test('无权限、加载、失败、空数据、截断和继续加载状态齐全', async (t) => {
  const denied = mountPage(t, () => {
    const error = new Error('需要管理员权限')
    error.code = 403
    return Promise.reject(error)
  })
  await denied.page.onLoad({ from: String(FROM), to: String(TO) })
  assert.equal(denied.page.data.denied, true)

  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/bill-detail/bill-detail.wxml'),
    'utf8'
  )
  assert.match(wxml, /sr-skeleton/)
  assert.match(wxml, /sr-error-state/)
  assert.match(wxml, /sr-empty-state/)
  assert.match(wxml, /truncated/)
  assert.match(wxml, /loadingMore/)
})

test('账单详情区分订单收入、实际净收入和资金流水净额', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/bill-detail/bill-detail.wxml'),
    'utf8'
  )
  const wxss = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/bill-detail/bill-detail.wxss'),
    'utf8'
  )
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))

  assert.match(wxml, /账单统计/)
  assert.match(wxml, /账单明细/)
  assert.match(wxml, /支付/)
  assert.match(wxml, /退款/)
  assert.match(wxml, /订单收入/)
  assert.match(wxml, /实际净收入/)
  assert.match(wxml, /资金流水净额/)
  assert.match(wxml, /实际净收入构成/)
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
  assert.match(wxss, /safe-area-inset-bottom/)
  assert.match(wxss, /var\(--sr-radius/)
  assert.ok(app.pages.includes('pages/staff/bill-detail/bill-detail'))
})
