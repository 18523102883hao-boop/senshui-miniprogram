// 投诉建议与失物招领（原 Task 16 · PRD §15.2）
// 合规红线：不得承诺未经确认的处理时限与奖励
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const core = require(path.join(projectRoot, 'cloudfunctions/submitFeedback/feedback-core.js'))
const createPath = path.join(projectRoot, 'miniprogram/pages/feedback/create/create.js')
const listPath = path.join(projectRoot, 'miniprogram/pages/feedback/list/list.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(v) { return JSON.parse(JSON.stringify(v)) }

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = {
    request: [],
    toast: [],
    modal: [],
    navigate: [],
    phone: [],
    chooseMedia: [],
    chooseImage: []
  }
  let pageConfig

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }
  const req = {
    call(name, data) {
      calls.request.push({ name, data })
      const r = options.responders && options.responders[name]
      if (typeof r === 'function') return r(data, calls.request.filter((c) => c.name === name).length)
      if (r) return Promise.resolve(r)
      return Promise.reject(new Error('no responder: ' + name))
    }
  }
  req.callWithLoading = (n, d) => req.call(n, d)
  stub(requestPath, req)
  stub(hapticsPath, { haptic() {} })

  global.wx = {
    navigateTo(o) { calls.navigate.push(o.url); if (options.navigateFail && o.fail) o.fail({}) },
    navigateBack() {}, switchTab(o) { calls.navigate.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    showModal(o) {
      calls.modal.push(o)
      if (o.success) o.success({ confirm: true })
    },
    showLoading() {}, hideLoading() {},
    makePhoneCall(o) { calls.phone.push(o.phoneNumber) },
    chooseMedia(o) {
      calls.chooseMedia.push(o)
      if (options.chosenFiles) o.success({ tempFiles: options.chosenFiles.map((p) => ({ tempFilePath: p })) })
      else if (o.fail) o.fail(options.chooseError || {})
    },
    chooseImage(o) {
      calls.chooseImage.push(o)
      if (options.chosenFiles) o.success({ tempFilePaths: options.chosenFiles })
      else if (o.fail) o.fail(options.chooseError || {})
    },
    cloud: { uploadFile: (o) => Promise.resolve({ fileID: 'cloud://' + (o.cloudPath || 'x') }) },
    getStorageSync() { return null }, setStorageSync() {},
    setNavigationBarTitle() {}, stopPullDownRefresh() {}
  }
  if (options.disableChooseMedia) delete global.wx.chooseMedia
  global.Page = (c) => { pageConfig = c }
  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    // 小程序 setData 支持 'a.b' 路径语法，测试桩必须一致，否则页面代码的正常写法会失效
    setData(patch) {
      for (const key of Object.keys(patch)) {
        if (key.indexOf('.') < 0) { this.data[key] = patch[key]; continue }
        const parts = key.split('.')
        let node = this.data
        for (let i = 0; i < parts.length - 1; i += 1) {
          if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {}
          node = node[parts[i]]
        }
        node[parts[parts.length - 1]] = patch[key]
      }
    }
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

// ============ 云端核心 ============

test('反馈类型覆盖投诉/建议/表扬/失物招领', () => {
  const keys = core.FEEDBACK_TYPES.map((t) => t.key)
  for (const k of ['complaint', 'suggestion', 'praise', 'lost_found']) {
    assert.ok(keys.includes(k), '缺少类型：' + k)
  }
})

test('内容为空或过短时拒绝提交', () => {
  assert.equal(core.validate({ type: 'complaint', content: '' }).ok, false)
  assert.equal(core.validate({ type: 'complaint', content: '差' }).ok, false, '过短内容无法处理')
  assert.equal(core.validate({ type: 'complaint', content: '排队时间太长了，希望增加窗口' }).ok, true)
})

test('未知类型被拒绝', () => {
  assert.equal(core.validate({ type: 'hack', content: '正常长度的反馈内容' }).ok, false)
})

test('允许电话联系时必须留手机号', () => {
  const base = { type: 'complaint', content: '排队时间太长了，希望增加窗口' }
  assert.equal(core.validate(Object.assign({}, base, { allowCall: true, phone: '' })).ok, false)
  assert.equal(core.validate(Object.assign({}, base, { allowCall: true, phone: '123' })).ok, false)
  assert.equal(core.validate(Object.assign({}, base, { allowCall: true, phone: '13800138000' })).ok, true)
  assert.equal(core.validate(Object.assign({}, base, { allowCall: false })).ok, true, '不留电话也能提交')
})

test('图片数量超上限被拒绝', () => {
  const base = { type: 'complaint', content: '排队时间太长了，希望增加窗口' }
  const many = Array.from({ length: core.MAX_IMAGES + 1 }, (_, i) => 'cloud://' + i)
  assert.equal(core.validate(Object.assign({}, base, { images: many })).ok, false)
  assert.equal(core.validate(Object.assign({}, base, { images: many.slice(0, core.MAX_IMAGES) })).ok, true)
})

test('落库状态固定为 submitted，客户端不可指定', () => {
  const doc = core.buildFeedback(
    { type: 'complaint', content: '排队时间太长了', status: 'resolved', isVip: true },
    { openid: 'u1' }, new Date()
  )
  assert.equal(doc.status, 'submitted')
  assert.equal(doc.isVip, undefined, '未声明字段一律丢弃')
  assert.equal(doc._openid, 'u1')
})

test('状态对用户的展示文案不承诺具体时限', () => {
  const text = JSON.stringify(core.STATUS_TEXT)
  for (const w of ['24 小时', '48 小时', '当天', '立即', '马上']) {
    assert.equal(text.includes(w), false, '不得承诺未确认的处理时限：' + w)
  }
})

test('不出现参考项目的悬赏承诺', () => {
  const src = fs.readFileSync(path.join(projectRoot, 'cloudfunctions/submitFeedback/feedback-core.js'), 'utf8')
  for (const w of ['查明奖励', '1000 元', '奖励 1000']) {
    assert.equal(src.includes(w), false, '不得照搬参考项目承诺：' + w)
  }
})

// ============ 提交页 ============

test('提交页按类型渲染，默认投诉建议', async (t) => {
  const { page } = mountPage(t, createPath)
  await page.onLoad({})
  assert.ok(page.data.types.length >= 4)
  assert.ok(page.data.form.type)
})

test('内容为空时前端拦截，不发请求', async (t) => {
  const { page, calls } = mountPage(t, createPath)
  await page.onLoad({})
  page.setData({ 'form.content': '' })
  await page.onSubmit()
  assert.equal(calls.request.filter((c) => c.name === 'submitFeedback').length, 0)
  assert.ok(calls.toast.length > 0)
})

test('提交成功展示成功态并保留紧急拨号入口', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    responders: { submitFeedback: () => Promise.resolve({ feedbackId: 'f1' }) }
  })
  await page.onLoad({})
  page.setData({ 'form.content': '排队时间太长了，希望增加窗口' })
  await page.onSubmit()
  assert.equal(page.data.submitted, true)
  page.onCallFront()
  assert.equal(calls.phone.length, 1, '紧急问题必须能直接打电话')
})

test('提交失败保留输入且可重试', async (t) => {
  let n = 0
  const { page } = mountPage(t, createPath, {
    responders: {
      submitFeedback: () => { n += 1; return n === 1 ? Promise.reject(new Error('网络异常')) : Promise.resolve({ feedbackId: 'f1' }) }
    }
  })
  await page.onLoad({})
  page.setData({ 'form.content': '排队时间太长了，希望增加窗口' })
  await page.onSubmit()
  assert.equal(page.data.form.content, '排队时间太长了，希望增加窗口', '失败不得清空')
  assert.equal(page.data.submitting, false)
  await page.onSubmit()
  assert.equal(page.data.submitted, true)
})

test('连点提交只发一次请求', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    responders: { submitFeedback: () => new Promise((r) => setTimeout(() => r({ feedbackId: 'f1' }), 10)) }
  })
  await page.onLoad({})
  page.setData({ 'form.content': '排队时间太长了，希望增加窗口' })
  await Promise.all([page.onSubmit(), page.onSubmit()])
  assert.equal(calls.request.filter((c) => c.name === 'submitFeedback').length, 1)
})

test('四种反馈共用图片选择链路并可添加图片', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    chosenFiles: ['/tmp/feedback-1.jpg']
  })
  for (const type of ['complaint', 'suggestion', 'praise', 'lost_found']) {
    await page.onLoad({ type })
    page.onChooseImage()
  }
  assert.equal(calls.chooseMedia.length, 4)
  assert.equal(page.data.form.images.length, 4)
})

test('提交反馈时先上传本地图片，并只把云文件标识提交到服务端', async (t) => {
  const { page, calls } = mountPage(t, createPath, {
    chosenFiles: ['/tmp/feedback-upload.jpg'],
    responders: { submitFeedback: () => Promise.resolve({ feedbackId: 'f1' }) }
  })
  page.onChooseImage()
  page.setData({ 'form.content': '这是包含现场图片的投诉反馈内容' })
  await page.onSubmit()

  const submit = calls.request.find((item) => item.name === 'submitFeedback')
  assert.ok(submit)
  assert.equal(submit.data.form.images.length, 1)
  assert.match(submit.data.form.images[0], /^cloud:\/\/feedback\//)
})

test('旧微信没有 chooseMedia 时回退 chooseImage', (t) => {
  const { page, calls } = mountPage(t, createPath, {
    disableChooseMedia: true,
    chosenFiles: ['/tmp/legacy.jpg']
  })
  page.onChooseImage()
  assert.equal(calls.chooseImage.length, 1)
  assert.deepEqual(page.data.form.images, ['/tmp/legacy.jpg'])
})

test('用户取消选择图片保持安静，未声明图片类型时给出可执行的后台配置提示', (t) => {
  const cancelled = mountPage(t, createPath, {
    chooseError: { errMsg: 'chooseMedia:fail cancel' }
  })
  cancelled.page.onChooseImage()
  assert.equal(cancelled.calls.toast.length, 0)

  const privacy = mountPage(t, createPath, {
    chooseError: {
      errMsg: 'chooseMedia:fail api scope is not declared in the privacy agreement'
    }
  })
  privacy.page.onChooseImage()
  assert.equal(privacy.calls.toast.length, 0)
  assert.ok(privacy.calls.modal.some((item) => (
    /隐私/.test(item.title) &&
    /设置[—-]服务内容声明[—-]用户隐私保护指引/.test(item.content) &&
    /收集你选中的照片或视频信息/.test(item.content) &&
    /5 分钟/.test(item.content)
  )))
})

// ============ 记录页 ============

test('记录页展示提交历史与状态', async (t) => {
  const { page } = mountPage(t, listPath, {
    responders: {
      getMyFeedback: () => Promise.resolve({
        list: [{ feedbackId: 'f1', type: 'complaint', content: '排队久', status: 'processing', createdAt: '2026-08-01' }]
      })
    }
  })
  await page.onShow()
  assert.equal(page.data.list.length, 1)
  assert.equal(page.data.isEmpty, false)
})

test('无记录时显示空态而非白屏', async (t) => {
  const { page } = mountPage(t, listPath, {
    responders: { getMyFeedback: () => Promise.resolve({ list: [] }) }
  })
  await page.onShow()
  assert.equal(page.data.isEmpty, true)
})

test('加载失败显示错误态并可重试', async (t) => {
  let n = 0
  const { page } = mountPage(t, listPath, {
    responders: {
      getMyFeedback: () => { n += 1; return n === 1 ? Promise.reject(new Error('x')) : Promise.resolve({ list: [] }) }
    }
  })
  await page.onShow()
  assert.equal(page.data.hasError, true)
  await page.onRetry()
  assert.equal(page.data.hasError, false)
})
