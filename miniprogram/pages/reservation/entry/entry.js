// 预约中心入口（功能扩展 Task 9）
// PRD §9.1：聚合团队预约与溪降场次预约；溪降沿用既有 booking 页面。
const { haptic } = require('../../../utils/haptics.js')

const ENTRIES = [
  {
    key: 'team',
    title: '团队 / 多人到园预约',
    desc: '公司团建、学校研学、亲友聚会',
    icon: '/assets/icons/forest/booking-people.png',
    route: '/pages/reservation/create/create'
  },
  {
    key: 'mine',
    title: '我的预约',
    desc: '查看、分享或取消已提交的预约',
    icon: '/assets/icons/forest/history.png',
    route: '/pages/reservation/mine/mine'
  }
]

Page({
  data: {
    entries: ENTRIES
  },

  onEntryTap(e) {
    const key = e.currentTarget.dataset.key
    const entry = ENTRIES.filter((x) => x.key === key)[0]
    if (!entry) return
    haptic('light')
    wx.navigateTo({
      url: entry.route,
      fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
    })
  },

  onShareAppMessage() {
    return { title: '森水长河 · 预约到园', path: '/pages/reservation/entry/entry' }
  }
})
