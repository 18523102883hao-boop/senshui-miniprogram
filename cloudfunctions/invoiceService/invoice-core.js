const ELIGIBLE_ORDER_TYPES = ['member_card', 'ticket_order', 'ticket_upgrade']
const ACTIVE_STATUSES = ['submitted', 'reviewing', 'issued']
const REVISABLE_STATUSES = ['rejected', 'cancelled_refund']
const INVOICEABLE_TICKET_STATUSES = ['unused', 'reserved', 'used', 'expired']
const MAX_INVOICE_PDF_SIZE = 10 * 1024 * 1024

const STATUS_TEXT = {
  submitted: '申请已提交',
  reviewing: '商家审核中',
  issued: '已开票',
  rejected: '已驳回',
  cancelled_refund: '已因退款关闭'
}

const TRANSITIONS = {
  submitted: ['reviewing', 'rejected', 'cancelled_refund'],
  reviewing: ['issued', 'rejected', 'cancelled_refund'],
  rejected: ['submitted'],
  issued: [],
  cancelled_refund: []
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
}

function normalizeInvoiceFile(input) {
  const file = input || {}
  return {
    fileId: cleanText(file.fileId, 500),
    fileName: cleanText(file.fileName, 160),
    size: Number(file.size),
    contentType: cleanText(file.contentType, 80).toLowerCase(),
    revision: Number(file.revision)
  }
}

function invoiceFilePathMarker(requestId) {
  const safeRequestId = String(requestId || '').replace(/[^A-Za-z0-9_-]/g, '')
  return safeRequestId ? `/invoice-files/${safeRequestId}/` : ''
}

function validateInvoiceFile(input, requestId, revision) {
  const file = normalizeInvoiceFile(input)
  const pathMarker = invoiceFilePathMarker(requestId)
  if (!file.fileName || !/\.pdf$/i.test(file.fileName)) {
    return { ok: false, msg: '请选择 PDF 格式的电子发票' }
  }
  if (file.contentType !== 'application/pdf') {
    return { ok: false, msg: '发票文件必须是 PDF 格式' }
  }
  if (!Number.isInteger(file.size) || file.size <= 0) {
    return { ok: false, msg: '发票文件为空或大小无效' }
  }
  if (file.size > MAX_INVOICE_PDF_SIZE) {
    return { ok: false, msg: '发票 PDF 不能超过 10MB' }
  }
  if (!file.fileId || !pathMarker || file.fileId.indexOf(pathMarker) < 0) {
    return { ok: false, msg: '发票文件存储路径不正确' }
  }
  if (!Number.isInteger(file.revision) || file.revision !== Number(revision)) {
    return { ok: false, msg: '申请资料已更新，请刷新后重新上传' }
  }
  return { ok: true, value: file }
}

function hasPdfHeader(input) {
  if (!input) return false
  let bytes
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    bytes = input
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input)
  } else if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
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

function getOrderAmount(order) {
  const o = order || {}
  const raw = typeof o.totalFee === 'number' ? o.totalFee : o.amount
  return Number.isInteger(raw) && raw > 0 ? raw : 0
}

function canApply(order) {
  const o = order || {}
  return o.status === 'paid' &&
    ELIGIBLE_ORDER_TYPES.indexOf(o.type) >= 0 &&
    getOrderAmount(o) > 0
}

function getInvoiceAmount(order, tickets) {
  const o = order || {}
  if (o.type !== 'ticket_order') return getOrderAmount(o)
  const list = Array.isArray(tickets) ? tickets : []
  return list.reduce((sum, ticket) => {
    const t = ticket || {}
    if (INVOICEABLE_TICKET_STATUSES.indexOf(t.status) < 0) return sum
    const price = Number(t.unitPrice)
    return Number.isInteger(price) && price > 0 ? sum + price : sum
  }, 0)
}

function normalizeEmail(value) {
  return cleanText(value, 100).toLowerCase()
}

function normalizeApplication(input) {
  const i = input || {}
  const titleType = i.titleType === 'company' ? 'company' : (i.titleType === 'personal' ? 'personal' : '')
  if (!titleType) return { ok: false, msg: '请选择抬头类型' }

  const titleName = cleanText(i.titleName, 80)
  if (titleName.length < 2) return { ok: false, msg: '请输入正确的发票抬头' }

  const email = normalizeEmail(i.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, msg: '请输入正确的接收邮箱' }
  }

  const value = {
    titleType,
    titleName,
    email,
    taxNo: '',
    registeredAddress: '',
    registeredPhone: '',
    bankName: '',
    bankAccount: ''
  }

  if (titleType === 'personal') return { ok: true, value }

  value.taxNo = cleanText(i.taxNo, 24).replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z0-9]{15,20}$/.test(value.taxNo)) {
    return { ok: false, msg: '请输入正确的单位税号' }
  }

  value.registeredAddress = cleanText(i.registeredAddress, 120)
  value.registeredPhone = cleanText(i.registeredPhone, 30)
  if (value.registeredPhone && !/^[0-9+\-()\s]{5,30}$/.test(value.registeredPhone)) {
    return { ok: false, msg: '请输入正确的注册电话' }
  }

  value.bankName = cleanText(i.bankName, 80)
  value.bankAccount = cleanText(i.bankAccount, 40).replace(/[\s-]+/g, '')
  if (value.bankAccount && !/^\d{8,32}$/.test(value.bankAccount)) {
    return { ok: false, msg: '请输入正确的银行账号' }
  }

  return { ok: true, value }
}

function orderTitle(order) {
  const o = order || {}
  if (o.type === 'ticket_order') return cleanText(o.productName || '门票', 80)
  if (o.type === 'ticket_upgrade') return cleanText(o.itemLabel || '补差价升级', 80)
  return '森水会员卡'
}

function buildHistoryEntry(from, to, actor, now, note) {
  const a = actor || {}
  return {
    from: from || '',
    to,
    byType: a.byType || 'system',
    byOpenid: a.openid || '',
    byName: a.name || '',
    note: cleanText(note, 200),
    at: now instanceof Date ? now : new Date(now || Date.now())
  }
}

function buildRequest(options) {
  const opts = options || {}
  const order = opts.order || {}
  if (!canApply(order)) return { ok: false, msg: '该订单暂不支持申请开票' }

  const form = normalizeApplication(opts.input)
  if (!form.ok) return form

  const invoiceAmount = getInvoiceAmount(order, opts.tickets)
  if (!Number.isInteger(invoiceAmount) || invoiceAmount <= 0) {
    return { ok: false, msg: '该订单没有可开票金额' }
  }

  const now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now())
  const value = Object.assign({}, form.value, {
    _openid: String(opts.openid || ''),
    orderId: order._id || '',
    outTradeNo: order.outTradeNo || '',
    orderType: order.type || '',
    orderTitle: orderTitle(order),
    invoiceAmount,
    invoiceType: 'electronic_normal',
    contentType: 'item_detail',
    status: 'submitted',
    revision: 1,
    invoiceNo: '',
    invoiceUrl: '',
    emailSent: false,
    invoiceFile: null,
    rejectReason: '',
    history: [buildHistoryEntry('', 'submitted', {
      byType: 'user',
      openid: opts.openid || ''
    }, now)],
    submittedAt: now,
    reviewedAt: null,
    issuedAt: null,
    createdAt: now,
    updatedAt: now
  })
  return { ok: true, value }
}

function resolveSubmission(existing) {
  if (!existing) return { mode: 'create', request: null }
  if (ACTIVE_STATUSES.indexOf(existing.status) >= 0) {
    return { mode: 'existing', request: existing }
  }
  if (REVISABLE_STATUSES.indexOf(existing.status) >= 0) {
    return { mode: 'revise', request: existing }
  }
  return { mode: 'existing', request: existing }
}

function buildRevision(existing, fresh, openid, now) {
  const old = existing || {}
  const value = Object.assign({}, fresh || {})
  const time = now instanceof Date ? now : new Date(now || Date.now())
  value.revision = Math.max(1, Number(old.revision) || 1) + 1
  value.createdAt = old.createdAt || value.createdAt || time
  value.history = (Array.isArray(old.history) ? old.history : []).concat([
    buildHistoryEntry(old.status, 'submitted', { byType: 'user', openid: openid || '' }, time, '修改资料后重新提交')
  ])
  value.submittedAt = time
  value.updatedAt = time
  return value
}

function canTransition(from, to) {
  return !!TRANSITIONS[from] && TRANSITIONS[from].indexOf(to) >= 0
}

function canManage(staff) {
  return !!staff && staff.status === 'approved' && staff.role === 'admin'
}

function isValidInvoiceUrl(value) {
  const url = cleanText(value, 500)
  return /^https:\/\//i.test(url) || /^cloud:\/\//i.test(url)
}

function buildInvoiceFilePatch(request, input, staff, now) {
  const r = request || {}
  if (!canManage(staff)) return { ok: false, msg: '无开票管理权限' }
  if (r.status !== 'reviewing') return { ok: false, msg: '当前状态不能上传发票文件' }

  const checked = validateInvoiceFile(input, r._id, r.revision)
  if (!checked.ok) return checked

  const time = now instanceof Date ? now : new Date(now || Date.now())
  const oldFile = r.invoiceFile && r.invoiceFile.fileId ? r.invoiceFile : null
  const action = oldFile ? 'invoice_file_replaced' : 'invoice_file_attached'
  const version = Math.max(0, Number(oldFile && oldFile.version) || 0) + 1
  const invoiceFile = Object.assign({}, checked.value, {
    version,
    uploadedAt: time,
    uploadedBy: staff._openid || '',
    uploadedByName: staff.name || ''
  })
  return {
    ok: true,
    value: {
      invoiceFile,
      updatedAt: time,
      history: (Array.isArray(r.history) ? r.history : []).concat([
        buildHistoryEntry(r.status, action, {
          byType: 'staff',
          openid: staff._openid || '',
          name: staff.name || ''
        }, time, invoiceFile.fileName)
      ])
    },
    oldFileId: oldFile ? oldFile.fileId : ''
  }
}

function buildInvoiceFilePersistence(patch) {
  const value = patch && patch.value ? patch.value : {}
  const history = Array.isArray(value.history) ? value.history : []
  return {
    invoiceFile: value.invoiceFile,
    updatedAt: value.updatedAt,
    historyEntry: history.length ? history[history.length - 1] : null
  }
}

function canAccessInvoiceFile(request, openid, staff) {
  const r = request || {}
  if (!r.invoiceFile || !r.invoiceFile.fileId) return false
  if (String(r._openid || '') === String(openid || '')) return r.status === 'issued'
  return canManage(staff) && (r.status === 'reviewing' || r.status === 'issued')
}

function buildStaffUpdate(request, input, staff, now) {
  const r = request || {}
  const i = input || {}
  const nextStatus = cleanText(i.status, 30)
  if (!canManage(staff)) return { ok: false, msg: '无开票管理权限' }
  if (r.status === 'issued' && nextStatus === 'issued') {
    if (Number(i.revision) !== Number(r.revision)) {
      return { ok: false, msg: '申请资料已更新，请刷新后重试' }
    }
    return { ok: true, idempotent: true, value: {} }
  }
  if (!canTransition(r.status, nextStatus)) return { ok: false, msg: '当前状态不可执行该操作' }

  const time = now instanceof Date ? now : new Date(now || Date.now())
  const patch = {
    status: nextStatus,
    updatedAt: time,
    history: (Array.isArray(r.history) ? r.history : []).concat([
      buildHistoryEntry(r.status, nextStatus, {
        byType: 'staff',
        openid: staff._openid || '',
        name: staff.name || ''
      }, time, i.note || i.rejectReason)
    ])
  }

  if (nextStatus === 'reviewing') {
    patch.reviewedAt = time
  } else if (nextStatus === 'rejected') {
    patch.rejectReason = cleanText(i.rejectReason || i.note, 200)
    if (patch.rejectReason.length < 2) return { ok: false, msg: '请填写驳回原因' }
  } else if (nextStatus === 'issued') {
    if (Number(i.revision) !== Number(r.revision)) {
      return { ok: false, msg: '申请资料已更新，请刷新后重试' }
    }
    const file = validateInvoiceFile(r.invoiceFile, r._id, r.revision)
    if (!file.ok) return { ok: false, msg: '请先上传有效的电子发票 PDF' }
    patch.rejectReason = ''
    patch.issuedAt = time
  }

  return { ok: true, value: patch }
}

function maskMiddle(value, head, tail) {
  const text = String(value || '')
  if (!text) return ''
  if (text.length <= head + tail) return '*'.repeat(text.length)
  return text.slice(0, head) + '*'.repeat(Math.min(8, text.length - head - tail)) + text.slice(-tail)
}

function maskEmail(value) {
  const email = String(value || '')
  const at = email.indexOf('@')
  if (at <= 0) return maskMiddle(email, 1, 1)
  return email.slice(0, 1) + '***' + email.slice(at)
}

function toStaffListItem(request) {
  const r = request || {}
  return {
    _id: r._id || '',
    outTradeNo: r.outTradeNo || '',
    orderTitle: r.orderTitle || '',
    invoiceAmount: Number(r.invoiceAmount) || 0,
    titleType: r.titleType || '',
    titleName: r.titleName || '',
    taxNo: maskMiddle(r.taxNo, 4, 4),
    bankAccount: maskMiddle(r.bankAccount, 0, 4),
    email: maskEmail(r.email),
    status: r.status || '',
    statusText: STATUS_TEXT[r.status] || r.status || '',
    revision: Number(r.revision) || 1,
    submittedAt: r.submittedAt || null,
    updatedAt: r.updatedAt || null
  }
}

function toUserDetail(request) {
  const r = request || {}
  const keys = [
    '_id', 'orderId', 'outTradeNo', 'orderType', 'orderTitle', 'invoiceAmount',
    'invoiceType', 'contentType', 'titleType', 'titleName', 'taxNo',
    'registeredAddress', 'registeredPhone', 'bankName', 'bankAccount', 'email',
    'status', 'revision', 'invoiceNo', 'invoiceUrl', 'emailSent', 'rejectReason',
    'invoiceFile',
    'history', 'submittedAt', 'reviewedAt', 'issuedAt', 'createdAt', 'updatedAt'
  ]
  const result = {}
  keys.forEach((key) => { result[key] = r[key] })
  if (r.invoiceFile && r.invoiceFile.fileId) {
    result.invoiceFile = {
      available: true,
      fileName: r.invoiceFile.fileName || '',
      size: Number(r.invoiceFile.size) || 0,
      contentType: r.invoiceFile.contentType || 'application/pdf',
      version: Number(r.invoiceFile.version) || 1,
      revision: Number(r.invoiceFile.revision) || Number(r.revision) || 1,
      uploadedAt: r.invoiceFile.uploadedAt || null
    }
  } else {
    result.invoiceFile = null
  }
  result.statusText = STATUS_TEXT[r.status] || r.status || ''
  return result
}

module.exports = {
  ELIGIBLE_ORDER_TYPES,
  ACTIVE_STATUSES,
  STATUS_TEXT,
  MAX_INVOICE_PDF_SIZE,
  canApply,
  getInvoiceAmount,
  normalizeApplication,
  orderTitle,
  buildHistoryEntry,
  buildRequest,
  resolveSubmission,
  buildRevision,
  canTransition,
  canManage,
  isValidInvoiceUrl,
  validateInvoiceFile,
  hasPdfHeader,
  buildInvoiceFilePatch,
  buildInvoiceFilePersistence,
  canAccessInvoiceFile,
  buildStaffUpdate,
  toStaffListItem,
  toUserDetail
}
