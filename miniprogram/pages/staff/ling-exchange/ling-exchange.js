// 长河令兑换台（员工端 · T21）
// 扫客户令码 → 显示电子令余额 → 选方向(实体↔电子) + 输数量 → 兑换
const request = require('../../../utils/request.js')

Page({
  data: {
    loaded: false,
    canDo: false,
    code: '',
    customer: null,     // { userLabel, balance }
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
        this.setData({ loaded: true, canDo: role === 'front' || role === 'admin' })
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
    request.callWithLoading('resolveUserForLing', { code }, '查询中')
      .then((d) => {
        this.setData({ code, customer: { userLabel: d.userLabel, balance: d.balance }, amount: '' })
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

    this.setData({ busy: true })
    request.callWithLoading('exchangeLing', { code: this.data.code, amount: n, direction: this.data.direction }, '处理中')
      .then((d) => {
        wx.showToast({ title: '兑换成功', icon: 'success' })
        this.setData({ customer: Object.assign({}, this.data.customer, { balance: d.balance }), amount: '' })
      })
      .catch((err) => wx.showToast({ title: err.message || '兑换失败', icon: 'none' }))
      .then(() => this.setData({ busy: false }))
  }
})
