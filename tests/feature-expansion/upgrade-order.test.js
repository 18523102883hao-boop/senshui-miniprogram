// 自助补差升级的数量与计价契约。
// 金额必须使用云端升级配置的单价计算，客户端只能提交数量。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const corePath = path.join(projectRoot, 'cloudfunctions/createSelfUpgrade/order-core.js')

function loadCore() {
  assert.equal(fs.existsSync(corePath), true, '缺少自助补差订单纯逻辑模块')
  delete require.cache[corePath]
  return require(corePath)
}

const DOUBLE_ITEM = {
  id: 'creek_double_to_camp',
  label: '双人单溪降 → 升营地（每人）',
  price: 11400,
  enabled: true
}

test('任意升级项目允许一次购买 1 至 10 份', () => {
  const core = loadCore()
  const one = core.resolveUpgradeOrder({ item: DOUBLE_ITEM, quantity: 1 })
  const ten = core.resolveUpgradeOrder({ item: DOUBLE_ITEM, quantity: 10 })

  assert.deepEqual(one, {
    ok: true,
    quantity: 1,
    unitPrice: 11400,
    totalFee: 11400,
    itemLabel: '双人单溪降 → 升营地（每人）'
  })
  assert.deepEqual(ten, {
    ok: true,
    quantity: 10,
    unitPrice: 11400,
    totalFee: 114000,
    itemLabel: '双人单溪降 → 升营地（每人）'
  })
})

test('升级购买拒绝 0、11、小数与非数字数量', () => {
  const core = loadCore()
  for (const quantity of [0, 11, 1.5, 'abc']) {
    const result = core.resolveUpgradeOrder({ item: DOUBLE_ITEM, quantity })
    assert.equal(result.ok, false, '应拒绝数量：' + quantity)
    assert.match(result.msg, /数量/)
  }
})

test('其他升级项目同样支持多份且由云端单价计算总额', () => {
  const core = loadCore()
  const item = { id: 'creek_adult_to_camp', label: '成人单溪降 → 升营地', price: 11000, enabled: true }

  assert.equal(core.resolveUpgradeOrder({ item, quantity: 1 }).ok, true)
  const result = core.resolveUpgradeOrder({ item, quantity: 4 })
  assert.equal(result.ok, true)
  assert.equal(result.unitPrice, 11000)
  assert.equal(result.totalFee, 44000)
})

test('缺省数量按 1 兼容旧客户端，金额只取云端配置单价', () => {
  const core = loadCore()
  const result = core.resolveUpgradeOrder({
    item: DOUBLE_ITEM,
    quantity: undefined,
    clientAmount: 1
  })

  assert.equal(result.ok, true)
  assert.equal(result.quantity, 1)
  assert.equal(result.unitPrice, 11400)
  assert.equal(result.totalFee, 11400)
})

test('升级项异常或下架时拒绝下单', () => {
  const core = loadCore()
  assert.equal(core.resolveUpgradeOrder({ item: null, quantity: 1 }).ok, false)
  assert.equal(core.resolveUpgradeOrder({ item: { ...DOUBLE_ITEM, enabled: false }, quantity: 1 }).ok, false)
  assert.equal(core.resolveUpgradeOrder({ item: { ...DOUBLE_ITEM, price: 0 }, quantity: 1 }).ok, false)
})

test('员工手机号后四位使用尾号匹配，同时兼容旧版姓名或完整手机号', () => {
  const core = loadCore()
  assert.equal(typeof core.resolveStaffReference, 'function', '缺少员工手机号尾号解析逻辑')
  assert.deepEqual(core.resolveStaffReference(' 8000 '), {
    value: '8000',
    lookup: 'phone_tail',
    phonePattern: '8000$'
  })
  assert.deepEqual(core.resolveStaffReference('小森'), {
    value: '小森',
    lookup: 'legacy_exact',
    phonePattern: ''
  })
  assert.deepEqual(core.resolveStaffReference(''), {
    value: '',
    lookup: 'empty',
    phonePattern: ''
  })
})
