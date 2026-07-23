// 商品与服务目录（T22 / T25 Vibe UI）——酒吧 / 小卖部 / 装备租赁 / 服务，供客户查看
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
    loaded: false,
    sections: [],
    activeKey: ''
  },

  onLoad() {
    this.load()
  },

  load() {
    request.call('getCatalog', {})
      .then((d) => {
        const sections = ((d && d.sections) || []).map((s) => ({
          ...s,
          iconPath: SECTION_ICONS[s.key] || SECTION_ICONS.store
        }))
        this.setData({ loaded: true, sections, activeKey: sections.length ? sections[0].key : '' })
      })
      .catch(() => this.setData({ loaded: true }))
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeKey) return
    haptic('light')
    this.setData({ activeKey: key })
  }
})
