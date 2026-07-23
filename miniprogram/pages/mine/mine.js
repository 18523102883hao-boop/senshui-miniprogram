// 我的（T15）——个人中心
const app = getApp()
const auth = require('../../utils/auth.js')
const request = require('../../utils/request.js')
const env = require('../../env.js')
const { makePhoneCall } = require('../../utils/util.js')
const { haptic } = require('../../utils/haptics.js')

Page({
  data: {
    userInfo: null,
    hasPhone: false,
    phoneMask: '',
    member: null, // { status, expireText }
    frontPhone: env.frontDeskPhone,
    grid: [
      { key: 'coupon', title: '我的卡券', sub: '', icon: '/assets/icons/forest/mine-coupon.png' },
      { key: 'ling', title: '长河令', sub: '', icon: '/assets/icons/forest/activity-token.png' },
      { key: 'lingcode', title: '我的令码', sub: '', icon: '/assets/icons/forest/activity-scan.png' },
      { key: 'order', title: '我的订单', sub: '', icon: '/assets/icons/forest/mine-orders.png' }
      // { key: 'booking', title: '我的预约', sub: '' } // 溪降预约暂不开放，后续恢复；导航逻辑(onGrid)保留
    ]
  },

  onShow() {
    this.setData({ userInfo: app.globalData.userInfo })
    this.refresh()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2, theme: 'light' })
    }
  },

  refresh() {
    // 会员卡状态
    request.call('getMemberCard', {})
      .then((d) => {
        if (d && d.member) {
          this.setData({ 'member': { status: d.member.status, expireText: d.member.expireText } })
        }
      })
      .catch(() => {})
    // 令余额 → 填入宫格
    request.call('getLingBalance', {})
      .then((d) => {
        const grid = this.data.grid.slice()
        grid[1].sub = ((d && d.balance) || 0) + ' 令'
        this.setData({ grid })
      })
      .catch(() => {})
  },

  // 手机号授权（延后到此处或下单时）
  onGetPhone(e) {
    if (!e.detail || !e.detail.code) {
      wx.showToast({ title: '已取消授权', icon: 'none' })
      return
    }
    auth.bindPhone(e.detail.code)
      .then((d) => {
        this.setData({ hasPhone: true, phoneMask: (d && d.phoneMask) || '已绑定' })
        wx.showToast({ title: '绑定成功', icon: 'success' })
      })
      .catch((err) => wx.showToast({ title: err.message || '绑定失败', icon: 'none' }))
  },

  goMember() {
    haptic('light')
    const url = this.data.member ? '/pages/member/card/card' : '/pages/member/detail/detail'
    wx.navigateTo({ url })
  },

  onGrid(e) {
    haptic('light')
    const key = e.currentTarget.dataset.key
    if (key === 'ling') {
      wx.switchTab({ url: '/pages/ling/ling' })
    } else if (key === 'lingcode') {
      wx.navigateTo({ url: '/pages/ling/mycode/mycode' })
    } else if (key === 'coupon') {
      wx.navigateTo({ url: '/pages/coupon/coupon' })
    } else if (key === 'order') {
      wx.navigateTo({ url: '/pages/order/order' })
    } else if (key === 'booking') {
      wx.navigateTo({ url: '/pages/booking/list/list?tab=mine' })
    }
  },

  callFront() {
    makePhoneCall(this.data.frontPhone)
  },

  goStaff() {
    wx.navigateTo({ url: '/pages/staff/entry/entry' })
  }
})
