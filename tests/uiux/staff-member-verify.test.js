const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/verify/verify.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, modalConfirm) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originalRequest = require.cache[requestPath]
  const calls = { requests: [], modals: [], toasts: [] }
  let config

  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      call() { return Promise.resolve({ member: {}, benefits: [] }) },
      callWithLoading(name, data) {
        calls.requests.push({ name, data })
        return Promise.resolve({ done: true })
      }
    }
  }
  global.wx = {
    showModal(input) {
      calls.modals.push(input)
      input.success({ confirm: modalConfirm, cancel: !modalConfirm })
    },
    showToast(input) { calls.toasts.push(input) },
    navigateBack() {}
  }
  global.Page = (pageConfig) => { config = pageConfig }
  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, config)
  page.data = clone(config.data)
  page.data.memberCode = 'SR-001'
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

test('生日权益点击后先提示核对本人身份证，确认后才调用云端', async (t) => {
  const { page, calls } = mountPage(t, true)
  await page.doVerify({ currentTarget: { dataset: { type: 'birthday' } } })

  assert.equal(calls.modals.length, 1)
  assert.match(calls.modals[0].title, /核对本人身份证/)
  assert.match(calls.modals[0].content, /证件生日与会员生日一致/)
  assert.deepEqual(calls.requests[0], {
    name: 'verifyBenefit',
    data: {
      memberCode: 'SR-001',
      benefitType: 'birthday',
      identityChecked: true
    }
  })
})

test('员工取消身份证核验时不调用云端', async (t) => {
  const { page, calls } = mountPage(t, false)
  await page.doVerify({ currentTarget: { dataset: { type: 'birthday' } } })
  assert.equal(calls.requests.length, 0)
})

test('生日权益行持续显示身份证核验说明', () => {
  const template = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/verify/verify.wxml'),
    'utf8'
  )
  assert.match(template, /item\.type === 'birthday'/)
  assert.match(template, /请客户出示本人身份证/)
  assert.match(template, /核对证件生日/)
})
