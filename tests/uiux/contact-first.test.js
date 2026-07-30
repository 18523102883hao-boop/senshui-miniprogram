// 企微直连优先（业主 2026-07-25 决策）
// 预约、特色服务等场景改为「加企微 + 打电话」为主，表单退为次要选项
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const uiDir = path.join(projectRoot, 'miniprogram/components/ui')
const entryPath = path.join(projectRoot, 'miniprogram/pages/reservation/entry/entry.js')
const detailPath = path.join(projectRoot, 'miniprogram/pages/service/detail/detail.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')
const envPath = path.join(projectRoot, 'miniprogram/env.js')
const qrcodePath = path.join(projectRoot, 'miniprogram/utils/qrcode.js')

function clone(v) { return JSON.parse(JSON.stringify(v)) }

function mountComponent(t, name, props) {
  const originalComponent = global.Component
  const originalWx = global.wx
  const originals = {}
  const calls = { phone: [], preview: [], navigate: [], toast: [] }
  let config

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }
  if (props && props.__env) {
    stub(envPath, props.__env)
    originals[qrcodePath] = require.cache[qrcodePath]
    delete require.cache[qrcodePath]
  }

  global.wx = {
    makePhoneCall(o) { calls.phone.push(o.phoneNumber) },
    previewImage(o) { calls.preview.push(o) },
    navigateTo(o) { calls.navigate.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    setClipboardData(o) { if (o.success) o.success() }
  }
  global.Component = (c) => { config = c }
  const p = path.join(uiDir, name, 'index.js')
  delete require.cache[p]
  require(p)

  const data = {}
  Object.keys(config.properties || {}).forEach((k) => { data[k] = config.properties[k].value })
  Object.assign(data, clone(config.data || {}))
  if (props) Object.keys(props).forEach((k) => { if (k !== '__env') data[k] = props[k] })

  const events = []
  const inst = Object.assign({}, config.methods, {
    data,
    setData(patch) { Object.assign(this.data, patch) },
    triggerEvent(n, d) { events.push({ name: n, detail: d }) }
  })
  if (config.lifetimes && config.lifetimes.attached) config.lifetimes.attached.call(inst)

  t.after(() => {
    delete require.cache[p]
    Object.keys(originals).forEach((k) => {
      if (originals[k]) require.cache[k] = originals[k]
      else delete require.cache[k]
    })
    global.Component = originalComponent
    global.wx = originalWx
  })
  return { inst, calls, events }
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], phone: [], toast: [] }
  let pageConfig

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }
  const req = {
    call(name, data) {
      calls.request.push({ name, data })
      const r = options.responders && options.responders[name]
      if (typeof r === 'function') return r(data)
      if (r) return Promise.resolve(r)
      return Promise.reject(new Error('no responder'))
    }
  }
  req.callWithLoading = (n, d) => req.call(n, d)
  stub(requestPath, req)
  stub(hapticsPath, { haptic() {} })

  global.wx = {
    navigateTo(o) { calls.navigate.push(o.url); if (options.navigateFail && o.fail) o.fail({}) },
    switchTab(o) { calls.navigate.push(o.url) },
    makePhoneCall(o) { calls.phone.push(o.phoneNumber) },
    showToast(o) { calls.toast.push(o) },
    previewImage() {}, setNavigationBarTitle() {}, stopPullDownRefresh() {},
    getStorageSync() { return null }, setStorageSync() {}
  }
  global.Page = (c) => { pageConfig = c }
  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) { Object.assign(this.data, patch) }
  })
  t.after(() => {
    delete require.cache[pagePath]
    Object.keys(originals).forEach((p) => {
      if (originals[p]) require.cache[p] = originals[p]
      else delete require.cache[p]
    })
    global.Page = originalPage
    global.wx = originalWx
  })
  return { page, calls }
}

const ENV_WITH_QR = {
  frontDeskPhone: '19112040740',
  park: { name: '森水长河' },
  concierge: { phone: '19112040740', serviceHours: '每日 10:00-18:00' },
  qrcodes: { concierge: '/images/qr-concierge.png' }
}
const ENV_NO_QR = Object.assign({}, ENV_WITH_QR, { qrcodes: {} })

// ============ sr-contact-card 组件 ============

test('联系卡同时提供二维码与电话两条路径', (t) => {
  const { inst } = mountComponent(t, 'sr-contact-card', { scene: 'concierge', __env: ENV_WITH_QR })
  assert.equal(inst.data.qrEnabled, true)
  assert.ok(inst.data.phone, '必须有电话兜底')
})

test('未配置二维码时仍可打电话，不出现裂图', (t) => {
  const { inst } = mountComponent(t, 'sr-contact-card', { scene: 'birthday', __env: ENV_NO_QR })
  assert.equal(inst.data.qrEnabled, false, '未配置不渲染二维码')
  assert.ok(inst.data.phone, '电话必须始终可用')
})

test('二维码图片加载失败时自动降级为只显示电话', (t) => {
  const { inst } = mountComponent(t, 'sr-contact-card', { scene: 'concierge', __env: ENV_WITH_QR })
  assert.equal(inst.data.qrEnabled, true)
  inst.onQrError()
  assert.equal(inst.data.qrEnabled, false, '图片 404 时必须隐藏，不能留裂图')
})

test('点击拨号使用配置的电话', (t) => {
  const { inst, calls } = mountComponent(t, 'sr-contact-card', { scene: 'concierge', __env: ENV_WITH_QR })
  inst.onCall()
  assert.deepEqual(calls.phone, ['19112040740'])
})

test('点击二维码可放大预览', (t) => {
  const { inst, calls } = mountComponent(t, 'sr-contact-card', { scene: 'concierge', __env: ENV_WITH_QR })
  inst.onPreview()
  assert.equal(calls.preview[0].urls[0], '/images/qr-concierge.png')
})

test('表单入口是可选的，默认不显示（业主要求少让客户填）', (t) => {
  const { inst } = mountComponent(t, 'sr-contact-card', { scene: 'concierge', __env: ENV_WITH_QR })
  assert.equal(inst.data.formRoute, '', '默认不给表单入口')
})

test('联系卡默认不配置已下线的服务线索表单', (t) => {
  const { inst } = mountComponent(t, 'sr-contact-card', {
    scene: 'birthday', __env: ENV_WITH_QR
  })
  assert.equal(inst.data.formRoute, '')
})

test('组件不直接调用云函数（业务留在页面）', () => {
  const src = fs.readFileSync(path.join(uiDir, 'sr-contact-card/index.js'), 'utf8')
  for (const bad of ['wx.cloud', 'utils/request', 'callFunction']) {
    assert.equal(src.includes(bad), false, '不得调用 ' + bad)
  }
})

// ============ 预约中心改为企微优先 ============

test('预约中心首屏是联系管家，不是让客户填表', (t) => {
  const { page } = mountPage(t, entryPath)
  assert.equal(page.data.contactFirst, true, '预约走企微直连优先')
  assert.equal(page.data.contactScene, 'concierge')
})

test('预约中心已取消自助表单（业主：不好管理，易漏单）', (t) => {
  const { page } = mountPage(t, entryPath)
  assert.equal(page.data.entries, undefined, '自助入口已移除')
  assert.ok(Array.isArray(page.data.scenes), '改为说明可安排的场景')
})

test('预约中心可直接拨打预约电话', (t) => {
  const { page, calls } = mountPage(t, entryPath)
  page.onCall()
  assert.deepEqual(calls.phone, ['19112040740'])
})

// ============ 特色服务改为企微优先 ============

test('服务详情页主行动是加企微顾问而非填表', (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: { getArticle: () => Promise.reject(new Error('x')) }
  })
  page.setData({ type: 'birthday' })
  assert.equal(page.data.contactFirst, true)
})

// 业主 2026-07-26：详情页只留「加管家企微」一条主路径，
// 填表与底部拨号栏都去掉——联系卡里已经有二维码和致电按钮
test('服务详情页只保留统一联系卡这一条联系路径', (t) => {
  const fs = require('node:fs')
  const wxml = fs.readFileSync(detailPath.replace(/\.js$/, '.wxml'), 'utf8')
  assert.ok(wxml.includes('sr-contact-card'), '必须保留联系卡')
  assert.ok(!/formRoute/.test(wxml), '不该再有填表入口')
  assert.ok(!/bar__cta/.test(wxml), '不该再有底部 CTA 栏')
})
