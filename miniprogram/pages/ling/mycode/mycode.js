// 我的令码（T21）——用户出示动态令码，员工扫码兑换实体↔电子长河令
// 动态刷新（每 60 秒），防截图转让。
const request = require('../../../utils/request.js')

const QR_REFRESH = 60 * 1000

Page({
  data: {
    loaded: false,
    balance: 0,
    qrFallback: false
  },

  onShow() {
    this.load()
  },

  onHide() {
    this.stop()
  },

  onUnload() {
    this.stop()
  },

  load() {
    request.call('getLingBalance', {})
      .then((d) => this.setData({ balance: (d && d.balance) || 0 }))
      .catch(() => {})
    this.setData({ loaded: true })
    this.startLoop()
  },

  startLoop() {
    this.stop()
    this.refresh()
    this._t = setInterval(() => this.refresh(), QR_REFRESH)
  },

  stop() {
    if (this._t) { clearInterval(this._t); this._t = null }
  },

  refresh() {
    request.call('getUserQr', {})
      .then((d) => { if (d && d.token) this.renderQr(d.token) })
      .catch(() => {})
  },

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
    query.select('#lingqr').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) { this.setData({ qrFallback: true }); return }
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
  }
})
