// 订单中心整合（原 Task 13 · PRD §14.4）
// 三类订单（会员卡 / 补差价 / 门票）统一展示模型，底层差异由服务层适配
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const core = require(path.join(projectRoot, 'cloudfunctions/getMyOrders/order-core.js'))
const orderPath = path.join(projectRoot, 'miniprogram/pages/order/order.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(v) { return JSON.parse(JSON.stringify(v)) }

function mountPage(t, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], toast: [] }
  let pageConfig
  const stub = (p, e) => { originals[p] = require.cache[p]; require.cache[p] = { id: p, filename: p, loaded: true, exports: e } }
  const req = {
    call(name, data) {
      calls.request.push({ name, data })
      const r = options.responders && options.responders[name]
      if (typeof r === 'function') return r(data, calls.request.filter((c) => c.name === name).length)
      if (r) return Promise.resolve(r)
      return Promise.reject(new Error('no responder'))
    }
  }
  req.callWithLoading = (n, d) => req.call(n, d)
  stub(requestPath, req)
  stub(hapticsPath, { haptic() {} })
  global.wx = {
    navigateTo(o) { calls.navigate.push(o.url); if (options.navigateFail && o.fail) o.fail({}) },
    switchTab(o) { calls.navigate.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    stopPullDownRefresh() {}, setNavigationBarTitle() {}
  }
  global.Page = (c) => { pageConfig = c }
  delete require.cache[orderPath]
  require(orderPath)
  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) { Object.assign(this.data, patch) }
  })
  t.after(() => {
    delete require.cache[orderPath]
    Object.keys(originals).forEach((p) => { if (originals[p]) require.cache[p] = originals[p]; else delete require.cache[p] })
    global.Page = originalPage
    global.wx = originalWx
  })
  return { page, calls }
}

// ============ 统一展示模型 ============

test('会员卡订单适配为统一模型', () => {
  const o = core.toDisplayOrder({
    _id: 'o1', type: 'member_card', outTradeNo: 'M001', amount: 990,
    status: 'paid', paidAt: new Date('2026-07-20'), createdAt: new Date('2026-07-20')
  })
  assert.equal(o.typeText, '森水会员卡')
  assert.equal(o.title, '森水会员卡')
  assert.equal(o.amountText, '9.90')
  assert.equal(o.statusText, '已完成')
})

test('补差价订单展示收款员工，便于对账', () => {
  const o = core.toDisplayOrder({
    _id: 'o2', type: 'ticket_upgrade', outTradeNo: 'U001', amount: 2000,
    itemLabel: '单溪降→营地', staffName: '小李', status: 'paid'
  })
  assert.equal(o.typeText, '补差价升级')
  assert.equal(o.title, '单溪降→营地')
  assert.equal(o.amountText, '20.00')
  assert.match(o.subtitle, /小李/)
})

test('门票订单展示票种与数量', () => {
  const o = core.toDisplayOrder({
    _id: 'o3', type: 'ticket_order', outTradeNo: 'TK001', totalFee: 11600,
    productName: '单人溪降票', quantity: 2, status: 'paid'
  })
  assert.equal(o.typeText, '门票')
  assert.equal(o.title, '单人溪降票')
  assert.equal(o.amountText, '116.00')
  assert.match(o.subtitle, /2/)
})

test('金额优先取 totalFee，回落 amount（两套字段历史并存）', () => {
  assert.equal(core.toDisplayOrder({ type: 'ticket_order', totalFee: 5800 }).amountText, '58.00')
  assert.equal(core.toDisplayOrder({ type: 'member_card', amount: 990 }).amountText, '9.90')
  assert.equal(core.toDisplayOrder({ type: 'member_card' }).amountText, '0.00', '缺字段不得渲染 NaN')
})

test('未知订单类型安全降级，不显示空白条目', () => {
  const o = core.toDisplayOrder({ type: 'mystery_type', outTradeNo: 'X1', amount: 100 })
  assert.ok(o.typeText, '未知类型也要有可读名称')
  assert.ok(o.title)
})

test('订单状态映射覆盖全部取值', () => {
  const cases = {
    pending: '待支付', paid: '已完成', paid_dup: '已完成',
    refunding: '退款中', refunded: '已退款', cancelled: '已取消', expired: '已关闭'
  }
  for (const s of Object.keys(cases)) {
    assert.equal(core.toDisplayOrder({ type: 'member_card', status: s }).statusText, cases[s], s + ' 映射错误')
  }
})

// ============ 分组与筛选 ============

test('按 Tab 筛选：全部 / 待支付 / 已完成 / 退款', () => {
  const list = [
    { type: 'member_card', status: 'pending' },
    { type: 'ticket_order', status: 'paid' },
    { type: 'ticket_upgrade', status: 'refunded' }
  ]
  assert.equal(core.filterByTab(list, '').length, 3)
  assert.equal(core.filterByTab(list, 'pending').length, 1)
  assert.equal(core.filterByTab(list, 'paid').length, 1)
  assert.equal(core.filterByTab(list, 'refund').length, 1)
})

test('已支付的重复单（paid_dup）归入已完成，不吓到用户', () => {
  const list = [{ type: 'member_card', status: 'paid_dup' }]
  assert.equal(core.filterByTab(list, 'paid').length, 1)
})

test('订单按时间倒序，最新在前', () => {
  const sorted = core.sortOrders([
    { outTradeNo: 'a', createdAt: new Date('2026-07-01') },
    { outTradeNo: 'b', createdAt: new Date('2026-07-20') },
    { outTradeNo: 'c', createdAt: new Date('2026-07-10') }
  ])
  assert.deepEqual(sorted.map((o) => o.outTradeNo), ['b', 'c', 'a'])
})

test('待支付订单可继续支付，已完成的不给支付入口', () => {
  assert.equal(core.canPay({ status: 'pending', type: 'ticket_order' }), true)
  assert.equal(core.canPay({ status: 'paid', type: 'ticket_order' }), false)
  assert.equal(core.canPay({ status: 'refunded', type: 'ticket_order' }), false)
})

test('只有已支付的门票订单能申请退款', () => {
  assert.equal(core.canRefund({ status: 'paid', type: 'ticket_order' }), true)
  assert.equal(core.canRefund({ status: 'pending', type: 'ticket_order' }), false)
  assert.equal(core.canRefund({ status: 'paid', type: 'ticket_upgrade' }), false, '补差价现场业务不走线上退款')
})

// ============ 订单页 ============

const ORDERS = [
  { orderId: 'o1', type: 'member_card', outTradeNo: 'M001', title: '森水会员卡', typeText: '森水会员卡',
    amountText: '9.90', status: 'paid', statusText: '已完成', subtitle: '' },
  { orderId: 'o2', type: 'ticket_order', outTradeNo: 'TK001', title: '单人溪降票', typeText: '门票',
    amountText: '116.00', status: 'paid', statusText: '已完成', subtitle: '2 张', canRefund: true }
]

test('订单页加载并展示统一列表', async (t) => {
  const { page } = mountPage(t, { responders: { getMyOrders: () => Promise.resolve({ list: ORDERS }) } })
  await page.onShow()
  assert.equal(page.data.list.length, 2)
  assert.equal(page.data.isEmpty, false)
})

test('切换 Tab 重新拉取对应订单', async (t) => {
  const { page, calls } = mountPage(t, {
    responders: { getMyOrders: (d) => Promise.resolve({ list: d.tab === 'pending' ? [] : ORDERS }) }
  })
  await page.onShow()
  await page.onTabTap({ currentTarget: { dataset: { key: 'pending' } } })
  assert.equal(page.data.tab, 'pending')
  assert.equal(page.data.isEmpty, true)
})

test('无订单显示空态并引导购票，不是白屏', async (t) => {
  const { page, calls } = mountPage(t, { responders: { getMyOrders: () => Promise.resolve({ list: [] }) } })
  await page.onShow()
  assert.equal(page.data.isEmpty, true)
  page.goBuy()
  assert.ok(calls.navigate.length > 0, '空态要能引导去购票')
})

test('加载失败显示错误态且可重试', async (t) => {
  let n = 0
  const { page } = mountPage(t, {
    responders: { getMyOrders: () => { n += 1; return n === 1 ? Promise.reject(new Error('x')) : Promise.resolve({ list: ORDERS }) } }
  })
  await page.onShow()
  assert.equal(page.data.hasError, true)
  await page.onRetry()
  assert.equal(page.data.hasError, false)
  assert.equal(page.data.list.length, 2)
})

test('门票订单可跳转退款页', async (t) => {
  const { page, calls } = mountPage(t, { responders: { getMyOrders: () => Promise.resolve({ list: ORDERS }) } })
  await page.onShow()
  page.onRefund({ currentTarget: { dataset: { no: 'TK001' } } })
  assert.ok(calls.navigate.some((u) => u.includes('refund') && u.includes('TK001')))
})
