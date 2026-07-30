const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const memberHelperPath = path.join(projectRoot, 'cloudfunctions/refundMember/invoice-refund.js')
const ticketHelperPath = path.join(projectRoot, 'cloudfunctions/requestTicketRefund/invoice-refund.js')

function loadHelper(helperPath) {
  assert.equal(fs.existsSync(helperPath), true, helperPath + ' 应提供退款与开票联动规则')
  delete require.cache[helperPath]
  return require(helperPath)
}

test('已开票订单必须先联系工作人员处理红字发票', () => {
  for (const helperPath of [memberHelperPath, ticketHelperPath]) {
    const helper = loadHelper(helperPath)
    const result = helper.resolve({ status: 'issued' })
    assert.equal(result.ok, false)
    assert.equal(result.code, 409)
    assert.match(result.msg, /红字发票/)
  }
})

test('待审核和审核中申请随退款关闭，其他状态不阻塞', () => {
  for (const helperPath of [memberHelperPath, ticketHelperPath]) {
    const helper = loadHelper(helperPath)
    assert.equal(helper.resolve({ status: 'submitted' }).shouldCancel, true)
    assert.equal(helper.resolve({ status: 'reviewing' }).shouldCancel, true)
    assert.equal(helper.resolve({ status: 'rejected' }).shouldCancel, false)
    assert.equal(helper.resolve({ status: 'cancelled_refund' }).shouldCancel, false)
    assert.equal(helper.resolve(null).ok, true)
  }
})

test('退款关闭申请保留系统审计历史', () => {
  const now = new Date('2026-07-28T08:00:00.000Z')
  for (const helperPath of [memberHelperPath, ticketHelperPath]) {
    const helper = loadHelper(helperPath)
    const patch = helper.buildCancellationPatch({
      status: 'reviewing',
      history: [{ from: 'submitted', to: 'reviewing' }]
    }, now)
    assert.equal(patch.status, 'cancelled_refund')
    assert.equal(patch.history.length, 2)
    assert.equal(patch.history[1].from, 'reviewing')
    assert.equal(patch.history[1].to, 'cancelled_refund')
    assert.equal(patch.history[1].byType, 'system')
    assert.match(patch.history[1].note, /退款/)
  }
})

test('两个退款云函数都在实际退款前检查开票并在受理后关闭申请', () => {
  const memberSource = fs.readFileSync(path.join(projectRoot, 'cloudfunctions/refundMember/index.js'), 'utf8')
  const ticketSource = fs.readFileSync(path.join(projectRoot, 'cloudfunctions/requestTicketRefund/index.js'), 'utf8')

  for (const source of [memberSource, ticketSource]) {
    assert.match(source, /invoice_requests/)
    assert.match(source, /invoiceRefund\.resolve/)
    assert.match(source, /cancelInvoiceForRefund/)
  }

  assert.ok(
    memberSource.indexOf('invoiceRefund.resolve') < memberSource.indexOf('cloud.cloudPay.refund'),
    '会员卡退款必须先检查开票状态'
  )
  assert.ok(
    ticketSource.indexOf('invoiceRefund.resolve') < ticketSource.indexOf("status: 'refund_pending'"),
    '门票退款必须在冻结票券前检查开票状态'
  )
})

test('管理员完成开票前再次校验订单未进入退款流程', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'cloudfunctions/invoiceService/index.js'), 'utf8')
  assert.match(source, /assertOrderStillInvoiceable/)
  assert.match(source, /invoiceStatus.*cancelled_refund/)
  assert.match(source, /订单已进入退款流程/)
})

test('隐私政策如实说明发票资料、使用目的和管理员访问范围', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/legal/privacy/privacy.js'), 'utf8')
  for (const field of ['发票抬头', '单位税号', '接收邮箱', '银行账号']) {
    assert.match(source, new RegExp(field))
  }
  assert.match(source, /仅用于.*发票/)
  assert.match(source, /管理员/)
})
