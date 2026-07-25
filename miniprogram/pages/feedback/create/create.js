// 投诉建议 / 失物招领 · 提交（原 Task 16）
// 合规：紧急问题始终保留拨号入口；不承诺处理时限。
const request = require('../../../utils/request.js')
const env = require('../../../env.js')
const { haptic } = require('../../../utils/haptics.js')
const { makePhoneCall } = require('../../../utils/util.js')

const MAX_IMAGES = 6
const TYPES = [
  { key: 'complaint', title: '投诉', placeholder: '请描述遇到的问题、时间和地点，便于我们核实' },
  { key: 'suggestion', title: '建议', placeholder: '你希望我们改进什么？' },
  { key: 'praise', title: '表扬', placeholder: '哪位同事或哪个环节让你满意？' },
  { key: 'lost_found', title: '失物招领', placeholder: '请描述物品特征、遗失时间与大致位置' }
]

Page({
  data: {
    types: TYPES,
    maxImages: MAX_IMAGES,
    form: { type: 'complaint', content: '', images: [], allowCall: false, phone: '' },
    placeholder: TYPES[0].placeholder,
    frontPhone: env.frontDeskPhone,
    submitting: false,
    submitted: false
  },

  onLoad(options) {
    const type = (options && options.type) || 'complaint'
    const hit = TYPES.filter((t) => t.key === type)[0] || TYPES[0]
    this.setData({ 'form.type': hit.key, placeholder: hit.placeholder })
    return Promise.resolve()
  },

  onTypeTap(e) {
    const key = e.currentTarget.dataset.key
    const hit = TYPES.filter((t) => t.key === key)[0]
    if (!hit) return
    haptic('light')
    this.setData({ 'form.type': key, placeholder: hit.placeholder })
  },

  onContentInput(e) { this.setData({ 'form.content': e.detail.value }) },
  onPhoneInput(e) { this.setData({ 'form.phone': e.detail.value }) },
  onAllowCallToggle() { this.setData({ 'form.allowCall': !this.data.form.allowCall }) },

  onChooseImage() {
    const left = MAX_IMAGES - this.data.form.images.length
    if (left <= 0) {
      wx.showToast({ title: '最多 ' + MAX_IMAGES + ' 张', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      success: (res) => {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath)
        this.setData({ 'form.images': this.data.form.images.concat(paths) })
      },
      fail: () => {}
    })
  },

  onRemoveImage(e) {
    const i = Number(e.currentTarget.dataset.index)
    const images = this.data.form.images.slice()
    images.splice(i, 1)
    this.setData({ 'form.images': images })
  },

  localCheck() {
    const f = this.data.form
    const content = String(f.content || '').trim()
    if (!content) return '请填写具体内容'
    if (content.length < 5) return '请再详细描述一下，便于我们核实处理'
    if (f.allowCall && !/^1[3-9]\d{9}$/.test(String(f.phone).trim())) return '选择电话联系需填写正确的手机号'
    return ''
  },

  onSubmit() {
    if (this.data.submitting || this.data.submitted) return Promise.resolve()
    const err = this.localCheck()
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return Promise.resolve()
    }

    this.setData({ submitting: true })
    // 图片先传云存储，失败不阻断文字提交（用户的诉求比截图更重要）
    return this.uploadImages()
      .then((images) => request.call('submitFeedback', {
        form: Object.assign({}, this.data.form, { images })
      }))
      .then(() => {
        haptic('medium')
        this.setData({ submitting: false, submitted: true })
      })
      .catch((e) => {
        // 失败保留输入，可直接重试
        this.setData({ submitting: false })
        wx.showToast({ title: (e && e.message) || '提交失败，请重试', icon: 'none' })
      })
  },

  uploadImages() {
    const list = this.data.form.images.filter((p) => p && p.indexOf('cloud://') !== 0)
    const done = this.data.form.images.filter((p) => p && p.indexOf('cloud://') === 0)
    if (!list.length) return Promise.resolve(done)
    const tasks = list.map((p, i) => wx.cloud.uploadFile({
      cloudPath: 'feedback/' + Date.now() + '_' + i + '.png',
      filePath: p
    }).then((r) => r.fileID).catch(() => ''))
    return Promise.all(tasks).then((ids) => done.concat(ids.filter(Boolean)))
  },

  onCallFront() {
    makePhoneCall(this.data.frontPhone)
  },

  goList() {
    wx.redirectTo({ url: '/pages/feedback/list/list' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
