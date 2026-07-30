const env = require('../../env.js')
const { haptic } = require('../../utils/haptics.js')

const QR_IMAGE = '/images/insurance-purchase-qr.jpg'
const REPORT_PHONE = '4001882892'

Page({
  data: {
    qrImage: QR_IMAGE,
    purchaseUrl: env.links.insurance,
    reportPhoneText: '4001-882-892',
    manualCopyVisible: false
  },

  previewQr() {
    haptic('light')
    wx.previewImage({
      current: this.data.qrImage,
      urls: [this.data.qrImage],
      showmenu: true,
      fail: () => {
        wx.showToast({
          title: '图片预览失败，请稍后重试',
          icon: 'none'
        })
      }
    })
  },

  copyPurchaseLink() {
    haptic('light')
    const purchaseUrl = String(this.data.purchaseUrl || '').trim()
    if (!purchaseUrl) {
      wx.showToast({ title: '投保链接暂未配置', icon: 'none' })
      return
    }
    if (typeof wx.setClipboardData !== 'function') {
      this.showManualCopy()
      return
    }
    wx.setClipboardData({
      data: purchaseUrl,
      success: () => {
        this.setData({ manualCopyVisible: false })
      },
      fail: (error) => {
        console.warn('[insurance] setClipboardData failed', error && error.errMsg)
        this.showManualCopy()
      }
    })
  },

  showManualCopy() {
    this.setData({ manualCopyVisible: true })
    wx.showToast({
      title: '请长按下方链接复制',
      icon: 'none'
    })
  },

  callReport() {
    haptic('light')
    wx.makePhoneCall({ phoneNumber: REPORT_PHONE })
  },

  onShareAppMessage() {
    return {
      title: '森水长河 · 溪降保险购买',
      path: '/pages/insurance/insurance'
    }
  }
})
