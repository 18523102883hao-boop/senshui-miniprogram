// 商品与服务目录（T22 / Vibe UI v2.0 改造）
// 酒吧 / 小卖部 / 装备租赁 / 服务价目公示。
// 改造点：补错误态（原来失败会永远停在「加载中」）、统一状态组件、加下单联系入口。
const request = require('../../utils/request.js')
const { haptic } = require('../../utils/haptics.js')

// 分类图标（浅色页 forest 套）
const SECTION_ICONS = {
  bar: '/assets/icons/forest/shop-beer.png',
  store: '/assets/icons/forest/home-store.png',
  rental: '/assets/icons/forest/shop-rental.png',
  service: '/assets/icons/forest/shop-package.png'
}

Page({
  data: {
    loading: true,
    hasError: false,
    isEmpty: false,
    sections: [],
    activeKey: ''
  },

  onLoad() {
    return this.load()
  },

  onPullDownRefresh() {
    return this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({ loading: true, hasError: false })
    return request.call('getCatalog', {})
      .then((d) => {
        const sections = ((d && d.sections) || []).map((s) => Object.assign({}, s, {
          iconPath: SECTION_ICONS[s.key] || SECTION_ICONS.store
        }))
        this.setData({
          loading: false,
          hasError: false,
          sections,
          isEmpty: sections.length === 0,
          activeKey: sections.length ? sections[0].key : ''
        })
      })
      // 原实现 catch 后只置 loaded，页面会停在「加载中」；现在明确给错误态可重试
      .catch(() => this.setData({ loading: false, hasError: true, isEmpty: false }))
  },

  onRetry() {
    return this.load()
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeKey) return
    haptic('light')
    this.setData({ activeKey: key })
  }
})
