// sr-qrcode —— 企业微信/客服二维码区块（Vibe UI v2.0）
// 关键约束：未配置的场景**整块不渲染**，不出现空白框或裂图。
// 业主陆续提供二维码时，只需改 env.js 的 qrcodes，页面无需改动。
const { getQrcode } = require('../../../utils/qrcode.js')

Component({
  properties: {
    // concierge | birthday | teamBuilding | brand | welfare | complaint
    scene: { type: String, value: 'concierge' },
    title: { type: String, value: '' },   // 不传则用场景默认名
    desc: { type: String, value: '长按识别或点击放大，添加后由专人对接' },
    theme: { type: String, value: 'light' }
  },
  data: { enabled: false, url: '', label: '', fallback: false },
  observers: {
    scene: function (scene) { this.resolve(scene) }
  },
  lifetimes: {
    attached() { this.resolve(this.data.scene) }
  },
  methods: {
    resolve(scene) {
      const r = getQrcode(scene)
      this.setData({ enabled: r.enabled, url: r.url, label: r.label, fallback: r.fallback })
    },
    onPreview() {
      if (!this.data.url) return
      wx.previewImage({ urls: [this.data.url], current: this.data.url })
    }
  }
})
