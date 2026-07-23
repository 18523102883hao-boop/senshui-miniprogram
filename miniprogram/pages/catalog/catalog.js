// 商品与服务目录（T22）——酒吧 / 小卖部 / 装备租赁 / 服务，供客户查看
const request = require('../../utils/request.js')

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
        const sections = (d && d.sections) || []
        this.setData({ loaded: true, sections, activeKey: sections.length ? sections[0].key : '' })
      })
      .catch(() => this.setData({ loaded: true }))
  },

  switchTab(e) {
    this.setData({ activeKey: e.currentTarget.dataset.key })
  }
})
