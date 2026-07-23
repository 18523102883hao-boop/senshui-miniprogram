// 我的会员卡 / 卡包（T14 展示端 / T20 动态码）
// 展示「动态会员码」（每 60 秒刷新，防截图转让）、权益核销状态、退款入口
const request = require('../../../utils/request.js')

const QR_REFRESH = 60 * 1000 // 动态码刷新间隔（须小于 token TTL 90s）

Page({
  data: {
    member: null, // { memberCode, birthday, statusText, expireText }
    benefits: [], // [{ type, name, stateText, done }]
    refundable: false,
    loaded: false,
    qrFallback: false // 未构建 npm（无二维码库）时降级为文本码
  },

  onShow() {
    this.load()
  },

  onHide() {
    this.stopQrLoop()
  },

  onUnload() {
    this.stopQrLoop()
  },

  load() {
    request.callWithLoading('getMemberCard', {}, '加载中')
      .then((d) => {
        if (!d || !d.member) {
          this.setData({ loaded: true, member: null })
          this.stopQrLoop()
          return
        }
        this.setData({
          member: d.member,
          benefits: d.benefits || [],
          refundable: !!d.refundable,
          loaded: true
        })
        this.startQrLoop()
      })
      .catch(() => this.setData({ loaded: true }))
  },

  // 动态会员码：每 60 秒取一次短时效 token 重绘，截图转发即失效
  startQrLoop() {
    this.stopQrLoop()
    this.refreshQr()
    this._qrTimer = setInterval(() => this.refreshQr(), QR_REFRESH)
  },

  stopQrLoop() {
    if (this._qrTimer) { clearInterval(this._qrTimer); this._qrTimer = null }
  },

  refreshQr() {
    request.call('getMemberQr', {})
      .then((d) => { if (d && d.token) this.renderQr(d.token) })
      .catch(() => { /* 取码失败：保留上一次二维码，不打断 */ })
  },

  // 二维码绘制：依赖 weapp-qrcode-canvas-2d（需构建 npm）；未安装则降级为文本码，页面仍可编译运行
  renderQr(text) {
    if (!text) return
    let drawQrcode
    try {
      drawQrcode = require('weapp-qrcode-canvas-2d')
    } catch (e) {
      this.setData({ qrFallback: true })
      return
    }
    const query = wx.createSelectorQuery().in(this)
    query.select('#qrcanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        this.setData({ qrFallback: true })
        return
      }
      const canvas = res[0].node
      const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
      const size = 200
      canvas.width = size * dpr
      canvas.height = size * dpr
      try {
        drawQrcode({ canvas, width: size * dpr, height: size * dpr, text })
      } catch (e) {
        this.setData({ qrFallback: true })
      }
    })
  },

  goBuy() {
    wx.redirectTo({ url: '/pages/member/detail/detail' })
  },

  onRefund() {
    wx.showModal({
      title: '申请退款',
      content: '未核销任一权益可 7 天无理由退款，确认申请？',
      success: (r) => {
        if (!r.confirm) return
        request.callWithLoading('refundMember', {}, '处理中')
          .then(() => {
            wx.showToast({ title: '退款已提交', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 800)
          })
          .catch((err) => wx.showToast({ title: err.message || '退款失败', icon: 'none' }))
      }
    })
  }
})
