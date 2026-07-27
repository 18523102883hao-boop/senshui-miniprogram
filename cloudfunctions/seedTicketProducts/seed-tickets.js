// 票种种子数据（PRD §17.3 ticket_products）
// ⚠️ 价格、规则、限制全部来自 docs/业务参数.md（业主 2026-07-24 以团购页截图确认）。
// 改价请先改 docs/业务参数.md，再改这里并重跑 seedTicketProducts（force: true）。
// 金额单位：分。

// 三条退款规则对所有票种一致（业主确认口径）
const REFUND_RULE = {
  tag: '随时退',
  summary: '未使用可随时退款',
  details: [
    '未使用可随时申请退款',
    '过期后未使用，商家审核后自动退款',
    '本产品包含多项游玩服务，任一项目核销后，未使用项目金额不可申请退款',
    '一次性购买多份时，支持未使用商品经商家审核后部分退款'
  ]
}

// 当日有效、仅入园 1 次（业主确认）
const VALIDITY_RULE = {
  type: 'same_day',
  desc: '所选日期当日有效，仅可入园 1 次'
}

const CREEK_BENEFITS = ['玻璃水质溪谷', '森林峡谷穿越', '飞拉达', '深浅跳潭', '魔网', '摆渡车', '安全设备与救生衣']
const CAMP_BENEFITS = ['自助火锅', '自助烧烤', '鸡汤饭', '玩玻璃水', '营地全天开放']

const CREEK_RESTRICTIONS = [
  '成人限制身高 150 厘米（含）以上',
  '孕妇、心脑血管疾病及其他不适宜剧烈运动者请勿参加',
  '遇强降雨或上游涨水会临时停运，以现场公告为准'
]

const CAMP_RESTRICTIONS = [
  '营地项目以现场开放情况为准',
  '未成年人须由监护人陪同'
]

function product(overrides) {
  return Object.assign({
    coverFileId: '',
    galleryFileIds: [],
    fulfillmentMode: 'native_pay',
    externalChannel: null,
    fallbackMode: 'contact_service', // 支付未就绪时的兜底
    exclusions: [],
    validityRule: VALIDITY_RULE,
    blackoutDates: [],
    refundRule: REFUND_RULE,
    reservationRequired: false, // 业主确认：无需预约，高峰期可能排队
    purchaseLimit: 10,
    stockMode: 'unlimited',
    stock: 0,
    status: 'active'
  }, overrides)
}

const TICKET_PRODUCTS = [
  product({
    sku: 'creek_single', name: '单人溪降票', category: 'creek', audience: '成人 1 名',
    salePrice: 6800, marketPrice: 33806,
    benefits: CREEK_BENEFITS, restrictions: CREEK_RESTRICTIONS,
    exclusions: ['餐食', '个人消费'],
    highlight: '全程约 2 公里，游玩时长约 1.5 小时',
    sort: 10
  }),
  product({
    sku: 'creek_double', name: '双人溪降票', category: 'creek', audience: '2 名（成人或符合身高的同行者）',
    salePrice: 12800, marketPrice: 67805,
    benefits: CREEK_BENEFITS, restrictions: CREEK_RESTRICTIONS,
    exclusions: ['餐食', '个人消费'],
    highlight: '两人同行更划算',
    sort: 20
  }),
  product({
    sku: 'creek_child', name: '儿童溪降票', category: 'creek', audience: '儿童 1 名',
    salePrice: 2990, marketPrice: 29806,
    benefits: CREEK_BENEFITS,
    restrictions: ['儿童适用身高/年龄范围请咨询管家'].concat(CREEK_RESTRICTIONS.slice(1)),
    exclusions: ['餐食', '个人消费'],
    highlight: '需成人陪同',
    sort: 30
  }),
  product({
    sku: 'camp_adult', name: '单人票 · 仅营地', category: 'camp', audience: '成人 1 名',
    salePrice: 15800, marketPrice: 80325,
    benefits: CAMP_BENEFITS, restrictions: CAMP_RESTRICTIONS,
    exclusions: ['溪降项目', '装备租赁'],
    highlight: '三餐全包一整天',
    sort: 40
  }),
  product({
    sku: 'camp_child', name: '儿童票 · 仅营地', category: 'camp', audience: '儿童 1 名',
    salePrice: 9800, marketPrice: 49843,
    benefits: CAMP_BENEFITS,
    restrictions: ['儿童适用身高/年龄范围请咨询管家'].concat(CAMP_RESTRICTIONS),
    exclusions: ['溪降项目', '装备租赁'],
    highlight: '三餐全包一整天',
    sort: 50
  }),
  product({
    sku: 'camp_senior', name: '老人票 · 仅营地', category: 'camp', audience: '65 周岁以上 1 名',
    salePrice: 11800, marketPrice: 49841,
    benefits: CAMP_BENEFITS,
    restrictions: ['入园时请携带有效身份证件核验年龄'].concat(CAMP_RESTRICTIONS),
    exclusions: ['溪降项目', '装备租赁'],
    highlight: '三餐全包一整天',
    sort: 60
  }),
  product({
    sku: 'combo_single', name: '单人套票 · 含溪降', category: 'combo', audience: '成人 1 名',
    salePrice: 17800, marketPrice: 103653,
    benefits: CAMP_BENEFITS.concat(['溪降全项目']),
    restrictions: CREEK_RESTRICTIONS.concat(CAMP_RESTRICTIONS),
    exclusions: ['装备租赁', '个人消费'],
    highlight: '营地 + 溪降，一天玩满',
    sort: 70
  })
]

module.exports = { TICKET_PRODUCTS, REFUND_RULE, VALIDITY_RULE }
