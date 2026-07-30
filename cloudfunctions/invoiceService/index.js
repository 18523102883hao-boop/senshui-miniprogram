// 云函数：invoiceService —— 用户申请开票 + 管理员审核开票
// 金额、订单归属、状态迁移和管理员权限均在云端重新校验。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./invoice-core.js')
const persistence = require('./invoice-persistence.js')

function response(code, msg, data) {
  const result = { code, msg }
  if (data !== undefined) result.data = data
  return result
}

function cleanId(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength || 64)
}

async function getOwnedOrder(openid, outTradeNo) {
  const r = await db.collection('orders')
    .where(_.or([
      { _openid: openid, outTradeNo },
      { payerOpenid: openid, outTradeNo }
    ]))
    .limit(1)
    .get()
  return r.data[0] || null
}

async function getOrderTickets(openid, order) {
  if (!order || order.type !== 'ticket_order') return undefined
  const r = await db.collection('tickets')
    .where({ _openid: openid, orderId: order.outTradeNo })
    .get()
  return r.data
}

function buildOrderSnapshot(order, tickets) {
  const invoiceAmount = core.getInvoiceAmount(order, tickets)
  return {
    orderId: order._id || '',
    outTradeNo: order.outTradeNo || '',
    orderType: order.type || '',
    orderTitle: core.orderTitle(order),
    invoiceAmount,
    eligible: core.canApply(order) && invoiceAmount > 0
  }
}

async function getMineByOrder(openid, outTradeNo) {
  const r = await db.collection('invoice_requests')
    .where({ _openid: openid, outTradeNo })
    .limit(1)
    .get()
  return r.data[0] || null
}

async function syncOrderSummary(orderId, requestId, status, revision, now) {
  if (!orderId) return
  await db.collection('orders').doc(orderId).update({
    data: {
      invoiceRequestId: requestId || '',
      invoiceStatus: status || '',
      invoiceRevision: Number(revision) || 1,
      updatedAt: now || new Date()
    }
  })
}

async function submit(openid, event) {
  const outTradeNo = cleanId(event.outTradeNo, 32)
  if (!outTradeNo) return response(400, '缺少订单号')

  const order = await getOwnedOrder(openid, outTradeNo)
  if (!order) return response(404, '订单不存在')
  if (!core.canApply(order)) return response(400, '该订单暂不支持申请开票')

  const tickets = await getOrderTickets(openid, order)
  const existing = await getMineByOrder(openid, outTradeNo)
  const resolution = core.resolveSubmission(existing)
  if (resolution.mode === 'existing') {
    return response(0, 'ok', {
      existing: true,
      request: core.toUserDetail(existing)
    })
  }

  const built = core.buildRequest({
    openid,
    order,
    tickets,
    input: event.form || event,
    now: new Date()
  })
  if (!built.ok) return response(400, built.msg)

  let requestId
  let request
  if (resolution.mode === 'revise') {
    request = core.buildRevision(existing, built.value, openid, new Date())
    await db.collection('invoice_requests').doc(existing._id).update({ data: request })
    requestId = existing._id
    request._id = requestId
  } else {
    request = built.value
    try {
      const add = await db.collection('invoice_requests').add({ data: request })
      requestId = add._id
    } catch (e) {
      // `_openid + outTradeNo` 唯一索引处理并发首次提交；冲突时返回胜出的申请。
      const raced = await getMineByOrder(openid, outTradeNo)
      if (!raced) throw e
      return response(0, 'ok', {
        existing: true,
        request: core.toUserDetail(raced)
      })
    }
    request._id = requestId
  }

  await syncOrderSummary(order._id, requestId, request.status, request.revision, request.updatedAt)
  return response(0, 'ok', {
    existing: false,
    request: core.toUserDetail(request)
  })
}

async function getMine(openid, event) {
  const outTradeNo = cleanId(event.outTradeNo, 32)
  if (!outTradeNo) return response(400, '缺少订单号')
  const order = await getOwnedOrder(openid, outTradeNo)
  if (!order) return response(404, '订单不存在')
  const [request, tickets] = await Promise.all([
    getMineByOrder(openid, outTradeNo),
    getOrderTickets(openid, order)
  ])
  return response(0, 'ok', {
    request: request ? core.toUserDetail(request) : null,
    order: buildOrderSnapshot(order, tickets)
  })
}

async function requireAdmin(openid) {
  const r = await db.collection('staff')
    .where({ _openid: openid, status: 'approved' })
    .limit(1)
    .get()
  const staff = r.data[0] || null
  if (staff) staff._openid = openid
  return core.canManage(staff) ? staff : null
}

async function listStaff(openid, event) {
  const staff = await requireAdmin(openid)
  if (!staff) return response(403, '无开票管理权限')

  const allowed = ['submitted', 'reviewing', 'issued', 'rejected', 'cancelled_refund']
  const status = cleanId(event.status, 30)
  const where = {}
  if (allowed.indexOf(status) >= 0) where.status = status

  const r = await db.collection('invoice_requests')
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get()
  return response(0, 'ok', { list: r.data.map(core.toStaffListItem) })
}

async function staffSummary(openid) {
  const staff = await requireAdmin(openid)
  if (!staff) return response(403, '无开票管理权限')

  const result = await db.collection('invoice_requests')
    .where({
      status: _.in(['submitted', 'reviewing'])
    })
    .count()

  return response(0, 'ok', {
    pendingCount: Number(result.total) || 0
  })
}

async function getStaffDetail(openid, event) {
  const staff = await requireAdmin(openid)
  if (!staff) return response(403, '无开票管理权限')
  const requestId = cleanId(event.requestId, 64)
  if (!requestId) return response(400, '缺少申请编号')
  try {
    const r = await db.collection('invoice_requests').doc(requestId).get()
    if (!r.data) return response(404, '开票申请不存在')
    return response(0, 'ok', { request: core.toUserDetail(r.data) })
  } catch (e) {
    return response(404, '开票申请不存在')
  }
}

async function getRequestById(requestId) {
  try {
    const result = await db.collection('invoice_requests').doc(requestId).get()
    return result.data || null
  } catch (e) {
    return null
  }
}

async function removeCloudFile(fileId) {
  if (!fileId) return
  try {
    await cloud.deleteFile({ fileList: [fileId] })
  } catch (e) {
    console.warn('[invoiceService] remove invoice file failed', fileId, e)
  }
}

async function attachInvoiceFile(openid, event) {
  const staff = await requireAdmin(openid)
  if (!staff) return response(403, '无开票管理权限')
  const requestId = cleanId(event.requestId, 64)
  if (!requestId) return response(400, '缺少申请编号')

  const request = await getRequestById(requestId)
  if (!request) return response(404, '开票申请不存在')

  const metadata = Object.assign({}, event.file || {}, {
    revision: Number(event.revision)
  })
  const preliminary = core.validateInvoiceFile(metadata, requestId, request.revision)
  if (!preliminary.ok) return response(400, preliminary.msg)

  let downloaded
  try {
    downloaded = await cloud.downloadFile({ fileID: preliminary.value.fileId })
  } catch (e) {
    return response(400, '发票文件读取失败，请重新选择 PDF')
  }
  const content = downloaded && downloaded.fileContent
  const actualSize = content && typeof content.length === 'number'
    ? content.length
    : (content && typeof content.byteLength === 'number' ? content.byteLength : 0)
  if (!actualSize || actualSize > core.MAX_INVOICE_PDF_SIZE || !core.hasPdfHeader(content)) {
    await removeCloudFile(preliminary.value.fileId)
    if (actualSize > core.MAX_INVOICE_PDF_SIZE) {
      return response(400, '发票 PDF 不能超过 10MB')
    }
    return response(400, '文件内容不是有效的 PDF')
  }

  const patch = core.buildInvoiceFilePatch(request, Object.assign({}, preliminary.value, {
    size: actualSize
  }), staff, new Date())
  if (!patch.ok) {
    await removeCloudFile(preliminary.value.fileId)
    return response(400, patch.msg)
  }

  const filePersistence = core.buildInvoiceFilePersistence(patch)
  const requestDoc = db.collection('invoice_requests').doc(requestId)
  try {
    await persistence.persistInvoiceFile({
      doc: requestDoc,
      command: _,
      invoiceFile: filePersistence.invoiceFile,
      updatedAt: filePersistence.updatedAt,
      historyEntry: filePersistence.historyEntry,
      onAuditError(error) {
        console.warn('[invoiceService] invoice file saved without audit history', {
          requestId,
          errCode: error && (error.errCode || error.code),
          errMsg: error && (error.errMsg || error.message)
        })
      }
    })
  } catch (e) {
    console.error('[invoiceService] attach invoice file persistence failed', {
      requestId,
      fileId: preliminary.value.fileId,
      errCode: e && (e.errCode || e.code),
      errMsg: e && (e.errMsg || e.message)
    })
    await removeCloudFile(preliminary.value.fileId)
    return response(503, '发票文件保存失败，请重新选择 PDF 后重试')
  }
  if (patch.oldFileId && patch.oldFileId !== patch.value.invoiceFile.fileId) {
    await removeCloudFile(patch.oldFileId)
  }
  const next = Object.assign({}, request, patch.value, { _id: requestId })
  return response(0, 'ok', { request: core.toUserDetail(next) })
}

async function getInvoiceFileAccess(openid, event) {
  const requestId = cleanId(event.requestId, 64)
  if (!requestId) return response(400, '缺少申请编号')
  const request = await getRequestById(requestId)
  if (!request) return response(404, '开票申请不存在')

  let staff = null
  if (String(request._openid || '') !== String(openid || '')) {
    staff = await requireAdmin(openid)
  }
  if (!core.canAccessInvoiceFile(request, openid, staff)) {
    return response(403, '无权查看该电子发票')
  }

  const result = await cloud.getTempFileURL({
    fileList: [request.invoiceFile.fileId]
  })
  const item = result && result.fileList && result.fileList[0]
  if (!item || item.status || !item.tempFileURL) {
    return response(404, '电子发票文件暂不可用')
  }
  const purpose = event.purpose === 'download' ? 'download' : 'preview'
  const audit = Object.assign(
    core.buildHistoryEntry(request.status, request.status, {
      byType: staff ? 'staff' : 'user',
      openid,
      name: staff ? staff.name : ''
    }, new Date(), purpose === 'download' ? '下载电子发票' : '预览电子发票'),
    {
      event: 'invoice_file_accessed',
      purpose
    }
  )
  await db.collection('invoice_requests').doc(requestId).update({
    data: {
      history: _.push(audit)
    }
  })
  return response(0, 'ok', {
    fileName: request.invoiceFile.fileName,
    tempFileURL: item.tempFileURL
  })
}

async function assertOrderStillInvoiceable(request) {
  if (!request || !request.orderId) return { ok: false, msg: '关联订单不存在' }
  try {
    const result = await db.collection('orders').doc(request.orderId).get()
    const order = result.data
    if (!order) return { ok: false, msg: '关联订单不存在' }
    if (order.status !== 'paid' || order.invoiceStatus === 'cancelled_refund') {
      return { ok: false, msg: '订单已进入退款流程，不能继续完成开票' }
    }
    return { ok: true, order }
  } catch (e) {
    return { ok: false, msg: '关联订单不存在' }
  }
}

async function updateStaff(openid, event) {
  const staff = await requireAdmin(openid)
  if (!staff) return response(403, '无开票管理权限')
  const requestId = cleanId(event.requestId, 64)
  if (!requestId) return response(400, '缺少申请编号')

  let request
  try {
    const r = await db.collection('invoice_requests').doc(requestId).get()
    request = r.data
  } catch (e) {
    return response(404, '开票申请不存在')
  }
  if (!request) return response(404, '开票申请不存在')

  if (request.status === 'issued' && event.status === 'issued') {
    const idempotent = core.buildStaffUpdate(request, event, staff, new Date())
    if (!idempotent.ok) return response(409, idempotent.msg)
    return response(0, 'ok', {
      idempotent: true,
      request: core.toUserDetail(Object.assign({}, request, { _id: requestId }))
    })
  }

  if (event.status === 'issued') {
    const orderCheck = await assertOrderStillInvoiceable(request)
    if (!orderCheck.ok) return response(409, orderCheck.msg)
  }

  const updated = core.buildStaffUpdate(request, event, staff, new Date())
  if (!updated.ok) return response(400, updated.msg)

  await db.collection('invoice_requests').doc(requestId).update({ data: updated.value })
  await syncOrderSummary(
    request.orderId,
    requestId,
    updated.value.status,
    request.revision,
    updated.value.updatedAt
  )
  const next = Object.assign({}, request, updated.value, { _id: requestId })
  return response(0, 'ok', { request: core.toUserDetail(next) })
}

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return response(401, '请先登录')
  const input = event || {}
  const action = cleanId(input.action, 30)

  try {
    if (action === 'submit') return await submit(OPENID, input)
    if (action === 'getMine') return await getMine(OPENID, input)
    if (action === 'listStaff') return await listStaff(OPENID, input)
    if (action === 'staffSummary') return await staffSummary(OPENID)
    if (action === 'getStaffDetail') return await getStaffDetail(OPENID, input)
    if (action === 'attachInvoiceFile') return await attachInvoiceFile(OPENID, input)
    if (action === 'getInvoiceFileAccess') return await getInvoiceFileAccess(OPENID, input)
    if (action === 'updateStaff') return await updateStaff(OPENID, input)
    return response(400, '不支持的开票操作')
  } catch (e) {
    console.error('[invoiceService]', action, e)
    return response(500, '开票服务暂不可用，请稍后重试')
  }
}

exports._private = {
  submit,
  getMine,
  listStaff,
  staffSummary,
  getStaffDetail,
  attachInvoiceFile,
  getInvoiceFileAccess,
  updateStaff,
  assertOrderStillInvoiceable,
  buildOrderSnapshot,
  syncOrderSummary
}
