// 员工端 · 溪降场次台账（功能扩展 Task 10）
// 三块能力：各场次余位、前台插单（与线上同一库存池）、当场核销人数台账。
// 权限：云端 checkStaff 二次校验，前端只做展示控制。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

const VERIFY_ROLES = ['front', 'creek', 'admin']
const INSERT_ROLES = ['front', 'admin'] // 只有前台/管理员能插单

function today() {
  const d = new Date()
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

Page({
  data: {
    checked: false,
    allowed: false,
    canInsert: false,
    role: '',
    staffName: '',
    date: today(),
    sessions: [],
    ledger: {},
    loading: false,
    // 插单表单
    insertSessionId: '',
    insertPhone: '',
    insertBoardingNo: '',
    insertTicketNo: '',
    inserting: false
  },

  onShow() {
    return this.checkPermission().then(() => {
      if (this.data.allowed) return this.loadData()
    })
  },

  onPullDownRefresh() {
    return this.loadData().then(() => wx.stopPullDownRefresh())
  },

  checkPermission() {
    return request.call('checkStaff', {})
      .then((d) => {
        const role = (d && d.role) || null
        this.setData({
          checked: true,
          role: role || '',
          staffName: (d && d.name) || '',
          allowed: VERIFY_ROLES.indexOf(role) >= 0,
          canInsert: INSERT_ROLES.indexOf(role) >= 0
        })
      })
      .catch(() => this.setData({ checked: true, allowed: false, canInsert: false }))
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value })
    return this.loadData()
  },

  loadData() {
    this.setData({ loading: true })
    return Promise.all([
      request.call('listSessions', { date: this.data.date }).catch(() => ({ sessions: [] })),
      request.call('getSessionLedger', { date: this.data.date }).catch(() => ({ ledger: {} }))
    ]).then((res) => {
      const s = res[0]
      const l = res[1]
      this.setData({
        sessions: (s && s.sessions) || [],
        ledger: (l && l.ledger) || {},
        loading: false
      })
    })
  },

  onSessionPick(e) {
    haptic('light')
    this.setData({ insertSessionId: e.currentTarget.dataset.id })
  },

  onInsertInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  onInsertSubmit() {
    if (this.data.inserting) return Promise.resolve()
    const d = this.data
    if (!d.insertSessionId) {
      wx.showToast({ title: '请先选择场次', icon: 'none' })
      return Promise.resolve()
    }
    if (!/^1[3-9]\d{9}$/.test(String(d.insertPhone).trim())) {
      wx.showToast({ title: '请填写正确的客人手机号', icon: 'none' })
      return Promise.resolve()
    }
    if (!String(d.insertBoardingNo).trim()) {
      wx.showToast({ title: '请填写上车号码', icon: 'none' })
      return Promise.resolve()
    }

    this.setData({ inserting: true })
    return request.call('frontInsertBooking', {
      sessionId: d.insertSessionId,
      phone: String(d.insertPhone).trim(),
      boardingNo: String(d.insertBoardingNo).trim(),
      ticketNo: String(d.insertTicketNo).trim()
    })
      .then(() => {
        haptic('medium')
        wx.showToast({ title: '插单成功', icon: 'success' })
        this.setData({ inserting: false, insertPhone: '', insertBoardingNo: '', insertTicketNo: '' })
        return this.loadData()
      })
      .catch((err) => {
        this.setData({ inserting: false })
        wx.showToast({ title: (err && err.message) || '插单失败', icon: 'none' })
      })
  },

  goVerify() {
    wx.navigateTo({
      url: '/pages/staff/verify/verify',
      fail: () => wx.showToast({ title: '核销台暂不可用', icon: 'none' })
    })
  }
})
