// 特色服务详情（功能扩展 Task 11）
// PRD §12.1-12.3：三种服务共用一个页面，内容走结构化文章区块，拉不到用本地兜底介绍。
const request = require('../../../utils/request.js')
const env = require('../../../env.js')
const { haptic } = require('../../../utils/haptics.js')
const { makePhoneCall } = require('../../../utils/util.js')
const { getQrcode } = require('../../../utils/qrcode.js')

const BLOCK_TYPES = ['hero', 'text', 'image', 'gallery', 'list', 'notice', 'feature_grid', 'service_list', 'timeline', 'faq', 'cta']

// 本地兜底：云端文章还没配时也要有能读的内容，且不承诺未确认的服务能力
const SERVICES = {
  birthday: {
    title: '生日宴请',
    slug: 'service-birthday',
    intro: '在山水间过一个生日。场地布置、餐食与活动可按人数和预算定制，具体方案由管家一对一沟通确认。',
    points: ['可按人数定制场地与餐食', '支持布置与拍摄协调', '活动安排与园区项目结合']
  },
  team_building: {
    title: '公司团建',
    slug: 'service-team-building',
    intro: '半天到两天的团队行程都可以安排。场地、餐饮、活动与住宿组合方式由管家按你的目标给方案。',
    points: ['行程与动线按团队规模安排', '餐饮与场地可组合', '溪降、擂台等项目可纳入行程']
  },
  brand: {
    title: '品牌合作',
    slug: 'service-brand',
    intro: '场地拍摄、联名活动与内容共创。欢迎带着想法来聊，具体合作方式与档期以商务沟通为准。',
    points: ['峡谷、溪流、营地等实景场地', '可协调拍摄与活动档期', '联名与内容共创可谈']
  }
}

function sanitizeBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && BLOCK_TYPES.indexOf(b.type) >= 0)
    .map((b) => ({ type: b.type, data: b.data || {} }))
}

Page({
  data: {
    type: '',
    title: '特色服务',
    fallbackIntro: '',
    points: [],
    blocks: [],
    loading: false,
    hasError: false,
    qrScene: 'concierge',
    // 企微直连优先（业主 2026-07-25）：加顾问微信比填表更高效
    contactFirst: true,
    frontPhone: env.frontDeskPhone
  },

  onLoad(options) {
    const type = (options && options.type) || ''
    const svc = SERVICES[type]
    // 服务类型 → 二维码场景（env.qrcodes 的键）
    const QR_SCENE = { birthday: 'birthday', team_building: 'teamBuilding', brand: 'brand' }
    this.setData({
      type,
      qrScene: QR_SCENE[type] || 'concierge',
      title: (svc && svc.title) || '特色服务',
      fallbackIntro: (svc && svc.intro) || '园区可提供生日、团建与品牌合作等定制服务，具体安排请咨询管家。',
      points: (svc && svc.points) || []
    })
    if (svc) wx.setNavigationBarTitle({ title: svc.title })
    return this.loadContent()
  },

  loadContent() {
    const svc = SERVICES[this.data.type]
    if (!svc) return Promise.resolve()
    this.setData({ loading: true })
    return request.call('getArticle', { slug: svc.slug })
      .then((d) => {
        const article = d && d.article
        this.setData({
          blocks: article ? sanitizeBlocks(article.blocks) : [],
          loading: false,
          hasError: false
        })
      })
      .catch(() => {
        // 云端没配文章不算错误，本地兜底内容已经可读
        this.setData({ loading: false, hasError: false, blocks: [] })
      })
  },

  // 底部主 CTA：滚到联系卡；二维码还没配时直接拨号，避免滚过去是空的
  onContact() {
    haptic('light')
    const qr = getQrcode(this.data.qrScene)
    if (!qr.enabled) return makePhoneCall(this.data.frontPhone)
    wx.pageScrollTo({ selector: '.cc', duration: 300, fail: () => {} })
  },

  goLead() {
    haptic('light')
    wx.navigateTo({
      url: '/pages/service/lead/lead?type=' + encodeURIComponent(this.data.type),
      fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
    })
  },

  goConcierge() {
    wx.navigateTo({
      url: '/pages/concierge/concierge',
      fail: () => wx.showToast({ title: '请联系前台', icon: 'none' })
    })
  },

  onCallFront() {
    makePhoneCall(this.data.frontPhone)
  },

  onShareAppMessage() {
    return {
      title: '森水长河 · ' + this.data.title,
      path: '/pages/service/detail/detail?type=' + encodeURIComponent(this.data.type)
    }
  }
})
