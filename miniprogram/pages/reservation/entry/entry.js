// 预约中心（Vibe UI v2.0 · 企微直连优先）
// 业主 2026-07-25 决策：团队到园这类需求，加企微/打电话比让客户填表更高效准确。
// 因此首屏是「联系管家」，自助表单退为次要入口（能力保留，不删）。
const env = require('../../../utils/../env.js')
const { haptic } = require('../../../utils/haptics.js')
const { makePhoneCall } = require('../../../utils/util.js')

const ENTRIES = [
  {
    key: 'team',
    title: '自助提交预约需求',
    desc: '填写日期、人数与联系方式，管家会回电确认',
    icon: '/assets/icons/forest/booking-people.png',
    route: '/pages/reservation/create/create'
  },
  {
    key: 'mine',
    title: '我的预约',
    desc: '查看、分享或取消已提交的预约',
    icon: '/assets/icons/forest/history.png',
    route: '/pages/reservation/mine/mine'
  }
]

Page({
  data: {
    // 企微直连优先（业主决策）
    contactFirst: true,
    contactScene: 'concierge',
    phone: env.frontDeskPhone,
    entries: ENTRIES
  },

  onCall() {
    haptic('light')
    makePhoneCall(this.data.phone)
  },

  onEntryTap(e) {
    const key = e.currentTarget.dataset.key
    const entry = ENTRIES.filter((x) => x.key === key)[0]
    if (!entry) return
    haptic('light')
    wx.navigateTo({
      url: entry.route,
      fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
    })
  },

  onShareAppMessage() {
    return { title: '森水长河 · 团队预约', path: '/pages/reservation/entry/entry' }
  }
})
