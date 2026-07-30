const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/order-detail/order-detail.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const utilPath = path.join(projectRoot, 'miniprogram/utils/util.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, responder) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [] }
  let config

  originals[requestPath] = require.cache[requestPath]
  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      call(name, data) {
        calls.request.push({ name, data })
        return responder(name, data)
      }
    }
  }
  delete require.cache[utilPath]
  global.wx = { stopPullDownRefresh() {} }
  global.Page = (pageConfig) => { config = pageConfig }
  delete require.cache[pagePath]
  require(pagePath)
  const page = Object.assign({}, config, {
    data: clone(config.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
    delete require.cache[pagePath]
    if (originals[requestPath]) require.cache[requestPath] = originals[requestPath]
    else delete require.cache[requestPath]
    global.Page = originalPage
    global.wx = originalWx
  })
  return { page, calls }
}

const DETAIL = {
  outTradeNo: 'TK-001',
  type: 'ticket_order',
  title: '双人溪降票',
  amount: 12800,
  status: 'paid',
  quantity: 1,
  admissionCountPerTicket: 2,
  admittedPeopleCount: 2,
  visitDate: '2026-07-28',
  contact: { name: '张**', phoneTail: '8000' },
  staff: { name: '李敏', staffNo: 'A001' },
  createdAt: '2026-07-28T01:00:00.000Z',
  paidAt: '2026-07-28T02:00:00.000Z',
  refund: {
    status: 'pending',
    refundFee: 6400,
    reason: '行程变化',
    createdAt: '2026-07-28T04:00:00.000Z'
  },
  invoice: {
    status: 'reviewing',
    statusText: '商家审核中',
    invoiceAmount: 12800,
    fileName: '',
    submittedAt: '2026-07-28T03:00:00.000Z'
  },
  tickets: [{
    ticketNo: 'T-001',
    productName: '双人溪降票',
    status: 'used',
    admissionCount: 2,
    admissionCountUnknown: false,
    usedAt: '2026-07-28T05:00:00.000Z'
  }],
  history: [
    { type: 'order_created', label: '订单创建', at: '2026-07-28T01:00:00.000Z' },
    { type: 'payment_received', label: '支付成功', at: '2026-07-28T02:00:00.000Z' },
    { type: 'ticket_verified', label: '门票核销', at: '2026-07-28T05:00:00.000Z', note: 'T-001 · 2 人' }
  ]
}

test('管理员订单详情按订单号加载并展示订单、金额、数量和人数', async (t) => {
  const { page, calls } = mountPage(t, (name, data) => {
    assert.equal(name, 'adminOperationsLedger')
    assert.deepEqual(data, { action: 'orderDetail', orderNo: 'TK-001' })
    return Promise.resolve(DETAIL)
  })
  await page.onLoad({ orderNo: 'TK-001' })

  assert.equal(calls.request.length, 1)
  assert.equal(page.data.detail.amountText, '128.00')
  assert.equal(page.data.detail.quantityText, '1 张')
  assert.equal(page.data.detail.peopleText, '2 人')
  assert.equal(page.data.detail.contactText, '张** · 手机尾号 8000')
})

test('退款、票券核销、开票与只读操作历史完整显示', async (t) => {
  const { page } = mountPage(t, () => Promise.resolve(DETAIL))
  await page.onLoad({ orderNo: 'TK-001' })

  assert.equal(page.data.detail.refund.refundFeeText, '64.00')
  assert.equal(page.data.detail.refund.statusText, '待处理')
  assert.equal(page.data.detail.invoice.statusText, '商家审核中')
  assert.equal(page.data.detail.tickets[0].statusText, '已核销')
  assert.equal(page.data.detail.tickets[0].countText, '1 张 / 2 人')
  assert.equal(page.data.detail.history.length, 3)
})

test('历史字段缺失时稳定显示未记录，且页面不提供事实修改操作', async (t) => {
  const { page } = mountPage(t, () => Promise.resolve({
    outTradeNo: 'OLD-001',
    title: '历史订单',
    contact: {},
    staff: {},
    tickets: [],
    history: []
  }))
  await page.onLoad({ orderNo: 'OLD-001' })
  assert.equal(page.data.detail.contactText, '未记录')
  assert.equal(page.data.detail.paidAtText, '未记录')

  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/order-detail/order-detail.wxml'),
    'utf8'
  )
  assert.doesNotMatch(wxml, /确认退款|撤销核销|修改支付|完成开票/)
  assert.match(wxml, /只读事实页/)
})

test('无权限、错误、加载与空票券状态齐全', async (t) => {
  const denied = mountPage(t, () => {
    const error = new Error('需要管理员权限')
    error.code = 403
    return Promise.reject(error)
  })
  await denied.page.onLoad({ orderNo: 'TK-001' })
  assert.equal(denied.page.data.denied, true)

  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/order-detail/order-detail.wxml'),
    'utf8'
  )
  assert.match(wxml, /sr-skeleton/)
  assert.match(wxml, /sr-error-state/)
  assert.match(wxml, /sr-empty-state/)
})

test('订单详情模板、脱敏说明、Design Token 与页面注册完整', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/order-detail/order-detail.wxml'),
    'utf8'
  )
  const wxss = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/order-detail/order-detail.wxss'),
    'utf8'
  )
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))

  for (const label of ['支付信息', '退款信息', '票券与核销', '开票信息', '操作历史']) {
    assert.match(wxml, new RegExp(label))
  }
  assert.match(wxml, /手机号仅显示后四位/)
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
  assert.match(wxss, /safe-area-inset-bottom/)
  assert.match(wxss, /var\(--sr-radius/)
  assert.ok(app.pages.includes('pages/staff/order-detail/order-detail'))
})
