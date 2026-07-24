// 我的票夹（功能扩展 Task 7）
// PRD §8.6：按状态分组；只有未使用/已占用的票能出入园码。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

const TABS = [
  { key: 'unused', title: '待使用' },
  { key: 'used', title: '已使用' },
  { key: 'refunded', title: '已退款' },
  { key: 'expired', title: '已过期' }
]

// 出码只对这些状态开放
const CODE_ENABLED = ['unused', 'reserved']

Page({
  data: {
    tabs: TABS,
    activeTab: 'unused',
    list: [],
    visibleList: [],
    loading: false,
    isEmpty: false,
    hasError: false,
    codeToken: '',
    codeTicketNo: '',
    codeExpiresIn: 0
  },

  onLoad() {
    return this.loadTickets()
  },

  onShow() {
    if (this.data.list.length) this.loadTickets()
  },

  onPullDownRefresh() {
    return this.loadTickets().then(() => wx.stopPullDownRefresh())
  },

  loadTickets() {
    this.setData({ loading: true, hasError: false })
    return request.call('getMyTickets', {})
      .then((d) => {
        const list = (d && d.list) || []
        this.setData({ list, loading: false, hasError: false })
        this.applyTab(this.data.activeTab)
      })
      .catch(() => this.setData({ loading: false, hasError: true }))
  },

  onRetry() {
    return this.loadTickets()
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key
    haptic('light')
    this.applyTab(key)
  },

  applyTab(key) {
    // reserved 归入待使用；refund_pending 归入已退款一栏便于用户追踪
    const groups = {
      unused: ['unused', 'reserved'],
      used: ['used'],
      refunded: ['refunded', 'refund_pending'],
      expired: ['expired', 'void']
    }
    const allow = groups[key] || []
    const visibleList = this.data.list.filter((t) => allow.indexOf(t.status) >= 0)
    this.setData({
      activeTab: key,
      visibleList,
      isEmpty: visibleList.length === 0,
      codeToken: '',
      codeTicketNo: ''
    })
  },

  onTicketTap(e) {
    const no = e.currentTarget.dataset.no
    const ticket = this.data.list.filter((t) => t.ticketNo === no)[0]
    if (!ticket) return Promise.resolve()
    if (CODE_ENABLED.indexOf(ticket.status) < 0) {
      wx.showToast({ title: '该票券不可再入园', icon: 'none' })
      return Promise.resolve()
    }
    haptic('light')
    return request.call('getTicketCode', { ticketNo: no })
      .then((d) => {
        this.setData({
          codeToken: (d && d.token) || '',
          codeTicketNo: no,
          codeExpiresIn: (d && d.expiresIn) || 90
        })
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '获取入园码失败', icon: 'none' }))
  },

  closeCode() {
    this.setData({ codeToken: '', codeTicketNo: '' })
  },

  // 弹层内部点击不穿透到遮罩
  noop() {},

  goBuy() {
    wx.navigateTo({
      url: '/pages/ticket/ticket',
      fail: () => wx.showToast({ title: '请从首页进入购票', icon: 'none' })
    })
  }
})
