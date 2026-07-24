// 门票商品详情（功能扩展 Task 6）
// PRD §8.4：适用人群、包含/不包含、有效期、预约、退款、安全限制、限购、客服、底部固定购买栏。
const request = require('../../../utils/request.js')
const env = require('../../../env.js')
const { haptic } = require('../../../utils/haptics.js')
const { makePhoneCall } = require('../../../utils/util.js')

const CTA_BY_MODE = {
  native_pay: { text: '立即购买', action: 'buy' },
  external_channel: { text: '前往官方渠道', action: 'channel' },
  contact_service: { text: '咨询管家', action: 'contact' }
}

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

Page({
  data: {
    productId: '',
    product: null,
    cta: null,
    loading: false,
    hasError: false,
    frontPhone: env.frontDeskPhone
  },

  onLoad(options) {
    this.setData({ productId: (options && options.productId) || '' })
    return this.loadProduct()
  },

  onRetry() {
    return this.loadProduct()
  },

  loadProduct() {
    this.setData({ loading: true, hasError: false })
    return request.call('getTicketProduct', { productId: this.data.productId })
      .then((d) => {
        const raw = d && d.product
        if (!raw) throw new Error('empty')
        const ready = !!(d && d.nativePayReady !== false)
        const sale = raw.salePrice || 0
        const showMarket = Number.isInteger(raw.marketPrice) && raw.marketPrice > sale
        const product = Object.assign({}, raw, {
          priceText: raw.priceText || fenToYuan(sale),
          marketPriceText: showMarket ? (raw.marketPriceText || fenToYuan(raw.marketPrice)) : '',
          benefits: raw.benefits || [],
          exclusions: raw.exclusions || [],
          restrictions: raw.restrictions || []
        })
        this.setData({
          product,
          cta: raw.cta || ctaOf(raw, ready),
          loading: false,
          hasError: false
        })
        if (product.name) wx.setNavigationBarTitle({ title: product.name })
      })
      .catch(() => this.setData({ loading: false, hasError: true }))
  },

  // 底部固定栏：按履约模式分发（PRD §8.2）
  onCtaTap() {
    const p = this.data.product
    const cta = this.data.cta
    if (!p || !cta) return
    haptic('medium')

    if (cta.action === 'buy') {
      return wx.navigateTo({
        url: '/pages/ticket/checkout/checkout?productId=' + encodeURIComponent(p.productId || this.data.productId),
        fail: () => wx.showToast({ title: '在线下单即将开放，可先咨询管家', icon: 'none' })
      })
    }

    if (cta.action === 'channel') {
      const url = (p.externalChannel && p.externalChannel.url) || ''
      if (!url) return wx.showToast({ title: '渠道链接整备中', icon: 'none' })
      return wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: '链接已复制，去浏览器打开', icon: 'none' })
      })
    }

    // contact：走线索表单，带上商品来源便于跟进
    wx.navigateTo({
      url: '/pages/service/lead/lead?type=ticket&sku=' + encodeURIComponent(p.sku || ''),
      fail: () => wx.navigateTo({
        url: '/pages/concierge/concierge',
        fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
      })
    })
  },

  onCallFront() {
    makePhoneCall(this.data.frontPhone)
  },

  onShareAppMessage() {
    const p = this.data.product || {}
    return {
      title: p.name ? '森水长河 · ' + p.name : '森水长河 · 门票',
      path: '/pages/ticket/detail/detail?productId=' + encodeURIComponent(this.data.productId)
    }
  }
})
