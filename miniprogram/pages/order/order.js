// 我的订单（原 Task 13 订单中心整合）
// 会员卡 / 补差价 / 门票三类订单统一展示，底层字段差异由云函数适配。
const request = require('../../utils/request.js')
const { haptic } = require('../../utils/haptics.js')

const TABS = [
  { key: '', title: '全部' },
  { key: 'pending', title: '待支付' },
  { key: 'paid', title: '已完成' },
  { key: 'refund', title: '退款' }
]

Page({
  data: {
    tabs: TABS,
    tab: '',
    list: [],
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
    return request.call('getMyOrders', { tab: this.data.tab })
      .then((d) => {
        const list = (d && d.list) || []
        this.setData({ list, loading: false, isEmpty: list.length === 0, hasError: false })
      })
      .catch(() => this.setData({ loading: false, hasError: true, isEmpty: false }))
  },

  onRetry() {
    return this.load()
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key || ''
    if (key === this.data.tab) return Promise.resolve()
    haptic('light')
    this.setData({ tab: key, list: [] })
    return this.load()
  },

  // 待支付的门票订单可继续支付
  onPay(e) {
    const no = e.currentTarget.dataset.no
    haptic('light')
    wx.navigateTo({
      url: '/pages/ticket/result/result?outTradeNo=' + encodeURIComponent(no),
      fail: () => wx.showToast({ title: '请稍后重试', icon: 'none' })
    })
  },

  onRefund(e) {
    const no = e.currentTarget.dataset.no
    haptic('light')
    wx.navigateTo({
      url: '/pages/refund/detail/detail?outTradeNo=' + encodeURIComponent(no),
      fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
    })
  },

  goBuy() {
    haptic('light')
    wx.navigateTo({
      url: '/pages/ticket/ticket',
      fail: () => wx.switchTab({ url: '/pages/index/index' })
    })
  }
})
