const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/operations/operations.js')
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
  const calls = { request: [], navigate: [] }
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

const REPORT = {
  finance: {
    gross: 39600,
    paidCount: 2,
    refunds: 6790,
    refundCount: 2,
    net: 32810,
    orderIncome: 22800,
    orderIncomeCount: 1,
    actualNetIncome: 168000,
    pendingRefundCount: 1,
    pendingRefundAmount: 3200,
    anomalyCount: 1,
    anomalyAmount: 22800
  },
  operations: {
    ticketVerifiedCount: 12,
    verifiedTicketCount: 12,
    admittedPeopleCount: 15,
    unknownAdmissionTicketCount: 1,
    relatedOrderCount: 10,
    actualNetIncome: 168000,
    ticketPriceMissingCount: 1,
    memberVerificationCount: 3,
    lingPhysicalToDigital: 100,
    lingDigitalToPhysical: 40,
    businessRecordCount: 6,
    businessBreakdown: [
      { key: 'physical_to_digital', label: '实体兑电子', count: 2, quantity: 100 },
      { key: 'digital_to_physical', label: '电子兑实体', count: 1, quantity: 40 },
      { key: 'member_card_exchange', label: '会员卡兑换', count: 3, quantity: 3000 }
    ]
  },
  anomalies: { total: 2, byType: { duplicate_payment: 1 }, list: [] },
  truncated: false,
  updatedAt: '2026-07-28T10:17:00.000Z'
}

test('经营数据首页默认查询今天并展示财务与实际入园核心指标', async (t) => {
  const { page, calls } = mountPage(t, (name, data) => {
    assert.equal(name, 'adminOperationsLedger')
    assert.equal(data.action, 'summary')
    assert.equal(data.to - data.from, 86400000)
    return Promise.resolve(REPORT)
  })
  await page.onLoad()

  assert.equal(calls.request.length, 1)
  assert.equal(page.data.loaded, true)
  assert.equal(page.data.report.finance.grossText, '396.00')
  assert.equal(page.data.report.finance.refundsText, '67.90')
  assert.equal(page.data.report.finance.orderIncomeText, '228.00')
  assert.equal(page.data.report.finance.actualNetIncomeText, '1680.00')
  assert.equal(page.data.report.operations.admittedPeopleCount, 15)
  assert.equal(page.data.report.operations.verifiedTicketCount, 12)
  assert.equal(page.data.showRisk, true)
})

test('资金账本、入园核销与数据导出为独立入口并继承当天范围', async (t) => {
  const { page, calls } = mountPage(t, () => Promise.resolve(REPORT))
  await page.onLoad()

  page.goFunds()
  page.goVerification()
  page.goExport()
  assert.match(calls.navigate[0], /pages\/staff\/reconciliation\/reconciliation/)
  assert.match(calls.navigate[0], /from=/)
  assert.match(calls.navigate[0], /to=/)
  assert.match(calls.navigate[1], /pages\/staff\/verification-data\/verification-data/)
  assert.match(calls.navigate[2], /pages\/staff\/data-export\/data-export/)
  assert.match(calls.navigate[2], /from=/)
  assert.match(calls.navigate[2], /to=/)
})

test('经营首页用一个业务数据入口承接三类兑换汇总', async (t) => {
  const { page, calls } = mountPage(t, () => Promise.resolve(REPORT))
  await page.onLoad()

  page.goBusinessData()
  assert.match(calls.navigate[0], /operation-details/)
  assert.match(calls.navigate[0], /kind=business_data/)
})

test('403 显示无权限，其他错误保留重试状态', async (t) => {
  const denied = mountPage(t, () => {
    const error = new Error('需要管理员权限')
    error.code = 403
    return Promise.reject(error)
  })
  await denied.page.onLoad()
  assert.equal(denied.page.data.denied, true)
  assert.equal(denied.page.data.hasError, false)

  const failed = mountPage(t, () => Promise.reject(new Error('network')))
  await failed.page.onLoad()
  assert.equal(failed.page.data.denied, false)
  assert.equal(failed.page.data.hasError, true)
})

test('模板将订单收入与实际净收入分开，且不重复展示已核销票面金额', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/operations/operations.wxml'),
    'utf8'
  )
  assert.match(wxml, /经营数据中心/)
  assert.match(wxml, /收入识别/)
  assert.match(wxml, /订单收入/)
  assert.match(wxml, /退款/)
  assert.match(wxml, /实际净收入/)
  assert.match(wxml, /未核销/)
  assert.match(wxml, /实际入园/)
  assert.match(wxml, /核销票数/)
  assert.doesNotMatch(wxml, /已核销票面金额/)
  assert.match(wxml, /资金账本/)
  assert.match(wxml, /入园核销/)
  assert.match(wxml, /业务数据/)
  assert.match(wxml, /数据导出/)
  assert.match(wxml, /实体兑电子/)
  assert.match(wxml, /电子兑实体/)
  assert.match(wxml, /会员卡兑换/)
  assert.doesNotMatch(wxml, /小程序业务账/)
  assert.doesNotMatch(wxml, />财务对账</)
  assert.doesNotMatch(wxml, /secondary-card__title">长河令兑换/)
  assert.match(wxml, /sr-skeleton/)
  assert.match(wxml, /sr-error-state/)
  assert.match(wxml, /sr-empty-state/)
  assert.match(wxml, /truncated/)
})

test('经营数据首页只使用全局 Design Token，并留出底部安全区', () => {
  const wxss = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/operations/operations.wxss'),
    'utf8'
  )
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
  assert.match(wxss, /safe-area-inset-bottom/)
  assert.match(wxss, /var\(--sr-radius/)
  assert.match(wxss, /var\(--sr-gap/)
})

test('经营数据首页已注册且员工模式入口仅对管理员显示', () => {
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))
  const js = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/staff/entry/entry.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/staff/entry/entry.wxml'), 'utf8')

  assert.ok(app.pages.includes('pages/staff/operations/operations'))
  assert.match(js, /goOperations/)
  assert.match(js, /admin:[\s\S]*manage:\s*\['operations',\s*'invoices',\s*'maps'\]/)
  assert.match(wxml, /wx:for="\{\{manageTasks\}\}"/)
})
