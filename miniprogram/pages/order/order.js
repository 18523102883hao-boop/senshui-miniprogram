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
    hasError: false,
    paying: false,
    cancellingNo: ''
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

  // 待支付订单继续支付：重新调起微信支付
  // 注意不能跳支付结果页——那页是「已付款、等回调」的场景，轮询的还是门票；
  // 待支付订单从没付过钱，跳过去只会永远停在「支付确认中」。
  onPay(e) {
    if (this.data.paying || this.data.cancellingNo) return Promise.resolve()
    const no = e.currentTarget.dataset.no
    const type = e.currentTarget.dataset.type
    haptic('light')
    this.setData({ paying: true })

    return request.call('repayOrder', { outTradeNo: no })
      .then((d) => new Promise((resolve, reject) => {
        wx.requestPayment(Object.assign({}, d.payment, { success: resolve, fail: reject }))
      }))
      .then(() => {
        this.setData({ paying: false })
        // 门票支付后要等出票，进结果页轮询；其余类型直接刷新列表即可
        if (type === 'ticket_order') {
          wx.navigateTo({
            url: '/pages/ticket/result/result?outTradeNo=' + encodeURIComponent(no),
            fail: () => this.load()
          })
          return
        }
        wx.showToast({ title: '支付成功', icon: 'success' })
        return this.load()
      })
      .catch((err) => {
        this.setData({ paying: false })
        // 用户主动取消支付：静默，不弹失败
        if (err && err.errMsg && err.errMsg.indexOf('cancel') > -1) return
        wx.showToast({ title: (err && err.message) || '支付失败，请稍后重试', icon: 'none' })
        // 订单状态已变（已支付/已关闭）时刷新列表，避免按钮还停在「继续支付」
        if (err && err.code === 409) return this.load()
      })
  },

  onCancelOrder(e) {
    if (this.data.paying || this.data.cancellingNo) return Promise.resolve()
    const no = e.currentTarget.dataset.no
    if (!no) return Promise.resolve()
    haptic('light')

    return new Promise((resolve) => {
      wx.showModal({
        title: '取消待支付订单？',
        content: '取消后该订单将关闭；如仍需购买，请重新下单。',
        confirmText: '确认取消',
        cancelText: '暂不取消',
        success: (modal) => {
          if (!modal.confirm) {
            resolve()
            return
          }

          this.setData({ cancellingNo: no })
          request.call('cancelPendingOrder', { outTradeNo: no })
            .then(() => {
              haptic('heavy')
              wx.showToast({ title: '订单已取消', icon: 'success' })
              return this.load()
            })
            .catch((err) => {
              wx.showToast({ title: (err && err.message) || '取消失败，请稍后重试', icon: 'none' })
              // 订单已支付或被其他请求处理时，刷新服务端最新状态。
              if (err && err.code === 409) return this.load()
            })
            .then(
              () => { this.setData({ cancellingNo: '' }); resolve() },
              () => { this.setData({ cancellingNo: '' }); resolve() }
            )
        },
        fail: resolve
      })
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

  onInvoice(e) {
    const no = e.currentTarget.dataset.no
    const target = e.currentTarget.dataset.target === 'detail' ? 'detail' : 'apply'
    haptic('light')
    wx.navigateTo({
      url: `/pages/invoice/${target}/${target}?outTradeNo=` + encodeURIComponent(no),
      fail: () => wx.showToast({ title: '开票服务暂不可用', icon: 'none' })
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
