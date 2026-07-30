const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

const STATUS_META = {
  submitted: {
    text: '申请已提交',
    desc: '资料已经提交给商家，预计在 10 个自然日内完成审核并开具。',
    step: 1
  },
  reviewing: {
    text: '商家审核中',
    desc: '商家正在核对订单与抬头信息，预计在 10 个自然日内完成审核并开具。',
    step: 2
  },
  issued: {
    text: '发票已开具',
    desc: '电子发票已经开具，可在本页查看或保存 PDF 文件。',
    step: 3
  },
  rejected: {
    text: '申请未通过',
    desc: '请根据商家说明修改开票资料后重新提交。',
    step: 1
  },
  cancelled_refund: {
    text: '申请已关闭',
    desc: '订单已进入退款流程，本次开票申请已自动关闭。',
    step: 1
  }
}

function fenToYuan(fen) {
  const value = Number(fen)
  return Number.isFinite(value) ? (Math.round(value) / 100).toFixed(2) : '0.00'
}

function formatDateTime(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatFileSize(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function decorateRequest(request) {
  const source = request || {}
  const meta = STATUS_META[source.status] || {
    text: source.statusText || '处理中',
    desc: '请稍后刷新查看最新状态。',
    step: 1
  }
  const invoiceFile = source.invoiceFile && typeof source.invoiceFile === 'object'
    ? Object.assign({}, source.invoiceFile, {
      sizeText: formatFileSize(source.invoiceFile.size)
    })
    : null
  return Object.assign({}, source, {
    statusText: meta.text,
    amountText: fenToYuan(source.invoiceAmount),
    titleTypeText: source.titleType === 'company' ? '单位' : '个人',
    submittedAtText: formatDateTime(source.submittedAt),
    issuedAtText: formatDateTime(source.issuedAt),
    invoiceFile,
    hasInvoiceFile: Boolean(invoiceFile && (invoiceFile.available || invoiceFile.fileName)),
    hasLegacyInvoice: Boolean(!invoiceFile && source.invoiceUrl)
  })
}

function downloadRemoteFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(result) {
        const statusCode = Number(result && result.statusCode)
        if (statusCode < 200 || statusCode >= 300 || !result.tempFilePath) {
          reject(new Error('电子发票下载失败'))
          return
        }
        resolve(result.tempFilePath)
      },
      fail: reject
    })
  })
}

function downloadCloudFile(fileId) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.downloadFile !== 'function') {
      reject(new Error('当前版本暂不支持打开该历史发票'))
      return
    }
    wx.cloud.downloadFile({
      fileID: fileId,
      success(result) {
        if (!result || !result.tempFilePath) {
          reject(new Error('电子发票下载失败'))
          return
        }
        resolve(result.tempFilePath)
      },
      fail: reject
    })
  })
}

function openPdf(filePath) {
  return new Promise((resolve, reject) => {
    wx.openDocument({
      filePath,
      fileType: 'pdf',
      showMenu: true,
      success: resolve,
      fail: reject
    })
  })
}

Page({
  data: {
    outTradeNo: '',
    loading: true,
    hasError: false,
    request: null,
    progressStep: 1,
    statusDesc: '',
    fileBusy: false,
    fileAction: ''
  },

  onLoad(options) {
    const outTradeNo = String((options && options.outTradeNo) || '')
    this.setData({ outTradeNo })
    return this.load()
  },

  onPullDownRefresh() {
    return this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    if (!this.data.outTradeNo) {
      this.setData({ loading: false, hasError: true })
      return Promise.resolve()
    }
    this.setData({ loading: true, hasError: false })
    return request.call('invoiceService', {
      action: 'getMine',
      outTradeNo: this.data.outTradeNo
    })
      .then((data) => {
        const invoice = data && data.request
        if (!invoice) {
          wx.redirectTo({
            url: '/pages/invoice/apply/apply?outTradeNo=' + encodeURIComponent(this.data.outTradeNo)
          })
          return
        }
        const meta = STATUS_META[invoice.status] || STATUS_META.submitted
        this.setData({
          loading: false,
          hasError: false,
          request: decorateRequest(invoice),
          progressStep: meta.step,
          statusDesc: meta.desc
        })
      })
      .catch(() => this.setData({ loading: false, hasError: true }))
  },

  onRetry() {
    return this.load()
  },

  onEdit() {
    haptic('light')
    wx.navigateTo({
      url: '/pages/invoice/apply/apply?outTradeNo=' + encodeURIComponent(this.data.outTradeNo)
    })
  },

  getInvoiceAccess(purpose) {
    const invoice = this.data.request
    if (!invoice) return Promise.reject(new Error('发票文件暂不可用'))
    if (invoice.hasInvoiceFile) {
      return request.call('invoiceService', {
        action: 'getInvoiceFileAccess',
        requestId: invoice._id,
        purpose
      }).then((data) => {
        if (!data || !data.tempFileURL) throw new Error('发票文件暂不可用')
        return data.tempFileURL
      })
    }
    if (invoice.hasLegacyInvoice) return Promise.resolve(invoice.invoiceUrl)
    return Promise.reject(new Error('发票文件暂不可用'))
  },

  openInvoice(purpose) {
    if (this.data.fileBusy) return Promise.resolve()
    const invoice = this.data.request
    if (!invoice || (!invoice.hasInvoiceFile && !invoice.hasLegacyInvoice)) {
      wx.showToast({ title: '发票文件暂不可用', icon: 'none' })
      return Promise.resolve()
    }
    haptic('light')
    this.setData({ fileBusy: true, fileAction: purpose })
    return this.getInvoiceAccess(purpose)
      .then((url) => {
        if (/^cloud:\/\//i.test(url)) return downloadCloudFile(url)
        return downloadRemoteFile(url)
      })
      .then((filePath) => openPdf(filePath))
      .then(() => {
        if (purpose === 'download') {
          wx.showToast({ title: '已下载，可从右上角保存', icon: 'none' })
        }
      })
      .catch(() => {
        wx.showToast({ title: '文件打开失败，请重试', icon: 'none' })
      })
      .finally(() => this.setData({ fileBusy: false, fileAction: '' }))
  },

  onViewInvoice() {
    return this.openInvoice('preview')
  },

  onDownloadInvoice() {
    return this.openInvoice('download')
  }
})

module.exports = {
  STATUS_META,
  fenToYuan,
  formatDateTime,
  formatFileSize,
  decorateRequest,
  downloadRemoteFile,
  openPdf
}
