// 我的反馈记录（原 Task 16）
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

const TYPE_TEXT = { complaint: '投诉', suggestion: '建议', praise: '表扬', lost_found: '失物招领' }
// 只说进展，不承诺时限（业务方未确认，PRD §28.9）
const STATUS_TEXT = { submitted: '已提交', processing: '处理中', resolved: '已处理', closed: '已关闭' }

Page({
  data: {
    list: [],
    typeText: TYPE_TEXT,
    statusText: STATUS_TEXT,
    loading: true,
    isEmpty: false,
    hasError: false
  },

  onShow() { return this.load() },

  onPullDownRefresh() { return this.load().then(() => wx.stopPullDownRefresh()) },

  load() {
    this.setData({ loading: true, hasError: false })
    return request.call('getMyFeedback', {})
      .then((d) => {
        const list = (d && d.list) || []
        this.setData({ list, loading: false, isEmpty: list.length === 0, hasError: false })
      })
      .catch(() => this.setData({ loading: false, hasError: true, isEmpty: false }))
  },

  onRetry() { return this.load() },

  goCreate() {
    haptic('light')
    wx.navigateTo({ url: '/pages/feedback/create/create' })
  }
})
