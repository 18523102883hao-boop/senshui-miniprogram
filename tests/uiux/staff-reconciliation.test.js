const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/reconciliation/reconciliation.js')
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
  const calls = { request: [], navigate: [], toast: [] }
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
    showToast(o) { calls.toast.push(o.title) },
    stopPullDownRefresh() {}
  }
  global.Page = (pageConfig) => { config = pageConfig }
  delete require.cache[pagePath]
  const exports = require(pagePath)
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
  return { page, calls, exports }
}

const REPORT = {
  finance: {
    gross: 101000,
    refunds: 1000,
    net: 100000,
    paidCount: 4,
    refundCount: 1
  },
  operations: {
    verifiedTicketCount: 9,
    admittedPeopleCount: 12,
    unknownAdmissionTicketCount: 1,
    memberVerificationCount: 1,
    lingPhysicalToDigital: 20,
    lingDigitalToPhysical: 0
  },
  reconciliation: {
    daily: [
      {
        date: '2026-07-27',
        gross: 30000,
        refunds: 0,
        net: 30000,
        paidCount: 1,
        refundCount: 0,
        verifiedTicketCount: 3,
        admittedPeopleCount: 5,
        unknownAdmissionTicketCount: 0
      },
      {
        date: '2026-07-28',
        gross: 71000,
        refunds: 1000,
        net: 70000,
        paidCount: 3,
        refundCount: 1,
        verifiedTicketCount: 6,
        admittedPeopleCount: 7,
        unknownAdmissionTicketCount: 1
      }
    ],
    monthly: [
      {
        month: '2026-07',
        gross: 101000,
        refunds: 1000,
        net: 100000,
        paidCount: 4,
        refundCount: 1,
        verifiedTicketCount: 9,
        admittedPeopleCount: 12,
        unknownAdmissionTicketCount: 1
      }
    ]
  },
  anomalies: {
    total: 1,
    list: [{ type: 'missing_admission_snapshot', eventAt: '2026-07-28T03:00:00.000Z' }]
  },
  updatedAt: '2026-07-28T10:20:00.000Z'
}

test('日汇总默认查询截至当前日期的最近 31 天', async (t) => {
  const from = new Date(2026, 6, 28).getTime()
  const to = new Date(2026, 6, 29).getTime()
  const { page, calls } = mountPage(t, (name, data) => {
    assert.equal(name, 'adminOperationsLedger')
    assert.equal(data.action, 'summary')
    assert.equal(data.to - data.from, 31 * 86400000)
    assert.equal(data.to, to)
    return Promise.resolve(REPORT)
  })

  await page.onLoad({ from: String(from), to: String(to) })
  assert.equal(calls.request.length, 1)
  assert.equal(page.data.mode, 'daily')
})

test('日账单倒序展示金额、核销票数、实际人数和风险', async (t) => {
  const { page } = mountPage(t, () => Promise.resolve(REPORT))
  await page.onLoad({})

  assert.equal(page.data.entries[0].key, '2026-07-28')
  assert.equal(page.data.entries[0].netText, '700.00')
  assert.equal(page.data.entries[0].verifiedTicketCount, 6)
  assert.equal(page.data.entries[0].admittedPeopleCount, 7)
  assert.equal(page.data.entries[0].riskCount, 1)
  assert.equal(page.data.entries[1].key, '2026-07-27')
})

test('月汇总切换为最近 12 个月并按月展示', async (t) => {
  const { page, calls } = mountPage(t, (_name, data) => {
    if (calls.request.length === 2) {
      assert.ok(data.to - data.from >= 365 * 86400000)
      assert.ok(data.to - data.from <= 366 * 86400000)
    }
    return Promise.resolve(REPORT)
  })
  await page.onLoad({})
  await page.onModeTap({ currentTarget: { dataset: { mode: 'monthly' } } })

  assert.equal(page.data.mode, 'monthly')
  assert.equal(page.data.entries[0].key, '2026-07')
  assert.equal(calls.request.length, 2)
})

test('自定义汇总校验日期并默认隐藏空账单', async (t) => {
  const emptyReport = {
    finance: {},
    operations: {},
    reconciliation: { daily: [], monthly: [] },
    anomalies: { total: 0, list: [] }
  }
  const { page, calls } = mountPage(t, () => Promise.resolve(emptyReport))
  await page.onLoad({})
  page.setData({ mode: 'custom', customFrom: '2026-07-29', customTo: '2026-07-28' })
  await page.onCustomQuery()
  assert.equal(calls.toast[0], '开始日期不能晚于结束日期')

  page.setData({ customFrom: '2026-07-28', customTo: '2026-07-28' })
  await page.onCustomQuery()
  assert.equal(page.data.entries.length, 0)
  page.onToggleEmpty()
  assert.equal(page.data.entries.length, 1)
})

test('账单下钻携带条目自身起止时间', async (t) => {
  const { page, calls } = mountPage(t, () => Promise.resolve(REPORT))
  await page.onLoad({})
  page.onEntryTap({ currentTarget: { dataset: { index: 0 } } })

  assert.match(calls.navigate[0], /pages\/staff\/bill-detail\/bill-detail/)
  assert.match(calls.navigate[0], /from=/)
  assert.match(calls.navigate[0], /to=/)
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

test('账单对账模板、Design Token 与页面注册完整', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/reconciliation/reconciliation.wxml'),
    'utf8'
  )
  const wxss = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/reconciliation/reconciliation.wxss'),
    'utf8'
  )
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))

  assert.match(wxml, /日汇总/)
  assert.match(wxml, /月汇总/)
  assert.match(wxml, /自定义汇总/)
  assert.match(wxml, /不显示空账单/)
  assert.match(wxml, /核销票数/)
  assert.match(wxml, /实际人数/)
  assert.match(wxml, /sr-skeleton/)
  assert.match(wxml, /sr-error-state/)
  assert.match(wxml, /sr-empty-state/)
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
  assert.match(wxss, /safe-area-inset-bottom/)
  assert.match(wxss, /var\(--sr-radius/)
  assert.ok(app.pages.includes('pages/staff/reconciliation/reconciliation'))
})
