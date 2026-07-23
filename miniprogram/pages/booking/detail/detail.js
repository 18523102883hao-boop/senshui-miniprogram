// 溪降预约 - 我的预约
const { call, callWithLoading } = require('../../../utils/request')

Page({
  data: {
    bookings: [],
    showQr: false,
    qrTicket: '',
    qrCode: '',
    qrFallback: false
  },

  onLoad() {
    this.loadBookings()
  },

  onShow() {
    // 从其他页面返回时刷新
    this.loadBookings()
  },

  onPullDownRefresh() {
    this.loadBookings().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载预约列表
  async loadBookings() {
    try {
      const data = await callWithLoading('getMyBookings')
      this.setData({
        bookings: data.bookings || []
      })
    } catch (err) {
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
    }
  },

  // 改签
  onChange(e) {
    const bookingId = e.currentTarget.dataset.id
    wx.showToast({
      title: '改签功能开发中',
      icon: 'none'
    })
    // TODO: 跳转到改签页面
  },

  // 取消预约
  onCancel(e) {
    const bookingId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认取消',
      content: '取消后名额将释放，确定要取消预约吗？',
      confirmText: '确定',
      cancelText: '再想想',
      success: async (res) => {
        if (res.confirm) {
          try {
            await callWithLoading('cancelBooking', { bookingId }, '取消中...')
            wx.showToast({
              title: '已取消',
              icon: 'success'
            })
            this.loadBookings()
          } catch (err) {
            wx.showToast({
              title: err.message || '取消失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 跳转到预约页面
  goToBooking() {
    wx.navigateTo({
      url: '/pages/booking/list/list'
    })
  },

  // 出示核销二维码（内容为票号，供检票员扫码；未构建 npm 时降级为文本）
  openQr(e) {
    const { ticket, code } = e.currentTarget.dataset
    this.setData({ showQr: true, qrTicket: ticket, qrCode: code, qrFallback: false }, () => {
      this.renderBookingQr(ticket)
    })
  },

  closeQr() {
    this.setData({ showQr: false })
  },

  noop() {},

  renderBookingQr(text) {
    if (!text) return
    let drawQrcode
    try {
      drawQrcode = require('weapp-qrcode-canvas-2d')
    } catch (e) {
      this.setData({ qrFallback: true })
      return
    }
    const query = wx.createSelectorQuery().in(this)
    query.select('#bookingQr').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        this.setData({ qrFallback: true })
        return
      }
      const canvas = res[0].node
      const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
      const size = 220
      canvas.width = size * dpr
      canvas.height = size * dpr
      try {
        drawQrcode({ canvas, width: size * dpr, height: size * dpr, text })
      } catch (e) {
        this.setData({ qrFallback: true })
      }
    })
  },

  // 获取状态文本
  getStatusText(status) {
    const statusMap = {
      reserved: '已预约',
      verified: '已核销',
      cancelled: '已取消',
      noshow: '未到'
    }
    return statusMap[status] || status
  },

  // 格式化日期
  formatDate(dateStr) {
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const weekDay = weekDays[date.getDay()]
    return `${month}月${day}日 周${weekDay}`
  }
})
