// 内容中心 · 详情（功能扩展 Task 4）
// PRD §10。结构化区块渲染，不做任何 HTML 注入；未知区块类型直接丢弃。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')
const { makePhoneCall } = require('../../../utils/util.js')

// 渲染器白名单：只有这几种类型在 wxml 里有对应模板
const BLOCK_TYPES = ['hero', 'text', 'image', 'gallery', 'list', 'notice', 'feature_grid', 'service_list', 'timeline', 'faq', 'cta']

// CTA 只允许跳到这些页面，防止运营配置把用户导到员工端或不存在的页面
const CTA_ROUTES = [
  '/pages/ticket/ticket',
  '/pages/reservation/entry/entry',
  '/pages/service/detail/detail',
  '/pages/guide/guide',
  '/pages/concierge/concierge',
  '/pages/member/detail/detail',
  '/pages/content/list/list',
  '/pages/catalog/catalog',
  '/pages/creek-notice/creek-notice',
  '/pages/upgrade-info/upgrade-info'
]

const CACHE_PREFIX = 'content_detail_'

function sanitizeBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && BLOCK_TYPES.indexOf(b.type) >= 0)
    .map((b) => ({ type: b.type, data: b.data || {} }))
}

Page({
  data: {
    slug: '',
    article: null,
    blocks: [],
    loading: false,
    hasError: false,
    fromCache: false
  },

  onLoad(options) {
    const slug = (options && options.slug) || ''
    const id = (options && options.id) || ''
    this.setData({ slug, articleId: id })
    return this.loadArticle()
  },

  onRetry() {
    return this.loadArticle()
  },

  loadArticle() {
    const slug = this.data.slug
    const payload = slug ? { slug } : { id: this.data.articleId }
    this.setData({ loading: true, hasError: false })

    return request.call('getArticle', payload)
      .then((d) => {
        const article = (d && d.article) || null
        if (!article) throw new Error('empty')
        this.applyArticle(article, false)
        wx.setStorageSync(CACHE_PREFIX + (slug || article.id), article)
      })
      .catch(() => {
        const cached = wx.getStorageSync(CACHE_PREFIX + (slug || this.data.articleId))
        if (cached) {
          this.applyArticle(cached, true)
          return
        }
        this.setData({ loading: false, hasError: true })
      })
  },

  applyArticle(article, fromCache) {
    this.setData({
      article,
      blocks: sanitizeBlocks(article.blocks),
      loading: false,
      hasError: false,
      fromCache: !!fromCache
    })
    if (article.title) wx.setNavigationBarTitle({ title: article.title })
  },

  // CTA：路由白名单 + 系统能力（拨号 / 导航）
  onCtaTap(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10)
    const block = this.data.blocks[index]
    if (!block || block.type !== 'cta') return
    const action = block.data.action || {}
    haptic('light')

    if (action.type === 'phone') {
      if (!action.phone) return wx.showToast({ title: '暂无联系电话', icon: 'none' })
      return makePhoneCall(action.phone)
    }

    if (action.type === 'location') {
      // 坐标未配置时不调用，避免把用户导到 (0,0)
      if (!action.latitude || !action.longitude) {
        return wx.showToast({ title: '位置信息待完善', icon: 'none' })
      }
      return wx.openLocation({
        latitude: Number(action.latitude),
        longitude: Number(action.longitude),
        name: action.name || '森水长河',
        address: action.address || ''
      })
    }

    if (action.type === 'route') {
      if (CTA_ROUTES.indexOf(action.route) < 0) {
        return wx.showToast({ title: '该入口暂不可用', icon: 'none' })
      }
      return wx.navigateTo({
        url: action.route,
        fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
      })
    }

    wx.showToast({ title: '该入口暂不可用', icon: 'none' })
  },

  onShareAppMessage() {
    const a = this.data.article || {}
    return {
      title: a.title || '森水长河',
      path: '/pages/content/detail/detail?slug=' + encodeURIComponent(this.data.slug || a.slug || '')
    }
  }
})
