const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/ling-exchange/ling-exchange.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originalRequest = require.cache[requestPath]
  const calls = { requests: [], toasts: [] }
  let config

  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      call(name, data) {
        calls.requests.push({ name, data })
        return Promise.resolve({ role: 'front' })
      },
      callWithLoading(name, data) {
        calls.requests.push({ name, data })
        if (name === 'resolveUserForLing') {
          return Promise.resolve({
            userLabel: 'open****1234',
            balance: 800,
            role: 'front',
            dailyLimit: 5000,
            dailyUsed: 4200,
            dailyRemaining: 800,
            dayKey: '2026-07-28'
          })
        }
        return Promise.resolve({
          balance: 1000,
          dailyLimit: 5000,
          dailyUsed: 4400,
          dailyRemaining: 600,
          dayKey: '2026-07-28'
        })
      }
    }
  }
  global.wx = {
    showToast(input) { calls.toasts.push(input) }
  }
  global.Page = (pageConfig) => { config = pageConfig }
  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, config)
  page.data = clone(config.data)
  page.setData = function (patch) { Object.assign(this.data, patch) }

  t.after(() => {
    global.Page = originalPage
    global.wx = originalWx
    if (originalRequest) require.cache[requestPath] = originalRequest
    else delete require.cache[requestPath]
    delete require.cache[pagePath]
  })

  return { page, calls }
}

test('扫码后展示云端返回的角色额度、今日已用和剩余', async (t) => {
  const { page } = mountPage(t)
  await page.resolve('UL.token')

  assert.equal(page.data.customer.role, 'front')
  assert.equal(page.data.customer.dailyLimit, 5000)
  assert.equal(page.data.customer.dailyUsed, 4200)
  assert.equal(page.data.customer.dailyRemaining, 800)
})

test('实体转电子超过今日剩余额度时在前端拦截且不调用兑换', async (t) => {
  const { page, calls } = mountPage(t)
  await page.resolve('UL.token')
  page.setData({ amount: '801', direction: 'p2d' })
  page.submit()

  assert.equal(
    calls.requests.filter((request) => request.name === 'exchangeLing').length,
    0
  )
  assert.match(calls.toasts.at(-1).title, /今日剩余额度 800/)
})

test('兑换成功后立即使用云端响应刷新余额与额度', async (t) => {
  const { page } = mountPage(t)
  await page.resolve('UL.token')
  page.setData({ amount: '200', direction: 'p2d' })
  await page.submit()

  assert.equal(page.data.customer.balance, 1000)
  assert.equal(page.data.customer.dailyUsed, 4400)
  assert.equal(page.data.customer.dailyRemaining, 600)
  assert.equal(page.data.amount, '')
})

test('员工兑换模板清晰展示每日累计额度口径', () => {
  const template = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/ling-exchange/ling-exchange.wxml'),
    'utf8'
  )
  assert.match(template, /今日实体转电子额度/)
  assert.match(template, /角色上限/)
  assert.match(template, /今日已用/)
  assert.match(template, /今日剩余/)
  assert.match(template, /按客户、北京时间自然日累计/)
})
