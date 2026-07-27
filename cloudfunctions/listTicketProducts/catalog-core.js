// 门票目录纯逻辑（PRD §8.2 履约模式 / §8.3 商品卡）
// 不依赖云 SDK，前端与云函数共用同一套判断，避免 CTA 两边不一致。

const CARD_BENEFIT_LIMIT = 5 // 卡片最多展示 5 条核心权益（PRD §8.3）

const CTA_BY_MODE = {
  native_pay: { text: '立即购买', action: 'buy' },
  external_channel: { text: '前往官方渠道', action: 'channel' },
  contact_service: { text: '咨询管家', action: 'contact' }
}

function fenToYuan(fen) {
  if (typeof fen !== 'number' || !Number.isInteger(fen)) {
    throw new TypeError('金额必须是整数分，收到：' + String(fen))
  }
  const cents = String(Math.abs(fen) % 100)
  return (fen < 0 ? '-' : '') + Math.floor(Math.abs(fen) / 100) + '.' + (cents.length === 1 ? '0' + cents : cents)
}

/**
 * 只保留上架商品并按 sort 升序（不修改入参）。
 * 草稿（draft）与下架（off）一律不进游客端。
 */
function filterActive(products) {
  return (Array.isArray(products) ? products : [])
    .filter((p) => p && p.status === 'active')
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
}

/**
 * 商品 → 列表卡片展示模型。
 * @param {object} product
 * @param {object} [ctx] { nativePayReady }
 */
function toCardItem(product, ctx) {
  const p = product || {}
  const sale = p.salePrice || 0
  const priceText = fenToYuan(sale)
  // 划线价必须真实且高于售价，否则不展示（PRD §8.3 不得虚假优惠）
  const showMarket = typeof p.marketPrice === 'number' && Number.isInteger(p.marketPrice) && p.marketPrice > sale
  return {
    productId: p._id || p.productId || '',
    sku: p.sku || '',
    name: p.name || '',
    category: p.category || '',
    audience: p.audience || '',
    coverFileId: p.coverFileId || '',
    salePrice: sale,
    priceText,
    marketPriceText: showMarket ? fenToYuan(p.marketPrice) : '',
    benefits: (p.benefits || []).slice(0, CARD_BENEFIT_LIMIT),
    reservationRequired: !!p.reservationRequired,
    leadTimeDays: Number(p.leadTimeDays) || 0,
    refundTag: (p.refundRule && p.refundRule.tag) || p.refundTag || '',
    validityText: (p.validityRule && p.validityRule.desc) || p.validityText || '',
    fulfillmentMode: p.fulfillmentMode || '',
    externalChannel: p.externalChannel || null,
    cta: ctaOf(p, ctx)
  }
}

/**
 * 履约模式 → CTA。
 * 未知模式或原生支付未就绪时，按备用模式降级；再不行就走咨询，页面永不中断（PRD §8.2）。
 */
function ctaOf(product, ctx) {
  const p = product || {}
  const options = ctx || {}
  let mode = p.fulfillmentMode

  if (mode === 'native_pay' && options.nativePayReady === false) {
    mode = p.fallbackMode || 'contact_service'
  }
  return CTA_BY_MODE[mode] || CTA_BY_MODE.contact_service
}

module.exports = { CARD_BENEFIT_LIMIT, CTA_BY_MODE, fenToYuan, filterActive, toCardItem, ctaOf }
