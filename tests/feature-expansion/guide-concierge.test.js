// Task 5 入园攻略与管家服务测试
// PRD §10.3 入园攻略（15 项）、§11.1 管家入口、§28.7 未确认设施不得发布
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const guidePath = path.join(projectRoot, 'miniprogram/pages/guide/guide.js')
const conciergePath = path.join(projectRoot, 'miniprogram/pages/concierge/concierge.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')
const envPath = path.join(projectRoot, 'miniprogram/env.js')
const qrcodePath = path.join(projectRoot, 'miniprogram/utils/qrcode.js')

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
  if (options.env) {
    stub(envPath, options.env)
    // qrcode.js 读 env，必须让它重新加载才能拿到注入的配置
    originals[qrcodePath] = require.cache[qrcodePath]
    delete require.cache[qrcodePath]
  }

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
    // 营地与溪降时段不同，攻略页的营业/入园时间由此推导
    hours: {
      camp: { label: '营地', open: '10:00', close: '21:00', cutoff: '19:00', cutoffLabel: '停止供餐' },
      creek: { label: '溪降', open: '10:00', close: '16:30', closeLabel: '停止检票' }
    }
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

test('未确认项文案统一，已确认项不得残留「请咨询管家」', (t) => {
  const { page } = mountPage(t, guidePath, { env: BASE_ENV })
  const all = page.data.groups.reduce((acc, g) => acc.concat(g.items), [])

  // 业主 2026-07-26 已逐项确认，待确认项可以为 0；
  // 但只要还有，文案就必须统一，不能各写各的
  for (const item of all.filter((i) => i.status === 'ask')) {
    assert.equal(item.desc, '请咨询管家', '未确认项文案必须统一为「请咨询管家」')
  }
  // 反向保证：标了 confirmed 的不能整条只写「请咨询管家」。
  // 句中提到某个子项待确认是允许的（例如身高限制已定，但儿童适用范围仍需咨询）。
  for (const item of all.filter((i) => i.status === 'confirmed')) {
    assert.notEqual(item.desc.trim(), '请咨询管家',
      item.title + ' 标为已确认却只写了「请咨询管家」')
  }
})

test('设施承诺只能来自业主确认的口径，不得凭空扩写', (t) => {
  const { page } = mountPage(t, guidePath, { env: BASE_ENV })
  const text = JSON.stringify(page.data.groups.reduce((acc, g) => acc.concat(g.items), []))
  // 业主确认过的：免费停车位、淋浴与更衣间。除此之外的设施承诺一律不许出现，
  // 尤其是带数量、面积、品牌这类看起来很具体、实则编造的表述。
  for (const word of ['个车位', '平方米', '五星', '免费提供', '24 小时', '母婴室', '轮椅']) {
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

// 业主 2026-07-26：去掉微信客服与咨询表单，客户直接加管家企微。
// 联系方式统一由 sr-contact-card 承载，页面不再自己维护渠道列表。
test('管家页不再有渠道列表，联系方式交给统一联系卡', (t) => {
  const { page } = mountPage(t, conciergePath, { env: BASE_ENV })
  assert.equal(page.data.channels, undefined, '渠道列表应已移除')
  const wxml = fs.readFileSync(conciergePath.replace(/\.js$/, '.wxml'), 'utf8')
  assert.ok(wxml.includes('sr-contact-card'), '必须保留统一联系卡')
  assert.ok(!wxml.includes('open-type="contact"'), '微信客服入口应已删除')
  assert.ok(!/service\/lead\/lead/.test(wxml), '咨询表单入口应已删除')
})

test('管家页仍保有电话兜底，加不上微信的人不能没有出路', (t) => {
  const { page } = mountPage(t, conciergePath, { env: BASE_ENV })
  assert.equal(page.data.phone, '19112040740', '电话必须可用')
})

test('二维码未配置时不渲染，避免空图', (t) => {
  const { page } = mountPage(t, conciergePath, { env: BASE_ENV })
  assert.equal(page.data.qrcodeUrl, '')
})

test('配置二维码后可预览大图', (t) => {
  const { page, calls } = mountPage(t, conciergePath, {
    env: envWith({ qrcodes: { concierge: 'https://cdn/qr.png' } })
  })
  assert.equal(page.data.qrcodeUrl, 'https://cdn/qr.png')
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
