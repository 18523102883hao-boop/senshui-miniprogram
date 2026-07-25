// 我的咨询记录（阶段6 · 消费已部署的 getMyServiceLeads）
// 用户提交生日/团建/品牌合作需求后，在这里看进度。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

const TYPE_TEXT = { birthday: '生日宴请', team_building: '公司团建', brand: '品牌合作' }
// 对用户展示的状态口径（内部 CRM 阶段不外露，避免"已流失"这类伤害性文案）
const STATUS_TEXT = {
  new: '已提交',
  contacted: '顾问已联系',
  qualified: '沟通中',
  proposal: '方案已发出',
  won: '已成交',
  lost: '已结束',
  closed: '已结束'
}

Page({
  data: {
    list: [],
    typeText: TYPE_TEXT,
    statusText: STATUS_TEXT,
    loading: true,
    isEmpty: false,
    hasError: false
  },

  onShow() {
    return this.load()
  },

  onPullDownRefresh() {
    return this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({ loading: true, hasError: false })
    return request.call('getMyServiceLeads', {})
      .then((d) => {
        const list = (d && d.list) || []
        this.setData({ list, loading: false, isEmpty: list.length === 0, hasError: false })
      })
      .catch(() => this.setData({ loading: false, hasError: true, isEmpty: false }))
  },

  onRetry() {
    return this.load()
  },

  goNew() {
    haptic('light')
    wx.navigateTo({
      url: '/pages/service/detail/detail?type=birthday',
      fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
    })
  },

  goConcierge() {
    wx.navigateTo({
      url: '/pages/concierge/concierge',
      fail: () => wx.showToast({ title: '请联系前台', icon: 'none' })
    })
  }
})
