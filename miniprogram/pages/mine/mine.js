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
    ]
  },

  onShow() {
    const u = app.globalData.userInfo || null
    const phone = u && u.phone
    this.setData({
      userInfo: u,
      hasPhone: !!phone,
      phoneMask: phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : ''
    })
    this.refresh()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3, theme: 'light' })
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
        const mask = (d && d.phoneMask) || '已登录'
        if (app.globalData.userInfo) app.globalData.userInfo.phone = mask
        this.setData({ hasPhone: true, phoneMask: mask })
        wx.showToast({ title: '登录成功', icon: 'success' })
      })
      .catch((err) => wx.showToast({ title: err.message || '登录失败', icon: 'none' }))
  },

  // 头像：chooseAvatar 可选「微信头像 / 相册 / 拍照」→ 上传云存储 → 持久化
  onChooseAvatar(e) {
    const tempUrl = e.detail && e.detail.avatarUrl
    if (!tempUrl) return
    wx.showLoading({ title: '上传中', mask: true })
    const openid = app.globalData.openid || 'u'
    const cloudPath = 'avatars/' + openid + '_' + Date.now() + '.png'
    wx.cloud.uploadFile({ cloudPath, filePath: tempUrl })
      .then((up) => request.call('updateAvatar', { avatarUrl: up.fileID }).then(() => up.fileID))
      .then((fileID) => {
        if (app.globalData.userInfo) app.globalData.userInfo.avatarUrl = fileID
        this.setData({ userInfo: Object.assign({}, this.data.userInfo || {}, { avatarUrl: fileID }) })
        wx.hideLoading()
        wx.showToast({ title: '头像已更新', icon: 'success' })
      })
      .catch((err) => {
        wx.hideLoading()
        wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
      })
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
    }
  },

  callFront() {
    makePhoneCall(this.data.frontPhone)
  },

  goAgreement() {
    wx.navigateTo({ url: '/pages/legal/agreement/agreement' })
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/legal/privacy/privacy' })
  },

  goStaff() {
    wx.navigateTo({ url: '/pages/staff/entry/entry' })
  }
})
