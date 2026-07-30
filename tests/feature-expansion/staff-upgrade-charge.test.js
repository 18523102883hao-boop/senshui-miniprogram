const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const core = require(path.join(projectRoot, 'cloudfunctions/createUpgradeCharge/charge-core.js'))

const ITEM = {
  id: 'double-creek-to-camp',
  label: '双人单溪降 → 升营地（每人）',
  price: 11400,
  enabled: true
}

test('员工选择升级项目后按 1 至 10 人计算总金额', () => {
  const one = core.resolveCharge({ item: ITEM, quantity: 1 })
  const ten = core.resolveCharge({ item: ITEM, quantity: 10 })

  assert.deepEqual(one, {
    ok: true,
    amount: 11400,
    unitPrice: 11400,
    quantity: 1,
    itemId: ITEM.id,
    itemLabel: ITEM.label
  })
  assert.equal(ten.ok, true)
  assert.equal(ten.amount, 114000)
  assert.equal(ten.unitPrice, 11400)
  assert.equal(ten.quantity, 10)
})

test('员工补差价人数拒绝越界和非整数，旧客户端默认一人', () => {
  for (const quantity of [0, 11, 1.5, 'abc']) {
    assert.equal(core.resolveCharge({ item: ITEM, quantity }).ok, false)
  }
  assert.equal(core.resolveCharge({ item: ITEM }).quantity, 1)
})

test('手动金额保持总价语义，不受项目人数乘法影响', () => {
  assert.deepEqual(core.resolveCharge({
    amount: 12000,
    itemLabel: '现场补差价',
    quantity: 5
  }), {
    ok: true,
    amount: 12000,
    unitPrice: 12000,
    quantity: 1,
    itemId: null,
    itemLabel: '现场补差价'
  })
})

test('员工补差价页面在选中项目后展示人数步进器并提交数量', () => {
  const js = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/charge/charge.js'),
    'utf8'
  )
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/charge/charge.wxml'),
    'utf8'
  )
  assert.match(wxml, /wx:if="\{\{selectedId\}\}"/)
  assert.match(wxml, /1–10 人/)
  assert.match(wxml, /bindtap="decreaseQuantity"/)
  assert.match(wxml, /bindtap="increaseQuantity"/)
  assert.match(wxml, /合计 ¥\{\{selectedTotalYuan\}\}/)
  assert.match(js, /itemId:\s*selectedId,\s*quantity/)
})

test('人数选择采用上下两行全宽布局，窄屏不依赖 CSS Grid', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/charge/charge.wxml'),
    'utf8'
  )
  const wxss = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/charge/charge.wxss'),
    'utf8'
  )
  assert.match(wxml, /quantity-panel__header/)
  assert.match(wxml, /quantity-panel__control/)
  assert.match(wxml, /购买人数/)
  assert.match(wxss, /\.quantity-panel__control[\s\S]*width:\s*100%/)
  assert.match(wxss, /box-sizing:\s*border-box/)
  assert.match(wxss, /min-width:\s*0/)
  assert.doesNotMatch(wxss, /grid-template-columns/)
})
