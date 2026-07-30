// 团队预约详情（功能扩展 Task 9）
// PRD §9.4。分享给同行人只带 shareToken，URL 中不出现手机号。
const request = require('../../../utils/request.js')

const STATUS_TEXT = {
  pending: '待确认',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '未通过'
}

const CANCELLABLE = ['pending', 'confirmed']

Page({
  data: {
    reservationId: '',
    shareToken: '',
    reservation: null,
    statusText: '',
    readonly: false,
    canCancel: false,
    loading: false,
    hasError: false,
    cancelling: false
  },

  onLoad(options) {
    this.setData({
      reservationId: (options && options.id) || '',
      shareToken: (options && options.token) || ''
    })
    return this.loadDetail()
  },

  loadDetail() {
    this.setData({ loading: true, hasError: false })
    const payload = this.data.reservationId
      ? { reservationId: this.data.reservationId }
      : { shareToken: this.data.shareToken }
    return request.call('getVisitReservation', payload)
      .then((d) => {
        const r = (d && d.reservation) || null
        if (!r) throw new Error('empty')
        this.setData({
          reservation: r,
          statusText: STATUS_TEXT[r.status] || r.status,
          readonly: !!(d && d.readonly),
          canCancel: !(d && d.readonly) && CANCELLABLE.indexOf(r.status) >= 0,
          loading: false
        })
      })
      .catch(() => this.setData({ loading: false, hasError: true }))
  },

  onRetry() {
    return this.loadDetail()
  },

  onCancel() {
    if (!this.data.canCancel || this.data.cancelling) return Promise.resolve()
    return new Promise((resolve) => {
      wx.showModal({
        title: '取消预约',
        content: '取消后名额将释放，如需再来请重新提交。',
        success: (res) => {
          if (!res.confirm) return resolve()
          this.doCancel().then(resolve)
        },
        fail: () => resolve()
      })
    })
  },

  doCancel() {
    this.setData({ cancelling: true })
    return request.call('cancelVisitReservation', { reservationId: this.data.reservationId })
      .then(() => {
        this.setData({ cancelling: false, canCancel: false })
        wx.showToast({ title: '已取消', icon: 'success' })
        return this.loadDetail()
      })
      .catch((err) => {
        this.setData({ cancelling: false })
        wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' })
      })
  },

  copyShare() {
    const token = (this.data.reservation && this.data.reservation.shareToken) || this.data.shareToken
    if (!token) return wx.showToast({ title: '暂无分享链接', icon: 'none' })
    wx.setClipboardData({
      data: '/pages/reservation/detail/detail?token=' + token,
      success: () => wx.showToast({ title: '已复制，可发给同行人', icon: 'none' })
    })
  },

  goConcierge() {
    wx.navigateTo({
      url: '/pages/concierge/concierge',
      fail: () => wx.showToast({ title: '请联系前台', icon: 'none' })
    })
  },

  onShareAppMessage() {
    const r = this.data.reservation || {}
    const token = r.shareToken || this.data.shareToken || ''
    return {
      title: '森水长河 · ' + (r.teamName || '团队预约'),
      // 只带 token，不带 id / 手机号（PRD §9.3）
      path: '/pages/reservation/detail/detail?token=' + encodeURIComponent(token)
    }
  }
})
