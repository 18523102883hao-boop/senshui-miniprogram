// 门票中心 · 商品列表（T16 → 功能扩展 Task 6 改造）
// PRD §8.3。原「聚合外部渠道」能力保留为兜底：接口异常或商品全部下架时仍能引导购票。
const request = require('../../utils/request.js')
const { haptic } = require('../../utils/haptics.js')

// 与 cloudfunctions/listTicketProducts/catalog-core.js 保持一致；
// 前端自己再算一遍，兼容云函数旧版本没返回展示字段的情况。
const CTA_BY_MODE = {
  native_pay: { text: '立即购买', action: 'buy' },
  external_channel: { text: '前往官方渠道', action: 'channel' },
  contact_service: { text: '咨询管家', action: 'contact' }
}

const CATEGORIES = [
  { key: '', title: '全部' },
  { key: 'creek', title: '溪降' },
  { key: 'camp', title: '营地' },
  { key: 'combo', title: '套票' }
]

function fenToYuan(fen) {
  const n = Number(fen)
  if (!Number.isInteger(n)) return ''
  const cents = String(Math.abs(n) % 100)
  return Math.floor(Math.abs(n) / 100) + '.' + (cents.length === 1 ? '0' + cents : cents)
}

function ctaOf(product, nativePayReady) {
  const p = product || {}
  let mode = p.fulfillmentMode
  if (mode === 'native_pay' && nativePayReady === false) mode = p.fallbackMode || 'contact_service'
  return CTA_BY_MODE[mode] || CTA_BY_MODE.contact_service
}

function toCard(p, nativePayReady) {
  const sale = p.salePrice || 0
  const showMarket = Number.isInteger(p.marketPrice) && p.marketPrice > sale
  return Object.assign({}, p, {
    priceText: p.priceText || fenToYuan(sale),
    marketPriceText: showMarket ? (p.marketPriceText || fenToYuan(p.marketPrice)) : '',
    benefits: (p.benefits || []).slice(0, 5),
    cta: p.cta || ctaOf(p, nativePayReady)
  })
}

Page({
  data: {
    categories: CATEGORIES,
    category: '',
    products: [],
    loading: false,
    hasError: false,
    nativePayReady: true,
    // 外部渠道兜底（原 T16 能力，后台可通过 getTicketConfig 下发）
    channels: [
      { name: '抖音官方旗舰店', desc: '团购套餐 · 分销优惠', url: '' },
      { name: '美团 / 大众点评', desc: '到店门票套餐', url: '' }
    ],
    upgradeNote: '已购基础票升级套票，可在前台补差价办理，线上线下同价。'
  },

  onLoad() {
    return this.loadProducts()
  },

  onPullDownRefresh() {
    return this.loadProducts().then(() => wx.stopPullDownRefresh())
  },

  onCategoryTap(e) {
    const key = e.currentTarget.dataset.key || ''
    if (key === this.data.category) return Promise.resolve()
    haptic('light')
    this.setData({ category: key, products: [] })
    return this.loadProducts()
  },

  loadProducts() {
    this.setData({ loading: true, hasError: false })
    return request.call('listTicketProducts', { category: this.data.category })
      .then((d) => {
        const ready = !!(d && d.nativePayReady !== false)
        const products = ((d && d.list) || []).map((p) => toCard(p, ready))
        this.setData({ products, nativePayReady: ready, loading: false, hasError: false })
      })
      .catch(() => {
        // 商品拉不到时不能让购票入口彻底失效，保留外部渠道兜底
        this.setData({ loading: false, hasError: true })
      })
  },

  onRetry() {
    return this.loadProducts()
  },

  onProductTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    haptic('light')
    wx.navigateTo({ url: '/pages/ticket/detail/detail?productId=' + encodeURIComponent(id) })
  },

  copyLink(e) {
    const url = e.currentTarget.dataset.url
    if (!url) {
      wx.showToast({ title: '链接整备中', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制，去浏览器打开', icon: 'none' })
    })
  },

  onShareAppMessage() {
    return { title: '森水长河 · 门票与套票', path: '/pages/ticket/ticket' }
  }
})
