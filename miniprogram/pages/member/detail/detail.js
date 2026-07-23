// 会员卡购买页（T13）
// 支付链路：createMemberOrder(云函数下单+云支付统一下单) → wx.requestPayment
//          → 微信异步通知 payCallback(云函数幂等发卡) → 卡包可见
const auth = require('../../../utils/auth.js')
const request = require('../../../utils/request.js')
const { MEMBER_CARD } = require('../../../utils/const.js')
const { fen2yuan } = require('../../../utils/util.js')

Page({
  data: {
    price: fen2yuan(MEMBER_CARD.price),
    benefits: [
      { icon: '令', title: '1000 长河令', desc: '入园核销时发放' },
      { icon: '寿', title: '生日 85 折', desc: '生日当天到店消费享 85 折' },
      { icon: '期', title: '有效期 1 年', desc: '自开卡日起 365 天' }
    ],
    birthday: '',            // MM-DD，购卡必填
    birthdayText: '请选择生日',
    hasCard: false,
    paying: false
  },

  onPickBirthday(e) {
    const val = e.detail.value // 'YYYY-MM-DD'
    const md = val.slice(5)    // 'MM-DD'（生日只取月日）
    const mm = Number(md.slice(0, 2))
    const dd = Number(md.slice(3, 5))
    this.setData({ birthday: md, birthdayText: `${mm} 月 ${dd} 日` })
  },

  onShow() {
    this.checkCard()
  },

  checkCard() {
    request.call('getMemberCard', {})
      .then((d) => this.setData({ hasCard: !!(d && d.member) }))
      .catch(() => {})
  },

  onBuy() {
    if (this.data.hasCard) {
      wx.redirectTo({ url: '/pages/member/card/card' })
      return
    }
    if (this.data.paying) return
    if (!this.data.birthday) {
      wx.showToast({ title: '请先选择生日', icon: 'none' })
      return
    }
    this.setData({ paying: true })

    auth.ensureLogin()
      .then(() => request.callWithLoading('createMemberOrder', { birthday: this.data.birthday }, '下单中'))
      .then((res) => this.requestPayment(res.payment, res.orderId))
      .then(() => {
        wx.showToast({ title: '开卡成功', icon: 'success' })
        setTimeout(() => wx.redirectTo({ url: '/pages/member/card/card' }), 800)
      })
      .catch((err) => {
        const msg = (err && err.errMsg) || (err && err.message) || ''
        if (msg.indexOf('cancel') === -1) {
          wx.showToast({ title: err.message || '支付未完成', icon: 'none' })
        }
      })
      .then(() => this.setData({ paying: false }))
  },

  requestPayment(payment, orderId) {
    return new Promise((resolve, reject) => {
      wx.requestPayment(
        Object.assign({}, payment, {
          success: () => resolve(orderId),
          fail: (e) => reject(e)
        })
      )
    })
  }
})
