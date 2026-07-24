// Task 1 契约测试：锁定跨任务复用的领域常量与纯函数
// 依据 PRD：§8.6 票券状态、§12.4 线索状态、§14.4 订单类型、§15.2 反馈状态、
//          §17.6 团队预约状态、§23 金额用分、specs/_conventions.md §6 合规禁用词
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const domainPath = path.join(projectRoot, 'miniprogram/utils/domain.js')
const constPath = path.join(projectRoot, 'miniprogram/utils/const.js')

function loadDomain() {
  delete require.cache[domainPath]
  return require(domainPath)
}

function values(obj) {
  return Object.keys(obj).map((k) => obj[k])
}

test('订单类型保留既有业务并新增门票订单', () => {
  const { ORDER_TYPES } = loadDomain()
  // 既有类型不得改动，否则会破坏线上会员卡与补差价订单
  assert.equal(ORDER_TYPES.MEMBER_CARD, 'member_card')
  assert.equal(ORDER_TYPES.TICKET_UPGRADE, 'ticket_upgrade')
  // 本轮新增
  assert.equal(ORDER_TYPES.TICKET_ORDER, 'ticket_order')
})

test('票券状态覆盖 PRD §8.6 且取值唯一', () => {
  const { TICKET_STATUS } = loadDomain()
  const list = values(TICKET_STATUS)
  const expected = ['unused', 'reserved', 'used', 'refund_pending', 'refunded', 'expired', 'void']
  assert.deepEqual(list.slice().sort(), expected.slice().sort())
  assert.equal(new Set(list).size, list.length, '状态取值必须唯一')
})

test('团队预约状态覆盖 PRD §17.6 且取值唯一', () => {
  const { VISIT_RESERVATION_STATUS } = loadDomain()
  const list = values(VISIT_RESERVATION_STATUS)
  const expected = ['pending', 'confirmed', 'completed', 'cancelled', 'rejected']
  assert.deepEqual(list.slice().sort(), expected.slice().sort())
  assert.equal(new Set(list).size, list.length, '状态取值必须唯一')
})

test('服务线索状态覆盖 PRD §12.4 且取值唯一', () => {
  const { LEAD_STATUS } = loadDomain()
  const list = values(LEAD_STATUS)
  const expected = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'closed']
  assert.deepEqual(list.slice().sort(), expected.slice().sort())
  assert.equal(new Set(list).size, list.length, '状态取值必须唯一')
})

test('反馈状态覆盖 PRD §15.2 且取值唯一', () => {
  const { FEEDBACK_STATUS } = loadDomain()
  const list = values(FEEDBACK_STATUS)
  const expected = ['submitted', 'processing', 'resolved', 'closed']
  assert.deepEqual(list.slice().sort(), expected.slice().sort())
  assert.equal(new Set(list).size, list.length, '状态取值必须唯一')
})

test('常量对象被冻结，避免运行期被业务代码改写', () => {
  const domain = loadDomain()
  const frozen = ['ORDER_TYPES', 'TICKET_STATUS', 'VISIT_RESERVATION_STATUS', 'LEAD_STATUS', 'FEEDBACK_STATUS']
  for (const name of frozen) {
    assert.equal(Object.isFrozen(domain[name]), true, `${name} 必须冻结`)
  }
})

test('fenToYuan 只接受整数分，拒绝小数与非法输入', () => {
  const { fenToYuan } = loadDomain()
  assert.equal(fenToYuan(0), '0.00')
  assert.equal(fenToYuan(990), '9.90')
  assert.equal(fenToYuan(12000), '120.00')
  assert.equal(fenToYuan(2990), '29.90')
  // 非整数分必须抛错，杜绝浮点金额流入订单
  assert.throws(() => fenToYuan(9.9), /整数分/)
  assert.throws(() => fenToYuan('990'), /整数分/)
  assert.throws(() => fenToYuan(null), /整数分/)
  assert.throws(() => fenToYuan(NaN), /整数分/)
})

test('新增领域常量文案不含长河令合规禁用词', () => {
  const banned = ['押注', '下注', '翻倍', '稳赚', '以小博大', '赌', '博彩']
  const sources = [fs.readFileSync(domainPath, 'utf8'), fs.readFileSync(constPath, 'utf8')]
  for (const src of sources) {
    for (const word of banned) {
      assert.equal(src.includes(word), false, `不得出现禁用词：${word}`)
    }
  }
})

test('const.js 复用 domain 的订单类型，避免两处定义漂移', () => {
  const { ORDER_TYPES } = loadDomain()
  delete require.cache[constPath]
  const consts = require(constPath)
  assert.deepEqual(consts.ORDER_TYPES, ORDER_TYPES, 'const.js 必须复用 domain.js 的订单类型')
})
