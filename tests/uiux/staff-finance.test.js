const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/finance/finance.js')
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
    gross: 12780,
    paidCount: 25,
    refunds: 0,
    refundCount: 0,
    net: 12780,
    actualNetIncome: 12780,
    verifiedTicketCount: 27,
    pendingRefundCount: 1,
    pendingRefundAmount: 8312,
    anomalyCount: 1,
    anomalyAmount: 13412
  },
  incomeBreakdown: [
    { key: 'ticket', label: '门票', amount: 300000, count: 20 },
    { key: 'membership', label: '会员', amount: 28600, count: 5 }
  ],
  anomalies: {
    total: 2,
    byType: { duplicate_payment: 1, missing_order: 1 },
    list: []
  },
  truncated: false,
  updatedAt: '2026-07-28T10:17:00.000Z'
}

test('实际净收入页继承日期范围并按核销口径展示金额', async (t) => {
  const { page, calls } = mountPage(t, (name, data) => {
    assert.equal(name, 'adminOperationsLedger')
    assert.equal(data.action, 'finance')
    assert.equal(data.from, 1000)
    assert.equal(data.to, 2000)
    return Promise.resolve(REPORT)
  })

  await page.onLoad({ from: '1000', to: '2000' })
  assert.equal(calls.request.length, 1)
  assert.equal(page.data.report.finance.grossText, '127.80')
  assert.equal(page.data.report.finance.refundsText, '0.00')
  assert.equal(page.data.report.finance.netText, '127.80')
  assert.equal(page.data.report.finance.actualNetIncomeText, '127.80')
  assert.equal(page.data.report.finance.paidCount, 25)
  assert.equal(page.data.report.finance.verifiedTicketCount, 27)
  assert.equal(page.data.hasData, true)
})

test('财务首页默认查询当天并仅在有风险时突出风险入口', async (t) => {
  const { page, calls } = mountPage(t, (_name, data) => {
    assert.equal(data.to - data.from, 86400000)
    return Promise.resolve(REPORT)
  })

  await page.onLoad({})
  assert.equal(page.data.showRisk, true)
  assert.equal(page.data.riskCount, 3)
  assert.equal(page.data.pendingRefundAmountText, '83.12')
  assert.equal(calls.request.length, 1)
})

test('全部账单和风险项继承当前范围下钻', async (t) => {
  const { page, calls } = mountPage(t, () => Promise.resolve(REPORT))
  await page.onLoad({ from: '1000', to: '2000' })

  page.goReconciliation()
  page.goAnomalies()
  assert.match(calls.navigate[0], /pages\/staff\/reconciliation\/reconciliation/)
  assert.match(calls.navigate[0], /from=1000/)
  assert.match(calls.navigate[1], /pages\/staff\/bill-detail\/bill-detail/)
  assert.match(calls.navigate[1], /risk=1/)
})

test('403 显示无权限，普通错误可重试', async (t) => {
  const denied = mountPage(t, () => {
    const error = new Error('需要管理员权限')
    error.code = 403
    return Promise.reject(error)
  })
  await denied.page.onLoad({})
  assert.equal(denied.page.data.denied, true)
  assert.equal(denied.page.data.hasError, false)

  const failed = mountPage(t, () => Promise.reject(new Error('network')))
  await failed.page.onLoad({})
  assert.equal(failed.page.data.denied, false)
  assert.equal(failed.page.data.hasError, true)
})

test('实际净收入模板明确它与核销票面金额是同一指标', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/finance/finance.wxml'),
    'utf8'
  )
  assert.match(wxml, /实际净收入/)
  assert.match(wxml, /按核销时间统计/)
  assert.match(wxml, /即已核销票面金额/)
  assert.match(wxml, /关联订单/)
  assert.match(wxml, /核销票数/)
  assert.match(wxml, /查看资金账本/)
  assert.doesNotMatch(wxml, /已履约收入/)
  assert.doesNotMatch(wxml, /支付订单/)
  assert.doesNotMatch(wxml, /小程序业务账/)
  assert.match(wxml, /showRisk/)
  assert.match(wxml, /sr-skeleton/)
  assert.match(wxml, /sr-error-state/)
  assert.match(wxml, /sr-empty-state/)
})

test('财务首页只使用全局 Design Token 并适配底部安全区', () => {
  const wxss = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/finance/finance.wxss'),
    'utf8'
  )
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
  assert.match(wxss, /safe-area-inset-bottom/)
  assert.match(wxss, /var\(--sr-radius/)
  assert.match(wxss, /var\(--sr-gap/)
})

test('财务首页已注册', () => {
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))
  assert.ok(app.pages.includes('pages/staff/finance/finance'))
})
