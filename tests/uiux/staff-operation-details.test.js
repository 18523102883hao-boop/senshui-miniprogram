const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(
  projectRoot,
  'miniprogram/pages/staff/operation-details/operation-details.js'
)
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], clipboard: [], toast: [], navigate: [] }
  let pageConfig

  const stub = (file, exports) => {
    originals[file] = require.cache[file]
    require.cache[file] = { id: file, filename: file, loaded: true, exports }
  }
  stub(requestPath, {
    call(name, data) {
      calls.request.push({ name, data })
      const responder = options.responders && options.responders[name]
      if (typeof responder === 'function') return responder(data, calls.request.length)
      if (responder) return Promise.resolve(responder)
      return Promise.reject(new Error('no responder: ' + name))
    }
  })
  stub(hapticsPath, { haptic() {} })

  global.wx = {
    showToast(input) { calls.toast.push(input) },
    navigateTo(input) { calls.navigate.push(input.url) },
    setClipboardData(input) {
      calls.clipboard.push(input.data)
      if (input.success) input.success()
    },
    stopPullDownRefresh() {}
  }
  global.Page = (config) => { pageConfig = config }
  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, pageConfig)
  page.data = clone(pageConfig.data)
  page.setData = function (patch, callback) {
    Object.keys(patch).forEach((key) => { this.data[key] = patch[key] })
    if (callback) callback()
  }

  t.after(() => {
    clearTimeout(page._searchTimer)
    global.Page = originalPage
    global.wx = originalWx
    Object.keys(originals).forEach((file) => {
      if (originals[file]) require.cache[file] = originals[file]
      else delete require.cache[file]
    })
    delete require.cache[pagePath]
  })
  return { page, calls }
}

const FROM = new Date(2026, 6, 28).getTime()
const TO = new Date(2026, 6, 29).getTime()
const DETAIL_RESPONSE = {
  kind: 'funds',
  page: 1,
  pageSize: 30,
  total: 1,
  hasMore: false,
  truncated: false,
  staffOptions: [
    { staffOpenid: 'staff-secret-openid', staffName: '张浩', staffNo: 'A01' }
  ],
  subtypeOptions: [{ key: 'ticket_order', label: '门票' }],
  businessBreakdown: [
    { key: 'physical_to_digital', label: '实体兑电子', count: 2, quantity: 100 },
    { key: 'digital_to_physical', label: '电子兑实体', count: 1, quantity: 40 },
    { key: 'member_card_exchange', label: '会员卡兑换', count: 3, quantity: 3000 }
  ],
  list: [{
    kind: 'funds',
    eventKind: 'payment',
    subtype: 'ticket_order',
    subtypeLabel: '门票',
    title: '单人溪降票',
    reference: 'TK001',
    amount: 16800,
    quantity: 0,
    staffName: '张浩',
    staffOpenid: 'staff-secret-openid',
    phoneTail: '8000',
    eventAt: '2026-07-28T02:00:00.000Z'
  }]
}

test('详情页继承汇总范围并默认加载资金流水', async (t) => {
  const { page, calls } = mountPage(t, {
    responders: { adminOperationsLedger: DETAIL_RESPONSE }
  })

  await page.onLoad({ kind: 'funds', from: String(FROM), to: String(TO) })

  assert.equal(calls.request[0].name, 'adminOperationsLedger')
  assert.deepEqual(calls.request[0].data, {
    action: 'details',
    kind: 'funds',
    from: FROM,
    to: TO,
    staffOpenid: '',
    subtype: '',
    keyword: '',
    page: 1,
    pageSize: 30
  })
  assert.equal(page.data.list[0].amountText, '168.00')
  assert.equal(page.data.rangeText, '2026-07-28')
})

test('兑换时间范围支持按开始和结束日期筛选并刷新汇总与明细', async (t) => {
  const { page, calls } = mountPage(t, {
    responders: { adminOperationsLedger: DETAIL_RESPONSE }
  })
  await page.onLoad({ kind: 'business_data', from: String(FROM), to: String(TO) })

  assert.equal(page.data.fromDate, '2026-07-28')
  assert.equal(page.data.toDate, '2026-07-28')

  await page.onFromDateChange({ detail: { value: '2026-07-26' } })
  await page.onToDateChange({ detail: { value: '2026-07-29' } })

  const last = calls.request[calls.request.length - 1].data
  assert.equal(last.from, Date.parse('2026-07-26T00:00:00+08:00'))
  assert.equal(last.to, Date.parse('2026-07-30T00:00:00+08:00'))
  assert.equal(last.kind, 'business_data')
  assert.equal(page.data.rangeText, '2026-07-26 至 2026-07-29')
})

test('三类顶层标签与员工、子类型、关键词筛选映射到服务端查询', async (t) => {
  const { page, calls } = mountPage(t, {
    responders: { adminOperationsLedger: (data) => Object.assign({}, DETAIL_RESPONSE, {
      kind: data.kind,
      list: [],
      total: 0
    }) }
  })
  await page.onLoad({ from: String(FROM), to: String(TO) })
  await page.onKindTap({ currentTarget: { dataset: { kind: 'business_data' } } })
  await page.onStaffChange({ detail: { value: 1 } })
  await page.onSubtypeChange({ detail: { value: 1 } })
  page.setData({ keyword: '8000' })
  await page.onSearchConfirm()

  const last = calls.request[calls.request.length - 1].data
  assert.equal(last.kind, 'business_data')
  assert.equal(last.staffOpenid, 'staff-secret-openid')
  assert.equal(last.subtype, 'ticket_order')
  assert.equal(last.keyword, '8000')
})

test('业务数据三张汇总卡可按类型下钻并保留统一明细页', async (t) => {
  const response = Object.assign({}, DETAIL_RESPONSE, {
    kind: 'business_data',
    subtypeOptions: [
      { key: 'physical_to_digital', label: '实体兑电子' },
      { key: 'digital_to_physical', label: '电子兑实体' },
      { key: 'member_card_exchange', label: '会员卡兑换' }
    ],
    list: [],
    total: 0
  })
  const { page, calls } = mountPage(t, {
    responders: { adminOperationsLedger: response }
  })

  await page.onLoad({ kind: 'business_data', from: String(FROM), to: String(TO) })
  assert.equal(page.data.businessBreakdown.length, 3)
  await page.onBusinessSummaryTap({
    currentTarget: { dataset: { subtype: 'member_card_exchange' } }
  })

  const last = calls.request[calls.request.length - 1].data
  assert.equal(last.kind, 'business_data')
  assert.equal(last.subtype, 'member_card_exchange')
})

test('旧资金与门票明细保留兼容展示，并可进入新的专属页面', async (t) => {
  const { page, calls } = mountPage(t, {
    responders: { adminOperationsLedger: DETAIL_RESPONSE }
  })

  await page.onLoad({ kind: 'funds', from: String(FROM), to: String(TO) })
  assert.equal(page.data.dedicatedEntry.title, '账单详情')
  page.goDedicatedPage()
  assert.match(calls.navigate[0], /pages\/staff\/bill-detail\/bill-detail/)
  assert.match(calls.navigate[0], new RegExp(`from=${FROM}`))
  assert.match(calls.navigate[0], new RegExp(`to=${TO}`))

  await page.onKindTap({
    currentTarget: { dataset: { kind: 'ticket_verifications' } }
  })
  assert.equal(page.data.dedicatedEntry.title, '核销数据')
  page.goDedicatedPage()
  assert.match(calls.navigate[1], /pages\/staff\/verification-data\/verification-data/)

  await page.onKindTap({
    currentTarget: { dataset: { kind: 'business_data' } }
  })
  assert.equal(page.data.dedicatedEntry, null)
  page.goDedicatedPage()
  assert.equal(calls.navigate.length, 2)
})

test('关键词输入防抖后刷新，清空筛选保留当前账目类别', async (t) => {
  const { page, calls } = mountPage(t, {
    responders: { adminOperationsLedger: DETAIL_RESPONSE }
  })
  await page.onLoad({ kind: 'ticket_verifications', from: String(FROM), to: String(TO) })
  const before = calls.request.length
  page.onKeywordInput({ detail: { value: 'TK0' } })
  page.onKeywordInput({ detail: { value: 'TK001' } })
  await new Promise((resolve) => setTimeout(resolve, 420))

  assert.equal(calls.request.length, before + 1, '连续输入只应触发一次查询')
  page.setData({ staffIndex: 1, subtypeIndex: 1, keyword: 'x' })
  await page.onResetFilters()
  assert.equal(page.data.kind, 'ticket_verifications')
  assert.equal(page.data.staffIndex, 0)
  assert.equal(page.data.subtypeIndex, 0)
  assert.equal(page.data.keyword, '')
})

test('重置筛选会恢复进入页面时的兑换时间范围', async (t) => {
  const { page, calls } = mountPage(t, {
    responders: { adminOperationsLedger: DETAIL_RESPONSE }
  })
  await page.onLoad({ kind: 'business_data', from: String(FROM), to: String(TO) })
  await page.onFromDateChange({ detail: { value: '2026-07-26' } })
  await page.onResetFilters()

  const last = calls.request[calls.request.length - 1].data
  assert.equal(last.from, FROM)
  assert.equal(last.to, TO)
  assert.equal(page.data.fromDate, '2026-07-28')
  assert.equal(page.data.toDate, '2026-07-28')
})

test('滚动到底继续加载并去重，查询中不重复翻页', async (t) => {
  const { page, calls } = mountPage(t, {
    responders: {
      adminOperationsLedger(data) {
        return Object.assign({}, DETAIL_RESPONSE, {
          page: data.page,
          total: 31,
          hasMore: data.page === 1,
          list: [Object.assign({}, DETAIL_RESPONSE.list[0], {
            reference: data.page === 1 ? 'TK001' : 'TK002'
          })]
        })
      }
    }
  })
  await page.onLoad({ from: String(FROM), to: String(TO) })
  const loadMore = page.onReachBottom()
  const duplicate = page.onReachBottom()
  await Promise.all([loadMore, duplicate])

  assert.deepEqual(page.data.list.map((item) => item.reference), ['TK001', 'TK002'])
  assert.equal(calls.request.filter((call) => call.data.page === 2).length, 1)
})

test('导出拉取当前筛选全部分页，CSV 不包含完整手机号或 openid', async (t) => {
  const { page, calls } = mountPage(t, {
    responders: {
      adminOperationsLedger(data) {
        return Object.assign({}, DETAIL_RESPONSE, {
          page: data.page,
          pageSize: data.pageSize,
          total: 101,
          hasMore: data.page === 1,
          list: [Object.assign({}, DETAIL_RESPONSE.list[0], {
            reference: data.page === 1 ? 'TK001' : 'TK101'
          })]
        })
      }
    }
  })
  await page.onLoad({ from: String(FROM), to: String(TO) })
  await page.onExport()

  assert.equal(calls.request.some((call) => call.data.pageSize === 100), true)
  assert.equal(calls.clipboard.length, 1)
  assert.match(calls.clipboard[0], /小程序业务账/)
  assert.match(calls.clipboard[0], /TK101/)
  assert.match(calls.clipboard[0], /8000/)
  assert.doesNotMatch(calls.clipboard[0], /staff-secret-openid|13800138000/)
})

test('403、失败、空结果和截断状态均有独立反馈', async (t) => {
  const template = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/operation-details/operation-details.wxml'),
    'utf8'
  )
  assert.match(template, /denied/)
  assert.match(template, /sr-error-state/)
  assert.match(template, /sr-empty-state/)
  assert.match(template, /truncated/)
  assert.match(template, /loadingMore/)
  assert.doesNotMatch(template, /保留旧入口兼容/)
  assert.doesNotMatch(template, /新版专属视图/)
  assert.doesNotMatch(template, /goDedicatedPage/)
  assert.match(template, /businessBreakdown/)
  assert.match(template, /onBusinessSummaryTap/)
  assert.match(template, /实体兑电子/)
  assert.match(template, /电子兑实体/)
  assert.match(template, /会员卡兑换/)
  assert.match(template, /兑换时间范围/)
  assert.match(template, /mode="date"/)
  assert.match(template, /onFromDateChange/)
  assert.match(template, /onToDateChange/)
  assert.ok(
    template.indexOf('兑换时间范围') < template.indexOf('三类业务汇总'),
    '日期范围决定汇总，时间筛选应位于三类业务汇总之前'
  )
  assert.doesNotMatch(template, />资金流水</)
  assert.doesNotMatch(template, />门票核销</)
})

test('详情页面只使用 Design Token 并适配底部安全区', () => {
  const style = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/operation-details/operation-details.wxss'),
    'utf8'
  )
  assert.match(style, /var\(--sr-/)
  assert.match(style, /env\(safe-area-inset-bottom\)/)
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i)
})

test('业务明细页面已注册', () => {
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))
  assert.ok(app.pages.includes('pages/staff/operation-details/operation-details'))
})
