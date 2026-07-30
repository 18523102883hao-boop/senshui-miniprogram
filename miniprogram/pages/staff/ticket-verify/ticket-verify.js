// 员工端 · 门票核销（功能扩展 Task 8）
// PRD §8.7：扫码或手输 → 预览票券 → 二次确认才核销，避免误扫直接销票。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

Page({
  data: {
    allowed: false,
    checked: false,
    staffName: '',
    role: '',
    input: '',
    lastToken: '', // 扫到的原始码，确认核销时原样回传
    ticket: null,
    verified: false,
    canVerify: false,
    errorMsg: '',
    submitting: false
  },

  onShow() {
    return this.checkPermission()
  },

  checkPermission() {
    return request.call('checkStaff', {})
      .then((d) => {
        const role = (d && d.role) || null
        this.setData({
          checked: true,
          allowed: ['front', 'creek', 'admin'].indexOf(role) >= 0,
          role: role || '',
          staffName: (d && d.name) || ''
        })
      })
      .catch(() => this.setData({ checked: true, allowed: false }))
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  onScan() {
    return new Promise((resolve) => {
      wx.scanCode({
        onlyFromCamera: false,
        success: (res) => {
          haptic('light')
          this.query(res.result).then(resolve)
        },
        fail: () => resolve()
      })
    })
  },

  onManualQuery() {
    const v = (this.data.input || '').trim()
    if (!v) {
      wx.showToast({ title: '请输入票号', icon: 'none' })
      return Promise.resolve()
    }
    return this.query(v)
  },

  // 预览：只查不核销
  query(token) {
    this.setData({ errorMsg: '', verified: false, lastToken: token })
    return request.call('verifyTicket', { token, ticketNo: token, confirm: false })
      .then((d) => {
        this.setData({
          ticket: (d && d.ticket) || null,
          canVerify: !!(d && d.canVerify),
          errorMsg: ''
        })
      })
      .catch((err) => {
        // 失败时保留已有票券信息，只展示原因（PRD §20）
        const raw = err && err.raw && err.raw.data
        this.setData({
          errorMsg: (err && err.message) || '查询失败',
          ticket: (raw && raw.ticket) || this.data.ticket,
          canVerify: false
        })
      })
  },

  onConfirm() {
    if (this.data.submitting) return Promise.resolve()
    this.setData({ submitting: true, errorMsg: '' })
    return request.call('verifyTicket', { token: this.data.lastToken, ticketNo: this.data.lastToken, confirm: true })
      .then((d) => {
        haptic('medium')
        this.setData({
          verified: !!(d && d.verified),
          ticket: (d && d.ticket) || this.data.ticket,
          canVerify: false,
          submitting: false
        })
        wx.showToast({ title: '核销成功', icon: 'success' })
      })
      .catch((err) => {
        this.setData({ submitting: false, errorMsg: (err && err.message) || '核销失败' })
      })
  },

  onReset() {
    this.setData({ ticket: null, verified: false, canVerify: false, errorMsg: '', input: '', lastToken: '' })
  }
})
