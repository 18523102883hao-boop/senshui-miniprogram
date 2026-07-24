// Task 8 门票核销与退款测试
// PRD §8.6 票券状态、§8.7 员工检票、§8.5 退款、§16 员工端
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const verifyCore = require(path.join(projectRoot, 'cloudfunctions/verifyTicket/verify-core.js'))
const refundCore = require(path.join(projectRoot, 'cloudfunctions/requestTicketRefund/refund-core.js'))
const verifyPagePath = path.join(projectRoot, 'miniprogram/pages/staff/ticket-verify/ticket-verify.js')
const refundPagePath = path.join(projectRoot, 'miniprogram/pages/refund/detail/detail.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], toast: [], modal: [], scan: [] }
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
    scanCode(o) {
      calls.scan.push(o)
      if (options.scanResult) return o.success && o.success({ result: options.scanResult })
      return o.fail && o.fail({ errMsg: 'scanCode:fail cancel' })
    },
    navigateTo(o) { calls.navigate.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    showModal(o) {
      calls.modal.push(o)
      if (o.success) o.success({ confirm: options.modalConfirm !== false })
    },
    showLoading() {}, hideLoading() {},
    getStorageSync() { return null }, setStorageSync() {},
    setNavigationBarTitle() {}, stopPullDownRefresh() {}
  }
  global.Page = (config) => { pageConfig = config }

  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
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

// ============ 核销：权限与状态 ============

test('非员工或未审批员工不得核销', () => {
  assert.equal(verifyCore.canVerify(null).ok, false)
  assert.equal(verifyCore.canVerify({ status: 'pending', role: 'front' }).ok, false)
  assert.equal(verifyCore.canVerify({ status: 'approved', role: 'bar' }).ok, false, '酒吧角色不负责检票')
  assert.equal(verifyCore.canVerify({ status: 'approved', role: 'front' }).ok, true)
  assert.equal(verifyCore.canVerify({ status: 'approved', role: 'creek' }).ok, true)
  assert.equal(verifyCore.canVerify({ status: 'approved', role: 'admin' }).ok, true)
})

test('只有未使用/已占用的票可核销', () => {
  assert.equal(verifyCore.canConsume({ status: 'unused' }).ok, true)
  assert.equal(verifyCore.canConsume({ status: 'reserved' }).ok, true)
  assert.equal(verifyCore.canConsume({ status: 'used' }).ok, false)
  assert.equal(verifyCore.canConsume({ status: 'expired' }).ok, false)
  assert.equal(verifyCore.canConsume({ status: 'void' }).ok, false)
})

test('退款中或已退款的票不可核销', () => {
  const pending = verifyCore.canConsume({ status: 'refund_pending' })
  assert.equal(pending.ok, false)
  assert.match(pending.msg, /退款/)
  assert.equal(verifyCore.canConsume({ status: 'refunded' }).ok, false)
})

test('重复扫同一张票被拦截并提示已使用时间', () => {
  const used = verifyCore.canConsume({ status: 'used', usedAt: '2026-08-01 10:30' })
  assert.equal(used.ok, false)
  assert.match(used.msg, /已核销|已使用/)
})

test('过期票不可核销', () => {
  const now = new Date('2026-08-02T10:00:00+08:00')
  const r = verifyCore.canConsume({ status: 'unused', expireAt: '2026-08-01T23:59:59+08:00' }, now)
  assert.equal(r.ok, false)
  assert.match(r.msg, /过期/)
})

test('入园码验签通过才解析出票号，篡改或过期一律拒绝', () => {
  const secret = 'test-secret'
  const token = verifyCore.signToken('T123', 1800000000, secret)
  const okAt = new Date(1800000000 * 1000 + 30 * 1000)
  assert.equal(verifyCore.resolveTicketNo(token, secret, okAt).ticketNo, 'T123')

  const tampered = token.replace('T123', 'T999')
  assert.ok(verifyCore.resolveTicketNo(tampered, secret, okAt).error, '篡改票号必须验签失败')

  const lateAt = new Date(1800000000 * 1000 + 200 * 1000)
  assert.ok(verifyCore.resolveTicketNo(token, secret, lateAt).error, '超过 TTL 必须过期')
})

test('员工手输票号也可核销（弱网兜底）', () => {
  const r = verifyCore.resolveTicketNo('T123', 'test-secret', new Date())
  assert.equal(r.ticketNo, 'T123')
})

test('核销留痕包含票号、员工与时间', () => {
  const record = verifyCore.buildVerification(
    { ticketNo: 'T1', productName: '单人溪降票', orderId: 'TK1', _openid: 'buyer' },
    { _openid: 'staff-1', name: '小李', role: 'creek' },
    new Date('2026-08-01T10:00:00+08:00')
  )
  assert.equal(record.ticketNo, 'T1')
  assert.equal(record.staffOpenid, 'staff-1')
  assert.equal(record.type, 'ticket')
  assert.ok(record.createdAt)
})

// ============ 退款分支 ============

const REFUNDABLE_TICKET = { ticketNo: 'T1', status: 'unused', unitPrice: 5800, orderId: 'TK1' }

test('已使用的票不能自动退款，转人工售后', () => {
  const r = refundCore.planRefund({
    tickets: [{ ticketNo: 'T1', status: 'used' }],
    order: { outTradeNo: 'TK1', totalFee: 5800, quantity: 1, status: 'paid' },
    payRefundEnabled: true
  })
  assert.equal(r.mode, 'manual')
  assert.match(r.msg, /已核销|已使用/)
})

test('未使用票可自动退款，金额按张数计算', () => {
  const r = refundCore.planRefund({
    tickets: [REFUNDABLE_TICKET, { ticketNo: 'T2', status: 'unused', unitPrice: 5800 }],
    order: { outTradeNo: 'TK1', totalFee: 17400, quantity: 3, status: 'paid' },
    payRefundEnabled: true
  })
  assert.equal(r.mode, 'auto')
  assert.equal(r.refundFee, 11600, '退两张 = 2 × 5800')
  assert.equal(r.totalFee, 17400)
})

test('部分核销的订单只退未使用部分', () => {
  const r = refundCore.planRefund({
    tickets: [{ ticketNo: 'T1', status: 'unused', unitPrice: 5800 }],
    order: { outTradeNo: 'TK1', totalFee: 17400, quantity: 3, status: 'paid' },
    partial: true,
    payRefundEnabled: true
  })
  assert.equal(r.mode, 'auto')
  assert.equal(r.refundFee, 5800)
})

test('未配置支付退款能力时创建人工售后单，绝不伪造退款成功', () => {
  const r = refundCore.planRefund({
    tickets: [REFUNDABLE_TICKET],
    order: { outTradeNo: 'TK1', totalFee: 5800, quantity: 1, status: 'paid' },
    payRefundEnabled: false
  })
  assert.equal(r.mode, 'manual')
  assert.match(r.msg, /人工|客服|审核/)
  assert.notEqual(r.mode, 'auto')
})

test('未支付或已退款订单不进入退款流程', () => {
  assert.equal(refundCore.planRefund({
    tickets: [REFUNDABLE_TICKET], order: { status: 'pending' }, payRefundEnabled: true
  }).mode, 'reject')
  assert.equal(refundCore.planRefund({
    tickets: [REFUNDABLE_TICKET], order: { status: 'refunded' }, payRefundEnabled: true
  }).mode, 'reject')
})

test('没有可退票券时明确拒绝', () => {
  const r = refundCore.planRefund({
    tickets: [], order: { outTradeNo: 'TK1', totalFee: 5800, status: 'paid' }, payRefundEnabled: true
  })
  assert.equal(r.mode, 'reject')
})

test('退款单号可重复生成且稳定，支持失败重试', () => {
  const a = refundCore.buildOutRefundNo('TK1', ['T1', 'T2'])
  const b = refundCore.buildOutRefundNo('TK1', ['T2', 'T1'])
  assert.equal(a, b, '同一组票券的退款单号必须稳定，重试才不会变成第二笔退款')
  assert.ok(a.length <= 64)
  assert.notEqual(a, refundCore.buildOutRefundNo('TK1', ['T1']))
})

// ============ 员工核销页 ============

test('无权限员工进入核销页看到提示而不是核销界面', async (t) => {
  const { page } = mountPage(t, verifyPagePath, {
    responders: { checkStaff: () => Promise.resolve({ role: null }) }
  })
  await page.onShow()
  assert.equal(page.data.allowed, false)
})

test('扫码后展示票券信息并可确认核销', async (t) => {
  const { page, calls } = mountPage(t, verifyPagePath, {
    scanResult: 'TK.T1.1800000000.abcdef',
    responders: {
      checkStaff: () => Promise.resolve({ role: 'creek', name: '小李' }),
      verifyTicket: (data) => Promise.resolve(
        data.confirm
          ? { verified: true, ticket: { ticketNo: 'T1', status: 'used', productName: '单人溪降票' } }
          : { verified: false, ticket: { ticketNo: 'T1', status: 'unused', productName: '单人溪降票' } }
      )
    }
  })
  await page.onShow()
  await page.onScan()
  assert.equal(page.data.ticket.ticketNo, 'T1')
  assert.equal(page.data.verified, false, '先预览再确认，避免误核销')

  await page.onConfirm()
  assert.equal(page.data.verified, true)
  assert.ok(calls.request.some((c) => c.name === 'verifyTicket' && c.data.confirm === true))
})

test('核销失败时展示原因，不清空当前票券信息', async (t) => {
  const { page } = mountPage(t, verifyPagePath, {
    scanResult: 'TK.T1.1800000000.abcdef',
    responders: {
      checkStaff: () => Promise.resolve({ role: 'creek', name: '小李' }),
      verifyTicket: () => Promise.reject(new Error('该票券已核销'))
    }
  })
  await page.onShow()
  await page.onScan()
  assert.equal(page.data.errorMsg, '该票券已核销')
})

test('支持手输票号核销', async (t) => {
  const { page, calls } = mountPage(t, verifyPagePath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'front', name: '小王' }),
      verifyTicket: () => Promise.resolve({ verified: false, ticket: { ticketNo: 'T9', status: 'unused' } })
    }
  })
  await page.onShow()
  page.onInput({ detail: { value: 'T9' } })
  await page.onManualQuery()
  assert.ok(calls.request.some((c) => c.name === 'verifyTicket' && c.data.ticketNo === 'T9'))
})

// ============ 退款页 ============

test('退款页展示可退票券与预计退款金额', async (t) => {
  const { page } = mountPage(t, refundPagePath, {
    responders: {
      getMyTickets: () => Promise.resolve({
        list: [
          { ticketNo: 'T1', status: 'unused', productName: 'A', unitPrice: 5800 },
          { ticketNo: 'T2', status: 'used', productName: 'A', unitPrice: 5800 }
        ],
        order: { outTradeNo: 'TK1', totalFee: 11600, status: 'paid' }
      })
    }
  })
  await page.onLoad({ outTradeNo: 'TK1' })
  assert.equal(page.data.refundable.length, 1, '只有未使用票可退')
  assert.equal(page.data.blocked.length, 1)
  assert.equal(page.data.refundText, '58.00')
})

test('无可退票券时提交按钮不可用', async (t) => {
  const { page } = mountPage(t, refundPagePath, {
    responders: {
      getMyTickets: () => Promise.resolve({
        list: [{ ticketNo: 'T2', status: 'used', productName: 'A', unitPrice: 5800 }],
        order: { outTradeNo: 'TK1', totalFee: 5800, status: 'paid' }
      })
    }
  })
  await page.onLoad({ outTradeNo: 'TK1' })
  assert.equal(page.data.canSubmit, false)
})

test('提交退款需二次确认，人工审核分支给出明确说明', async (t) => {
  const { page, calls } = mountPage(t, refundPagePath, {
    responders: {
      getMyTickets: () => Promise.resolve({
        list: [{ ticketNo: 'T1', status: 'unused', productName: 'A', unitPrice: 5800 }],
        order: { outTradeNo: 'TK1', totalFee: 5800, status: 'paid' }
      }),
      requestTicketRefund: () => Promise.resolve({ mode: 'manual', msg: '已提交人工审核' })
    }
  })
  await page.onLoad({ outTradeNo: 'TK1' })
  await page.onSubmit()
  assert.equal(calls.modal.length, 1, '退款必须二次确认')
  assert.equal(page.data.resultMode, 'manual')
  assert.ok(page.data.resultMsg)
})

test('退款接口失败时可重试，不会误报成功', async (t) => {
  let times = 0
  const { page } = mountPage(t, refundPagePath, {
    responders: {
      getMyTickets: () => Promise.resolve({
        list: [{ ticketNo: 'T1', status: 'unused', productName: 'A', unitPrice: 5800 }],
        order: { outTradeNo: 'TK1', totalFee: 5800, status: 'paid' }
      }),
      requestTicketRefund: () => {
        times += 1
        return times === 1 ? Promise.reject(new Error('网络异常')) : Promise.resolve({ mode: 'auto', refundFee: 5800 })
      }
    }
  })
  await page.onLoad({ outTradeNo: 'TK1' })
  await page.onSubmit()
  assert.equal(page.data.resultMode, '')
  assert.equal(page.data.submitting, false, '失败后必须解锁以便重试')

  await page.onSubmit()
  assert.equal(page.data.resultMode, 'auto')
})
