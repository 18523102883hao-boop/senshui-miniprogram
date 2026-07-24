// 团队预约创建（功能扩展 Task 9）
// PRD §9.2。前端校验只是体验，规则以云端 createVisitReservation 为准。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

function pad(n) { return n < 10 ? '0' + n : '' + n }

function fmtDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function genIdempotencyKey() {
  return 'vr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

const DEFAULT_TEAM_TYPES = [
  { key: 'company', title: '公司团建' },
  { key: 'school', title: '学校研学' },
  { key: 'family', title: '家庭亲友' },
  { key: 'club', title: '俱乐部 / 社群' },
  { key: 'other', title: '其他' }
]

Page({
  data: {
    config: null,
    teamTypes: DEFAULT_TEAM_TYPES,
    minDate: '',
    maxDate: '',
    notice: '',
    form: {
      visitDate: '',
      teamType: 'company',
      teamName: '',
      partySize: '',
      contactName: '',
      contactPhone: '',
      remark: '',
      privacyAgreed: false
    },
    idempotencyKey: '',
    loading: false,
    submitting: false,
    hasError: false
  },

  onLoad() {
    this.setData({ idempotencyKey: genIdempotencyKey() })
    return this.loadConfig()
  },

  loadConfig() {
    this.setData({ loading: true, hasError: false })
    return request.call('getReservationConfig', {})
      .then((d) => {
        const config = (d && d.config) || {}
        const today = new Date()
        const max = new Date(today.getTime() + (config.advanceDays || 30) * 24 * 3600 * 1000)
        this.setData({
          config,
          teamTypes: config.teamTypes || DEFAULT_TEAM_TYPES,
          notice: config.notice || '',
          minDate: fmtDate(today),
          maxDate: fmtDate(max),
          loading: false
        })
      })
      .catch(() => this.setData({ loading: false, hasError: true }))
  },

  onRetry() {
    return this.loadConfig()
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ 'form.visitDate': e.detail.value })
  },

  onTeamTypeTap(e) {
    haptic('light')
    this.setData({ 'form.teamType': e.currentTarget.dataset.key })
  },

  onPrivacyToggle() {
    this.setData({ 'form.privacyAgreed': !this.data.form.privacyAgreed })
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/legal/privacy/privacy' })
  },

  // 前端快速校验：拦住明显错误，减少一次往返
  localCheck() {
    const f = this.data.form
    const cfg = this.data.config || {}
    if (!f.visitDate) return '请选择到访日期'
    if (!String(f.teamName).trim()) return '请填写团队名称'
    const size = parseInt(f.partySize, 10)
    if (!size || size < (cfg.minPartySize || 1)) return '团队预约人数不少于 ' + (cfg.minPartySize || 1) + ' 人'
    if (cfg.maxPartySize && size > cfg.maxPartySize) return '单次预约不超过 ' + cfg.maxPartySize + ' 人'
    if (!String(f.contactName).trim()) return '请填写联系人姓名'
    if (!/^1\d{10}$/.test(String(f.contactPhone).trim())) return '请填写正确的联系手机号'
    if (!f.privacyAgreed) return '请先阅读并同意隐私政策'
    return ''
  },

  onSubmit() {
    if (this.data.submitting) return Promise.resolve()
    const err = this.localCheck()
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return Promise.resolve()
    }

    this.setData({ submitting: true })
    const f = this.data.form
    return request.call('createVisitReservation', {
      form: Object.assign({}, f, { partySize: parseInt(f.partySize, 10) }),
      idempotencyKey: this.data.idempotencyKey // 重试复用，云端据此不重复建单
    })
      .then((d) => {
        this.setData({ submitting: false })
        const id = (d && d.reservationId) || ''
        if (d && d.needsManual) {
          wx.showToast({ title: '已提交，管家会联系你确认', icon: 'none' })
        }
        wx.redirectTo({ url: '/pages/reservation/detail/detail?id=' + encodeURIComponent(id) })
      })
      .catch((err2) => {
        this.setData({ submitting: false })
        // 重复预约（409）也给出明确指引
        wx.showToast({ title: (err2 && err2.message) || '提交失败，请重试', icon: 'none' })
      })
  }
})
