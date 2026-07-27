// 管家服务（功能扩展 Task 5）
// 业主 2026-07-26：去掉微信客服与咨询表单，客户直接加管家企业微信。
// 联系方式统一由 sr-contact-card 承载（二维码 + 致电），
// 二维码未配置或加载失败会自动降级为只留电话，不出现空图。
const env = require('../../env.js')
const { haptic } = require('../../utils/haptics.js')
const { getQrcode } = require('../../utils/qrcode.js')

// 特色服务（从首页移入：生日/团建/品牌合作属低频需求，不占首屏）
const SERVICES = [
  { key: 'birthday', title: '生日宴请', desc: '在山水间过一个生日', icon: '/assets/icons/forest/activity-reward.png' },
  { key: 'team_building', title: '公司团建', desc: '定制行程与场地', icon: '/assets/icons/forest/booking-people.png' },
  { key: 'brand', title: '品牌合作', desc: '场地拍摄与联名活动', icon: '/assets/icons/forest/activity-badge.png' }
]

Page({
  data: {
    services: SERVICES,
    qrcodeUrl: getQrcode('concierge').url,
    serviceHours: (env.concierge && env.concierge.serviceHours) || '',
    phone: (env.concierge && env.concierge.phone) || env.frontDeskPhone || '',
    parkName: (env.park && env.park.name) || '森水长河'
  },

  onServiceTap(e) {
    const type = e.currentTarget.dataset.type
    haptic('light')
    wx.navigateTo({
      url: '/pages/service/detail/detail?type=' + encodeURIComponent(type),
      fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
    })
  },

  onPreviewQrcode() {
    const url = this.data.qrcodeUrl
    if (!url) return wx.showToast({ title: '二维码待配置', icon: 'none' })
    wx.previewImage({ urls: [url], current: url })
  },

  onShareAppMessage() {
    return { title: '森水长河 · 管家服务', path: '/pages/concierge/concierge' }
  }
})
