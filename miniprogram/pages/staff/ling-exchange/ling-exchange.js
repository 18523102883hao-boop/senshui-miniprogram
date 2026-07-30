// 长河令兑换台（员工端 · T21）
// 扫客户令码 → 显示电子令余额 → 选方向(实体↔电子) + 输数量 → 兑换
const request = require('../../../utils/request.js')

Page({
  data: {
    loaded: false,
    canDo: false,
    role: null,
    code: '',
    customer: null,     // { userLabel, balance, dailyLimit, dailyUsed, dailyRemaining }
    direction: 'p2d',   // p2d 实体转电子 / d2p 电子兑实体
    amount: '',
    busy: false
  },

  onShow() {
    this.check()
  },

  check() {
    request.call('checkStaff', {})
      .then((d) => {
        const role = (d && d.role) || null
        this.setData({ loaded: true, role, canDo: role === 'front' || role === 'admin' })
      })
      .catch(() => this.setData({ loaded: true, canDo: false }))
  },

  scan() {
    wx.scanCode({
      onlyFromCamera: true,
      success: (res) => this.resolve(res.result),
      fail: () => {}
    })
  },

  resolve(code) {
    return request.callWithLoading('resolveUserForLing', { code }, '查询中')
      .then((d) => {
        const hasQuota = [d.dailyLimit, d.dailyUsed, d.dailyRemaining]
          .every((value) => Number.isFinite(Number(value)))
        this.setData({
          code,
          customer: {
            userLabel: d.userLabel,
            balance: d.balance,
            role: d.role || this.data.role,
            roleLabel: (d.role || this.data.role) === 'admin' ? '管理员' : '普通员工',
            hasQuota,
            dailyLimit: hasQuota ? Number(d.dailyLimit) : 0,
            dailyUsed: hasQuota ? Number(d.dailyUsed) : 0,
            dailyRemaining: hasQuota ? Number(d.dailyRemaining) : 0,
            dayKey: d.dayKey || ''
          },
          amount: ''
        })
      })
      .catch((err) => wx.showToast({ title: err.message || '无效客户码', icon: 'none' }))
  },

  setDir(e) {
    this.setData({ direction: e.currentTarget.dataset.dir })
  },

  onAmount(e) {
    this.setData({ amount: e.detail.value })
  },

  submit() {
    if (this.data.busy) return
    if (!this.data.code) { wx.showToast({ title: '请先扫客户令码', icon: 'none' }); return }
    const n = parseInt(this.data.amount, 10)
    if (!(n > 0)) { wx.showToast({ title: '请输入数量', icon: 'none' }); return }
    const remaining = this.data.customer && Number(this.data.customer.dailyRemaining)
    if (this.data.direction === 'p2d' && this.data.customer && this.data.customer.hasQuota && n > remaining) {
      wx.showToast({ title: `超出今日剩余额度 ${remaining} 令`, icon: 'none' })
      return
    }

    this.setData({ busy: true })
    return request.callWithLoading('exchangeLing', { code: this.data.code, amount: n, direction: this.data.direction }, '处理中')
      .then((d) => {
        wx.showToast({ title: '兑换成功', icon: 'success' })
        const hasQuota = [d.dailyLimit, d.dailyUsed, d.dailyRemaining]
          .every((value) => Number.isFinite(Number(value)))
        this.setData({
          customer: Object.assign({}, this.data.customer, {
            balance: d.balance,
            hasQuota: hasQuota || this.data.customer.hasQuota,
            dailyLimit: hasQuota ? Number(d.dailyLimit) : this.data.customer.dailyLimit,
            dailyUsed: hasQuota ? Number(d.dailyUsed) : this.data.customer.dailyUsed,
            dailyRemaining: hasQuota ? Number(d.dailyRemaining) : this.data.customer.dailyRemaining,
            dayKey: d.dayKey || this.data.customer.dayKey
          }),
          amount: ''
        })
      })
      .catch((err) => wx.showToast({ title: err.message || '兑换失败', icon: 'none' }))
      .then(() => this.setData({ busy: false }))
  }
})
