// Task 6 门票目录测试
// PRD §8.1 产品类型、§8.2 三种履约模式、§8.3 列表卡、§8.4 详情、§17.3 ticket_products
// 价格与规则来源：docs/业务参数.md（业主 2026-07-24 确认）
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const catalogCore = require(path.join(projectRoot, 'cloudfunctions/listTicketProducts/catalog-core.js'))
const seedData = require(path.join(projectRoot, 'cloudfunctions/seedTicketProducts/seed-tickets.js'))
const listPath = path.join(projectRoot, 'miniprogram/pages/ticket/ticket.js')
const detailPath = path.join(projectRoot, 'miniprogram/pages/ticket/detail/detail.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], toast: [], clipboard: [], phone: [] }
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
    navigateTo(o) { calls.navigate.push(o.url); if (options.navigateFail && o.fail) o.fail({}) },
    switchTab(o) { calls.navigate.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    setClipboardData(o) { calls.clipboard.push(o.data); if (o.success) o.success() },
    makePhoneCall(o) { calls.phone.push(o.phoneNumber) },
    getStorageSync() { return null },
    setStorageSync() {},
    setNavigationBarTitle() {},
    stopPullDownRefresh() {}
  }
  global.Page = (config) => { pageConfig = config }

  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
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

// ============ 云端目录逻辑 ============

test('只展示上架商品，草稿与下架不进游客端', () => {
  const list = catalogCore.filterActive([
    { sku: 'a', status: 'active', sort: 2 },
    { sku: 'b', status: 'draft', sort: 1 },
    { sku: 'c', status: 'off', sort: 3 },
    { sku: 'd', status: 'active', sort: 1 }
  ])
  assert.deepEqual(list.map((p) => p.sku), ['d', 'a'], '按 sort 升序且只保留 active')
})

test('列表项金额来自整数分，非整数分的商品被判为无效', () => {
  const item = catalogCore.toCardItem({
    sku: 'creek_single', name: '单人溪降票', salePrice: 5800, marketPrice: 33806,
    status: 'active', benefits: ['玻璃水', '飞拉达', '摆渡车', '安全装备', '救生衣', '第六条']
  })
  assert.equal(item.priceText, '58.00')
  assert.equal(item.marketPriceText, '338.06')
  assert.equal(item.benefits.length, 5, '卡片最多展示 5 条核心权益')
  assert.throws(() => catalogCore.toCardItem({ sku: 'x', salePrice: 58.5 }), /整数分/)
})

test('无划线价时不编造原价', () => {
  const item = catalogCore.toCardItem({ sku: 'x', name: 'x', salePrice: 5800, status: 'active' })
  assert.equal(item.marketPriceText, '')
})

test('划线价不高于售价时不展示，避免虚假优惠', () => {
  const item = catalogCore.toCardItem({ sku: 'x', name: 'x', salePrice: 5800, marketPrice: 5000, status: 'active' })
  assert.equal(item.marketPriceText, '', '划线价低于售价属于脏数据，不得展示')
})

test('三种履约模式各自映射到正确的 CTA', () => {
  assert.deepEqual(catalogCore.ctaOf({ fulfillmentMode: 'native_pay' }), { text: '立即购买', action: 'buy' })
  assert.deepEqual(catalogCore.ctaOf({ fulfillmentMode: 'external_channel' }), { text: '前往官方渠道', action: 'channel' })
  assert.deepEqual(catalogCore.ctaOf({ fulfillmentMode: 'contact_service' }), { text: '咨询管家', action: 'contact' })
})

test('未知或缺失履约模式降级为咨询管家，页面不中断', () => {
  assert.equal(catalogCore.ctaOf({}).action, 'contact')
  assert.equal(catalogCore.ctaOf({ fulfillmentMode: 'unknown_mode' }).action, 'contact')
})

test('原生支付未就绪时自动降级到备用模式', () => {
  const cta = catalogCore.ctaOf(
    { fulfillmentMode: 'native_pay', fallbackMode: 'external_channel' },
    { nativePayReady: false }
  )
  assert.equal(cta.action, 'channel', '支付未就绪必须走备用渠道而不是报错')
})

// ============ 种子商品数据 ============

test('种子票种覆盖溪降、营地与套票三类', () => {
  const cats = seedData.TICKET_PRODUCTS.map((p) => p.category)
  for (const c of ['creek', 'camp', 'combo']) {
    assert.ok(cats.includes(c), '缺少票种分类：' + c)
  }
})

test('种子价格与 docs/业务参数.md 一致（整数分）', () => {
  const bySku = {}
  seedData.TICKET_PRODUCTS.forEach((p) => { bySku[p.sku] = p })
  const expected = {
    creek_single: 6800, creek_double: 12800, creek_child: 2990,
    camp_adult: 15800, camp_child: 9800, camp_senior: 11800, combo_single: 17800
  }
  for (const sku of Object.keys(expected)) {
    assert.ok(bySku[sku], '缺少票种：' + sku)
    assert.equal(bySku[sku].salePrice, expected[sku], sku + ' 售价不符')
    assert.equal(Number.isInteger(bySku[sku].salePrice), true, sku + ' 售价必须是整数分')
  }
})

test('每个种子票种规则字段完整（人群/有效期/预约/退款/限购）', () => {
  for (const p of seedData.TICKET_PRODUCTS) {
    assert.ok(p.audience, p.sku + ' 缺少适用人群')
    assert.ok(p.validityRule && p.validityRule.desc, p.sku + ' 缺少有效期说明')
    assert.equal(typeof p.reservationRequired, 'boolean', p.sku + ' 缺少是否需预约')
    assert.ok(p.refundRule && p.refundRule.summary, p.sku + ' 缺少退款规则')
    assert.ok(p.purchaseLimit > 0, p.sku + ' 缺少限购数量')
    assert.ok(Array.isArray(p.benefits) && p.benefits.length > 0, p.sku + ' 缺少权益')
    assert.ok(['active', 'draft', 'off'].includes(p.status), p.sku + ' 状态非法')
  }
})

test('溪降票必须写明身高限制，营地票不得凭空套用', () => {
  const bySku = {}
  seedData.TICKET_PRODUCTS.forEach((p) => { bySku[p.sku] = p })
  assert.ok(JSON.stringify(bySku.creek_single.restrictions).includes('150'), '溪降票需写明 150 厘米限制')
  const childRules = JSON.stringify(bySku.creek_child.restrictions)
  assert.ok(childRules.includes('120 厘米（含）至 150 厘米（含）'),
    '儿童溪降票需写明 120–150 厘米且边界均包含')
  assert.equal(childRules.includes('请咨询管家'), false, '已确认的儿童身高不可继续显示为待咨询')
  assert.ok(Array.isArray(bySku.camp_adult.restrictions))
})

test('种子文案不含绝对化表述与合规禁用词', () => {
  const text = JSON.stringify(seedData.TICKET_PRODUCTS)
  for (const word of ['全网最低', '最低价', '第一', '国家级', '押注', '下注', '稳赚', '赌']) {
    assert.equal(text.includes(word), false, '不得出现：' + word)
  }
})

// ============ 列表页 ============

const PRODUCT_LIST = [
  {
    sku: 'creek_single', productId: 'p1', name: '单人溪降票', category: 'creek', audience: '成人 1 名',
    salePrice: 5800, marketPrice: 33806, fulfillmentMode: 'native_pay',
    benefits: ['玻璃水质', '森林峡谷穿越', '飞拉达'], reservationRequired: false,
    refundTag: '随时退', validityText: '当日有效', status: 'active'
  },
  {
    sku: 'birthday_service', productId: 'p2', name: '生日宴请服务', category: 'service', audience: '按需定制',
    salePrice: 0, fulfillmentMode: 'contact_service', benefits: ['场地布置'], reservationRequired: true,
    validityText: '协商确定', status: 'active'
  }
]

test('列表页加载上架商品并渲染卡片', async (t) => {
  const { page } = mountPage(t, listPath, {
    responders: { listTicketProducts: () => Promise.resolve({ list: PRODUCT_LIST }) }
  })
  await page.onLoad({})
  assert.equal(page.data.products.length, 2)
  assert.equal(page.data.products[0].priceText, '58.00')
  assert.equal(page.data.products[0].cta.text, '立即购买')
  assert.equal(page.data.products[1].cta.text, '咨询管家')
})

test('门票列表移除其他购票渠道，但接口失败时仍展示错误重试态', async (t) => {
  const { page } = mountPage(t, listPath, {
    responders: { listTicketProducts: () => Promise.reject(new Error('offline')) }
  })
  await page.onLoad({})
  assert.equal(page.data.hasError, true)
  assert.equal(page.data.channels, undefined, '不应再保留外部购票渠道数据')
  assert.equal(page.data.upgradeNote, undefined, '不应再保留渠道卡片底部说明')
  assert.equal(page.copyLink, undefined, '不应再保留渠道复制事件')

  const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/ticket/ticket.wxml'), 'utf8')
  assert.doesNotMatch(wxml, /其他购票渠道|抖音官方旗舰店|美团\s*\/\s*大众点评|通过官方渠道购买/)
})

test('点击商品卡进入详情并带 productId', async (t) => {
  const { page, calls } = mountPage(t, listPath, {
    responders: { listTicketProducts: () => Promise.resolve({ list: PRODUCT_LIST }) }
  })
  await page.onLoad({})
  page.onProductTap({ currentTarget: { dataset: { id: 'p1' } } })
  assert.equal(calls.navigate[0], '/pages/ticket/detail/detail?productId=p1')
})

// ============ 详情页 ============

const PRODUCT_DETAIL = {
  productId: 'p1', sku: 'creek_single', name: '单人溪降票', category: 'creek',
  audience: '成人 1 名', salePrice: 5800, marketPrice: 33806,
  coverFileId: '', galleryFileIds: [],
  benefits: ['玻璃水质', '森林峡谷穿越', '飞拉达', '深浅跳潭', '魔网'],
  exclusions: ['餐食', 'individual 保险'],
  validityRule: { desc: '所选日期当日有效，仅可入园 1 次' },
  refundRule: { summary: '未使用可随时退款', details: ['过期未使用商家审核后自动退款'] },
  restrictions: ['成人限制身高 150 厘米（含）以上'],
  reservationRequired: false, purchaseLimit: 10,
  fulfillmentMode: 'native_pay', status: 'active'
}

test('详情页展示完整规则区块', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: { getTicketProduct: () => Promise.resolve({ product: PRODUCT_DETAIL }) }
  })
  await page.onLoad({ productId: 'p1' })
  assert.equal(page.data.product.name, '单人溪降票')
  assert.equal(page.data.product.priceText, '58.00')
  assert.ok(page.data.product.benefits.length >= 5)
  assert.ok(page.data.product.refundRule.summary)
  assert.ok(page.data.product.restrictions.length > 0)
  assert.equal(page.data.cta.action, 'buy')
})

test('原生支付商品点购买跳下单页，未上线时提示不静默', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    navigateFail: true,
    responders: { getTicketProduct: () => Promise.resolve({ product: PRODUCT_DETAIL }) }
  })
  await page.onLoad({ productId: 'p1' })
  page.onCtaTap()
  assert.ok(calls.navigate[0].indexOf('/pages/ticket/checkout/checkout') === 0)
  assert.equal(calls.toast.length, 1)
})

test('咨询型商品点 CTA 直接进入管家而不是下单或线索页', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      getTicketProduct: () => Promise.resolve({
        product: Object.assign({}, PRODUCT_DETAIL, { fulfillmentMode: 'contact_service', productId: 'p2' })
      })
    }
  })
  await page.onLoad({ productId: 'p2' })
  page.onCtaTap()
  assert.equal(calls.navigate[0].indexOf('/pages/ticket/checkout/checkout'), -1)
  assert.equal(calls.navigate[0], '/pages/concierge/concierge')
})

test('外部渠道商品点 CTA 复制链接', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      getTicketProduct: () => Promise.resolve({
        product: Object.assign({}, PRODUCT_DETAIL, {
          fulfillmentMode: 'external_channel',
          externalChannel: { name: '抖音官方旗舰店', url: 'https://example.com/shop' }
        })
      })
    }
  })
  await page.onLoad({ productId: 'p1' })
  page.onCtaTap()
  assert.equal(calls.clipboard[0], 'https://example.com/shop')
})

test('商品不存在时显示错误态并可重试', async (t) => {
  let times = 0
  const { page } = mountPage(t, detailPath, {
    responders: {
      getTicketProduct: () => {
        times += 1
        return times === 1 ? Promise.reject(new Error('404')) : Promise.resolve({ product: PRODUCT_DETAIL })
      }
    }
  })
  await page.onLoad({ productId: 'p1' })
  assert.equal(page.data.hasError, true)
  await page.onRetry()
  assert.equal(page.data.hasError, false)
})
