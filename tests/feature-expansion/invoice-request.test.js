const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const core = require(path.join(projectRoot, 'cloudfunctions/invoiceService/invoice-core.js'))

test('只有正常支付完成的三类订单具备开票资格', () => {
  for (const type of ['member_card', 'ticket_order', 'ticket_upgrade']) {
    assert.equal(core.canApply({ type, status: 'paid', amount: 990 }), true, type)
  }
  assert.equal(core.canApply({ type: 'member_card', status: 'paid_dup', amount: 990 }), false)
  assert.equal(core.canApply({ type: 'ticket_order', status: 'refunding', totalFee: 5800 }), false)
  assert.equal(core.canApply({ type: 'ticket_order', status: 'refunded', totalFee: 5800 }), false)
  assert.equal(core.canApply({ type: 'rental_order', status: 'paid', amount: 1000 }), false)
})

test('门票可开票金额只统计未退款票券，其他订单取服务端实付金额', () => {
  const tickets = [
    { unitPrice: 5800, status: 'unused' },
    { unitPrice: 5800, status: 'used' },
    { unitPrice: 5800, status: 'refund_pending' },
    { unitPrice: 5800, status: 'refunded' },
    { unitPrice: 5800, status: 'void' }
  ]
  assert.equal(core.getInvoiceAmount({ type: 'ticket_order', totalFee: 29000 }, tickets), 11600)
  assert.equal(core.getInvoiceAmount({ type: 'member_card', amount: 990 }), 990)
  assert.equal(core.getInvoiceAmount({ type: 'ticket_upgrade', amount: 22800 }), 22800)
  assert.equal(core.getInvoiceAmount({ type: 'ticket_order', totalFee: 5800 }, []), 0)
})

test('个人抬头仅保留必要字段并规范邮箱', () => {
  const result = core.normalizeApplication({
    titleType: 'personal',
    titleName: '  张 三  ',
    email: ' TEST@Example.COM ',
    taxNo: 'SHOULD-DROP',
    bankAccount: '62220000'
  })
  assert.equal(result.ok, true)
  assert.equal(result.value.titleName, '张 三')
  assert.equal(result.value.email, 'test@example.com')
  assert.equal(result.value.taxNo, '')
  assert.equal(result.value.bankAccount, '')
})

test('单位抬头要求名称、税号和邮箱，选填字段有长度边界', () => {
  const missingTax = core.normalizeApplication({
    titleType: 'company',
    titleName: '成都森水长河有限公司',
    email: 'finance@example.com'
  })
  assert.equal(missingTax.ok, false)
  assert.match(missingTax.msg, /税号/)

  const valid = core.normalizeApplication({
    titleType: 'company',
    titleName: ' 成都森水长河有限公司 ',
    taxNo: ' 91510100MA1234567X ',
    email: 'finance@example.com',
    registeredAddress: '成都市示例地址',
    registeredPhone: '028-12345678',
    bankName: '示例银行成都分行',
    bankAccount: '6222 0000 0000 0000'
  })
  assert.equal(valid.ok, true)
  assert.equal(valid.value.taxNo, '91510100MA1234567X')
  assert.equal(valid.value.bankAccount, '6222000000000000')
})

test('开票状态机仅允许审核闭环中的合法迁移', () => {
  assert.equal(core.canTransition('submitted', 'reviewing'), true)
  assert.equal(core.canTransition('submitted', 'rejected'), true)
  assert.equal(core.canTransition('reviewing', 'issued'), true)
  assert.equal(core.canTransition('reviewing', 'cancelled_refund'), true)
  assert.equal(core.canTransition('rejected', 'submitted'), true)
  assert.equal(core.canTransition('submitted', 'issued'), false)
  assert.equal(core.canTransition('issued', 'reviewing'), false)
  assert.equal(core.canTransition('cancelled_refund', 'submitted'), false)
})

test('只有已审批管理员可以读取和处理完整开票资料', () => {
  assert.equal(core.canManage({ status: 'approved', role: 'admin' }), true)
  assert.equal(core.canManage({ status: 'approved', role: 'front' }), false)
  assert.equal(core.canManage({ status: 'pending', role: 'admin' }), false)
  assert.equal(core.canManage(null), false)
})

test('创建申请使用订单快照和服务端金额，并生成审计历史', () => {
  const now = new Date('2026-07-28T03:00:00.000Z')
  const result = core.buildRequest({
    openid: 'user-1',
    order: {
      _id: 'order-1',
      type: 'ticket_order',
      outTradeNo: 'TK001',
      productName: '单人溪降票',
      status: 'paid',
      totalFee: 11600
    },
    tickets: [
      { unitPrice: 5800, status: 'unused' },
      { unitPrice: 5800, status: 'used' }
    ],
    input: {
      titleType: 'personal',
      titleName: '张三',
      email: 'zhangsan@example.com',
      invoiceAmount: 1,
      orderTitle: '篡改标题'
    },
    now
  })
  assert.equal(result.ok, true)
  assert.equal(result.value.invoiceAmount, 11600)
  assert.equal(result.value.orderTitle, '单人溪降票')
  assert.equal(result.value._openid, 'user-1')
  assert.equal(result.value.status, 'submitted')
  assert.equal(result.value.invoiceFile, null)
  assert.equal(result.value.history.length, 1)
  assert.equal(result.value.history[0].to, 'submitted')
})

test('电子发票文件只接受当前申请目录下且不超过 10MB 的 PDF', () => {
  const valid = core.validateInvoiceFile({
    fileId: 'cloud://cloud1.example/invoice-files/inv-1/1720000000000.pdf',
    fileName: '森水会员卡电子发票.pdf',
    size: 1024 * 1024,
    contentType: 'application/pdf',
    revision: 2
  }, 'inv-1', 2)
  assert.equal(valid.ok, true)

  assert.match(core.validateInvoiceFile({
    fileId: 'cloud://cloud1.example/invoice-files/inv-1/invoice.jpg',
    fileName: 'invoice.jpg',
    size: 1024,
    contentType: 'image/jpeg',
    revision: 2
  }, 'inv-1', 2).msg, /PDF/)

  assert.match(core.validateInvoiceFile({
    fileId: 'cloud://cloud1.example/invoice-files/inv-2/invoice.pdf',
    fileName: 'invoice.pdf',
    size: 1024,
    contentType: 'application/pdf',
    revision: 2
  }, 'inv-1', 2).msg, /路径/)

  assert.match(core.validateInvoiceFile({
    fileId: 'cloud://cloud1.example/invoice-files/inv-1/invoice.pdf',
    fileName: 'invoice.pdf',
    size: 10 * 1024 * 1024 + 1,
    contentType: 'application/pdf',
    revision: 2
  }, 'inv-1', 2).msg, /10MB/)

  assert.match(core.validateInvoiceFile({
    fileId: 'cloud://cloud1.example/invoice-files/inv-1/invoice.pdf',
    fileName: 'invoice.pdf',
    size: 1024,
    contentType: 'application/pdf',
    revision: 1
  }, 'inv-1', 2).msg, /已更新/)

  assert.equal(core.hasPdfHeader(Buffer.from('%PDF-1.7\n')), true)
  assert.equal(core.hasPdfHeader(Buffer.from('<html>')), false)
})

test('申请详情不下发云文件标识和管理员身份，预览必须另行鉴权', () => {
  const detail = core.toUserDetail({
    _id: 'inv-1',
    status: 'issued',
    invoiceFile: {
      fileId: 'cloud://cloud1.example/invoice-files/inv-1/invoice.pdf',
      fileName: '电子发票.pdf',
      size: 2048,
      contentType: 'application/pdf',
      version: 1,
      revision: 2,
      uploadedAt: new Date('2026-07-28T10:00:00Z'),
      uploadedBy: 'staff-openid',
      uploadedByName: '管理员'
    }
  })
  assert.equal(detail.invoiceFile.available, true)
  assert.equal(detail.invoiceFile.fileName, '电子发票.pdf')
  assert.equal(detail.invoiceFile.fileId, undefined)
  assert.equal(detail.invoiceFile.uploadedBy, undefined)
  assert.equal(detail.invoiceFile.uploadedByName, undefined)
})

test('电子发票临时访问地址写入原子审计记录', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'cloudfunctions/invoiceService/index.js'),
    'utf8'
  )
  assert.match(source, /invoice_file_accessed/)
  assert.match(source, /history:\s*_\.push/)
  assert.match(source, /purpose\s*===\s*'download'/)
})

test('已存在有效申请时返回幂等结果，不生成新申请', () => {
  const existing = { _id: 'inv-1', status: 'reviewing', outTradeNo: 'TK001' }
  const result = core.resolveSubmission(existing)
  assert.deepEqual(result, { mode: 'existing', request: existing })
  assert.equal(core.resolveSubmission({ _id: 'inv-2', status: 'rejected' }).mode, 'revise')
  assert.equal(core.resolveSubmission(null).mode, 'create')
})

test('列表摘要对税号、银行账号和邮箱脱敏', () => {
  const masked = core.toStaffListItem({
    _id: 'inv-1',
    titleName: '成都森水长河有限公司',
    taxNo: '91510100MA1234567X',
    bankAccount: '6222000000000000',
    email: 'finance@example.com'
  })
  assert.notEqual(masked.taxNo, '91510100MA1234567X')
  assert.notEqual(masked.bankAccount, '6222000000000000')
  assert.notEqual(masked.email, 'finance@example.com')
})

test('重新申请时同时返回当前订单快照，不能沿用退款前金额', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'cloudfunctions/invoiceService/index.js'), 'utf8')
  assert.match(source, /function buildOrderSnapshot/)
  assert.match(source, /request:\s*request\s*\?\s*core\.toUserDetail\(request\)\s*:\s*null/)
  assert.match(source, /order:\s*buildOrderSnapshot\(order,\s*tickets\)/)
})

test('并发首次提交由唯一索引兜底并返回已存在申请', () => {
  const service = fs.readFileSync(path.join(projectRoot, 'cloudfunctions/invoiceService/index.js'), 'utf8')
  const deployment = fs.readFileSync(path.join(projectRoot, 'scripts/db-init.md'), 'utf8')
  assert.match(service, /并发/)
  assert.match(service, /raced/)
  assert.match(deployment, /invoice_requests/)
  assert.match(deployment, /_openid.*outTradeNo.*是/)
})

test('部署配置完整包含开票、退款、继续支付和运营账云函数', () => {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'cloudbaserc.json'), 'utf8'))
  const names = new Set((config.functions || []).map((item) => item.name))
  const required = [
    'invoiceService',
    'getMyOrders',
    'requestTicketRefund',
    'refundMember',
    'repayOrder',
    'adminOperationsLedger'
  ]
  for (const name of required) assert.equal(names.has(name), true, `cloudbaserc 缺少 ${name}`)

  const script = fs.readFileSync(path.join(projectRoot, 'scripts/deploy-functions.sh'), 'utf8')
  for (const name of required) assert.match(script, new RegExp(`\\b${name}\\b`), `部署脚本缺少 ${name}`)
})

test('开发者工具端口检查不会把任意 CLI 失败误判为可用', () => {
  const script = fs.readFileSync(path.join(projectRoot, 'scripts/deploy-functions.sh'), 'utf8')
  assert.match(script, /local output/)
  assert.match(script, /output=.*cloud functions list/)
  assert.doesNotMatch(
    script,
    /if ! "\$CLI" cloud functions list[\s\S]{0,160}\|\s*grep/,
    'pipefail 下反向管道会把 CLI 的任意失败误判为端口可用'
  )
})
