// Task 5 入园攻略与管家服务测试
// PRD §10.3 入园攻略（15 项）、§11.1 管家入口、§28.7 未确认设施不得发布
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const guidePath = path.join(projectRoot, 'miniprogram/pages/guide/guide.js')
const conciergePath = path.join(projectRoot, 'miniprogram/pages/concierge/concierge.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')
const envPath = path.join(projectRoot, 'miniprogram/env.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], toast: [], phone: [], location: [], clipboard: [], preview: [] }
  let pageConfig

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }

  stub(requestPath, {
    call(name, data) {
      calls.request.push({ name, data })
      const responder = options.responders && options.responders[name]
      if (typeof responder === 'function') return responder(data)
      return Promise.resolve(responder || {})
    },
    callWithLoading(name, data) { return this.call(name, data) }
  })
  stub(hapticsPath, { haptic() {} })
  if (options.env) stub(envPath, options.env)

  global.wx = {
    navigateTo(o) { calls.navigate.push(o.url); if (options.navigateFail && o.fail) o.fail({}) },
    showToast(o) { calls.toast.push(o) },
    makePhoneCall(o) { calls.phone.push(o.phoneNumber) },
    openLocation(o) { calls.location.push(o) },
    setClipboardData(o) { calls.clipboard.push(o.data) },
    previewImage(o) { calls.preview.push(o) },
    getStorageSync() { return null },
    setStorageSync() {},
    setNavigationBarTitle() {},
    stopPullDownRefresh() {}
  }
  global.Page = (config) => { pageConfig = config }

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

const BASE_ENV = {
  cloudEnv: 'test-env',
  version: '1.0.0',
  frontDeskPhone: '19112040740',
  park: {
    name: '森水长河',
    address: '重庆市綦江区黑山镇招呼站（公交站）东南 10 米',
    latitude: 0,
    longitude: 0,
    openHours: '10:00-18:00',
    admissionHours: '10:00-16:30'
  },
  concierge: { phone: '19112040740', qrcodeUrl: '', serviceHours: '每日 10:00-18:00' }
}

function envWith(patch) {
  return Object.assign({}, BASE_ENV, patch)
}

// ============ 入园攻略 ============

test('攻略分类覆盖交通、检票、设施、安全和服务五组', (t) => {
  const { page } = mountPage(t, guidePath, { env: BASE_ENV })
  const keys = page.data.groups.map((g) => g.key)
  for (const k of ['transport', 'admission', 'facility', 'safety', 'service']) {
    assert.ok(keys.includes(k), '缺少攻略分组：' + k)
  }
})

test('已确认的信息按业主提供的口径展示', (t) => {
  const { page } = mountPage(t, guidePath, { env: BASE_ENV })
  const all = page.data.groups.reduce((acc, g) => acc.concat(g.items), [])
  const text = JSON.stringify(all)
  assert.ok(text.includes('10:00-16:30'), '入园时间必须展示')
  assert.ok(text.includes('黑山镇'), '地址必须展示')
  assert.ok(text.includes('150'), '身高限制必须展示')
})

test('未确认的设施项一律显示「请咨询管家」，不得伪造设施承诺', (t) => {
  const { page } = mountPage(t, guidePath, { env: BASE_ENV })
  const all = page.data.groups.reduce((acc, g) => acc.concat(g.items), [])
  const pending = all.filter((i) => i.status === 'ask')
  assert.ok(pending.length > 0, '应存在待确认项（停车/母婴/宠物等）')
  for (const item of pending) {
    assert.equal(item.desc, '请咨询管家', '未确认项文案必须统一为「请咨询管家」')
  }
  // 不得出现凭空捏造的设施承诺
  const text = JSON.stringify(all)
  for (const word of ['免费停车', '个车位', '免费提供']) {
    assert.equal(text.includes(word), false, '不得伪造设施信息：' + word)
  }
})

test('一键导航使用配置坐标', (t) => {
  const { page, calls } = mountPage(t, guidePath, {
    env: envWith({ park: Object.assign({}, BASE_ENV.park, { latitude: 28.9012, longitude: 106.6123 }) })
  })
  page.onNavigate()
  assert.equal(calls.location.length, 1)
  assert.equal(calls.location[0].latitude, 28.9012)
  assert.equal(calls.location[0].longitude, 106.6123)
  assert.ok(calls.location[0].address.includes('黑山镇'))
})

test('坐标未配置时不调用导航，改为复制地址', (t) => {
  const { page, calls } = mountPage(t, guidePath, { env: BASE_ENV })
  page.onNavigate()
  assert.equal(calls.location.length, 0, '坐标为空时不得调用 openLocation')
  assert.equal(calls.clipboard[0], BASE_ENV.park.address)
  assert.equal(calls.toast.length, 1)
})

test('云端攻略文章可覆盖本地默认内容', async (t) => {
  const { page } = mountPage(t, guidePath, {
    env: BASE_ENV,
    responders: {
      getArticle: () => Promise.resolve({
        article: {
          slug: 'visit-guide', title: '入园攻略',
          blocks: [{ type: 'text', data: { text: '云端最新攻略' } }]
        }
      })
    }
  })
  await page.loadArticle()
  assert.equal(page.data.article.title, '入园攻略')
  assert.equal(page.data.blocks.length, 1)
})

test('云端攻略缺失时仍显示本地默认分组，不白屏', async (t) => {
  const { page } = mountPage(t, guidePath, {
    env: BASE_ENV,
    responders: { getArticle: () => Promise.reject(new Error('offline')) }
  })
  await page.loadArticle()
  assert.ok(page.data.groups.length >= 5)
  assert.equal(page.data.hasError, false, '本地内容可用时不算错误')
})

test('攻略页拨号走确认过的前台电话', (t) => {
  const { page, calls } = mountPage(t, guidePath, { env: BASE_ENV })
  page.onCallFront()
  assert.deepEqual(calls.phone, ['19112040740'])
})

// ============ 管家服务 ============

test('管家页提供电话与表单两条无障碍替代路径', (t) => {
  const { page } = mountPage(t, conciergePath, { env: BASE_ENV })
  const types = page.data.channels.map((c) => c.type)
  assert.ok(types.includes('phone'), '必须能拨电话')
  assert.ok(types.includes('form'), '必须能提交咨询表单')
  assert.ok(types.includes('wechat'), '优先提供微信客服')
})

test('未配置二维码时不渲染二维码渠道，避免空图', (t) => {
  const { page } = mountPage(t, conciergePath, { env: BASE_ENV })
  const types = page.data.channels.map((c) => c.type)
  assert.equal(types.includes('qrcode'), false, '二维码未配置就不能出现在渠道里')
  assert.equal(page.data.qrcodeUrl, '')
})

test('配置二维码后才出现二维码渠道且可预览', (t) => {
  const { page, calls } = mountPage(t, conciergePath, {
    env: envWith({ concierge: Object.assign({}, BASE_ENV.concierge, { qrcodeUrl: 'https://cdn/qr.png' }) })
  })
  const qr = page.data.channels.filter((c) => c.type === 'qrcode')[0]
  assert.ok(qr, '配置后应出现二维码渠道')
  page.onPreviewQrcode()
  assert.equal(calls.preview[0].urls[0], 'https://cdn/qr.png')
})

test('管家页展示营业时间，不承诺未确认的响应时限', (t) => {
  const { page } = mountPage(t, conciergePath, { env: BASE_ENV })
  assert.ok(page.data.serviceHours)
  const text = JSON.stringify(page.data)
  for (const word of ['5 分钟内', '30 分钟内', '秒回', '7×24']) {
    assert.equal(text.includes(word), false, '不得承诺未确认的响应时限：' + word)
  }
})

test('点击渠道按类型分发：电话拨号、表单跳线索页', (t) => {
  const { page, calls } = mountPage(t, conciergePath, { env: BASE_ENV })
  page.onChannelTap({ currentTarget: { dataset: { type: 'phone' } } })
  assert.deepEqual(calls.phone, ['19112040740'])

  page.onChannelTap({ currentTarget: { dataset: { type: 'form' } } })
  assert.ok(calls.navigate[0].indexOf('/pages/service/lead/lead') === 0)
})

test('表单页尚未上线时给出提示而不是静默失败', (t) => {
  const { page, calls } = mountPage(t, conciergePath, { env: BASE_ENV, navigateFail: true })
  page.onChannelTap({ currentTarget: { dataset: { type: 'form' } } })
  assert.equal(calls.toast.length, 1)
})
