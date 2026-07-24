// 员工模式入口（T10）——工牌绑定 + 角色路由
// 权限：未绑定/未审批不可见任何员工功能页
const request = require('../../../utils/request.js')

const ROLE_TEXT = {
  front: '前台',
  creek: '溪降检票',
  bar: '酒吧 / 小卖部',
  admin: '管理员'
}

Page({
  data: {
    loaded: false,
    role: null,
    staffName: '',
    roleText: '',
    form: { name: '', phone: '', inviteCode: '' }
  },

  onShow() {
    this.check()
  },

  check() {
    request.call('checkStaff', {})
      .then((d) => {
        const role = (d && d.role) || null
        this.setData({
          loaded: true,
          role,
          staffName: (d && d.name) || '',
          roleText: role ? (ROLE_TEXT[role] || role) : ''
        })
      })
      .catch(() => this.setData({ loaded: true, role: null }))
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  bind() {
    const { name, phone, inviteCode } = this.data.form
    if (!name || !phone || !inviteCode) {
      wx.showToast({ title: '请填写姓名、手机号和口令', icon: 'none' })
      return
    }
    request.callWithLoading('bindStaff', { name, phone, inviteCode }, '提交中')
      .then(() => {
        wx.showToast({ title: '登记成功', icon: 'success' })
        this.check()
      })
      .catch((err) => wx.showToast({ title: err.message || '登记失败', icon: 'none' }))
  },

  goCharge() {
    wx.navigateTo({ url: '/pages/staff/charge/charge' })
  },

  goMaps() {
    wx.navigateTo({ url: '/pages/staff/maps/maps' })
  },

  goLingExchange() {
    wx.navigateTo({ url: '/pages/staff/ling-exchange/ling-exchange' })
  },

  goVerify() {
    wx.navigateTo({ url: '/pages/staff/verify/verify' })
  },

  // 门票核销（前台 / 溪降 / 管理员）
  goTicketVerify() {
    wx.navigateTo({ url: '/pages/staff/ticket-verify/ticket-verify' })
  },

  goCreek() {
    wx.navigateTo({ url: '/pages/staff/creek/creek' })
  }
})
