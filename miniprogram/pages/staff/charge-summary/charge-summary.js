// 补差价收款 · 全员汇总（管理员 · T20）
// 按员工统计金额，支持今天/本月/全部；复制明细 CSV 到剪贴板供线下算提成
const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')

const RANGES = [
  { key: 'today', label: '今天' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' }
]

Page({
  data: {
    loaded: false,
    denied: false,
    rangeKey: 'today',
    ranges: RANGES,
    byStaff: [],
    grandTotalYuan: '0.00',
    grandCount: 0,
    detail: []
  },

  onLoad() {
    this.load()
  },

  switchRange(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.rangeKey) return
    this.setData({ rangeKey: key })
    this.load()
  },

  computeRange(key) {
    const now = new Date()
    if (key === 'today') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() }
    if (key === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime() }
    return {} // all
  },

  load() {
    const payload = this.computeRange(this.data.rangeKey)
    request.callWithLoading('getChargeSummary', payload, '加载中')
      .then((d) => {
        const byStaff = (d.byStaff || []).map((s) => ({
          staffName: s.staffName || '(未命名)',
          staffNo: s.staffNo || '',
          count: s.count,
          totalYuan: util.fen2yuan(s.total)
        }))
        this.setData({
          loaded: true,
          denied: false,
          byStaff,
          grandTotalYuan: util.fen2yuan(d.grandTotal),
          grandCount: d.grandCount,
          detail: d.detail || []
        })
      })
      .catch((err) => {
        if (err && err.code === 403) {
          this.setData({ loaded: true, denied: true })
        } else {
          wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
        }
      })
  },

  copyCsv() {
    if (!this.data.detail.length) {
      wx.showToast({ title: '暂无明细', icon: 'none' })
      return
    }
    const rows = [['时间', '员工', '工牌', '项目', '金额(元)', '订单号']]
    this.data.detail.forEach((c) => {
      rows.push([
        util.formatDate(c.paidAt, 'YYYY-MM-DD HH:mm'),
        c.staffName || '',
        c.staffNo || '',
        c.itemLabel || '',
        util.fen2yuan(c.amount),
        c.outTradeNo || ''
      ])
    })
    const csv = rows.map((r) => r.join(',')).join('\n')
    wx.setClipboardData({
      data: csv,
      success: () => wx.showToast({ title: '明细已复制，粘贴到表格', icon: 'none' })
    })
  }
})
