const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')
const {
  isUndeclaredPrivacyScopeError,
  showDeclarationGuide
} = require('../../../utils/privacy-scope.js')
const MAX_PDF_SIZE = 10 * 1024 * 1024

const STATUS_META = {
  submitted: { text: '待审核', desc: '申请人已提交资料，等待管理员开始审核。' },
  reviewing: { text: '审核中', desc: '请核对订单与抬头资料，上传电子发票 PDF 后确认完成。' },
  issued: { text: '已开票', desc: '电子发票文件已上传，申请人可在小程序中查看。' },
  rejected: { text: '已驳回', desc: '申请人可以根据驳回原因修改资料后重新提交。' },
  cancelled_refund: { text: '已关闭', desc: '订单进入退款流程，本次开票申请已自动关闭。' }
}

function fenToYuan(fen) {
  const value = Number(fen)
  return Number.isFinite(value) ? (Math.round(value) / 100).toFixed(2) : '0.00'
}

function valueOrDash(value) {
  const text = String(value == null ? '' : value).trim()
  return text || '—'
}

function formatFileSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '大小未知'
  if (value >= 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' MB'
  return Math.max(1, Math.round(value / 1024)) + ' KB'
}

function hasPdfSignature(data) {
  if (!data) return false
  let bytes
  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data)
  } else if (ArrayBuffer.isView(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  } else {
    return false
  }
  return bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2D
}

function choosePdfFile() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success(res) {
        const files = res && res.tempFiles
        if (!files || !files[0]) return reject(new Error('未选择文件'))
        resolve(files[0])
      },
      fail: reject
    })
  })
}

function readFileHeader(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      position: 0,
      length: 5,
      success: (res) => resolve(res.data),
      fail: reject
    })
  })
}

function uploadCloudFile(cloudPath, filePath) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => resolve(res.fileID),
      fail: reject
    })
  })
}

function downloadTempFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode && res.statusCode !== 200) {
          return reject(new Error('电子发票下载失败'))
        }
        resolve(res.tempFilePath)
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

function decorate(source) {
  const item = source || {}
  const meta = STATUS_META[item.status] || { text: '处理中', desc: '请稍后刷新最新状态。' }
  const invoiceFile = item.invoiceFile || null
  return Object.assign({}, item, {
    amountText: fenToYuan(item.invoiceAmount),
    statusText: meta.text,
    statusDesc: meta.desc,
    titleTypeText: item.titleType === 'company' ? '单位' : '个人',
    taxNoText: valueOrDash(item.taxNo),
    registeredAddressText: valueOrDash(item.registeredAddress),
    registeredPhoneText: valueOrDash(item.registeredPhone),
    bankNameText: valueOrDash(item.bankName),
    bankAccountText: valueOrDash(item.bankAccount),
    hasInvoiceFile: !!(invoiceFile && (invoiceFile.available || invoiceFile.fileId)),
    invoiceFileName: invoiceFile && invoiceFile.fileName ? invoiceFile.fileName : '',
    invoiceFileSizeText: formatFileSize(invoiceFile && invoiceFile.size)
  })
}

Page({
  data: {
    requestId: '',
    loading: true,
    hasError: false,
    request: null,
    rejectReason: '',
    saving: false,
    uploading: false,
    previewing: false
  },

  onLoad(options) {
    const requestId = String((options && options.requestId) || '').trim()
    this.setData({ requestId })
    return this.load()
  },

  onPullDownRefresh() {
    return this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    if (!this.data.requestId) {
      this.setData({ loading: false, hasError: true })
      return Promise.resolve()
    }
    this.setData({ loading: true, hasError: false })
    return request.call('invoiceService', {
      action: 'getStaffDetail',
      requestId: this.data.requestId
    })
      .then((data) => {
        const invoice = data && data.request
        if (!invoice) throw new Error('开票申请不存在')
        this.setData({
          loading: false,
          hasError: false,
          request: decorate(invoice),
          rejectReason: invoice.rejectReason || ''
        })
      })
      .catch((err) => {
        this.setData({ loading: false, hasError: true })
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
      })
  },

  onRetry() {
    return this.load()
  },

  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value })
  },

  updateStatus(payload, successTitle) {
    if (this.data.saving) return Promise.resolve()
    this.setData({ saving: true })
    return request.call('invoiceService', Object.assign({
      action: 'updateStaff',
      requestId: this.data.requestId,
      revision: this.data.request && this.data.request.revision
    }, payload))
      .then((data) => {
        const invoice = data && data.request
        this.setData({
          request: decorate(invoice || Object.assign({}, this.data.request, payload)),
          saving: false
        })
        haptic('medium')
        wx.showToast({ title: successTitle, icon: 'success' })
      })
      .catch((err) => {
        this.setData({ saving: false })
        wx.showToast({ title: (err && err.message) || '操作失败，请重试', icon: 'none' })
      })
  },

  onStartReview() {
    return this.updateStatus({ status: 'reviewing' }, '已开始审核')
  },

  async onChooseInvoiceFile() {
    if (this.data.uploading || this.data.saving) return
    let uploadedFileId = ''
    this.setData({ uploading: true })
    try {
      const file = await choosePdfFile()
      const fileName = String(file.name || '').trim()
      const fileSize = Number(file.size)
      if (!/\.pdf$/i.test(fileName)) throw new Error('请选择 PDF 格式的电子发票')
      if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error('发票文件为空')
      if (fileSize > MAX_PDF_SIZE) throw new Error('发票 PDF 不能超过 10MB')

      const header = await readFileHeader(file.path)
      if (!hasPdfSignature(header)) throw new Error('文件内容不是有效的 PDF')

      const safeRequestId = String(this.data.requestId).replace(/[^A-Za-z0-9_-]/g, '')
      const cloudPath = 'invoice-files/' + safeRequestId + '/' +
        Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.pdf'
      uploadedFileId = await uploadCloudFile(cloudPath, file.path)
      const data = await request.call('invoiceService', {
        action: 'attachInvoiceFile',
        requestId: this.data.requestId,
        revision: this.data.request.revision,
        file: {
          fileId: uploadedFileId,
          fileName,
          size: fileSize,
          contentType: 'application/pdf',
          revision: this.data.request.revision
        }
      })
      if (!data || !data.request) throw new Error('发票文件保存失败')
      this.setData({ request: decorate(data.request) })
      haptic('medium')
      wx.showToast({ title: 'PDF 已上传', icon: 'success' })
    } catch (err) {
      if (uploadedFileId && wx.cloud && typeof wx.cloud.deleteFile === 'function') {
        wx.cloud.deleteFile({ fileList: [uploadedFileId] })
      }
      const message = (err && (err.message || err.errMsg)) || '上传失败，请重试'
      if (isUndeclaredPrivacyScopeError(err)) {
        showDeclarationGuide('file')
      } else if (!/cancel/i.test(message)) {
        wx.showToast({ title: message, icon: 'none' })
      }
    } finally {
      this.setData({ uploading: false })
    }
  },

  async onPreviewInvoice() {
    const invoice = this.data.request
    if (!invoice || !invoice.hasInvoiceFile || this.data.previewing) return
    this.setData({ previewing: true })
    try {
      const data = await request.call('invoiceService', {
        action: 'getInvoiceFileAccess',
        requestId: this.data.requestId
      })
      if (!data || !data.tempFileURL) throw new Error('电子发票文件暂不可用')
      const filePath = await downloadTempFile(data.tempFileURL)
      await openPdf(filePath)
    } catch (err) {
      wx.showToast({
        title: (err && (err.message || err.errMsg)) || '预览失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ previewing: false })
    }
  },

  onIssue() {
    if (!this.data.request || !this.data.request.hasInvoiceFile) {
      wx.showToast({ title: '请先上传电子发票 PDF', icon: 'none' })
      return Promise.resolve()
    }
    if (this.data.uploading || this.data.saving) return Promise.resolve()
    return new Promise((resolve) => {
      wx.showModal({
        title: '确认完成开票？',
        content: '确认后申请人即可在小程序中查看该 PDF，请先预览核对文件。',
        confirmText: '确认完成',
        success: (res) => {
          if (!res.confirm) return resolve()
          resolve(this.updateStatus({ status: 'issued' }, '开票已完成'))
        },
        fail: () => resolve()
      })
    })
  },

  onReject() {
    const rejectReason = String(this.data.rejectReason || '').trim()
    if (rejectReason.length < 2) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' })
      return Promise.resolve()
    }
    return this.updateStatus({
      status: 'rejected',
      rejectReason
    }, '申请已驳回')
  }
})

module.exports = {
  STATUS_META,
  MAX_PDF_SIZE,
  fenToYuan,
  valueOrDash,
  formatFileSize,
  hasPdfSignature,
  isUndeclaredFileScopeError: isUndeclaredPrivacyScopeError,
  decorate
}
