// 补差价收款（员工端 · T20）
// 发起收款单 → 生成小程序码给客户扫 → 轮询到账 → 展示我的收款合计与明细
const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')

const POLL_INTERVAL = 3000 // 轮询到账间隔
const POLL_MAX = 100       // 最多轮询次数（约 5 分钟）

Page({
  data: {
    loaded: false,
    role: null,
    staffName: '',
    isAdmin: false,
    canCharge: false,

    items: [],          // 预设升级项 [{id,label,price,priceYuan}]
    selectedId: '',
    manualAmount: '',   // 手输金额（元）
    manualLabel: '',

    qr: null,           // { chargeId, qrBase64, amountYuan, itemLabel }
    waiting: false,     // 是否在等待客户支付

    today: { totalYuan: '0.00', count: 0 },
    all: { totalYuan: '0.00', count: 0 },
    list: []
  },

  onShow() {
    this.check()
  },

  onHide() {
    this.stopPolling()
  },

  onUnload() {
    this.stopPolling()
  },

  check() {
    request.call('checkStaff', {})
      .then((d) => {
        const role = (d && d.role) || null
        const canCharge = role === 'front' || role === 'admin'
        this.setData({
          loaded: true,
          role,
          staffName: (d && d.name) || '',
          isAdmin: role === 'admin',
          canCharge
        })
        if (canCharge) {
          this.loadItems()
          this.loadMyCharges()
        }
      })
      .catch(() => this.setData({ loaded: true, role: null }))
  },

  loadItems() {
    request.call('getUpgradeItems', {})
      .then((d) => {
        const items = ((d && d.items) || []).map((i) => ({
          id: i.id,
          label: i.label,
          price: i.price,
          priceYuan: util.fen2yuan(i.price)
        }))
        this.setData({ items })
      })
      .catch(() => { /* 价目缺失可纯手输 */ })
  },

  loadMyCharges() {
    request.call('listMyCharges', {})
      .then((d) => {
        const list = ((d && d.list) || []).map((c) => ({
          amountYuan: util.fen2yuan(c.amount),
          itemLabel: c.itemLabel,
          timeText: util.formatDate(c.paidAt, 'MM-DD HH:mm'),
          outTradeNo: c.outTradeNo
        }))
        this.setData({
          today: { totalYuan: util.fen2yuan(d.today.total), count: d.today.count },
          all: { totalYuan: util.fen2yuan(d.all.total), count: d.all.count },
          list
        })
      })
      .catch(() => { /* 忽略，保留占位 */ })
  },

  selectItem(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedId: id === this.data.selectedId ? '' : id, manualAmount: '', manualLabel: '' })
  },

  onManualAmount(e) {
    this.setData({ manualAmount: e.detail.value, selectedId: '' })
  },

  onManualLabel(e) {
    this.setData({ manualLabel: e.detail.value })
  },

  createCharge() {
    const { selectedId, manualAmount, manualLabel } = this.data
    let payload
    if (selectedId) {
      payload = { itemId: selectedId }
    } else {
      const yuan = parseFloat(manualAmount)
      if (!(yuan > 0)) {
        wx.showToast({ title: '请选择项目或输入金额', icon: 'none' })
        return
      }
      const amount = Math.round(yuan * 100)
      payload = { amount, itemLabel: manualLabel || '票种升级' }
    }

    request.callWithLoading('createUpgradeCharge', payload, '生成中')
      .then((d) => {
        if (!d.qrBase64) {
          wx.showModal({ title: '收款码生成失败', content: '请稍后重试；若持续失败，检查小程序是否已发布对应版本。', showCancel: false })
          return
        }
        this.setData({
          qr: {
            chargeId: d.chargeId,
            qrBase64: d.qrBase64,
            amountYuan: util.fen2yuan(d.amount),
            itemLabel: d.itemLabel
          },
          waiting: true
        })
        this.startPolling(d.chargeId)
      })
      .catch((err) => wx.showToast({ title: err.message || '生成失败', icon: 'none' }))
  },

  startPolling(chargeId) {
    this.stopPolling()
    this._pollCount = 0
    const tick = () => {
      this._pollCount += 1
      if (this._pollCount > POLL_MAX) { this.stopPolling(); return }
      request.call('getUpgradeCharge', { chargeId })
        .then((d) => {
          if (!this.data.waiting) return
          if (d.status === 'paid') {
            this.stopPolling()
            wx.showToast({ title: '已到账 ¥' + this.data.qr.amountYuan, icon: 'success' })
            this.setData({ qr: null, waiting: false, selectedId: '', manualAmount: '', manualLabel: '' })
            this.loadMyCharges()
          } else if (d.status === 'expired' || d.status === 'cancelled') {
            this.stopPolling()
            this.setData({ waiting: false })
          } else {
            this._pollTimer = setTimeout(tick, POLL_INTERVAL)
          }
        })
        .catch(() => { this._pollTimer = setTimeout(tick, POLL_INTERVAL) })
    }
    this._pollTimer = setTimeout(tick, POLL_INTERVAL)
  },

  stopPolling() {
    if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null }
  },

  closeQr() {
    this.stopPolling()
    this.setData({ qr: null, waiting: false })
    this.loadMyCharges()
  },

  goSummary() {
    wx.navigateTo({ url: '/pages/staff/charge-summary/charge-summary' })
  }
})
