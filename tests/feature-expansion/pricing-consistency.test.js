// 票价与补差价的一致性（2026-07-26 溪降调价后加）
//
// 核心不变量：单项票价 + 升级差价 = 对应套票价。
// 违反它会出现两种坏情况：
//   高了 —— 客人先买单项再升级比直接买套票贵，等于被坑；
//   低了 —— 客人可以拆着买套利，园区亏钱。
// 价格散在票种种子、升级项种子、补差价页文案三处，改一处漏两处很容易发生。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const TICKETS = require(path.join(projectRoot, 'cloudfunctions/seedTicketProducts/seed-tickets.js')).TICKET_PRODUCTS
const upgradeSrc = fs.readFileSync(path.join(projectRoot, 'cloudfunctions/seedUpgradeItems/index.js'), 'utf8')
const upgradePageSrc = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/upgrade-info/upgrade-info.js'), 'utf8')

function ticketPrice(sku) {
  const t = TICKETS.find((p) => p.sku === sku)
  assert.ok(t, '缺票种：' + sku)
  return t.salePrice
}

function upgradePrice(id) {
  const m = upgradeSrc.match(new RegExp("id: '" + id + "'[^}]*price: (\\d+)"))
  assert.ok(m, '缺升级项：' + id)
  return Number(m[1])
}

test('单项票 + 升级差价 = 套票价，两条路径不能有价差', () => {
  const combo = ticketPrice('combo_single')

  const paths = [
    ['成人营地 → 升溪降', ticketPrice('camp_adult') + upgradePrice('camp_adult_to_creek')],
    ['成人溪降 → 升营地', ticketPrice('creek_single') + upgradePrice('creek_adult_to_camp')],
    // 双人票按人均算，升级仍按每位持票人的单价计费
    ['双人溪降 → 升营地（每人）', ticketPrice('creek_double') / 2 + upgradePrice('creek_double_to_camp')]
  ]

  for (const [name, total] of paths) {
    assert.equal(total, combo,
      name + '：合计 ' + (total / 100) + ' 元，与套票 ' + (combo / 100) + ' 元不一致')
  }
})

test('升溪降的差价等于对应的溪降票价', () => {
  // 亲子营地票的大人加玩溪降，收的就是单人溪降票价
  assert.equal(upgradePrice('camp_family_to_creek_adult'), ticketPrice('creek_single'),
    '大人加玩溪降的差价应等于单人溪降票价')
  // 儿童两条升级路径都按儿童溪降票价收
  assert.equal(upgradePrice('camp_family_to_creek_child'), ticketPrice('creek_child'))
  assert.equal(upgradePrice('camp_child_to_creek'), ticketPrice('creek_child'))
})

test('补差价页展示的价格与升级项配置一致，不能只改一处', () => {
  // 页面文案是硬编码的，最容易在调价时被漏掉
  const EXPECT = {
    camp_adult_to_creek: { orig: ticketPrice('camp_adult'), add: upgradePrice('camp_adult_to_creek') },
    camp_family_to_creek_adult: { add: upgradePrice('camp_family_to_creek_adult') },
    creek_adult_to_camp: { orig: ticketPrice('creek_single'), add: upgradePrice('creek_adult_to_camp') },
    creek_double_to_camp: { orig: ticketPrice('creek_double'), add: upgradePrice('creek_double_to_camp') }
  }

  for (const [itemId, expect] of Object.entries(EXPECT)) {
    const row = upgradePageSrc.match(new RegExp("itemId: '" + itemId + "'[^}]*}"))
    assert.ok(row, '补差价页缺少 ' + itemId)

    const addMatch = row[0].match(/add: '\+¥([\d.]+)'/)
    assert.ok(addMatch, itemId + ' 缺 add 文案')
    assert.equal(Math.round(Number(addMatch[1]) * 100), expect.add,
      itemId + ' 页面显示的差价与配置不符')

    if (expect.orig !== undefined) {
      const origMatch = row[0].match(/orig: '([\d.]+)'/)
      assert.ok(origMatch, itemId + ' 缺 orig 文案')
      assert.equal(Math.round(Number(origMatch[1]) * 100), expect.orig,
        itemId + ' 页面显示的原价与票种配置不符')
    }
  }
})

test('溪降双人票比两张单人票便宜，否则双人票没有存在意义', () => {
  const single = ticketPrice('creek_single')
  const double = ticketPrice('creek_double')
  assert.ok(double < single * 2,
    '双人票 ' + (double / 100) + ' 元不该贵过两张单人票 ' + (single * 2 / 100) + ' 元')
})

test('所有票价为正整数分，不出现浮点误差', () => {
  for (const p of TICKETS) {
    assert.ok(Number.isInteger(p.salePrice) && p.salePrice > 0,
      p.sku + ' 售价必须是正整数分，实际 ' + p.salePrice)
    assert.ok(Number.isInteger(p.marketPrice) && p.marketPrice >= p.salePrice,
      p.sku + ' 划线价必须是不低于售价的整数分')
  }
})
