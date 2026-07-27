// Task 11 生日 / 团建 / 品牌合作线索
// PRD §12.1-12.3 三种线索字段、§12.4 状态、§23 隐私
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const core = require(path.join(projectRoot, 'cloudfunctions/createServiceLead/lead-core.js'))
const detailPath = path.join(projectRoot, 'miniprogram/pages/service/detail/detail.js')
const leadPath = path.join(projectRoot, 'miniprogram/pages/service/lead/lead.js')
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
  const calls = { request: [], navigate: [], redirect: [], toast: [], phone: [] }
  let pageConfig

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }

  const requestImpl = {
    call(name, data) {
      calls.request.push({ name, data })
      const responder = options.responders && options.responders[name]
      if (typeof responder === 'function') return responder(data, calls.request.filter((c) => c.name === name).length)
      if (responder) return Promise.resolve(responder)
      return Promise.reject(new Error('no responder: ' + name))
    }
  }
  requestImpl.callWithLoading = (name, data) => requestImpl.call(name, data)
  stub(requestPath, requestImpl)
  stub(hapticsPath, { haptic() {} })
  stub(envPath, { cloudEnv: 'test', frontDeskPhone: '19112040740', park: { name: '森水长河' } })

  global.wx = {
    navigateTo(o) { calls.navigate.push(o.url); if (options.navigateFail && o.fail) o.fail({}) },
    redirectTo(o) { calls.redirect.push(o.url) },
    navigateBack() {},
    showToast(o) { calls.toast.push(o) },
    showModal(o) { if (o.success) o.success({ confirm: true }) },
    showLoading() {}, hideLoading() {},
    makePhoneCall(o) { calls.phone.push(o.phoneNumber) },
    getStorageSync() { return null }, setStorageSync() {},
    setNavigationBarTitle() {}, stopPullDownRefresh() {}
  }
  global.Page = (config) => { pageConfig = config }

  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
    if (typeof page.onUnload === 'function') page.onUnload()
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

// ============ 三种 schema ============

test('三种服务各有 schema，字段按 PRD §12 定义', () => {
  for (const type of ['birthday', 'team_building', 'brand']) {
    const s = core.getSchema(type)
    assert.ok(s, '缺少 schema: ' + type)
    assert.ok(Array.isArray(s.fields) && s.fields.length > 0)
    assert.ok(s.title)
  }
})

test('生日线索包含生日日期与人数字段', () => {
  const keys = core.getSchema('birthday').fields.map((f) => f.key)
  assert.ok(keys.includes('birthdayDate'))
  assert.ok(keys.includes('partySize'))
  assert.ok(keys.includes('contactName'))
  assert.ok(keys.includes('contactPhone'))
})

test('团建线索包含公司与团建目标字段', () => {
  const keys = core.getSchema('team_building').fields.map((f) => f.key)
  assert.ok(keys.includes('company'))
  assert.ok(keys.includes('goal'))
  assert.ok(keys.includes('visitDate'))
})

test('品牌合作线索包含合作类型与需求描述', () => {
  const keys = core.getSchema('brand').fields.map((f) => f.key)
  assert.ok(keys.includes('brandName'))
  assert.ok(keys.includes('cooperationType'))
  assert.ok(keys.includes('requirement'))
})

test('未知服务类型不返回 schema，避免伪造表单', () => {
  assert.equal(core.getSchema('unknown'), null)
  assert.equal(core.getSchema(''), null)
})

// ============ 校验 ============

function base(type, patch) {
  const common = { contactName: '张三', contactPhone: '13800138000', privacyAgreed: true }
  const byType = {
    birthday: { birthdayDate: '2026-09-01', partySize: 20 },
    team_building: { company: '某某公司', visitDate: '2026-09-01', partySize: 50, goal: '团队协作' },
    brand: { brandName: '某品牌', cooperationType: '场地拍摄', requirement: '需要山谷场景' }
  }
  return Object.assign({}, common, byType[type], patch)
}

test('必填项缺失时按 schema 指明缺哪个字段', () => {
  const r = core.validate('birthday', base('birthday', { birthdayDate: '' }))
  assert.equal(r.ok, false)
  assert.ok(r.msg.length > 0)
})

test('手机号格式校验', () => {
  assert.equal(core.validate('birthday', base('birthday', { contactPhone: '123' })).ok, false)
  assert.equal(core.validate('birthday', base('birthday')).ok, true)
})

test('未同意隐私政策不允许提交', () => {
  const r = core.validate('brand', base('brand', { privacyAgreed: false }))
  assert.equal(r.ok, false)
  assert.match(r.msg, /隐私|同意/)
})

test('三种类型都能通过各自的完整表单校验', () => {
  for (const type of ['birthday', 'team_building', 'brand']) {
    assert.equal(core.validate(type, base(type)).ok, true, type + ' 校验未通过')
  }
})

test('线索初始状态为 new，且记录来源类型', () => {
  const doc = core.buildLead('birthday', base('birthday'), { openid: 'u1', idempotencyKey: 'k1' }, new Date())
  assert.equal(doc.status, 'new')
  assert.equal(doc.type, 'birthday')
  assert.equal(doc._openid, 'u1')
  assert.equal(doc.contactPhone, '13800138000')
  assert.ok(doc.createdAt)
})

test('只保存 schema 定义的字段，忽略客户端塞进来的多余数据', () => {
  const doc = core.buildLead('birthday', base('birthday', { isAdmin: true, status: 'won' }), { openid: 'u1' }, new Date())
  assert.equal(doc.isAdmin, undefined, '不得接受客户端注入的任意字段')
  assert.equal(doc.status, 'new', '状态不可由客户端指定')
})

test('相同幂等键复用已有线索，连点不会重复创建', () => {
  const existing = [{ _id: 'l1', idempotencyKey: 'k1', status: 'new' }]
  assert.equal(core.pickReusable(existing, 'k1')._id, 'l1')
  assert.equal(core.pickReusable(existing, 'k2'), null)
})

// ============ 服务详情页 ============

test('详情页按类型加载对应内容与 CTA', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: {
      getArticle: () => Promise.resolve({
        article: { slug: 'service-birthday', title: '生日宴请', blocks: [{ type: 'text', data: { text: '介绍' } }] }
      })
    }
  })
  await page.onLoad({ type: 'birthday' })
  assert.equal(page.data.type, 'birthday')
  assert.ok(page.data.title)
  assert.equal(page.data.blocks.length, 1)
})

test('详情内容缺失时仍展示本地兜底介绍，不白屏', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: { getArticle: () => Promise.reject(new Error('404')) }
  })
  await page.onLoad({ type: 'team_building' })
  assert.ok(page.data.title)
  assert.ok(page.data.fallbackIntro.length > 0)
  assert.equal(page.data.hasError, false)
})

// 业主 2026-07-26：服务详情页去掉填表入口与底部 CTA 栏，
// 客户直接加管家企微（联系方式由 sr-contact-card 承载）
test('详情页不再有填表入口与底部操作栏', (t) => {
  const fs = require('node:fs')
  const wxml = fs.readFileSync(detailPath.replace(/\.js$/, '.wxml'), 'utf8')
  assert.ok(!/formRoute|formText/.test(wxml), '联系卡不应再挂表单入口')
  assert.ok(!/class="bar"/.test(wxml), '底部操作栏应已移除')
  assert.ok(wxml.includes('sr-contact-card'), '联系方式仍由统一联系卡承载')

  const js = fs.readFileSync(detailPath, 'utf8')
  assert.ok(!/goLead\s*\(/.test(js), 'goLead 已无引用，不该留着')
})

test('未知类型进入详情页时回退到服务总览而不是报错', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: { getArticle: () => Promise.reject(new Error('404')) }
  })
  await page.onLoad({ type: 'nonsense' })
  assert.ok(page.data.title, '仍需给出可读标题')
})

// ============ 线索表单页 ============

test('表单页按类型渲染不同字段', async (t) => {
  const { page } = mountPage(t, leadPath)
  await page.onLoad({ type: 'team_building' })
  const keys = page.data.fields.map((f) => f.key)
  assert.ok(keys.includes('company'))
  assert.ok(keys.includes('goal'))
  assert.equal(keys.includes('birthdayDate'), false, '团建表单不应出现生日字段')
})

test('未同意隐私协议时前端拦截提交', async (t) => {
  const { page, calls } = mountPage(t, leadPath)
  await page.onLoad({ type: 'birthday' })
  page.setData({ form: base('birthday', { privacyAgreed: false }) })
  await page.onSubmit()
  assert.equal(calls.request.filter((c) => c.name === 'createServiceLead').length, 0)
  assert.ok(calls.toast.length > 0)
})

test('提交失败保留已填内容，可直接重试', async (t) => {
  let times = 0
  const { page, calls } = mountPage(t, leadPath, {
    responders: {
      createServiceLead: () => {
        times += 1
        return times === 1 ? Promise.reject(new Error('网络异常')) : Promise.resolve({ leadId: 'l1' })
      }
    }
  })
  await page.onLoad({ type: 'birthday' })
  page.setData({ form: base('birthday') })
  await page.onSubmit()
  assert.equal(page.data.form.contactName, '张三', '失败后不得清空表单')
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.submitted, false)

  await page.onSubmit()
  assert.equal(page.data.submitted, true)
  const posts = calls.request.filter((c) => c.name === 'createServiceLead')
  assert.equal(posts[0].data.idempotencyKey, posts[1].data.idempotencyKey, '重试复用幂等键')
})

test('连点提交只创建一个线索', async (t) => {
  const { page, calls } = mountPage(t, leadPath, {
    responders: { createServiceLead: () => new Promise((r) => setTimeout(() => r({ leadId: 'l1' }), 10)) }
  })
  await page.onLoad({ type: 'brand' })
  page.setData({ form: base('brand') })
  await Promise.all([page.onSubmit(), page.onSubmit()])
  assert.equal(calls.request.filter((c) => c.name === 'createServiceLead').length, 1)
})

test('提交成功后展示成功态，并给出管家与返回入口', async (t) => {
  const { page, calls } = mountPage(t, leadPath, {
    responders: { createServiceLead: () => Promise.resolve({ leadId: 'l1' }) }
  })
  await page.onLoad({ type: 'birthday' })
  page.setData({ form: base('birthday') })
  await page.onSubmit()
  assert.equal(page.data.submitted, true)

  page.goConcierge()
  assert.ok(calls.navigate.some((u) => u.includes('concierge')))
})

test('成功页不承诺具体响应时限', async (t) => {
  const { page } = mountPage(t, leadPath, {
    responders: { createServiceLead: () => Promise.resolve({ leadId: 'l1' }) }
  })
  await page.onLoad({ type: 'birthday' })
  page.setData({ form: base('birthday') })
  await page.onSubmit()
  const text = JSON.stringify(page.data)
  for (const w of ['24 小时内', '2 小时内', '立即回复', '秒回']) {
    assert.equal(text.includes(w), false, '不得承诺未确认的响应时限：' + w)
  }
})
