// 线上购票聚合页（T16）
// V1 不自建票务：聚合抖音/美团官方链接 + 价目公示 + 升级补差说明。
// 小程序内不直接跳外部 H5，采用「复制链接到浏览器/抖音打开」方案（最稳，无需业务域名备案）。
const request = require('../../utils/request.js')

Page({
  data: {
    channels: [
      { name: '抖音官方旗舰店', desc: '团购套餐 · 分销优惠', url: '' },
      { name: '美团 / 大众点评', desc: '到店门票套餐', url: '' }
    ],
    priceList: [
      { name: '门票 · 单人', price: '以现场公示为准' },
      { name: '溪降套票', price: '以现场公示为准' }
    ],
    upgradeNote: '已购基础票升级套票，可在前台补差价办理，线上线下同价。分销优惠详见各渠道页。'
  },

  onLoad() {
    // TODO：渠道链接/价目由后台 notices 或独立配置集合下发，见 specs/T16
    request.call('getTicketConfig', {})
      .then((d) => {
        if (!d) return
        this.setData({
          channels: d.channels || this.data.channels,
          priceList: d.priceList || this.data.priceList,
          upgradeNote: d.upgradeNote || this.data.upgradeNote
        })
      })
      .catch(() => {})
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
  }
})
