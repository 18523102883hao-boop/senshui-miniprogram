// 待支付订单继续支付（2026-07-26）
//
// 背景：订单中心的「继续支付」原本无论订单类型都跳门票支付结果页，
// 会员卡订单跳过去后轮询 getMyTickets 永远查不到票，卡死在「支付确认中」。
// 根子上还有一个错：待支付订单从没付过钱，轮询本就不会成功，该做的是重新调起支付。
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const orderPagePath = path.join(projectRoot, 'miniprogram/pages/order/order.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function mountOrderPage(t, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], toast: [], payment: [] }
  let pageConfig

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }

  stub(requestPath, {
    call(name, data) {
      calls.request.push({ name, data })
      const responder = options.responders && options.responders[name]
      if (typeof responder === 'function') return responder(data)
      if (responder) return Promise.resolve(responder)
      return Promise.reject(new Error('no responder: ' + name))
    },
    callWithLoading(name, data) { return this.call(name, data) }
  })
  stub(hapticsPath, { haptic() {} })

  global.wx = {
    requestPayment(opts) {
      calls.payment.push(opts)
      if (options.paymentFail) {
        if (opts.fail) opts.fail(options.paymentFail)
        return
      }
      if (opts.success) opts.success({})
    },
    navigateTo(opts) {
      calls.navigate.push(opts.url)
      if (options.navigateFail && opts.fail) opts.fail({})
    },
    showToast(opts) { calls.toast.push(opts) },
    stopPullDownRefresh() {},
    switchTab(opts) { calls.navigate.push(opts.url) }
  }
  global.Page = (config) => { pageConfig = config }

  delete require.cache[orderPagePath]
  require(orderPagePath)

  const page = Object.assign({}, pageConfig)
  page.data = JSON.parse(JSON.stringify(pageConfig.data))
  page.setData = function (patch) {
    Object.keys(patch).forEach((k) => { page.data[k] = patch[k] })
  }

  t.after(() => {
    global.Page = originalPage
    global.wx = originalWx
    Object.keys(originals).forEach((p) => {
      if (originals[p]) require.cache[p] = originals[p]
      else delete require.cache[p]
    })
    delete require.cache[orderPagePath]
  })

  return { page, calls }
}

const PAYMENT = { timeStamp: '1', nonceStr: 'n', package: 'prepay_id=x', signType: 'RSA', paySign: 's' }

test('会员卡待支付：重新调起微信支付，不跳门票结果页', async (t) => {
  const { page, calls } = mountOrderPage(t, {
    responders: {
      repayOrder: { payment: PAYMENT, type: 'member_card' },
      getMyOrders: { list: [] }
    }
  })

  await page.onPay({ currentTarget: { dataset: { no: 'MMRXLRP4Z6QLLOX', type: 'member_card' } } })

  assert.equal(calls.request[0].name, 'repayOrder', '应调 repayOrder 重新下单')
  assert.equal(calls.request[0].data.outTradeNo, 'MMRXLRP4Z6QLLOX')
  assert.equal(calls.payment.length, 1, '应调起一次微信支付')
  assert.ok(calls.navigate.every((u) => u.indexOf('/pages/ticket/result/result') === -1),
    '会员卡订单不得跳门票支付结果页（那页轮询的是 getMyTickets，永远查不到票）')
})

test('门票待支付：支付成功后才进结果页等出票', async (t) => {
  const { page, calls } = mountOrderPage(t, {
    responders: { repayOrder: { payment: PAYMENT, type: 'ticket_order' } }
  })

  await page.onPay({ currentTarget: { dataset: { no: 'TK123', type: 'ticket_order' } } })

  assert.equal(calls.payment.length, 1)
  assert.ok(/^\/pages\/ticket\/result\/result\?outTradeNo=TK123/.test(calls.navigate[0]),
    '门票支付后需要等出票，应进结果页轮询')
})

test('用户取消支付：静默处理，不弹失败提示', async (t) => {
  const { page, calls } = mountOrderPage(t, {
    responders: { repayOrder: { payment: PAYMENT, type: 'member_card' } },
    paymentFail: { errMsg: 'requestPayment:fail cancel' }
  })

  await page.onPay({ currentTarget: { dataset: { no: 'X1', type: 'member_card' } } })

  assert.equal(calls.toast.length, 0, '主动取消不是错误，不该弹提示')
  assert.equal(page.data.paying, false, '取消后必须解除按钮忙碌态')
})

test('订单状态已变（已支付/已关闭）时刷新列表，按钮不停在「继续支付」', async (t) => {
  const err = new Error('该订单已支付')
  err.code = 409
  const { page, calls } = mountOrderPage(t, {
    responders: {
      repayOrder: () => Promise.reject(err),
      getMyOrders: { list: [] }
    }
  })

  await page.onPay({ currentTarget: { dataset: { no: 'X2', type: 'member_card' } } })

  assert.ok(calls.toast.length >= 1, '应告知用户订单状态')
  assert.ok(calls.request.some((c) => c.name === 'getMyOrders'), '409 后应重新拉取订单列表')
})

test('支付调起中连点不重复拉起支付面板', async (t) => {
  let resolveRepay
  const { page, calls } = mountOrderPage(t, {
    responders: { repayOrder: () => new Promise((r) => { resolveRepay = r }) }
  })

  const first = page.onPay({ currentTarget: { dataset: { no: 'X3', type: 'member_card' } } })
  await page.onPay({ currentTarget: { dataset: { no: 'X3', type: 'member_card' } } })
  assert.equal(calls.request.length, 1, '第二次点击应被忙碌态拦下')

  resolveRepay({ payment: PAYMENT, type: 'member_card' })
  await first
})
