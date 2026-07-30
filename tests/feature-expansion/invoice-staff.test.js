const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const core = require(path.join(projectRoot, 'cloudfunctions/invoiceService/invoice-core.js'))
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')
const listPath = path.join(projectRoot, 'miniprogram/pages/staff/invoices/invoices.js')
const detailPath = path.join(projectRoot, 'miniprogram/pages/staff/invoice-detail/invoice-detail.js')
const servicePath = path.join(projectRoot, 'cloudfunctions/invoiceService/index.js')

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function setPath(target, key, value) {
  const parts = key.split('.')
  let cursor = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {}
    cursor = cursor[parts[i]]
  }
  cursor[parts[parts.length - 1]] = value
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = {
    request: [],
    navigate: [],
    toast: [],
    modal: [],
    chooseFile: [],
    uploadFile: [],
    downloadFile: [],
    openDocument: []
  }
  let pageConfig

  function stub(modulePath, exports) {
    originals[modulePath] = require.cache[modulePath]
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports }
  }
  const requestImpl = {
    call(name, data) {
      calls.request.push({ name, data })
      const responder = options.responders && options.responders[name]
      if (typeof responder === 'function') return responder(data, calls.request.length)
      if (responder !== undefined) return Promise.resolve(responder)
      return Promise.reject(new Error('no responder for ' + name))
    }
  }
  stub(requestPath, requestImpl)
  stub(hapticsPath, { haptic() {} })

  global.wx = {
    setNavigationBarTitle() {},
    navigateTo(o) { calls.navigate.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    showModal(o) { calls.modal.push(o); if (o.success) o.success({ confirm: options.modalConfirm !== false }) },
    stopPullDownRefresh() {},
    chooseMessageFile(o) {
      calls.chooseFile.push(o)
      if (options.chooseFileError) return o.fail(options.chooseFileError)
      o.success({
        tempFiles: [options.selectedFile || {
          name: '森水会员卡电子发票.pdf',
          size: 2048,
          path: '/tmp/invoice.pdf'
        }]
      })
    },
    getFileSystemManager() {
      return {
        readFile(o) {
          const data = options.fileHeader || Uint8Array.from([37, 80, 68, 70, 45]).buffer
          o.success({ data })
        }
      }
    },
    downloadFile(o) {
      calls.downloadFile.push(o.url)
      o.success({ statusCode: 200, tempFilePath: '/tmp/preview.pdf' })
    },
    openDocument(o) {
      calls.openDocument.push(o)
      o.success()
    },
    cloud: {
      uploadFile(o) {
        calls.uploadFile.push(o)
        o.success({
          fileID: options.uploadFileID ||
            'cloud://cloud1.example/invoice-files/inv-2/1720000000000.pdf'
        })
      },
      deleteFile() {}
    }
  }
  global.Page = (config) => { pageConfig = config }
  delete require.cache[pagePath]
  require(pagePath)
  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) {
      Object.keys(patch).forEach((key) => setPath(this.data, key, patch[key]))
    }
  })

  t.after(() => {
    delete require.cache[pagePath]
    Object.keys(originals).forEach((modulePath) => {
      if (originals[modulePath]) require.cache[modulePath] = originals[modulePath]
      else delete require.cache[modulePath]
    })
    global.Page = originalPage
    global.wx = originalWx
  })
  return { page, calls }
}

const STAFF_LIST = [
  {
    _id: 'inv-1',
    outTradeNo: 'TK001',
    orderTitle: '单人溪降票',
    invoiceAmount: 5800,
    titleType: 'company',
    titleName: '成都森水长河有限公司',
    email: 'f***@example.com',
    status: 'submitted',
    statusText: '申请已提交'
  },
  {
    _id: 'inv-2',
    outTradeNo: 'M001',
    orderTitle: '森水会员卡',
    invoiceAmount: 990,
    titleType: 'personal',
    titleName: '张三',
    email: 'z***@example.com',
    status: 'reviewing',
    statusText: '商家审核中'
  }
]

const REVIEWING = {
  _id: 'inv-2',
  outTradeNo: 'M001',
  orderTitle: '森水会员卡',
  invoiceAmount: 990,
  invoiceType: 'electronic_normal',
  contentType: 'item_detail',
  titleType: 'personal',
  titleName: '张三',
  email: 'zhangsan@example.com',
  status: 'reviewing',
  revision: 2,
  history: []
}

test('管理员状态更新必须遵循状态机且完成开票仅依赖已绑定 PDF', () => {
  const admin = { _openid: 'staff-1', name: '管理员', role: 'admin', status: 'approved' }
  const front = { _openid: 'staff-2', name: '前台', role: 'front', status: 'approved' }
  assert.equal(core.buildStaffUpdate({ status: 'submitted' }, { status: 'reviewing' }, front).ok, false)
  assert.equal(core.buildStaffUpdate({ status: 'submitted' }, { status: 'issued' }, admin).ok, false)
  assert.match(core.buildStaffUpdate({ status: 'submitted' }, { status: 'rejected' }, admin).msg, /驳回原因/)

  const incomplete = core.buildStaffUpdate({ status: 'reviewing', revision: 2 }, {
    status: 'issued', revision: 2
  }, admin)
  assert.equal(incomplete.ok, false)
  assert.match(incomplete.msg, /PDF/)

  const complete = core.buildStaffUpdate({
    _id: 'inv-2',
    status: 'reviewing',
    revision: 2,
    history: [],
    invoiceFile: {
      fileId: 'cloud://cloud1.example/invoice-files/inv-2/1720000000000.pdf',
      fileName: '森水会员卡电子发票.pdf',
      size: 2048,
      contentType: 'application/pdf',
      revision: 2
    }
  }, {
    status: 'issued',
    revision: 2
  }, admin, new Date('2026-07-28T10:00:00Z'))
  assert.equal(complete.ok, true)
  assert.equal(complete.value.status, 'issued')
  assert.equal(complete.value.invoiceNo, undefined)
  assert.equal(complete.value.invoiceUrl, undefined)
  assert.equal(complete.value.emailSent, undefined)
  assert.equal(complete.value.history.length, 1)

  const stale = core.buildStaffUpdate({
    status: 'reviewing',
    revision: 3,
    invoiceFile: { fileId: 'cloud://cloud1.example/invoice-files/inv-2/a.pdf', revision: 3 }
  }, { status: 'issued', revision: 2 }, admin)
  assert.equal(stale.ok, false)
  assert.match(stale.msg, /已更新/)

  const repeated = core.buildStaffUpdate({ status: 'issued', revision: 2 }, {
    status: 'issued',
    revision: 2
  }, admin)
  assert.equal(repeated.ok, true)
  assert.equal(repeated.idempotent, true)
})

test('管理员绑定 PDF 时保留版本和审计记录，替换文件递增版本', () => {
  const admin = { _openid: 'staff-1', name: '管理员', role: 'admin', status: 'approved' }
  const request = Object.assign({}, REVIEWING, { history: [] })
  const first = core.buildInvoiceFilePatch(request, {
    fileId: 'cloud://cloud1.example/invoice-files/inv-2/1720000000000.pdf',
    fileName: '会员卡发票.pdf',
    size: 2048,
    contentType: 'application/pdf',
    revision: 2
  }, admin, new Date('2026-07-28T10:00:00Z'))
  assert.equal(first.ok, true)
  assert.equal(first.value.invoiceFile.version, 1)
  assert.equal(first.value.history.at(-1).to, 'invoice_file_attached')

  const replacement = core.buildInvoiceFilePatch(
    Object.assign({}, request, first.value),
    {
      fileId: 'cloud://cloud1.example/invoice-files/inv-2/1720000001000.pdf',
      fileName: '会员卡发票-重开.pdf',
      size: 4096,
      contentType: 'application/pdf',
      revision: 2
    },
    admin,
    new Date('2026-07-28T10:01:00Z')
  )
  assert.equal(replacement.ok, true)
  assert.equal(replacement.value.invoiceFile.version, 2)
  assert.equal(replacement.value.history.at(-1).to, 'invoice_file_replaced')
})

test('绑定 PDF 的数据库写入只追加本次审计记录，不重写历史数组', () => {
  const patch = {
    ok: true,
    value: {
      invoiceFile: {
        fileId: 'cloud://cloud1.example/invoice-files/inv-2/1720000000000.pdf',
        fileName: '会员卡发票.pdf'
      },
      updatedAt: new Date('2026-07-28T10:00:00Z'),
      history: [
        { to: 'submitted', legacyValue: undefined },
        { to: 'invoice_file_attached', note: '会员卡发票.pdf' }
      ]
    }
  }

  const persistence = core.buildInvoiceFilePersistence(patch)
  assert.deepEqual(Object.keys(persistence).sort(), ['historyEntry', 'invoiceFile', 'updatedAt'])
  assert.equal(persistence.invoiceFile, patch.value.invoiceFile)
  assert.equal(persistence.updatedAt, patch.value.updatedAt)
  assert.equal(persistence.historyEntry, patch.value.history.at(-1))
})

test('员工模式入口只对管理员显示开票管理', () => {
  const js = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/staff/entry/entry.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/staff/entry/entry.wxml'), 'utf8')
  assert.match(js, /goInvoices/)
  assert.match(js, /title:\s*'开票管理'/)
  assert.match(js, /pages\/staff\/invoices\/invoices/)
  assert.match(js, /admin:[\s\S]*manage:\s*\['operations',\s*'invoices',\s*'maps'\]/)
  assert.match(wxml, /manageTasks/)
})

test('管理员工作台使用轻量开票待处理统计而不是拉取完整列表', () => {
  const source = fs.readFileSync(servicePath, 'utf8')
  assert.match(source, /async function staffSummary/)
  assert.match(source, /count\(\)/)
  assert.match(source, /pendingCount/)
  assert.match(source, /action === 'staffSummary'/)
  assert.match(source, /requireAdmin/)
})

test('开票列表拒绝普通员工，管理员可加载并按状态筛选', async (t) => {
  const denied = mountPage(t, listPath, {
    responders: { checkStaff: () => Promise.resolve({ role: 'front' }) }
  })
  await denied.page.onShow()
  assert.equal(denied.page.data.allowed, false)

  const allowed = mountPage(t, listPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'admin', name: '管理员' }),
      invoiceService: (data) => Promise.resolve({
        list: data.status ? STAFF_LIST.filter((item) => item.status === data.status) : STAFF_LIST
      })
    }
  })
  await allowed.page.onShow()
  assert.equal(allowed.page.data.allowed, true)
  assert.equal(allowed.page.data.list.length, 2)
  await allowed.page.onFilterTap({ currentTarget: { dataset: { key: 'reviewing' } } })
  assert.equal(allowed.page.data.list.length, 1)
  const listRequest = allowed.calls.request.filter((call) => call.name === 'invoiceService').pop()
  assert.equal(listRequest.data.action, 'listStaff')
  assert.equal(listRequest.data.status, 'reviewing')
})

test('开票列表整卡进入管理员详情', async (t) => {
  const { page, calls } = mountPage(t, listPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'admin' }),
      invoiceService: () => Promise.resolve({ list: STAFF_LIST })
    }
  })
  await page.onShow()
  page.onInvoiceTap({ currentTarget: { dataset: { id: 'inv-1' } } })
  assert.ok(calls.navigate.some((url) => url.includes('/pages/staff/invoice-detail/invoice-detail') && url.includes('inv-1')))
})

test('员工开票列表模板包含状态筛选、金额和错误恢复', () => {
  const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/staff/invoices/invoices.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/staff/invoices/invoices.wxss'), 'utf8')
  assert.match(wxml, /待审核/)
  assert.match(wxml, /审核中/)
  assert.match(wxml, /已开票/)
  assert.match(wxml, /已驳回/)
  assert.match(wxml, /sr-error-state/)
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
})

test('员工开票详情可开始审核', async (t) => {
  const submitted = Object.assign({}, REVIEWING, { status: 'submitted', _id: 'inv-1' })
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      invoiceService(data) {
        if (data.action === 'getStaffDetail') return Promise.resolve({ request: submitted })
        return Promise.resolve({ request: Object.assign({}, submitted, { status: data.status }) })
      }
    }
  })
  await page.onLoad({ requestId: 'inv-1' })
  await page.onStartReview()
  const update = calls.request.find((call) => call.data.action === 'updateStaff')
  assert.equal(update.data.status, 'reviewing')
  assert.equal(page.data.request.status, 'reviewing')
})

test('员工开票详情先上传并预览 PDF，再独立确认完成开票', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      invoiceService(data) {
        if (data.action === 'getStaffDetail') return Promise.resolve({ request: REVIEWING })
        if (data.action === 'attachInvoiceFile') {
          return Promise.resolve({
            request: Object.assign({}, REVIEWING, {
              invoiceFile: Object.assign({ version: 1 }, data.file)
            })
          })
        }
        if (data.action === 'getInvoiceFileAccess') {
          return Promise.resolve({ tempFileURL: 'https://temp.example.com/invoice.pdf' })
        }
        return Promise.resolve({ request: Object.assign({}, REVIEWING, { status: data.status }) })
      }
    }
  })
  await page.onLoad({ requestId: 'inv-2' })
  await page.onIssue()
  assert.ok(calls.toast.some((item) => /上传.*PDF/.test(item.title)))

  await page.onChooseInvoiceFile()
  assert.equal(calls.uploadFile.length, 1)
  assert.match(calls.uploadFile[0].cloudPath, /^invoice-files\/inv-2\/.+\.pdf$/)
  const attach = calls.request.find((call) => call.data.action === 'attachInvoiceFile')
  assert.equal(attach.data.revision, 2)
  assert.equal(attach.data.file.fileName, '森水会员卡电子发票.pdf')
  assert.equal(page.data.request.invoiceFile.version, 1)

  await page.onPreviewInvoice()
  assert.deepEqual(calls.downloadFile, ['https://temp.example.com/invoice.pdf'])
  assert.equal(calls.openDocument[0].fileType, 'pdf')

  await page.onIssue()
  const update = calls.request.filter((call) => call.data.action === 'updateStaff').pop()
  assert.equal(update.data.status, 'issued')
  assert.equal(update.data.revision, 2)
  assert.equal(update.data.invoiceNo, undefined)
  assert.equal(update.data.invoiceUrl, undefined)
  assert.equal(update.data.emailSent, undefined)
})

test('员工开票详情拒绝伪装 PDF 和超过 10MB 的文件', async (t) => {
  const oversized = mountPage(t, detailPath, {
    selectedFile: {
      name: '过大的发票.pdf',
      size: 10 * 1024 * 1024 + 1,
      path: '/tmp/large.pdf'
    },
    responders: {
      invoiceService: () => Promise.resolve({ request: REVIEWING })
    }
  })
  await oversized.page.onLoad({ requestId: 'inv-2' })
  await oversized.page.onChooseInvoiceFile()
  assert.equal(oversized.calls.uploadFile.length, 0)
  assert.ok(oversized.calls.toast.some((item) => /10MB/.test(item.title)))

  const disguised = mountPage(t, detailPath, {
    fileHeader: Uint8Array.from([60, 104, 116, 109, 108]).buffer,
    responders: {
      invoiceService: () => Promise.resolve({ request: REVIEWING })
    }
  })
  await disguised.page.onLoad({ requestId: 'inv-2' })
  await disguised.page.onChooseInvoiceFile()
  assert.equal(disguised.calls.uploadFile.length, 0)
  assert.ok(disguised.calls.toast.some((item) => /PDF/.test(item.title)))
})

test('PDF 选择能力未在微信后台声明时给出可执行的隐私配置提示', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    chooseFileError: {
      errMsg: 'chooseMessageFile:fail api scope is not declared in the privacy agreement'
    },
    responders: {
      invoiceService: () => Promise.resolve({ request: REVIEWING })
    }
  })
  await page.onLoad({ requestId: 'inv-2' })
  await page.onChooseInvoiceFile()

  assert.ok(calls.modal.some((item) => {
    return /隐私/.test(item.title) &&
      /设置[—-]服务内容声明[—-]用户隐私保护指引/.test(item.content) &&
      /收集你选中的文件/.test(item.content) &&
      /5 分钟/.test(item.content)
  }))
  assert.equal(page.data.uploading, false)
})

test('员工开票详情驳回必须填写原因并保留操作失败内容', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      invoiceService(data) {
        if (data.action === 'getStaffDetail') return Promise.resolve({ request: REVIEWING })
        return Promise.reject(new Error('网络异常'))
      }
    }
  })
  await page.onLoad({ requestId: 'inv-2' })
  await page.onReject()
  assert.ok(calls.toast.some((item) => /驳回原因/.test(item.title)))
  page.onRejectReasonInput({ detail: { value: '税号与单位名称不一致' } })
  await page.onReject()
  assert.equal(page.data.rejectReason, '税号与单位名称不一致')
  assert.equal(page.data.saving, false)
})

test('员工开票详情模板包含敏感资料说明和完整处理动作', () => {
  const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/staff/invoice-detail/invoice-detail.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/staff/invoice-detail/invoice-detail.wxss'), 'utf8')
  assert.match(wxml, /开始审核/)
  assert.match(wxml, /选择 PDF 文件/)
  assert.match(wxml, /预览发票/)
  assert.match(wxml, /替换文件/)
  assert.doesNotMatch(wxml, /确认已发送邮件/)
  assert.doesNotMatch(wxml, /发票号码/)
  assert.doesNotMatch(wxml, /cloud:\/\//)
  assert.match(wxml, /完成开票/)
  assert.match(wxml, /驳回申请/)
  assert.match(wxml, /仅用于发票开具/)
  assert.match(wxml, /<privacy-popup/)
  assert.match(wxss, /safe-area-inset-bottom/)
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
})

test('隐私政策如实说明管理员选择并上传电子发票 PDF', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/legal/privacy/privacy.js'),
    'utf8'
  )
  assert.match(source, /收集你选中的文件/)
  assert.match(source, /电子发票 PDF/)
})
