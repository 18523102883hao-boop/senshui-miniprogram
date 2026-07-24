// 服务线索表单（功能扩展 Task 11）
// 一个页面 + 一份 schema 支撑三种服务，字段随类型变化，不写三套逻辑。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

// 与 cloudfunctions/createServiceLead/lead-core.js 的 SCHEMAS 对应
const COMMON_FIELDS = [
  { key: 'contactName', label: '联系人', type: 'text', required: true, maxLength: 20 },
  { key: 'contactPhone', label: '联系手机', type: 'phone', required: true },
  { key: 'budget', label: '预算区间', type: 'text', required: false, maxLength: 40, placeholder: '选填' },
  { key: 'remark', label: '补充说明', type: 'textarea', required: false, maxLength: 200, placeholder: '选填' }
]

const SCHEMAS = {
  birthday: {
    title: '生日宴请咨询',
    fields: [
      { key: 'birthdayDate', label: '生日日期', type: 'date', required: true },
      { key: 'partySize', label: '预计人数', type: 'number', required: true },
      { key: 'planPreference', label: '偏好方案', type: 'text', required: false, maxLength: 40, placeholder: '选填' }
    ].concat(COMMON_FIELDS)
  },
  team_building: {
    title: '公司团建咨询',
    fields: [
      { key: 'company', label: '公司/组织', type: 'text', required: true, maxLength: 40 },
      { key: 'visitDate', label: '预计日期', type: 'date', required: true },
      { key: 'partySize', label: '预计人数', type: 'number', required: true },
      { key: 'goal', label: '团建目标', type: 'text', required: true, maxLength: 60, placeholder: '如：团队协作' },
      { key: 'needs', label: '餐饮/会议需求', type: 'textarea', required: false, maxLength: 200, placeholder: '选填' }
    ].concat(COMMON_FIELDS)
  },
  brand: {
    title: '品牌合作咨询',
    fields: [
      { key: 'brandName', label: '品牌/机构', type: 'text', required: true, maxLength: 40 },
      { key: 'cooperationType', label: '合作类型', type: 'text', required: true, maxLength: 40, placeholder: '如：场地拍摄' },
      { key: 'requirement', label: '需求描述', type: 'textarea', required: true, maxLength: 300 },
      { key: 'expectDate', label: '期望时间', type: 'date', required: false }
    ].concat(COMMON_FIELDS)
  }
}

function genKey() {
  return 'sl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

Page({
  data: {
    type: '',
    title: '服务咨询',
    fields: [],
    form: { privacyAgreed: false },
    idempotencyKey: '',
    submitting: false,
    submitted: false
  },

  onLoad(options) {
    const type = (options && options.type) || 'birthday'
    const schema = SCHEMAS[type] || SCHEMAS.birthday
    this.setData({
      type: SCHEMAS[type] ? type : 'birthday',
      title: schema.title,
      fields: schema.fields,
      idempotencyKey: genKey()
    })
    wx.setNavigationBarTitle({ title: schema.title })
    return Promise.resolve()
  },

  onFieldInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ ['form.' + key]: e.detail.value })
  },

  onDateChange(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ ['form.' + key]: e.detail.value })
  },

  onPrivacyToggle() {
    this.setData({ 'form.privacyAgreed': !this.data.form.privacyAgreed })
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/legal/privacy/privacy' })
  },

  localCheck() {
    const f = this.data.form || {}
    for (const field of this.data.fields) {
      const v = f[field.key]
      if (field.required && (v === undefined || v === null || String(v).trim() === '')) {
        return '请填写' + field.label
      }
      if (field.type === 'phone' && v && !/^1[3-9]\d{9}$/.test(String(v).trim())) {
        return '请填写正确的' + field.label
      }
    }
    if (!f.privacyAgreed) return '请先阅读并同意隐私政策'
    return ''
  },

  onSubmit() {
    if (this.data.submitting || this.data.submitted) return Promise.resolve()
    const err = this.localCheck()
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return Promise.resolve()
    }

    haptic('light')
    this.setData({ submitting: true })
    return request.call('createServiceLead', {
      type: this.data.type,
      form: this.data.form,
      idempotencyKey: this.data.idempotencyKey // 失败重试复用，避免重复线索
    })
      .then(() => {
        haptic('medium')
        this.setData({ submitting: false, submitted: true })
      })
      .catch((e) => {
        // 失败保留已填内容，用户可直接重试
        this.setData({ submitting: false })
        wx.showToast({ title: (e && e.message) || '提交失败，请重试', icon: 'none' })
      })
  },

  goConcierge() {
    wx.navigateTo({
      url: '/pages/concierge/concierge',
      fail: () => wx.showToast({ title: '请联系前台', icon: 'none' })
    })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
