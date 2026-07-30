const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')
const applyPath = path.join(projectRoot, 'miniprogram/pages/invoice/apply/apply.js')
const detailPath = path.join(projectRoot, 'miniprogram/pages/invoice/detail/detail.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

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
    clipboard: [],
    download: [],
    openDocument: []
  }
  let pageConfig

  function stub(modulePath, exports) {
    originals[modulePath] = require.cache[modulePath]
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports }
  }

  const req = {
    call(name, data) {
      calls.request.push({ name, data })
      const responder = options.responders && options.responders[name]
      if (typeof responder === 'function') return responder(data, calls.request.length)
      if (responder !== undefined) return Promise.resolve(responder)
      return Promise.reject(new Error('no responder for ' + name))
    }
  }
  stub(requestPath, req)
  stub(hapticsPath, { haptic() {} })

  global.wx = {
    setNavigationBarTitle() {},
    showToast(o) { calls.toast.push(o) },
    navigateTo(o) { calls.navigate.push(o.url); if (o.success) o.success() },
    redirectTo(o) { calls.navigate.push(o.url); if (o.success) o.success() },
    showModal(o) {
      calls.modal.push(o)
      if (o.success) o.success({ confirm: options.modalConfirm !== false, cancel: options.modalConfirm === false })
    },
    setClipboardData(o) { calls.clipboard.push(o.data); if (o.success) o.success() },
    downloadFile(o) {
      calls.download.push(o)
      const result = options.downloadResult || {
        statusCode: 200,
        tempFilePath: '/tmp/invoice.pdf'
      }
      if (options.downloadError) {
        if (o.fail) o.fail(options.downloadError)
        return
      }
      if (o.success) o.success(result)
    },
    openDocument(o) {
      calls.openDocument.push(o)
      if (options.openDocumentError) {
        if (o.fail) o.fail(options.openDocumentError)
        return
      }
      if (o.success) o.success()
    },
    stopPullDownRefresh() {}
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

const ELIGIBLE_ORDER = {
  orderId: 'order-1',
  outTradeNo: 'TK001',
  orderType: 'ticket_order',
  orderTitle: '单人溪降票',
  invoiceAmount: 11600,
  eligible: true
}

const REVIEWING_REQUEST = {
  _id: 'inv-1',
  outTradeNo: 'TK001',
  orderTitle: '单人溪降票',
  invoiceAmount: 11600,
  invoiceType: 'electronic_normal',
  contentType: 'item_detail',
  titleType: 'company',
  titleName: '成都森水长河有限公司',
  taxNo: '91510100MA1234567X',
  email: 'finance@example.com',
  status: 'reviewing',
  submittedAt: '2026-07-28T03:00:00.000Z'
}

test('申请开票页加载订单快照并默认个人抬头', async (t) => {
  const { page } = mountPage(t, applyPath, {
    responders: {
      invoiceService: () => Promise.resolve({ request: null, order: ELIGIBLE_ORDER })
    }
  })
  await page.onLoad({ outTradeNo: 'TK001' })
  assert.equal(page.data.loading, false)
  assert.equal(page.data.order.invoiceAmountText, '116.00')
  assert.equal(page.data.form.titleType, 'personal')
  assert.equal(page.data.hasError, false)
})

test('申请开票页加载失败时展示可恢复提示并允许重试', async (t) => {
  let attempts = 0
  const unavailable = new Error('服务暂不可用，请稍后重试')
  unavailable.code = -504002
  const { page } = mountPage(t, applyPath, {
    responders: {
      invoiceService() {
        attempts += 1
        if (attempts === 1) return Promise.reject(unavailable)
        return Promise.resolve({ request: null, order: ELIGIBLE_ORDER })
      }
    }
  })

  await page.onLoad({ outTradeNo: 'TK001' })
  assert.equal(page.data.hasError, true)
  assert.equal(page.data.errorMessage, '服务暂不可用，请稍后重试')

  await page.onRetry()
  assert.equal(attempts, 2)
  assert.equal(page.data.hasError, false)
  assert.equal(page.data.errorMessage, '')

  const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/invoice/apply/apply.wxml'), 'utf8')
  assert.match(wxml, /desc="\{\{errorMessage/)
})

test('申请开票页单位抬头展开单位字段，切回个人后不提交单位资料', async (t) => {
  const { page } = mountPage(t, applyPath, {
    responders: {
      invoiceService: () => Promise.resolve({ request: null, order: ELIGIBLE_ORDER })
    }
  })
  await page.onLoad({ outTradeNo: 'TK001' })
  page.onTitleType({ currentTarget: { dataset: { type: 'company' } } })
  page.onFieldInput({ currentTarget: { dataset: { field: 'taxNo' } }, detail: { value: '91510100MA1234567X' } })
  page.onMoreToggle()
  assert.equal(page.data.form.titleType, 'company')
  assert.equal(page.data.moreExpanded, true)
  page.onTitleType({ currentTarget: { dataset: { type: 'personal' } } })
  assert.equal(page.data.form.taxNo, '')
  assert.equal(page.data.moreExpanded, false)
})

test('申请开票页本地校验个人和单位必填项及隐私同意', async (t) => {
  const { page } = mountPage(t, applyPath, {
    responders: {
      invoiceService: () => Promise.resolve({ request: null, order: ELIGIBLE_ORDER })
    }
  })
  await page.onLoad({ outTradeNo: 'TK001' })
  assert.match(page.localCheck(), /抬头/)
  page.setData({
    'form.titleName': '张三',
    'form.email': 'bad',
    'form.privacyAgreed': true
  })
  assert.match(page.localCheck(), /邮箱/)
  page.setData({ 'form.email': 'zhangsan@example.com' })
  assert.equal(page.localCheck(), '')
  page.onTitleType({ currentTarget: { dataset: { type: 'company' } } })
  assert.match(page.localCheck(), /税号/)
})

test('申请开票页确认后提交服务端并进入进度页，重复点击被锁定', async (t) => {
  let resolveSubmit
  const pending = new Promise((resolve) => { resolveSubmit = resolve })
  const { page, calls } = mountPage(t, applyPath, {
    responders: {
      invoiceService(data) {
        if (data.action === 'getMine') return Promise.resolve({ request: null, order: ELIGIBLE_ORDER })
        return pending
      }
    }
  })
  await page.onLoad({ outTradeNo: 'TK001' })
  page.setData({
    'form.titleName': '张三',
    'form.email': 'zhangsan@example.com',
    'form.privacyAgreed': true
  })
  const first = page.onSubmit()
  const second = page.onSubmit()
  assert.equal(page.data.submitting, true)
  assert.equal(calls.request.filter((c) => c.data.action === 'submit').length, 1)
  resolveSubmit({ request: { status: 'submitted' } })
  await Promise.all([first, second])
  assert.ok(calls.navigate.some((url) => url.includes('/pages/invoice/detail/detail') && url.includes('TK001')))
})

test('申请开票页被驳回时回填资料并允许重新提交', async (t) => {
  const rejected = Object.assign({}, REVIEWING_REQUEST, {
    status: 'rejected',
    rejectReason: '单位税号不清晰'
  })
  const { page } = mountPage(t, applyPath, {
    responders: {
      invoiceService: () => Promise.resolve({ request: rejected })
    }
  })
  await page.onLoad({ outTradeNo: 'TK001' })
  assert.equal(page.data.form.titleType, 'company')
  assert.equal(page.data.form.titleName, '成都森水长河有限公司')
  assert.equal(page.data.form.taxNo, '91510100MA1234567X')
  assert.equal(page.data.rejectReason, '单位税号不清晰')
})

test('申请开票页模板提供固定发票信息、折叠单位资料和底部安全区', () => {
  const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/invoice/apply/apply.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/invoice/apply/apply.wxss'), 'utf8')
  assert.match(wxml, /电子普通发票/)
  assert.match(wxml, /商品明细/)
  assert.match(wxml, /个人/)
  assert.match(wxml, /单位/)
  assert.match(wxml, /更多单位信息/)
  assert.match(wxml, /隐私政策/)
  assert.match(wxss, /safe-area-inset-bottom/)
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/, '页面颜色必须使用全局 Design Token')
})

test('开票进度页将提交、审核、开票映射为三段进度', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: {
      invoiceService: () => Promise.resolve({ request: REVIEWING_REQUEST })
    }
  })
  await page.onLoad({ outTradeNo: 'TK001' })
  assert.equal(page.data.request.statusText, '商家审核中')
  assert.equal(page.data.progressStep, 2)
  assert.match(page.data.statusDesc, /10 个自然日/)
})

test('开票进度页已开票显示 PDF 文件名和开具时间，不承诺邮件已发送', async (t) => {
  const issued = Object.assign({}, REVIEWING_REQUEST, {
    status: 'issued',
    issuedAt: '2026-07-28T06:30:00.000Z',
    invoiceFile: {
      available: true,
      fileName: '森水长河电子发票.pdf',
      size: 2048,
      contentType: 'application/pdf',
      version: 1,
      revision: 1
    }
  })
  const { page } = mountPage(t, detailPath, {
    responders: {
      invoiceService: () => Promise.resolve({ request: issued })
    }
  })
  await page.onLoad({ outTradeNo: 'TK001' })
  assert.equal(page.data.progressStep, 3)
  assert.equal(page.data.request.invoiceFile.fileName, '森水长河电子发票.pdf')
  assert.equal(page.data.request.invoiceFile.sizeText, '2.0 KB')
  assert.match(page.data.request.issuedAtText, /2026-07-28/)

  const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/invoice/detail/detail.wxml'), 'utf8')
  assert.doesNotMatch(wxml, /已发送至|emailSent/)
})

test('查看电子发票每次获取授权地址并用 PDF 文档能力打开', async (t) => {
  const issued = Object.assign({}, REVIEWING_REQUEST, {
    status: 'issued',
    invoiceFile: {
      available: true,
      fileName: '森水长河电子发票.pdf',
      size: 2048
    }
  })
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      invoiceService(data) {
        if (data.action === 'getMine') return Promise.resolve({ request: issued })
        if (data.action === 'getInvoiceFileAccess') {
          return Promise.resolve({
            fileName: '森水长河电子发票.pdf',
            tempFileURL: 'https://tmp.example.com/invoice.pdf'
          })
        }
        return Promise.reject(new Error('unexpected action'))
      }
    }
  })

  await page.onLoad({ outTradeNo: 'TK001' })
  await page.onViewInvoice()
  const access = calls.request.find((item) => item.data.action === 'getInvoiceFileAccess')
  assert.equal(access.data.requestId, 'inv-1')
  assert.equal(access.data.purpose, 'preview')
  assert.equal(calls.download[0].url, 'https://tmp.example.com/invoice.pdf')
  assert.equal(calls.openDocument[0].fileType, 'pdf')
  assert.equal(calls.openDocument[0].showMenu, true)
  assert.equal(page.data.fileBusy, false)
})

test('下载电子发票提供明确反馈，失败后可以重试', async (t) => {
  let attempts = 0
  const issued = Object.assign({}, REVIEWING_REQUEST, {
    status: 'issued',
    invoiceFile: {
      available: true,
      fileName: '森水长河电子发票.pdf',
      size: 2048
    }
  })
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      invoiceService(data) {
        if (data.action === 'getMine') return Promise.resolve({ request: issued })
        attempts += 1
        if (attempts === 1) return Promise.reject(new Error('临时地址已过期'))
        return Promise.resolve({
          fileName: '森水长河电子发票.pdf',
          tempFileURL: 'https://tmp.example.com/invoice.pdf'
        })
      }
    }
  })

  await page.onLoad({ outTradeNo: 'TK001' })
  await page.onDownloadInvoice()
  assert.equal(page.data.fileBusy, false)
  assert.match(calls.toast.at(-1).title, /失败|重试/)

  await page.onDownloadInvoice()
  assert.equal(attempts, 2)
  assert.equal(calls.request.at(-1).data.purpose, 'download')
  assert.match(calls.toast.at(-1).title, /已下载/)
})

test('历史发票地址仍可通过兼容入口查看，被驳回可返回修改', async (t) => {
  const issued = Object.assign({}, REVIEWING_REQUEST, {
    status: 'issued',
    invoiceUrl: 'https://example.com/legacy-invoice.pdf'
  })
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      invoiceService: () => Promise.resolve({ request: issued })
    }
  })
  await page.onLoad({ outTradeNo: 'TK001' })
  assert.equal(page.data.request.hasLegacyInvoice, true)
  await page.onViewInvoice()
  assert.equal(calls.download[0].url, 'https://example.com/legacy-invoice.pdf')

  page.setData({ 'request.status': 'rejected' })
  page.onEdit()
  assert.ok(calls.navigate.some((url) => url.includes('/pages/invoice/apply/apply')))
})

test('开票进度页模板包含三段节点、申请详情和异常恢复', () => {
  const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/invoice/detail/detail.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/invoice/detail/detail.wxss'), 'utf8')
  assert.match(wxml, /申请提交/)
  assert.match(wxml, /商家审核/)
  assert.match(wxml, /商家开票/)
  assert.match(wxml, /查看电子发票/)
  assert.match(wxml, /下载电子发票/)
  assert.match(wxml, /sr-error-state/)
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
})
