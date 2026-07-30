// 内容中心 · 列表（功能扩展 Task 4）
// PRD §10 园区内容中心。分类 → 分页列表 → 详情。
// 弱网策略：成功写缓存，失败读缓存；两者都没有才显示错误态。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

const CATEGORIES = [
  { key: '', title: '全部' },
  { key: 'park_intro', title: '园区介绍' },
  { key: 'activity_story', title: '精彩活动' },
  { key: 'guide', title: '入园攻略' },
  { key: 'service', title: '服务' }
]

const CACHE_PREFIX = 'content_list_'

function cacheKey(category) {
  return CACHE_PREFIX + (category || 'all')
}

Page({
  data: {
    categories: CATEGORIES,
    category: '',
    list: [],
    cursor: 0,
    hasMore: false,
    loading: false,
    loadingMore: false,
    isEmpty: false,
    hasError: false,
    fromCache: false
  },

  onLoad(options) {
    const category = (options && options.category) || ''
    this.setData({ category })
    return this.loadList(true)
  },

  onPullDownRefresh() {
    return this.loadList(true).then(() => wx.stopPullDownRefresh())
  },

  onCategoryTap(e) {
    const key = e.currentTarget.dataset.key || ''
    if (key === this.data.category) return Promise.resolve()
    haptic('light')
    // 切分类必须清空旧数据并从头拉，否则会把上一个分类的内容拼进来
    this.setData({ category: key, list: [], cursor: 0, hasMore: false })
    return this.loadList(true)
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return Promise.resolve()
    return this.loadList(false)
  },

  onRetry() {
    return this.loadList(true)
  },

  loadList(reset) {
    const category = this.data.category
    const cursor = reset ? 0 : this.data.cursor
    this.setData(reset ? { loading: true, hasError: false } : { loadingMore: true })

    return request.call('listArticles', { category, cursor })
      .then((d) => {
        const page = (d && d.list) || []
        const list = reset ? page : this.data.list.concat(page)
        this.setData({
          list,
          cursor: (d && d.nextCursor) || 0,
          hasMore: !!(d && d.hasMore),
          loading: false,
          loadingMore: false,
          hasError: false,
          fromCache: false,
          isEmpty: list.length === 0
        })
        if (reset) wx.setStorageSync(cacheKey(category), list)
      })
      .catch(() => {
        const cached = reset ? wx.getStorageSync(cacheKey(category)) : null
        if (cached && cached.length) {
          // 弱网降级：展示上次看到的内容，并标记来源
          this.setData({
            list: cached, loading: false, loadingMore: false,
            hasError: false, fromCache: true, isEmpty: false, hasMore: false
          })
          return
        }
        this.setData({
          loading: false, loadingMore: false,
          hasError: reset, isEmpty: false, fromCache: false
        })
      })
  },

  onItemTap(e) {
    const slug = e.currentTarget.dataset.slug
    if (!slug) return
    haptic('light')
    wx.navigateTo({ url: '/pages/content/detail/detail?slug=' + encodeURIComponent(slug) })
  },

  onShareAppMessage() {
    const c = this.data.category
    const found = CATEGORIES.filter((x) => x.key === c)[0]
    return {
      title: '森水长河 · ' + ((found && found.title) || '园区内容'),
      path: '/pages/content/list/list?category=' + encodeURIComponent(c)
    }
  }
})
