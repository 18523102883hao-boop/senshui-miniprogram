// sr-contact-card —— 企微直连联系卡（业主 2026-07-25 决策）
//
// 产品取向：预约、生日、团建、品牌合作这类需求，加个企微直接聊
// 比让客户填一堆表单更高效准确。所以此卡是这些场景的**主行动**，
// 表单退为可选的次要入口（传 formRoute 才出现）。
//
// 健壮性：二维码未配置 → 不渲染；配了但图片加载失败 → 自动隐藏只留电话。
// 电话始终可用，保证任何情况下都有联系方式（也是无障碍替代路径）。
const env = require('../../../env.js')
const { getQrcode } = require('../../../utils/qrcode.js')

Component({
  properties: {
    // 二维码场景：concierge | birthday | teamBuilding | brand | welfare | complaint
    scene: { type: String, value: 'concierge' },
    title: { type: String, value: '添加管家，直接沟通' },
    desc: { type: String, value: '长按识别二维码，或直接致电，由工作人员为你安排' },
    // 传了才显示「填写需求表单」次要入口；默认不显示（少让客户填）
    formRoute: { type: String, value: '' },
    formText: { type: String, value: '也可以填写需求表单' },
    theme: { type: String, value: 'light' }
  },
  data: {
    qrEnabled: false,
    qrUrl: '',
    qrLabel: '',
    qrFallback: false,
    phone: '',
    serviceHours: ''
  },
  observers: {
    scene: function (scene) { this.resolve(scene) }
  },
  lifetimes: {
    attached() { this.resolve(this.data.scene) }
  },
  methods: {
    resolve(scene) {
      const qr = getQrcode(scene)
      const c = env.concierge || {}
      this.setData({
        qrEnabled: qr.enabled,
        qrUrl: qr.url,
        qrLabel: qr.label,
        qrFallback: qr.fallback,
        phone: c.phone || env.frontDeskPhone || '',
        serviceHours: c.serviceHours || ''
      })
    },

    // 图片 404 时隐藏二维码区块，只保留电话；否则会留一张裂图
    onQrError() {
      this.setData({ qrEnabled: false })
    },

    onPreview() {
      if (!this.data.qrUrl) return
      wx.previewImage({ urls: [this.data.qrUrl], current: this.data.qrUrl })
    },

    onCall() {
      if (!this.data.phone) return
      wx.makePhoneCall({ phoneNumber: String(this.data.phone) })
    },

    onForm() {
      if (!this.data.formRoute) return
      wx.navigateTo({
        url: this.data.formRoute,
        fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
      })
    }
  }
})
