// 溪降预约 · 创建（功能扩展 Task 10 补齐）
// 修复与补齐：
//   ① 按所选场次的日期查询，不再只查当天（原来预约次日场次必失败）
//   ② 购票凭证校验：优先用小程序内的溪降票，否则要求手输外部渠道券号
//   ③ 安全须知 + 儿童条件强制确认
//   ④ 预约成功申请订阅消息（拒绝也不影响预约）
const { call, callWithLoading } = require('../../../utils/request')
const { haptic } = require('../../../utils/haptics')
const env = require('../../../env.js')

// 订阅消息模板 ID 由 env.js 配置（后台申请到再填）；为空则跳过申请，不影响预约
function subscribeTmplIds() {
  return (env.subscribeTmplIds && env.subscribeTmplIds.booking) || []
}

const CREEK_SKUS = ['creek_single', 'creek_double', 'creek_child', 'combo_single']
const USABLE = ['unused', 'reserved']

Page({
  data: {
    sessionId: '',
    date: '',
    session: {},
    phone: '',
    // 购票凭证
    hasNativeTicket: false,
    nativeTicketNo: '',
    externalTicketNo: '',
    // 安全确认
    safetyConfirmed: false,
    withChild: false,
    childConfirmed: false,
    submitting: false,
    loading: false
  },

  onLoad(options) {
    const sessionId = (options && options.sessionId) || ''
    if (!sessionId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return Promise.resolve()
    }
    this.setData({ sessionId, date: (options && options.date) || '' })
    return Promise.all([this.loadSession(), this.loadMyTickets()])
  },

  // 按所选场次的日期查询；没传日期才退回今天
  loadSession() {
    const date = this.data.date || new Date().toISOString().split('T')[0]
    this.setData({ loading: true })
    return callWithLoading('listSessions', { date })
      .then((data) => {
        const list = (data && data.sessions) || []
        const session = list.filter((s) => s._id === this.data.sessionId)[0]
        this.setData({ loading: false })
        if (!session) {
          wx.showToast({ title: '场次不存在或已关闭', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 1500)
          return
        }
        this.setData({ session, date: session.date || date })
      })
      .catch((err) => {
        this.setData({ loading: false })
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
      })
  },

  // 查用户有没有小程序内购买的溪降票
  loadMyTickets() {
    return call('getMyTickets', { status: 'unused' })
      .then((d) => {
        const usable = ((d && d.list) || []).filter(
          (t) => t && USABLE.indexOf(t.status) >= 0 && CREEK_SKUS.indexOf(t.sku) >= 0
        )
        if (usable.length) {
          this.setData({ hasNativeTicket: true, nativeTicketNo: usable[0].ticketNo })
        }
      })
      .catch(() => { /* 查不到票不阻断，走手输券号 */ })
  },

  onPhoneInput(e) { this.setData({ phone: e.detail.value }) },
  onExternalTicketInput(e) { this.setData({ externalTicketNo: e.detail.value }) },
  onSafetyToggle() { this.setData({ safetyConfirmed: !this.data.safetyConfirmed }) },
  onWithChildToggle() { this.setData({ withChild: !this.data.withChild, childConfirmed: false }) },
  onChildToggle() { this.setData({ childConfirmed: !this.data.childConfirmed }) },

  goNotice() {
    wx.navigateTo({ url: '/pages/creek-notice/creek-notice' })
  },

  localCheck() {
    const d = this.data
    if (!/^1[3-9]\d{9}$/.test(String(d.phone).trim())) return '请填写正确的手机号'
    // 云端不会凭空造票号，这里必须有真实凭证来源
    if (!d.hasNativeTicket && !String(d.externalTicketNo).trim()) {
      return '请填写已购渠道的券号，或先在小程序购买溪降票'
    }
    if (!d.safetyConfirmed) return '请先阅读并确认溪降安全须知'
    if (d.withChild && !d.childConfirmed) return '携带儿童需确认身高条件并由监护人全程陪同'
    return ''
  },

  onSubmit() {
    if (this.data.submitting) return Promise.resolve()
    const err = this.localCheck()
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return Promise.resolve()
    }

    haptic('light')
    this.setData({ submitting: true })
    return callWithLoading('createBooking', {
      sessionId: this.data.sessionId,
      phone: this.data.phone,
      externalTicketNo: this.data.externalTicketNo,
      withChild: this.data.withChild,
      safetyConfirmed: true
    }, '预约中...')
      .then((data) => {
        haptic('medium')
        // 离线持久化，无网也能出示
        wx.setStorageSync('lastBookingCode', data.code)
        wx.setStorageSync('lastBookingNo', data.bookingNo || '')
        return this.requestSubscribe().then(() => data)
      })
      .then((data) => {
        this.setData({ submitting: false })
        wx.showToast({ title: '预约成功', icon: 'success' })
        wx.redirectTo({ url: '/pages/booking/detail/detail?bookingId=' + data.bookingId })
      })
      .catch((e) => {
        this.setData({ submitting: false })
        wx.showToast({ title: (e && e.message) || '预约失败', icon: 'none' })
      })
  },

  // 订阅消息：拒绝或失败都不影响预约结果
  requestSubscribe() {
    const tmplIds = subscribeTmplIds()
    if (!tmplIds.length || !wx.requestSubscribeMessage) return Promise.resolve()
    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds,
        success: (res) => {
          const accepted = tmplIds.filter((id) => res[id] === 'accept')
          if (!accepted.length) return resolve()
          call('saveSubscribeGrant', { tmplIds: accepted, scene: 'booking' })
            .then(resolve).catch(resolve)
        },
        fail: () => resolve()
      })
    })
  },

  formatDate(dateStr) {
    const date = new Date(dateStr)
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    return (date.getMonth() + 1) + '月' + date.getDate() + '日 周' + weekDays[date.getDay()]
  }
})
