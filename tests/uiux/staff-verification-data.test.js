const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/verification-data/verification-data.js')
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

const SUMMARY = {
  operations: {
    verifiedTicketCount: 3,
    admittedPeopleCount: 4,
    unknownAdmissionTicketCount: 1,
    relatedOrderCount: 2,
    actualNetIncome: 33600,
    ticketPriceMissingCount: 1
  },
  ticketBreakdown: [
    {
      key: 'creek_double',
      label: '双人溪降票',
      ticketCount: 1,
      admissionCount: 2,
      unknownAdmissionTicketCount: 0,
      admissionShare: 0.5,
      faceValue: 12800
    },
    {
      key: 'creek_single',
      label: '单人溪降票',
      ticketCount: 2,
      admissionCount: 2,
      unknownAdmissionTicketCount: 1,
      admissionShare: 0.5,
      faceValue: 20800
    }
  ],
  staffBreakdown: [],
  anomalies: { total: 1, list: [] },
  truncated: false,
  updatedAt: '2026-07-28T10:20:00.000Z'
}

const DETAILS = {
  page: 1,
  total: 1,
  hasMore: false,
  truncated: false,
  staffOptions: [{ staffOpenid: 'staff-secret', staffName: '张浩', staffNo: 'A01' }],
  subtypeOptions: [{ key: 'creek_double', label: '双人溪降票' }],
  list: [{
    kind: 'ticket_verifications',
    subtype: 'creek_double',
    subtypeLabel: '双人溪降票',
    title: '双人溪降票',
    reference: 'T-DOUBLE',
    orderTradeNo: 'TK-DOUBLE',
    amount: 12800,
    ticketCount: 1,
    admissionCount: 2,
    admissionCountUnknown: false,
    staffName: '张浩',
    staffOpenid: 'staff-secret',
    phoneTail: '8000',
    eventAt: '2026-07-28T03:00:00.000Z'
  }]
}

test('默认今天并严格分开展示核销票数、实际人数、待核对票数、订单与实际净收入', async (t) => {
  const { page, calls } = mountPage(t, (name, data) => {
    assert.equal(name, 'adminOperationsLedger')
    assert.equal(data.action, 'verification')
    assert.equal(data.to - data.from, 86400000)
    return Promise.resolve(SUMMARY)
  })

  await page.onLoad({})
  assert.equal(page.data.tab, 'summary')
  assert.equal(page.data.summary.operations.verifiedTicketCount, 3)
  assert.equal(page.data.summary.operations.admittedPeopleCount, 4)
  assert.equal(page.data.summary.operations.unknownAdmissionTicketCount, 1)
  assert.equal(page.data.summary.operations.relatedOrderCount, 2)
  assert.equal(page.data.summary.operations.actualNetIncomeText, '336.00')
  assert.equal(calls.request.length, 1)
})

test('日、月、自定义日期范围均可查询且自定义范围不超过 366 天', async (t) => {
  const { page, calls } = mountPage(t, () => Promise.resolve(SUMMARY))
  await page.onLoad({})

  await page.onModeTap({ currentTarget: { dataset: { mode: 'month' } } })
  assert.equal(page.data.mode, 'month')
  assert.ok(page.data.range.to - page.data.range.from >= 28 * 86400000)

  await page.onModeTap({ currentTarget: { dataset: { mode: 'custom' } } })
  page.setData({ customFrom: '2026-07-01', customTo: '2026-07-28' })
  await page.onCustomQuery()
  const query = calls.request[calls.request.length - 1].data
  assert.equal(query.from, new Date(2026, 6, 1).getTime())
  assert.equal(query.to, new Date(2026, 6, 29).getTime())

  page.setData({ customFrom: '2025-01-01', customTo: '2026-07-28' })
  await page.onCustomQuery()
  assert.match(calls.toast[0], /366/)
})

test('验明细支持员工、票种、订单号筛选、分页和订单下钻', async (t) => {
  const { page, calls } = mountPage(t, (_name, data) => {
    if (data.action === 'verification') return Promise.resolve(SUMMARY)
    return Promise.resolve(Object.assign({}, DETAILS, {
      page: data.page,
      hasMore: data.page === 1,
      total: 31
    }))
  })
  await page.onLoad({})
  await page.onTabTap({ currentTarget: { dataset: { tab: 'details' } } })
  await page.onStaffChange({ detail: { value: 1 } })
  await page.onSubtypeChange({ detail: { value: 1 } })
  page.setData({ keyword: 'TK-DOUBLE' })
  await page.onSearchConfirm()

  const query = calls.request[calls.request.length - 1].data
  assert.equal(query.action, 'details')
  assert.equal(query.kind, 'ticket_verifications')
  assert.equal(query.staffOpenid, 'staff-secret')
  assert.equal(query.subtype, 'creek_double')
  assert.equal(query.keyword, 'TK-DOUBLE')

  await page.onReachBottom()
  assert.equal(page.data.page, 2)
  page.onDetailTap({ currentTarget: { dataset: { orderNo: 'TK-DOUBLE' } } })
  assert.match(calls.navigate[0], /pages\/staff\/order-detail\/order-detail/)
  assert.match(calls.navigate[0], /orderNo=TK-DOUBLE/)
})

test('票种统计和明细明确展示双人票 1 张 / 2 人', async (t) => {
  const { page } = mountPage(t, (_name, data) => {
    return Promise.resolve(data.action === 'verification' ? SUMMARY : DETAILS)
  })
  await page.onLoad({})
  assert.equal(page.data.summary.ticketBreakdown[0].countText, '1 张 / 2 人')
  await page.onTabTap({ currentTarget: { dataset: { tab: 'details' } } })
  assert.equal(page.data.list[0].countText, '1 张 / 2 人')
})

test('无权限、加载、失败、空数据、截断与继续加载状态齐全', async (t) => {
  const denied = mountPage(t, () => {
    const error = new Error('需要管理员权限')
    error.code = 403
    return Promise.reject(error)
  })
  await denied.page.onLoad({})
  assert.equal(denied.page.data.denied, true)

  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/verification-data/verification-data.wxml'),
    'utf8'
  )
  assert.match(wxml, /sr-skeleton/)
  assert.match(wxml, /sr-error-state/)
  assert.match(wxml, /sr-empty-state/)
  assert.match(wxml, /truncated/)
  assert.match(wxml, /loadingMore/)
})

test('核销页模板、Design Token 与页面注册完整', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/verification-data/verification-data.wxml'),
    'utf8'
  )
  const wxss = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/verification-data/verification-data.wxss'),
    'utf8'
  )
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))

  assert.match(wxml, /验证统计/)
  assert.match(wxml, /验证明细/)
  assert.match(wxml, /核销票数/)
  assert.match(wxml, /实际人数/)
  assert.match(wxml, /待核对/)
  assert.match(wxml, /实际净收入/)
  assert.match(wxml, /1 张.*2 人/)
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
  assert.match(wxss, /safe-area-inset-bottom/)
  assert.match(wxss, /var\(--sr-radius/)
  assert.ok(app.pages.includes('pages/staff/verification-data/verification-data'))
})
