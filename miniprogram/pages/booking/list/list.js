// 溪降预约 - 场次列表
const { call, callWithLoading } = require('../../../utils/request')
const { haptic } = require('../../../utils/haptics')

Page({
  data: {
    selectedDate: '',
    today: '',
    sessions: []
  },

  onLoad() {
    const today = this.formatDateForPicker(new Date())
    this.setData({
      selectedDate: today,
      today: today
    })
    this.loadSessions()
  },

  onPullDownRefresh() {
    this.loadSessions().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载场次列表
  async loadSessions() {
    try {
      const data = await callWithLoading('listSessions', {
        date: this.data.selectedDate,
        status: 'open'
      })
      this.setData({
        sessions: data.sessions || []
      })
    } catch (err) {
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
    }
  },

  // 日期选择变化
  onDateChange(e) {
    haptic('light')
    this.setData({
      selectedDate: e.detail.value
    })
    this.loadSessions()
  },

  // 选择场次
  onSelectSession(e) {
    const sessionId = e.currentTarget.dataset.id
    const session = this.data.sessions.find(s => s._id === sessionId)
    
    if (!session) return
    
    if (session.status !== 'open') {
      wx.showToast({
        title: '该场次已关闭',
        icon: 'none'
      })
      return
    }

    if (session.remaining <= 0) {
      wx.showToast({
        title: '该场次已满',
        icon: 'none'
      })
      return
    }

    haptic('light')
    // 必须带上当前选中的日期：创建页据此查询场次，否则预约非当天场次会查不到
    wx.navigateTo({
      url: `/pages/booking/create/create?sessionId=${sessionId}&date=${this.data.selectedDate}`
    })
  },

  // 跳转我的预约
  goToMyBookings() {
    haptic('light')
    wx.navigateTo({
      url: '/pages/booking/detail/detail'
    })
  },

  // 格式化日期显示
  formatDate(dateStr) {
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const weekDay = weekDays[date.getDay()]
    return `${month}月${day}日 周${weekDay}`
  },

  // 格式化日期为 picker 格式
  formatDateForPicker(date) {
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    return `${year}-${month}-${day}`
  }
})
