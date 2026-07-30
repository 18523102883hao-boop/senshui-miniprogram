const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const core = require('../../cloudfunctions/adminOperationsLedger/report-core.js')
const exportCore = require('../../cloudfunctions/adminOperationsLedger/export-core.js')
const exportWorkbook = require('../../cloudfunctions/adminOperationsLedger/export-workbook.js')

const FROM = new Date('2026-07-27T16:00:00.000Z').getTime() // 北京时间 07-28 00:00
const TO = new Date('2026-07-28T16:00:00.000Z').getTime()   // 北京时间 07-29 00:00

function sampleInput() {
  return {
    orders: [
      {
        type: 'ticket_order',
        status: 'paid',
        outTradeNo: 'TK-001',
        productName: '单人溪降票',
        amount: 16800,
        unverifiedAmount: 0,
        unverifiedTicketCount: 0,
        contact: { phone: '13800138000' },
        paidAt: new Date('2026-07-28T02:00:00.000Z')
      },
      {
        type: 'ticket_upgrade',
        status: 'paid_dup',
        outTradeNo: 'U-002',
        itemLabel: '溪降票升级营地票',
        amount: 22800,
        staffOpenid: 'staff-openid-1',
        staffName: '张浩',
        paidAt: new Date('2026-07-28T03:00:00.000Z')
      },
      {
        type: 'member_card',
        status: 'paid',
        outTradeNo: 'M-OLD',
        amount: 990,
        paidAt: new Date('2026-07-26T03:00:00.000Z')
      }
    ],
    refundedTickets: [
      {
        ticketNo: 'T-REFUND',
        orderId: 'TK-OLD',
        productName: '儿童溪降票',
        unitPrice: 5800,
        refundedAt: new Date('2026-07-28T04:00:00.000Z')
      }
    ],
    refundedMembers: [
      {
        memberCode: 'SR-REFUND',
        orderId: 'M-REFUND',
        refundAmount: 990,
        refundedAt: new Date('2026-07-28T05:00:00.000Z')
      }
    ],
    usedTickets: [
      {
        ticketNo: 'T-USED-1',
        orderId: 'TK-001',
        sku: 'creek_single',
        productName: '单人溪降票',
        unitPrice: 16800,
        contact: { phone: '13800138000' },
        verifiedBy: 'staff-openid-1',
        staffName: '张浩',
        usedAt: new Date('2026-07-28T06:00:00.000Z')
      }
    ],
    legacyTicketVerifications: [
      {
        type: 'creek_ticket',
        ticketNo: 'LEGACY-1',
        staffOpenid: 'staff-openid-2',
        staffName: '李敏',
        createdAt: new Date('2026-07-28T06:30:00.000Z')
      }
    ],
    memberVerifications: [
      {
        type: 'member_benefit',
        benefitType: 'birthday',
        memberCode: 'SR-001',
        staffOpenid: 'staff-openid-2',
        staffName: '李敏',
        createdAt: new Date('2026-07-28T07:00:00.000Z')
      }
    ],
    lingLedger: [
      {
        type: 'physical_to_digital',
        change: 100,
        staffOpenid: 'staff-openid-1',
        staffName: '张浩',
        createdAt: new Date('2026-07-28T08:00:00.000Z')
      },
      {
        type: 'digital_to_physical',
        change: -40,
        staffOpenid: 'staff-openid-2',
        staffName: '李敏',
        createdAt: new Date('2026-07-28T09:00:00.000Z')
      },
      {
        type: 'member_grant',
        change: 1000,
        staffName: '张浩',
        createdAt: new Date('2026-07-28T10:00:00.000Z')
      }
    ],
    pendingRefunds: [
      {
        outTradeNo: 'TK-PENDING',
        refundFee: 3200,
        status: 'pending',
        createdAt: new Date('2026-07-28T10:30:00.000Z')
      }
    ]
  }
}

test('校验时间范围且自定义范围最多 366 天', () => {
  assert.equal(core.validateRange({ from: FROM, to: TO }).ok, true)
  assert.equal(core.validateRange({ from: TO, to: FROM }).ok, false)
  assert.equal(core.validateRange({ from: FROM, to: FROM + 367 * 86400000 }).ok, false)
})

test('小程序业务账按支付与实际退款发生时间计算，不混入核销票面金额', () => {
  const report = core.buildSummary(sampleInput(), { from: FROM, to: TO })

  assert.equal(report.finance.gross, 39600)
  assert.equal(report.finance.paidCount, 2)
  assert.equal(report.finance.refunds, 6790)
  assert.equal(report.finance.refundCount, 2)
  assert.equal(report.finance.net, 32810)
  assert.equal(report.finance.pendingRefundCount, 1)
  assert.equal(report.finance.pendingRefundAmount, 3200)
  assert.equal(report.finance.anomalyCount, 1)
  assert.equal(report.finance.anomalyAmount, 22800)
  assert.equal(report.finance.orderIncome, 0)
  assert.equal(report.finance.actualNetIncome, 16800)

  assert.equal(report.operations.ticketVerifiedCount, 2)
  assert.equal(report.operations.actualNetIncome, 16800)
  assert.equal(report.operations.ticketFaceValue, undefined)
  assert.equal(report.operations.ticketPriceMissingCount, 1)
  assert.equal(report.operations.memberVerificationCount, 1)
  assert.equal(report.operations.lingPhysicalToDigital, 100)
  assert.equal(report.operations.lingDigitalToPhysical, 40)

  assert.equal(report.finance.gross, 39600, '核销票面金额不能重复计入支付流水')
  assert.equal(
    report.finance.actualNetIncome,
    report.operations.actualNetIncome,
    '实际净收入必须只有一个统一字段'
  )
})

test('订单收入只统计已支付但尚未核销的有效门票，实际净收入只统计已核销票面金额', () => {
  const input = {
    orders: [
      {
        type: 'ticket_order',
        status: 'paid',
        outTradeNo: 'TK-PENDING',
        productName: '待核销溪降票',
        amount: 16800,
        unverifiedAmount: 16800,
        unverifiedTicketCount: 1,
        paidAt: new Date('2026-07-28T02:00:00.000Z')
      },
      {
        type: 'ticket_order',
        status: 'paid',
        outTradeNo: 'TK-USED',
        productName: '已核销溪降票',
        amount: 12800,
        unverifiedAmount: 0,
        unverifiedTicketCount: 0,
        paidAt: new Date('2026-07-28T03:00:00.000Z')
      }
    ],
    usedTickets: [
      {
        ticketNo: 'T-USED',
        orderId: 'TK-USED',
        sku: 'creek_double',
        productName: '双人溪降票',
        unitPrice: 12800,
        admissionCount: 2,
        usedAt: new Date('2026-07-28T04:00:00.000Z')
      }
    ]
  }
  const report = core.buildSummary(input, { from: FROM, to: TO })

  assert.equal(report.finance.gross, 29600, '支付流水仍按实际支付统计')
  assert.equal(report.finance.orderIncome, 16800)
  assert.equal(report.finance.orderIncomeCount, 1)
  assert.equal(report.finance.actualNetIncome, 12800)
  assert.equal(report.operations.actualNetIncome, 12800)
  assert.equal(report.operations.ticketFaceValue, undefined)
  assert.equal(report.daily[0].orderIncome, 16800)
  assert.equal(report.daily[0].actualNetIncome, 12800)
  assert.equal(report.daily[0].ticketFaceValue, undefined)
})

test('业务数据分为实体兑电子、电子兑实体和会员卡兑换三类汇总', () => {
  const report = core.buildSummary(sampleInput(), { from: FROM, to: TO })
  const breakdown = report.operations.businessBreakdown

  assert.deepEqual(breakdown, [
    { key: 'physical_to_digital', label: '实体兑电子', count: 1, quantity: 100 },
    { key: 'digital_to_physical', label: '电子兑实体', count: 1, quantity: 40 },
    { key: 'member_card_exchange', label: '会员卡兑换', count: 1, quantity: 1000 }
  ])
  assert.equal(report.operations.businessRecordCount, 3)
  assert.equal(
    breakdown.some((row) => row.key === 'birthday'),
    false,
    '生日 85 折不属于长河令业务数据'
  )
})

test('财务首页使用已核销收入、已核销订单和已核销票种构成', () => {
  const report = core.buildSummary(sampleInput(), { from: FROM, to: TO })

  assert.equal(report.verificationFinance.gross, 16800)
  assert.equal(report.verificationFinance.net, 16800)
  assert.equal(report.verificationFinance.paidCount, 1)
  assert.equal(report.verificationFinance.verifiedTicketCount, 2)

  const ticketIncome = report.verifiedIncomeBreakdown.find((row) => row.key === 'creek_single')
  assert.deepEqual(
    { amount: ticketIncome.amount, count: ticketIncome.count },
    { amount: 16800, count: 1 }
  )
})

test('按业务、票种、员工和北京时间日期生成拆分', () => {
  const report = core.buildSummary(sampleInput(), { from: FROM, to: TO })

  const ticketIncome = report.incomeBreakdown.find((x) => x.key === 'ticket_order')
  const upgradeIncome = report.incomeBreakdown.find((x) => x.key === 'ticket_upgrade')
  assert.deepEqual({ amount: ticketIncome.amount, count: ticketIncome.count }, { amount: 16800, count: 1 })
  assert.deepEqual({ amount: upgradeIncome.amount, count: upgradeIncome.count }, { amount: 22800, count: 1 })

  assert.deepEqual(report.ticketBreakdown[0], {
    key: 'creek_single',
    label: '单人溪降票',
    count: 1,
    ticketCount: 1,
    admissionCount: 1,
    unknownAdmissionTicketCount: 0,
    admissionShare: 1,
    faceValue: 16800,
    priceMissingCount: 0
  })
  assert.equal(report.daily[0].date, '2026-07-28')
  assert.equal(report.daily[0].gross, 39600)
  assert.equal(report.daily[0].refunds, 6790)

  const zhang = report.staffBreakdown.find((x) => x.staffName === '张浩')
  assert.equal(zhang.upgradeAmount, 22800)
  assert.equal(zhang.ticketVerifiedCount, 1)
  assert.equal(zhang.admittedPeopleCount, 1)
  assert.equal(zhang.lingExchangeCount, 1)
})

test('核销汇总严格区分票数、实际人数、待核对人数和关联订单', () => {
  const input = sampleInput()
  input.usedTickets.push(
    {
      ticketNo: 'T-DOUBLE',
      orderId: 'TK-DOUBLE',
      sku: 'creek_double',
      productName: '双人溪降票',
      unitPrice: 12800,
      admissionCount: 2,
      orderExists: true,
      verifiedBy: 'staff-openid-1',
      staffName: '张浩',
      usedAt: new Date('2026-07-28T11:00:00.000Z')
    },
    {
      ticketNo: 'T-UNKNOWN',
      orderId: 'TK-MISSING',
      sku: 'legacy_unknown',
      productName: '历史未知票',
      unitPrice: 0,
      orderExists: false,
      verifiedBy: 'staff-openid-2',
      staffName: '李敏',
      usedAt: new Date('2026-07-28T12:00:00.000Z')
    }
  )

  const report = core.buildSummary(input, { from: FROM, to: TO })
  assert.equal(report.operations.verifiedTicketCount, 4)
  assert.equal(report.operations.ticketVerifiedCount, 4)
  assert.equal(report.operations.admittedPeopleCount, 3)
  assert.equal(report.operations.unknownAdmissionTicketCount, 2)
  assert.equal(report.operations.relatedOrderCount, 3)

  const double = report.ticketBreakdown.find((row) => row.key === 'creek_double')
  assert.equal(double.ticketCount, 1)
  assert.equal(double.admissionCount, 2)
  assert.equal(double.unknownAdmissionTicketCount, 0)
  assert.equal(double.admissionShare, 2 / 3)

  const unknown = report.ticketBreakdown.find((row) => row.key === 'legacy_unknown')
  assert.equal(unknown.ticketCount, 1)
  assert.equal(unknown.admissionCount, 0)
  assert.equal(unknown.unknownAdmissionTicketCount, 1)
})

test('已知历史 SKU 可回填人数，未知历史票不伪造实际人数', () => {
  const input = sampleInput()
  input.legacyTicketVerifications = [
    {
      type: 'creek_ticket',
      ticketNo: 'LEGACY-DOUBLE',
      orderId: 'TK-HISTORY',
      sku: 'creek_double',
      productName: '双人溪降票',
      unitPrice: 12800,
      staffOpenid: 'staff-openid-2',
      staffName: '李敏',
      createdAt: new Date('2026-07-28T06:30:00.000Z')
    },
    {
      type: 'creek_ticket',
      ticketNo: 'LEGACY-UNKNOWN',
      sku: 'retired_unknown',
      productName: '退役未知票',
      staffOpenid: 'staff-openid-2',
      staffName: '李敏',
      createdAt: new Date('2026-07-28T06:40:00.000Z')
    }
  ]

  const events = core.buildEvents(input, { from: FROM, to: TO })
  const known = events.find((event) => event.reference === 'LEGACY-DOUBLE')
  const unknown = events.find((event) => event.reference === 'LEGACY-UNKNOWN')
  assert.deepEqual(
    { tickets: known.ticketCount, people: known.admissionCount, unknown: known.admissionCountUnknown },
    { tickets: 1, people: 2, unknown: false }
  )
  assert.deepEqual(
    { tickets: unknown.ticketCount, people: unknown.admissionCount, unknown: unknown.admissionCountUnknown },
    { tickets: 1, people: 0, unknown: true }
  )
})

test('旧记录即使带有人数未知标记，已知单人票和双人票仍按票种回填人数', () => {
  const input = sampleInput()
  input.usedTickets = [
    {
      ticketNo: 'T-CHILD',
      orderId: 'TK-CHILD',
      sku: 'creek_child',
      productName: '儿童溪降票',
      unitPrice: 2990,
      admissionCountUnknown: true,
      usedAt: new Date('2026-07-28T06:00:00.000Z')
    },
    {
      ticketNo: 'T-DOUBLE-LEGACY-FLAG',
      orderId: 'TK-DOUBLE',
      sku: 'creek_double',
      productName: '双人溪降票',
      unitPrice: 12800,
      admissionCountUnknown: true,
      usedAt: new Date('2026-07-28T07:00:00.000Z')
    }
  ]
  input.legacyTicketVerifications = []

  const report = core.buildSummary(input, { from: FROM, to: TO })
  assert.equal(report.operations.verifiedTicketCount, 2)
  assert.equal(report.operations.admittedPeopleCount, 3)
  assert.equal(report.operations.unknownAdmissionTicketCount, 0)
  assert.equal(report.ticketBreakdown.find((row) => row.key === 'creek_child').admissionCount, 1)
  assert.equal(report.ticketBreakdown.find((row) => row.key === 'creek_double').admissionCount, 2)
})

test('财务接口把核销口径报告映射到财务首页', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../cloudfunctions/adminOperationsLedger/index.js'),
    'utf8'
  )
  assert.match(source, /finance:\s*report\.verificationFinance/)
  assert.match(source, /incomeBreakdown:\s*report\.verifiedIncomeBreakdown/)
})

test('日账和月账均保留资金、核销票数、实际人数与异常摘要', () => {
  const input = sampleInput()
  input.usedTickets[0].admissionCount = 1
  input.usedTickets[0].orderExists = true
  const report = core.buildSummary(input, { from: FROM, to: TO })

  assert.equal(report.reconciliation.daily.length, 1)
  assert.equal(report.reconciliation.monthly.length, 1)
  assert.equal(report.reconciliation.monthly[0].month, '2026-07')
  assert.equal(report.reconciliation.monthly[0].gross, 39600)
  assert.equal(report.reconciliation.monthly[0].verifiedTicketCount, 2)
  assert.equal(report.reconciliation.monthly[0].admittedPeopleCount, 1)
  assert.ok(Array.isArray(report.anomalies.list))
  assert.ok(report.anomalies.byType.duplicate_payment >= 1)
  assert.ok(report.anomalies.byType.missing_admission_snapshot >= 1)
})

test('核销异常识别已核销后退款、缺人数、缺价格、缺订单与重复支付', () => {
  const input = sampleInput()
  input.usedTickets.push({
    ticketNo: 'T-RISK',
    orderId: 'TK-NOT-FOUND',
    sku: 'unknown_ticket',
    productName: '未知票',
    unitPrice: 0,
    orderExists: false,
    refundedAt: new Date('2026-07-28T12:00:00.000Z'),
    verifiedBy: 'staff-openid-1',
    staffName: '张浩',
    usedAt: new Date('2026-07-28T11:00:00.000Z')
  })
  const report = core.buildSummary(input, { from: FROM, to: TO })

  for (const key of [
    'duplicate_payment',
    'verified_then_refunded',
    'missing_admission_snapshot',
    'missing_price',
    'missing_order'
  ]) {
    assert.ok(report.anomalies.byType[key] >= 1, `缺少异常类型 ${key}`)
  }
})

test('管理员订单详情只返回白名单字段并对联系人脱敏', () => {
  const detail = core.buildOrderDetail({
    _id: 'db-secret-id',
    _openid: 'customer-secret-openid',
    outTradeNo: 'TK-001',
    type: 'ticket_order',
    productName: '单人溪降票',
    amount: 16800,
    status: 'paid',
    quantity: 1,
    admissionCountPerTicket: 1,
    admittedPeopleCount: 1,
    visitDate: '2026-07-28',
    contact: { name: '张三', phone: '13800138000' },
    staffOpenid: 'staff-secret-openid',
    staffName: '李敏',
    staffNo: 'A001',
    paidAt: new Date('2026-07-28T02:00:00.000Z')
  }, [{
    ticketNo: 'T-USED-1',
    sku: 'creek_single',
    productName: '单人溪降票',
    status: 'used',
    admissionCount: 1,
    usedAt: new Date('2026-07-28T06:00:00.000Z')
  }])
  const json = JSON.stringify(detail)

  assert.equal(detail.outTradeNo, 'TK-001')
  assert.equal(detail.contact.name, '张**')
  assert.equal(detail.contact.phoneTail, '8000')
  assert.equal(detail.tickets[0].ticketNo, 'T-USED-1')
  assert.doesNotMatch(json, /customer-secret-openid|staff-secret-openid|13800138000|db-secret-id/)
})

test('管理员订单详情组合退款、开票与只读操作历史', () => {
  const detail = core.buildOrderDetail({
    outTradeNo: 'TK-DETAIL',
    type: 'ticket_order',
    productName: '双人溪降票',
    amount: 12800,
    status: 'paid',
    quantity: 1,
    admissionCountPerTicket: 2,
    contact: { name: '张三', phone: '13800138000' },
    createdAt: new Date('2026-07-28T01:00:00.000Z'),
    paidAt: new Date('2026-07-28T02:00:00.000Z')
  }, [{
    ticketNo: 'T-DETAIL',
    sku: 'creek_double',
    productName: '双人溪降票',
    status: 'used',
    admissionCount: 2,
    usedAt: new Date('2026-07-28T05:00:00.000Z')
  }], {
    refundRequests: [{
      status: 'pending',
      refundFee: 6400,
      reason: '行程变化',
      ticketNos: ['T-DETAIL'],
      createdAt: new Date('2026-07-28T04:00:00.000Z')
    }],
    invoiceRequests: [{
      status: 'reviewing',
      invoiceAmount: 12800,
      invoiceFile: null,
      submittedAt: new Date('2026-07-28T03:00:00.000Z'),
      history: [{
        from: 'submitted',
        to: 'reviewing',
        at: new Date('2026-07-28T03:30:00.000Z'),
        by: { name: '管理员私密姓名' }
      }]
    }]
  })

  assert.equal(detail.refund.status, 'pending')
  assert.equal(detail.refund.refundFee, 6400)
  assert.equal(detail.invoice.status, 'reviewing')
  assert.equal(detail.invoice.statusText, '商家审核中')
  assert.equal(detail.history.some((item) => item.type === 'ticket_verified'), true)
  assert.equal(detail.history.some((item) => item.type === 'refund_requested'), true)
  assert.equal(detail.history.some((item) => item.type === 'invoice_submitted'), true)
  assert.doesNotMatch(JSON.stringify(detail), /13800138000|管理员私密姓名/)
})

test('详情支持类别、员工、子类型与关键词过滤后分页', () => {
  const input = sampleInput()
  const all = core.buildEvents(input, { from: FROM, to: TO })

  const funds = core.buildDetails(all, {
    kind: 'funds',
    keyword: '8000',
    page: 1,
    pageSize: 30
  })
  assert.equal(funds.total, 1)
  assert.equal(funds.list[0].reference, 'TK-001')
  assert.equal(funds.list[0].phoneTail, '8000')

  const tickets = core.buildDetails(all, {
    kind: 'ticket_verifications',
    staffOpenid: 'staff-openid-1',
    subtype: 'creek_single',
    page: 1,
    pageSize: 30
  })
  assert.equal(tickets.total, 1)
  assert.equal(tickets.list[0].reference, 'T-USED-1')

  const secondPage = core.buildDetails(all, {
    kind: 'funds',
    page: 2,
    pageSize: 2
  })
  assert.equal(secondPage.page, 2)
  assert.equal(secondPage.list.length, 2)
})

test('资金明细可在服务端按支付或退款过滤后再分页', () => {
  const all = core.buildEvents(sampleInput(), { from: FROM, to: TO })
  const payments = core.buildDetails(all, {
    kind: 'funds',
    eventKind: 'payment',
    page: 1,
    pageSize: 30
  })
  const refunds = core.buildDetails(all, {
    kind: 'funds',
    eventKind: 'refund',
    page: 1,
    pageSize: 30
  })

  assert.ok(payments.total > 0)
  assert.ok(refunds.total > 0)
  assert.equal(payments.list.every((row) => row.eventKind === 'payment'), true)
  assert.equal(refunds.list.every((row) => row.eventKind === 'refund'), true)
})

test('长河令详情排除会员赠送，历史核销不伪造票价', () => {
  const all = core.buildEvents(sampleInput(), { from: FROM, to: TO })
  const ling = core.buildDetails(all, { kind: 'ling_exchanges', page: 1, pageSize: 30 })
  const tickets = core.buildDetails(all, { kind: 'ticket_verifications', page: 1, pageSize: 30 })

  assert.equal(ling.total, 2)
  assert.deepEqual(ling.list.map((x) => x.quantity).sort((a, b) => a - b), [40, 100])
  assert.equal(tickets.total, 2)
  assert.equal(tickets.list.find((x) => x.reference === 'LEGACY-1').priceMissing, true)
  assert.equal(tickets.list.find((x) => x.reference === 'LEGACY-1').amount, 0)
})

test('业务数据支持三类汇总分别下钻到明细', () => {
  const all = core.buildEvents(sampleInput(), { from: FROM, to: TO })
  const physical = core.buildDetails(all, {
    kind: 'business_data',
    subtype: 'physical_to_digital',
    page: 1,
    pageSize: 30
  })
  const digital = core.buildDetails(all, {
    kind: 'business_data',
    subtype: 'digital_to_physical',
    page: 1,
    pageSize: 30
  })
  const member = core.buildDetails(all, {
    kind: 'business_data',
    subtype: 'member_card_exchange',
    page: 1,
    pageSize: 30
  })

  assert.equal(physical.total, 1)
  assert.equal(physical.list[0].quantity, 100)
  assert.equal(digital.total, 1)
  assert.equal(digital.list[0].quantity, 40)
  assert.equal(member.total, 1)
  assert.equal(member.list[0].quantity, 1000)
  assert.equal(member.list[0].subtypeLabel, '会员卡兑换')
})

test('明细响应不暴露客户 openid，手机号仅返回后四位', () => {
  const input = sampleInput()
  input.usedTickets[0]._openid = 'customer-secret-openid'
  const all = core.buildEvents(input, { from: FROM, to: TO })
  const result = core.buildDetails(all, { kind: 'ticket_verifications', page: 1, pageSize: 30 })
  const json = JSON.stringify(result)

  assert.doesNotMatch(json, /customer-secret-openid/)
  assert.doesNotMatch(json, /13800138000/)
  assert.match(json, /8000/)
})

test('云函数对汇总和明细统一执行管理员鉴权与范围校验', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../cloudfunctions/adminOperationsLedger/index.js'),
    'utf8'
  )
  assert.match(source, /collection\(['"]staff['"]\)/)
  assert.match(source, /role\s*!==\s*['"]admin['"]/)
  assert.match(source, /status:\s*['"]approved['"]/)
  assert.match(source, /core\.validateRange/)
  assert.match(source, /action\s*===\s*['"]details['"]/)
  assert.match(source, /core\.buildSummary/)
  assert.match(source, /core\.buildDetails/)
  assert.match(source, /action\s*===\s*['"]orderDetail['"]/)
  assert.match(source, /core\.buildOrderDetail/)
})

test('云函数读取业务账所需集合并提供批量上限提示', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../cloudfunctions/adminOperationsLedger/index.js'),
    'utf8'
  )
  for (const collection of ['orders', 'tickets', 'members', 'refund_requests', 'verifications', 'ling_ledger']) {
    assert.match(source, new RegExp(`['"]${collection}['"]`), `缺少 ${collection} 数据源`)
  }
  assert.match(source, /READ_LIMIT/)
  assert.match(source, /truncated/)
})

test('报表云函数已加入部署清单', () => {
  const deploy = fs.readFileSync(path.join(__dirname, '../../scripts/deploy-functions.sh'), 'utf8')
  assert.match(deploy, /adminOperationsLedger/)
})

test('导出仅接受数据集和字段白名单，并自动保留审计必需字段', () => {
  assert.throws(
    () => exportCore.normalizeSelection({ datasets: ['customer_openids'] }),
    /不支持的数据类型/
  )
  assert.throws(
    () => exportCore.normalizeSelection({
      datasets: ['payment_details'],
      fields: { payment_details: ['openid'] }
    }),
    /不支持的导出字段/
  )

  const selection = exportCore.normalizeSelection({
    datasets: ['payment_details'],
    fields: { payment_details: ['amount', 'phoneTail'] }
  })
  assert.deepEqual(selection.datasets, ['payment_details'])
  assert.deepEqual(
    selection.fields.payment_details,
    ['eventAt', 'reference', 'amount', 'phoneTail', 'definition']
  )
})

test('导出计划按所选类型生成独立工作表且手机号只保留尾号', () => {
  const input = sampleInput()
  input.orders[0]._openid = 'customer-secret-openid'
  input.orders[0].contact.phone = '13800138000'
  const report = core.buildSummary(input, { from: FROM, to: TO })
  const events = core.buildEvents(input, { from: FROM, to: TO })
  const plan = exportCore.buildExportPlan({
    report,
    events,
    range: { from: FROM, to: TO },
    exportedBy: '管理员',
    exportedAt: new Date('2026-07-28T08:00:00.000Z'),
    selection: {
      datasets: [
        'funds_summary',
        'payment_details',
        'verification_details',
        'business_summary'
      ],
      fields: {
        payment_details: ['title', 'amount', 'staffName', 'phoneTail'],
        verification_details: [
          'title',
          'ticketCount',
          'admissionCount',
          'amount',
          'staffName',
          'phoneTail'
        ]
      }
    }
  })

  assert.deepEqual(
    plan.sheets.map((sheet) => sheet.name),
    ['导出说明', '收入与资金汇总', '支付明细', '核销明细', '业务汇总']
  )
  assert.match(plan.fileName, /^森水长河-经营数据-20260728-20260728\.xlsx$/)
  const json = JSON.stringify(plan)
  assert.match(json, /8000/)
  assert.doesNotMatch(json, /13800138000|customer-secret-openid|staff-openid-1/)
  const verification = plan.sheets.find((sheet) => sheet.key === 'verification_details')
  const verifiedSingle = verification.rows.find((row) => row.项目名称 === '单人溪降票')
  assert.equal(verifiedSingle.实际人数, 1)
  assert.equal(verifiedSingle['实际净收入（元）'], 168)
})

test('数据源截断时拒绝生成不完整 Excel', () => {
  assert.throws(
    () => exportCore.buildExportPlan({
      report: {},
      events: [],
      range: { from: FROM, to: TO },
      truncated: true,
      selection: { datasets: ['funds_summary'] }
    }),
    (error) => error && error.code === 'EXPORT_TRUNCATED'
  )
})

test('工作簿包含导出说明和每类数据独立工作表', async () => {
  const report = core.buildSummary(sampleInput(), { from: FROM, to: TO })
  const events = core.buildEvents(sampleInput(), { from: FROM, to: TO })
  const plan = exportCore.buildExportPlan({
    report,
    events,
    range: { from: FROM, to: TO },
    exportedBy: '管理员',
    selection: {
      datasets: ['funds_summary', 'payment_details', 'refund_details']
    }
  })
  const buffer = await exportWorkbook.writeBuffer(plan)
  assert.ok(Buffer.isBuffer(buffer))
  assert.ok(buffer.length > 1000)

  const workbook = await exportWorkbook.readBuffer(buffer)
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ['导出说明', '收入与资金汇总', '支付明细', '退款明细']
  )
  assert.equal(workbook.getWorksheet('支付明细').views[0].state, 'frozen')
})

test('导出接口使用管理员鉴权、截断保护并上传 xlsx 文件', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../cloudfunctions/adminOperationsLedger/index.js'),
    'utf8'
  )
  assert.match(source, /action\s*===\s*['"]export['"]/)
  assert.match(source, /sources\.truncated/)
  assert.match(source, /buildExportPlan/)
  assert.match(source, /writeBuffer/)
  assert.match(source, /cloud\.uploadFile/)
  assert.match(source, /\.xlsx/)
})
