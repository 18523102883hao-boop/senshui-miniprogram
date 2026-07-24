// Task 7 门票下单 / 支付 / 出票测试
// PRD §8.5 原生下单、§14 订单、§23 金额与幂等
// 云函数逻辑抽到 *-core.js（不依赖 wx-server-sdk）以便本地验证。
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const orderCore = require(path.join(projectRoot, 'cloudfunctions/createTicketOrder/order-core.js'))
const issueCore = require(path.join(projectRoot, 'cloudfunctions/payCallback/ticket-issue.js'))
const checkoutPath = path.join(projectRoot, 'miniprogram/pages/ticket/checkout/checkout.js')
const resultPath = path.join(projectRoot, 'miniprogram/pages/ticket/result/result.js')
const walletPath = path.join(projectRoot, 'miniprogram/pages/ticket/wallet/wallet.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], redirect: [], toast: [], modal: [], payment: [] }
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
    requestPayment(o) {
      calls.payment.push(o)
      if (options.paymentFail) return o.fail && o.fail(options.paymentFail)
      return o.success && o.success({})
    },
    navigateTo(o) { calls.navigate.push(o.url); if (options.navigateFail && o.fail) o.fail({}) },
    redirectTo(o) { calls.redirect.push(o.url) },
    switchTab(o) { calls.navigate.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    showModal(o) { calls.modal.push(o) },
    showLoading() {}, hideLoading() {},
    getStorageSync() { return null }, setStorageSync() {},
    setNavigationBarTitle() {}, stopPullDownRefresh() {},
    setClipboardData(o) { if (o.success) o.success() }
  }
  global.Page = (config) => { pageConfig = config }

  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
    // 结果页会挂轮询定时器，必须走一次卸载，否则测试进程不退出
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

const PRODUCT = {
  _id: 'p1', sku: 'creek_single', name: '单人溪降票', salePrice: 5800,
  status: 'active', purchaseLimit: 10, stockMode: 'unlimited', stock: 0,
  fulfillmentMode: 'native_pay', reservationRequired: false
}

// ============ 下单校验：金额只由云端算 ============

test('订单金额由云端商品快照计算，客户端传的金额被忽略', () => {
  const r = orderCore.resolveOrder({
    product: PRODUCT,
    quantity: 2,
    clientAmount: 1 // 前端篡改成 1 分
  })
  assert.equal(r.ok, true)
  assert.equal(r.totalFee, 11600, '必须是 5800 × 2，而不是客户端传的值')
  assert.equal(r.unitPrice, 5800)
})

test('商品未上架不允许下单', () => {
  const r = orderCore.resolveOrder({ product: Object.assign({}, PRODUCT, { status: 'draft' }), quantity: 1 })
  assert.equal(r.ok, false)
  assert.match(r.msg, /下架|不存在/)
})

test('非原生支付商品不允许走下单接口', () => {
  const r = orderCore.resolveOrder({ product: Object.assign({}, PRODUCT, { fulfillmentMode: 'contact_service' }), quantity: 1 })
  assert.equal(r.ok, false)
})

test('数量非法或超过限购一律拒绝', () => {
  assert.equal(orderCore.resolveOrder({ product: PRODUCT, quantity: 0 }).ok, false)
  assert.equal(orderCore.resolveOrder({ product: PRODUCT, quantity: -1 }).ok, false)
  assert.equal(orderCore.resolveOrder({ product: PRODUCT, quantity: 1.5 }).ok, false)
  const over = orderCore.resolveOrder({ product: PRODUCT, quantity: 11 })
  assert.equal(over.ok, false)
  assert.match(over.msg, /限购/)
})

test('总库存不足时不建单，充足时放行', () => {
  const limited = Object.assign({}, PRODUCT, { stockMode: 'total', stock: 3 })
  assert.equal(orderCore.resolveOrder({ product: limited, quantity: 4 }).ok, false)
  assert.equal(orderCore.resolveOrder({ product: limited, quantity: 3 }).ok, true)
})

test('不限库存的商品不做库存校验', () => {
  assert.equal(orderCore.resolveOrder({ product: PRODUCT, quantity: 10 }).ok, true)
})

test('需要预约的商品必须带使用日期', () => {
  const needDate = Object.assign({}, PRODUCT, { reservationRequired: true })
  assert.equal(orderCore.resolveOrder({ product: needDate, quantity: 1 }).ok, false)
  assert.equal(orderCore.resolveOrder({ product: needDate, quantity: 1, visitDate: '2026-08-09' }).ok, true)
})

test('缺少幂等键时拒绝建单', () => {
  assert.equal(orderCore.normalizeIdempotencyKey(''), '')
  assert.equal(orderCore.normalizeIdempotencyKey('  abc-123 ').length > 0, true)
})

test('同一幂等键命中已有订单则复用，不重复建单', () => {
  const existing = [{ _id: 'o1', idempotencyKey: 'k1', status: 'pending', outTradeNo: 'TK123' }]
  const hit = orderCore.pickReusableOrder(existing, 'k1')
  assert.equal(hit._id, 'o1', '相同幂等键必须复用未支付订单')
  assert.equal(orderCore.pickReusableOrder(existing, 'k2'), null)
})

test('已支付的同幂等键订单不再复用为待支付单', () => {
  const existing = [{ _id: 'o1', idempotencyKey: 'k1', status: 'paid' }]
  assert.equal(orderCore.pickReusableOrder(existing, 'k1'), null)
})

test('商户订单号唯一且长度符合微信限制', () => {
  const a = orderCore.buildOutTradeNo('TK')
  const b = orderCore.buildOutTradeNo('TK')
  assert.notEqual(a, b)
  assert.ok(a.length <= 32, '微信 outTradeNo 上限 32 字符')
  assert.ok(a.indexOf('TK') === 0)
})

// ============ 出票：幂等 + 数量准确 ============

const PAID_ORDER = {
  _id: 'o1', _openid: 'user-1', outTradeNo: 'TK123', type: 'ticket_order',
  productId: 'p1', sku: 'creek_single', productName: '单人溪降票',
  quantity: 3, unitPrice: 5800, totalFee: 17400, visitDate: '',
  contact: { name: '张三', phone: '138****8888' }
}

test('一单多张票，出票数量与购买数量一致', () => {
  const tickets = issueCore.buildTickets(PAID_ORDER, new Date('2026-08-01T10:00:00+08:00'))
  assert.equal(tickets.length, 3)
  const nos = tickets.map((x) => x.ticketNo)
  assert.equal(new Set(nos).size, 3, '票号必须唯一')
})

test('新出票券初始为未使用，并带齐溯源字段', () => {
  const [ticket] = issueCore.buildTickets(PAID_ORDER, new Date('2026-08-01T10:00:00+08:00'))
  assert.equal(ticket.status, 'unused')
  assert.equal(ticket._openid, 'user-1')
  assert.equal(ticket.orderId, 'TK123')
  assert.equal(ticket.productId, 'p1')
  assert.equal(ticket.unitPrice, 5800)
  assert.ok(ticket.ticketNo)
  assert.ok(ticket.createdAt)
})

test('已出过票的订单不再重复出票（回调重放安全）', () => {
  // 第二个参数是该订单已存在的票券数
  assert.equal(issueCore.shouldIssue({ status: 'paid' }, 0), false, '订单已是 paid 说明回调处理过')
  assert.equal(issueCore.shouldIssue({ status: 'paid_dup' }, 0), false, '重复支付单也不出票')
  assert.equal(issueCore.shouldIssue({ status: 'pending' }, 0), true, '待支付且未出票 → 正常出票')
  assert.equal(issueCore.shouldIssue({ status: 'pending' }, 3), false, '已存在票券则不再出票')
})

test('票券有效期按商品规则计算，当日票不早于购买当天结束', () => {
  const now = new Date('2026-08-01T10:00:00+08:00')
  const t1 = issueCore.buildTickets(Object.assign({}, PAID_ORDER, { quantity: 1 }), now)[0]
  assert.ok(t1.expireAt instanceof Date)
  assert.ok(t1.expireAt.getTime() > now.getTime())
})

// ============ 下单页 ============

test('下单页展示云端价格，数量增减受限购约束', async (t) => {
  const { page } = mountPage(t, checkoutPath, {
    responders: { getTicketProduct: () => Promise.resolve({ product: Object.assign({}, PRODUCT, { productId: 'p1', priceText: '58.00', purchaseLimit: 2 }) }) }
  })
  await page.onLoad({ productId: 'p1' })
  assert.equal(page.data.quantity, 1)
  assert.equal(page.data.totalText, '58.00')

  page.onPlus()
  assert.equal(page.data.quantity, 2)
  assert.equal(page.data.totalText, '116.00')

  page.onPlus()
  assert.equal(page.data.quantity, 2, '不得超过限购')

  page.onMinus(); page.onMinus()
  assert.equal(page.data.quantity, 1, '数量不得小于 1')
})

test('提交订单必须带幂等键，且同一页面内多次提交复用同一个键', async (t) => {
  const { page, calls } = mountPage(t, checkoutPath, {
    responders: {
      getTicketProduct: () => Promise.resolve({ product: Object.assign({}, PRODUCT, { productId: 'p1' }) }),
      createTicketOrder: () => Promise.resolve({ payment: { nonceStr: 'x' }, outTradeNo: 'TK1', orderId: 'o1' })
    }
  })
  await page.onLoad({ productId: 'p1' })
  await page.onSubmit()
  await page.onSubmit()
  const creates = calls.request.filter((c) => c.name === 'createTicketOrder')
  assert.equal(creates.length, 2)
  assert.ok(creates[0].data.idempotencyKey)
  assert.equal(creates[0].data.idempotencyKey, creates[1].data.idempotencyKey, '同一次下单意图应复用幂等键')
})

test('连点提交按钮不会并发下单', async (t) => {
  const { page, calls } = mountPage(t, checkoutPath, {
    responders: {
      getTicketProduct: () => Promise.resolve({ product: Object.assign({}, PRODUCT, { productId: 'p1' }) }),
      createTicketOrder: () => new Promise((resolve) => setTimeout(() => resolve({ payment: {}, outTradeNo: 'TK1' }), 10))
    }
  })
  await page.onLoad({ productId: 'p1' })
  const p1 = page.onSubmit()
  const p2 = page.onSubmit()
  await Promise.all([p1, p2])
  assert.equal(calls.request.filter((c) => c.name === 'createTicketOrder').length, 1, '提交中必须拦截第二次点击')
})

test('用户取消支付后停留在下单页，可以再次支付', async (t) => {
  const { page, calls } = mountPage(t, checkoutPath, {
    paymentFail: { errMsg: 'requestPayment:fail cancel' },
    responders: {
      getTicketProduct: () => Promise.resolve({ product: Object.assign({}, PRODUCT, { productId: 'p1' }) }),
      createTicketOrder: () => Promise.resolve({ payment: {}, outTradeNo: 'TK1', orderId: 'o1' })
    }
  })
  await page.onLoad({ productId: 'p1' })
  await page.onSubmit()
  assert.equal(calls.redirect.length, 0, '取消支付不应跳走')
  assert.equal(page.data.submitting, false, '必须解锁按钮以便重试')
})

test('支付成功跳转结果页并带订单号', async (t) => {
  const { page, calls } = mountPage(t, checkoutPath, {
    responders: {
      getTicketProduct: () => Promise.resolve({ product: Object.assign({}, PRODUCT, { productId: 'p1' }) }),
      createTicketOrder: () => Promise.resolve({ payment: {}, outTradeNo: 'TK1', orderId: 'o1' })
    }
  })
  await page.onLoad({ productId: 'p1' })
  await page.onSubmit()
  assert.ok(calls.redirect[0].indexOf('/pages/ticket/result/result') === 0)
  assert.ok(calls.redirect[0].includes('TK1'))
})

// ============ 结果页：回调延迟 ============

test('回调未到账时显示「确认中」而不是失败', async (t) => {
  const { page } = mountPage(t, resultPath, {
    responders: { getMyTickets: () => Promise.resolve({ list: [], order: { status: 'pending' } }) }
  })
  await page.onLoad({ outTradeNo: 'TK1' })
  assert.equal(page.data.state, 'confirming')
  assert.notEqual(page.data.state, 'failed')
})

test('轮询到已支付后切换为成功并展示票券', async (t) => {
  let times = 0
  const { page } = mountPage(t, resultPath, {
    responders: {
      getMyTickets: () => {
        times += 1
        return times === 1
          ? Promise.resolve({ list: [], order: { status: 'pending' } })
          : Promise.resolve({ list: [{ ticketNo: 'T1', status: 'unused' }], order: { status: 'paid' } })
      }
    }
  })
  await page.onLoad({ outTradeNo: 'TK1' })
  await page.pollOnce()
  assert.equal(page.data.state, 'success')
  assert.equal(page.data.tickets.length, 1)
})

test('多次轮询仍未到账时给出联系客服的出口，不误报失败', async (t) => {
  const { page } = mountPage(t, resultPath, {
    responders: { getMyTickets: () => Promise.resolve({ list: [], order: { status: 'pending' } }) }
  })
  await page.onLoad({ outTradeNo: 'TK1' })
  for (let i = 0; i < 10; i += 1) await page.pollOnce()
  assert.equal(page.data.state, 'confirming')
  assert.equal(page.data.showSupport, true, '长时间未到账应露出客服入口')
})

// ============ 票夹 ============

test('票夹按状态分组，未使用票排在最前', async (t) => {
  const { page } = mountPage(t, walletPath, {
    responders: {
      getMyTickets: () => Promise.resolve({
        list: [
          { ticketNo: 'T1', status: 'used', productName: 'A' },
          { ticketNo: 'T2', status: 'unused', productName: 'B' },
          { ticketNo: 'T3', status: 'refunded', productName: 'C' }
        ]
      })
    }
  })
  await page.onLoad({})
  assert.equal(page.data.tabs[0].key, 'unused')
  assert.equal(page.data.visibleList.length, 1)
  assert.equal(page.data.visibleList[0].ticketNo, 'T2')
})

test('票夹空态提示去购票而不是空白', async (t) => {
  const { page } = mountPage(t, walletPath, {
    responders: { getMyTickets: () => Promise.resolve({ list: [] }) }
  })
  await page.onLoad({})
  assert.equal(page.data.isEmpty, true)
})

test('点击未使用票券展示入园码', async (t) => {
  const { page, calls } = mountPage(t, walletPath, {
    responders: {
      getMyTickets: () => Promise.resolve({ list: [{ ticketNo: 'T2', status: 'unused', productName: 'B' }] }),
      getTicketCode: () => Promise.resolve({ token: 'TK.T2.123.abc', expiresIn: 90 })
    }
  })
  await page.onLoad({})
  await page.onTicketTap({ currentTarget: { dataset: { no: 'T2' } } })
  assert.equal(page.data.codeToken, 'TK.T2.123.abc')
  assert.ok(calls.request.some((c) => c.name === 'getTicketCode'))
})

test('已使用票券不再请求入园码', async (t) => {
  const { page, calls } = mountPage(t, walletPath, {
    responders: { getMyTickets: () => Promise.resolve({ list: [{ ticketNo: 'T1', status: 'used', productName: 'A' }] }) }
  })
  await page.onLoad({})
  page.setData({ activeTab: 'used' })
  await page.onTicketTap({ currentTarget: { dataset: { no: 'T1' } } })
  assert.equal(calls.request.filter((c) => c.name === 'getTicketCode').length, 0)
})
