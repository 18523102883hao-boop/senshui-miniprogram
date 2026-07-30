const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/entry/entry.js')
const wxmlPath = path.join(projectRoot, 'miniprogram/pages/staff/entry/entry.wxml')
const wxssPath = path.join(projectRoot, 'miniprogram/pages/staff/entry/entry.wxss')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, responders = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originalRequest = require.cache[requestPath]
  const originalHaptics = require.cache[hapticsPath]
  const calls = { request: [], navigate: [], toast: [], haptic: [] }
  let pageConfig

  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      call(name, data) {
        calls.request.push({ name, data })
        const responder = responders[name]
        return responder
          ? responder(data)
          : Promise.resolve({})
      },
      callWithLoading(name, data, loadingText) {
        calls.request.push({ name, data, loadingText })
        const responder = responders[name]
        return responder
          ? responder(data)
          : Promise.resolve({})
      }
    }
  }
  require.cache[hapticsPath] = {
    id: hapticsPath,
    filename: hapticsPath,
    loaded: true,
    exports: {
      haptic(type) {
        calls.haptic.push(type)
      }
    }
  }

  global.wx = {
    navigateTo({ url }) {
      calls.navigate.push(url)
    },
    showToast(payload) {
      calls.toast.push(payload)
    },
    stopPullDownRefresh() {}
  }
  global.Page = (config) => {
    pageConfig = config
  }

  delete require.cache[pagePath]
  const exports = require(pagePath)
  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) {
      Object.keys(patch).forEach((key) => {
        if (key.indexOf('.') < 0) {
          this.data[key] = patch[key]
          return
        }
        const parts = key.split('.')
        let target = this.data
        for (let index = 0; index < parts.length - 1; index += 1) {
          target[parts[index]] = target[parts[index]] || {}
          target = target[parts[index]]
        }
        target[parts.at(-1)] = patch[key]
      })
    }
  })

  t.after(() => {
    delete require.cache[pagePath]
    if (originalRequest) require.cache[requestPath] = originalRequest
    else delete require.cache[requestPath]
    if (originalHaptics) require.cache[hapticsPath] = originalHaptics
    else delete require.cache[hapticsPath]
    global.Page = originalPage
    global.wx = originalWx
  })

  return { page, calls, exports }
}

test('身份查询失败显示错误重试态而不是员工登记', async (t) => {
  const { page } = mountPage(t, {
    checkStaff: () => Promise.reject(new Error('网络异常'))
  })

  await page.check()

  assert.equal(page.data.viewState, 'error')
  assert.equal(page.data.role, null)
})

test('查询成功但没有角色时才显示未绑定态', async (t) => {
  const { page } = mountPage(t, {
    checkStaff: () => Promise.resolve({ role: null })
  })

  await page.check()

  assert.equal(page.data.viewState, 'unbound')
  assert.equal(page.data.role, null)
})

test('四种角色获得稳定且无越权的任务顺序', (t) => {
  const { exports } = mountPage(t)
  assert.equal(typeof exports.buildTaskLayout, 'function')

  assert.deepEqual(exports.buildTaskLayout('front').all.map((item) => item.key), [
    'charge', 'ticketVerify', 'lingExchange', 'memberVerify'
  ])
  assert.deepEqual(exports.buildTaskLayout('creek').all.map((item) => item.key), [
    'ticketVerify', 'memberVerify'
  ])
  assert.deepEqual(exports.buildTaskLayout('bar').all.map((item) => item.key), [
    'memberVerify'
  ])
  assert.deepEqual(exports.buildTaskLayout('admin').all.map((item) => item.key), [
    'ticketVerify', 'charge', 'memberVerify', 'lingExchange',
    'operations', 'invoices', 'maps'
  ])
})

test('管理员概览失败不影响身份和任务入口', async (t) => {
  const { page } = mountPage(t, {
    checkStaff: () => Promise.resolve({ role: 'admin', name: '张浩' }),
    adminOperationsLedger: () => Promise.reject(new Error('汇总失败')),
    invoiceService: () => Promise.resolve({ pendingCount: 2 })
  })

  await page.check()

  assert.equal(page.data.viewState, 'bound')
  assert.equal(page.data.role, 'admin')
  assert.equal(page.data.primaryTask.key, 'ticketVerify')
  assert.equal(page.data.dashboardError, true)
  assert.equal(page.data.dashboard.pendingInvoiceCount, 2)
})

test('管理员今日概览使用核销确认的实际净收入而不是支付减退款', async (t) => {
  const { page } = mountPage(t, {
    checkStaff: () => Promise.resolve({ role: 'admin', name: '张浩' }),
    adminOperationsLedger: () => Promise.resolve({
      finance: {
        net: 50000,
        actualNetIncome: 16800
      },
      operations: {
        actualNetIncome: 16800,
        admittedPeopleCount: 1,
        verifiedTicketCount: 1
      }
    }),
    invoiceService: () => Promise.resolve({ pendingCount: 0 })
  })

  await page.check()

  assert.equal(page.data.dashboard.actualNetIncomeText, '168.00')
  assert.equal(Object.hasOwn(page.data.dashboard, 'netText'), false)
})

test('任务卡使用统一路由处理并提供轻触觉反馈', (t) => {
  const { page, calls } = mountPage(t)

  page.onTaskTap({
    currentTarget: {
      dataset: { route: '/pages/staff/ticket-verify/ticket-verify' }
    }
  })

  assert.deepEqual(calls.navigate, ['/pages/staff/ticket-verify/ticket-verify'])
  assert.deepEqual(calls.haptic, ['light'])
})

test('员工工作台采用长河令深色层级并满足现场触控尺寸', () => {
  const wxml = fs.readFileSync(wxmlPath, 'utf8')
  const wxss = fs.readFileSync(wxssPath, 'utf8')

  assert.match(wxml, /primaryTask/)
  assert.match(wxml, /frequentTasks/)
  assert.match(wxml, /manageTasks/)
  assert.match(wxml, /今日实际净收入/)
  assert.match(wxml, /actualNetIncomeText/)
  assert.match(wxml, /viewState === 'error'/)
  assert.match(wxml, /viewState === 'unbound'/)
  assert.match(wxss, /var\(--sr-dark-bg\)/)
  assert.match(wxss, /var\(--sr-dark-card\)/)
  assert.match(wxss, /min-height:\s*88rpx/)
  assert.doesNotMatch(wxml, /线索跟进/)
  assert.doesNotMatch(wxml, /goLeads/)
})
