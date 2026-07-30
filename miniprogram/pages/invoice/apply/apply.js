const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

function fenToYuan(fen) {
  const amount = Number(fen)
  if (!Number.isFinite(amount)) return '0.00'
  return (Math.round(amount) / 100).toFixed(2)
}

function emptyForm() {
  return {
    titleType: 'personal',
    titleName: '',
    taxNo: '',
    email: '',
    registeredAddress: '',
    registeredPhone: '',
    bankName: '',
    bankAccount: '',
    privacyAgreed: false
  }
}

function formFromRequest(invoice) {
  const source = invoice || {}
  return Object.assign(emptyForm(), {
    titleType: source.titleType === 'company' ? 'company' : 'personal',
    titleName: source.titleName || '',
    taxNo: source.taxNo || '',
    email: source.email || '',
    registeredAddress: source.registeredAddress || '',
    registeredPhone: source.registeredPhone || '',
    bankName: source.bankName || '',
    bankAccount: source.bankAccount || ''
  })
}

function orderView(order, invoice) {
  const source = order || invoice || {}
  return {
    orderId: source.orderId || '',
    outTradeNo: source.outTradeNo || '',
    orderType: source.orderType || '',
    orderTitle: source.orderTitle || '订单',
    invoiceAmount: Number(source.invoiceAmount) || 0,
    invoiceAmountText: fenToYuan(source.invoiceAmount),
    eligible: source.eligible !== false
  }
}

Page({
  data: {
    outTradeNo: '',
    loading: true,
    hasError: false,
    errorMessage: '',
    order: null,
    form: emptyForm(),
    moreExpanded: false,
    rejectReason: '',
    confirming: false,
    submitting: false
  },

  onLoad(options) {
    const outTradeNo = String((options && options.outTradeNo) || '')
    this.setData({ outTradeNo })
    return this.load()
  },

  load() {
    if (!this.data.outTradeNo) {
      this.setData({ loading: false, hasError: true, errorMessage: '订单信息不完整，请返回订单页重试' })
      return Promise.resolve()
    }
    this.setData({ loading: true, hasError: false, errorMessage: '' })
    return request.call('invoiceService', {
      action: 'getMine',
      outTradeNo: this.data.outTradeNo
    })
      .then((data) => {
        const invoice = data && data.request
        if (invoice && ['submitted', 'reviewing', 'issued'].indexOf(invoice.status) >= 0) {
          wx.redirectTo({
            url: '/pages/invoice/detail/detail?outTradeNo=' + encodeURIComponent(this.data.outTradeNo)
          })
          return
        }
        const order = orderView(data && data.order, invoice)
        if (!order.eligible || order.invoiceAmount <= 0) {
          this.setData({ loading: false, hasError: true })
          wx.showToast({ title: '该订单暂无可开票金额', icon: 'none' })
          return
        }
        const form = invoice ? formFromRequest(invoice) : emptyForm()
        this.setData({
          loading: false,
          hasError: false,
          errorMessage: '',
          order,
          form,
          moreExpanded: form.titleType === 'company' && !!(
            form.registeredAddress || form.registeredPhone || form.bankName || form.bankAccount
          ),
          rejectReason: (invoice && invoice.rejectReason) || ''
        })
      })
      .catch((error) => this.setData({
        loading: false,
        hasError: true,
        errorMessage: (error && error.message) || '开票服务暂不可用，请稍后重试'
      }))
  },

  onRetry() {
    return this.load()
  },

  onTitleType(e) {
    const titleType = e.currentTarget.dataset.type === 'company' ? 'company' : 'personal'
    haptic('light')
    if (titleType === 'personal') {
      this.setData({
        'form.titleType': titleType,
        'form.taxNo': '',
        'form.registeredAddress': '',
        'form.registeredPhone': '',
        'form.bankName': '',
        'form.bankAccount': '',
        moreExpanded: false
      })
      return
    }
    this.setData({ 'form.titleType': titleType })
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    this.setData({ ['form.' + field]: e.detail.value })
  },

  onMoreToggle() {
    haptic('light')
    this.setData({ moreExpanded: !this.data.moreExpanded })
  },

  onPrivacyToggle() {
    this.setData({ 'form.privacyAgreed': !this.data.form.privacyAgreed })
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/legal/privacy/privacy' })
  },

  localCheck() {
    const form = this.data.form || {}
    if (String(form.titleName || '').trim().length < 2) return '请填写发票抬头'
    if (form.titleType === 'company') {
      const taxNo = String(form.taxNo || '').replace(/\s+/g, '').toUpperCase()
      if (!/^[A-Z0-9]{15,20}$/.test(taxNo)) return '请填写正确的单位税号'
      if (form.registeredPhone && !/^[0-9+\-()\s]{5,30}$/.test(String(form.registeredPhone))) {
        return '请填写正确的注册电话'
      }
      if (form.bankAccount && !/^\d{8,32}$/.test(String(form.bankAccount).replace(/[\s-]+/g, ''))) {
        return '请填写正确的银行账号'
      }
    }
    const email = String(form.email || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return '请填写正确的接收邮箱'
    if (!form.privacyAgreed) return '请先阅读并同意隐私政策'
    return ''
  },

  onSubmit() {
    if (this.data.submitting || this.data.confirming) return Promise.resolve()
    const error = this.localCheck()
    if (error) {
      wx.showToast({ title: error, icon: 'none' })
      return Promise.resolve()
    }

    const order = this.data.order || {}
    const form = this.data.form || {}
    this.setData({ confirming: true })
    haptic('light')

    return new Promise((resolve) => {
      wx.showModal({
        title: '确认开票信息',
        content: `${form.titleName}\n¥${order.invoiceAmountText} · ${form.email}`,
        confirmText: '确认提交',
        success: (result) => {
          this.setData({ confirming: false })
          if (!result.confirm) {
            resolve()
            return
          }
          this.setData({ submitting: true })
          request.call('invoiceService', {
            action: 'submit',
            outTradeNo: this.data.outTradeNo,
            form
          })
            .then(() => {
              haptic('medium')
              this.setData({ submitting: false })
              wx.redirectTo({
                url: '/pages/invoice/detail/detail?outTradeNo=' + encodeURIComponent(this.data.outTradeNo)
              })
            })
            .catch((err) => {
              this.setData({ submitting: false })
              wx.showToast({ title: (err && err.message) || '提交失败，请重试', icon: 'none' })
            })
            .then(resolve)
        },
        fail: () => {
          this.setData({ confirming: false })
          resolve()
        }
      })
    })
  }
})

module.exports = { fenToYuan, emptyForm, formFromRequest, orderView }
