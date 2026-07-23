// 溪降预约 - 创建预约
const { call, callWithLoading } = require('../../../utils/request')

Page({
  data: {
    sessionId: '',
    session: {},
    phone: ''
  },

  onLoad(options) {
    if (!options.sessionId) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({
      sessionId: options.sessionId
    })
    this.loadSession()
  },

  // 加载场次信息
  async loadSession() {
    try {
      const data = await callWithLoading('listSessions', {
        date: new Date().toISOString().split('T')[0]
      })
      
      const session = data.sessions.find(s => s._id === this.data.sessionId)
      if (!session) {
        wx.showToast({
          title: '场次不存在',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }

      this.setData({ session })
    } catch (err) {
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
    }
  },

  // 手机号输入
  onPhoneInput(e) {
    this.setData({
      phone: e.detail.value
    })
  },

  // 提交预约
  async onSubmit() {
    const { phone, sessionId } = this.data

    // 校验手机号
    if (!phone || phone.length !== 11) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: '手机号格式不正确',
        icon: 'none'
      })
      return
    }

    try {
      const data = await callWithLoading('createBooking', {
        sessionId,
        phone
      }, '预约中...')

      // 保存预约码到本地（离线持久化）
      wx.setStorageSync('lastBookingCode', data.code)
      wx.setStorageSync('lastBookingTicketNo', data.ticketNo)

      wx.showToast({
        title: '预约成功',
        icon: 'success'
      })

      // 跳转到预约详情页
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/booking/detail/detail?bookingId=${data.bookingId}`
        })
      }, 1500)
    } catch (err) {
      wx.showToast({
        title: err.message || '预约失败',
        icon: 'none'
      })
    }
  },

  // 格式化日期
  formatDate(dateStr) {
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const weekDay = weekDays[date.getDay()]
    return `${month}月${day}日 周${weekDay}`
  }
})
