// 管家服务（功能扩展 Task 5）
// PRD §11.1：微信客服优先，同时必须提供电话与表单等无障碍替代路径。
// 二维码只有在配置后才渲染，未配置不出现空图。
const env = require('../../env.js')
const { haptic } = require('../../utils/haptics.js')
const { makePhoneCall } = require('../../utils/util.js')
const { getQrcode } = require('../../utils/qrcode.js')

function buildChannels(cfg) {
  const c = cfg || {}
  const qr = getQrcode('concierge')
  const channels = [
    {
      type: 'wechat',
      title: '微信客服',
      desc: '在微信内直接对话，响应最快',
      icon: '/assets/icons/forest/customer-service.png',
      primary: true
    }
  ]
  if (c.phone) {
    channels.push({
      type: 'phone',
      title: '拨打前台电话',
      desc: c.phone,
      icon: '/assets/icons/forest/mine-phone.png'
    })
  }
  // 未配置二维码就不加这一项，避免渲染空图（PRD §11.1）
  // 配置走 env.qrcodes.concierge，由 utils/qrcode.js 统一解析
  if (qr.enabled) {
    channels.push({
      type: 'qrcode',
      title: '添加企业微信管家',
      desc: '长按或点击保存二维码',
      icon: '/assets/icons/forest/activity-scan.png'
    })
  }
  channels.push({
    type: 'form',
    title: '提交咨询表单',
    desc: '留下需求与联系方式，管家会主动联系你',
    icon: '/assets/icons/forest/edit.png'
  })
  return channels
}

// 特色服务（从首页移入：生日/团建/品牌合作属低频需求，不占首屏）
const SERVICES = [
  { key: 'birthday', title: '生日宴请', desc: '在山水间过一个生日', icon: '/assets/icons/forest/activity-reward.png' },
  { key: 'team_building', title: '公司团建', desc: '定制行程与场地', icon: '/assets/icons/forest/booking-people.png' },
  { key: 'brand', title: '品牌合作', desc: '场地拍摄与联名活动', icon: '/assets/icons/forest/activity-badge.png' }
]

Page({
  data: {
    services: SERVICES,
    channels: buildChannels(env.concierge),
    qrcodeUrl: getQrcode('concierge').url,
    serviceHours: (env.concierge && env.concierge.serviceHours) || '',
    phone: (env.concierge && env.concierge.phone) || env.frontDeskPhone || '',
    parkName: (env.park && env.park.name) || '森水长河'
  },

  onChannelTap(e) {
    const type = e.currentTarget.dataset.type
    haptic('light')
    if (type === 'phone') return makePhoneCall(this.data.phone)
    if (type === 'qrcode') return this.onPreviewQrcode()
    if (type === 'form') {
      return wx.navigateTo({
        url: '/pages/service/lead/lead?type=consult',
        fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
      })
    }
    // wechat 渠道由 wxml 的 <button open-type="contact"> 直接触发，无需 JS 处理
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
