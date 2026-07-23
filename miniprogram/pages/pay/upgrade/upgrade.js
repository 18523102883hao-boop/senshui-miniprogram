// 补差价支付（客户端 · T20）
// 客户扫员工出示的小程序码进入：解析 chargeId → 展示项目/金额 → 确认支付 → 成功页
const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')

Page({
  data: {
    loaded: false,
    chargeId: '',
    amountYuan: '',
    itemLabel: '',
    staffName: '',
    status: '',        // pending / paid / expired / cancelled / notfound
    paying: false,
    errorMsg: ''
  },

  onLoad(options) {
    // 扫小程序码：options.scene 为编码后的 chargeId；开发编译可直接用 options.chargeId
    let chargeId = ''
    if (options.scene) {
      chargeId = decodeURIComponent(options.scene)
    } else if (options.chargeId) {
      chargeId = options.chargeId
    }
    if (!chargeId) {
      this.setData({ loaded: true, status: 'notfound', errorMsg: '未识别到收款单' })
      return
    }
    this.setData({ chargeId })
    this.loadCharge()
  },

  loadCharge() {
    request.call('getUpgradeCharge', { chargeId: this.data.chargeId })
      .then((d) => {
        this.setData({
          loaded: true,
          amountYuan: util.fen2yuan(d.amount),
          itemLabel: d.itemLabel,
          staffName: d.staffName,
          status: d.status
        })
      })
      .catch((err) => {
        this.setData({ loaded: true, status: 'notfound', errorMsg: (err && err.message) || '收款单不存在' })
      })
  },

  pay() {
    if (this.data.paying) return
    this.setData({ paying: true })
    request.call('payUpgradeCharge', { chargeId: this.data.chargeId })
      .then((d) => new Promise((resolve, reject) => {
        wx.requestPayment(Object.assign({}, d.payment, { success: resolve, fail: reject }))
      }))
      .then(() => {
        this.setData({ status: 'paid', paying: false })
      })
      .catch((err) => {
        this.setData({ paying: false })
        // 用户主动取消支付：静默
        if (err && err.errMsg && err.errMsg.indexOf('cancel') > -1) return
        wx.showToast({ title: (err && err.message) || (err && err.errMsg) || '支付失败', icon: 'none' })
        // 业务态错误（已支付/过期）刷新展示
        if (err && err.code) this.loadCharge()
      })
  }
})
