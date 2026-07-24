// Task 4 内容中心页面测试（PRD §10 园区内容中心 / §20 UX 与状态要求 / §25 自测清单）
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const listPath = path.join(projectRoot, 'miniprogram/pages/content/list/list.js')
const detailPath = path.join(projectRoot, 'miniprogram/pages/content/detail/detail.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originalRequest = require.cache[requestPath]
  const originalHaptics = require.cache[hapticsPath]
  const calls = { request: [], navigate: [], toast: [], phone: [], location: [], storage: {} }
  const storage = Object.assign({}, options.storage)
  let pageConfig

  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      call(name, data) {
        calls.request.push({ name, data })
        const responder = options.responders && options.responders[name]
        if (typeof responder === 'function') return responder(data, calls.request.length)
        return Promise.resolve(responder || {})
      },
      callWithLoading(name, data) { return this.call(name, data) }
    }
  }
  require.cache[hapticsPath] = {
    id: hapticsPath, filename: hapticsPath, loaded: true, exports: { haptic() {} }
  }

  global.wx = {
    cloud: { getTempFileURL: () => Promise.resolve({ fileList: [] }) },
    navigateTo(o) { calls.navigate.push(o.url) },
    switchTab(o) { calls.navigate.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    makePhoneCall(o) { calls.phone.push(o.phoneNumber) },
    openLocation(o) { calls.location.push(o) },
    setStorageSync(k, v) { storage[k] = v; calls.storage[k] = v },
    getStorageSync(k) { return storage[k] },
    stopPullDownRefresh() {},
    setNavigationBarTitle() {}
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
    if (originalRequest) require.cache[requestPath] = originalRequest
    else delete require.cache[requestPath]
    if (originalHaptics) require.cache[hapticsPath] = originalHaptics
    else delete require.cache[hapticsPath]
    global.Page = originalPage
    global.wx = originalWx
  })

  return { page, calls, storage }
}

function articleList(n, prefix = 'a') {
  return Array.from({ length: n }, (_, i) => ({
    id: prefix + i, slug: prefix + '-' + i, category: 'guide',
    title: '标题' + i, summary: '摘要' + i, coverFileId: '', publishedAt: '2026-07-0' + (i % 9 + 1)
  }))
}

// ============ 列表页 ============

test('列表页按 category 参数请求对应分类', async (t) => {
  const { page, calls } = mountPage(t, listPath, {
    responders: { listArticles: () => Promise.resolve({ list: articleList(3), hasMore: false, nextCursor: null }) }
  })
  await page.onLoad({ category: 'park_intro' })
  assert.equal(page.data.category, 'park_intro')
  assert.equal(calls.request[0].data.category, 'park_intro')
  assert.equal(page.data.list.length, 3)
  assert.equal(page.data.loading, false)
})

test('切换分类会清空旧列表并重新从头请求', async (t) => {
  const { page, calls } = mountPage(t, listPath, {
    responders: {
      listArticles: (data) => Promise.resolve({
        list: articleList(2, data.category || 'all'), hasMore: true, nextCursor: 10
      })
    }
  })
  await page.onLoad({})
  await page.onCategoryTap({ currentTarget: { dataset: { key: 'guide' } } })
  assert.equal(page.data.category, 'guide')
  assert.equal(calls.request[calls.request.length - 1].data.cursor, 0, '切分类必须从游标 0 开始')
  assert.equal(page.data.list.length, 2, '切分类不能拼接旧分类的数据')
})

test('触底加载下一页并在无更多时停止请求', async (t) => {
  const { page, calls } = mountPage(t, listPath, {
    responders: {
      listArticles: (data) => Promise.resolve(
        data.cursor === 0
          ? { list: articleList(10, 'p1'), hasMore: true, nextCursor: 10 }
          : { list: articleList(2, 'p2'), hasMore: false, nextCursor: null }
      )
    }
  })
  await page.onLoad({})
  await page.onReachBottom()
  assert.equal(page.data.list.length, 12, '第二页应追加而不是覆盖')
  assert.equal(page.data.hasMore, false)

  const before = calls.request.length
  await page.onReachBottom()
  assert.equal(calls.request.length, before, 'hasMore=false 后不应继续请求')
})

test('空数据显示空态而不是空白页', async (t) => {
  const { page } = mountPage(t, listPath, {
    responders: { listArticles: () => Promise.resolve({ list: [], hasMore: false, nextCursor: null }) }
  })
  await page.onLoad({})
  assert.equal(page.data.isEmpty, true)
  assert.equal(page.data.hasError, false)
})

test('接口失败显示错误态，重试可恢复', async (t) => {
  let calledTimes = 0
  const { page } = mountPage(t, listPath, {
    responders: {
      listArticles: () => {
        calledTimes += 1
        return calledTimes === 1
          ? Promise.reject(new Error('network'))
          : Promise.resolve({ list: articleList(1), hasMore: false, nextCursor: null })
      }
    }
  })
  await page.onLoad({})
  assert.equal(page.data.hasError, true)
  assert.equal(page.data.loading, false)

  await page.onRetry()
  assert.equal(page.data.hasError, false)
  assert.equal(page.data.list.length, 1)
})

test('接口失败时优先展示本地缓存的列表', async (t) => {
  const cached = articleList(2, 'cache')
  const { page } = mountPage(t, listPath, {
    storage: { 'content_list_all': cached },
    responders: { listArticles: () => Promise.reject(new Error('offline')) }
  })
  await page.onLoad({})
  assert.equal(page.data.list.length, 2, '弱网应回落到缓存')
  assert.equal(page.data.fromCache, true)
})

test('点击列表项跳转详情并带上 slug', async (t) => {
  const { page, calls } = mountPage(t, listPath, {
    responders: { listArticles: () => Promise.resolve({ list: articleList(2), hasMore: false, nextCursor: null }) }
  })
  await page.onLoad({})
  page.onItemTap({ currentTarget: { dataset: { slug: 'a-1' } } })
  assert.equal(calls.navigate[0], '/pages/content/detail/detail?slug=a-1')
})

test('列表页可分享，分享路径带回当前分类', async (t) => {
  const { page } = mountPage(t, listPath, {
    responders: { listArticles: () => Promise.resolve({ list: [], hasMore: false, nextCursor: null }) }
  })
  await page.onLoad({ category: 'guide' })
  const share = page.onShareAppMessage()
  assert.ok(share.path.includes('category=guide'))
  assert.ok(share.title)
})

// ============ 详情页 ============

const FULL_ARTICLE = {
  slug: 'park-intro', title: '园区介绍', summary: '摘要', category: 'park_intro',
  blocks: [
    { type: 'hero', data: { title: '森水长河', subtitle: '峡谷溯溪' } },
    { type: 'text', data: { text: '正文段落' } },
    { type: 'image', data: { fileId: 'cloud://a.png', caption: '峡谷' } },
    { type: 'feature_grid', data: { items: [{ title: '溪降', desc: '2 公里' }] } },
    { type: 'service_list', data: { items: [{ title: '管家', desc: '到园对接' }] } },
    { type: 'timeline', data: { items: [{ time: '10:00', title: '入园' }] } },
    { type: 'faq', data: { items: [{ q: '需要预约吗', a: '无需预约' }] } },
    { type: 'cta', data: { text: '去买票', action: { type: 'route', route: '/pages/ticket/ticket' } } }
  ]
}

test('详情页渲染全部受支持的区块类型', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: { getArticle: () => Promise.resolve({ article: FULL_ARTICLE }) }
  })
  await page.onLoad({ slug: 'park-intro' })
  assert.deepEqual(
    page.data.blocks.map((b) => b.type),
    ['hero', 'text', 'image', 'feature_grid', 'service_list', 'timeline', 'faq', 'cta']
  )
})

test('详情页丢弃未知区块类型且不白屏', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: {
      getArticle: () => Promise.resolve({
        article: {
          slug: 'x', title: 'x',
          blocks: [
            { type: 'script', data: { text: '<script>alert(1)</script>' } },
            { type: 'text', data: { text: '安全正文' } },
            { type: 'iframe', data: {} }
          ]
        }
      })
    }
  })
  await page.onLoad({ slug: 'x' })
  assert.deepEqual(page.data.blocks.map((b) => b.type), ['text'])
  assert.equal(page.data.hasError, false)
})

test('CTA 只允许跳白名单路由', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: { getArticle: () => Promise.resolve({ article: FULL_ARTICLE }) }
  })
  await page.onLoad({ slug: 'park-intro' })
  page.onCtaTap({ currentTarget: { dataset: { index: 7 } } })
  assert.equal(calls.navigate[0], '/pages/ticket/ticket')
})

test('CTA 指向白名单外的路由时被拒绝并提示', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      getArticle: () => Promise.resolve({
        article: {
          slug: 'x', title: 'x',
          blocks: [{ type: 'cta', data: { text: '点我', action: { type: 'route', route: '/pages/staff/entry/entry' } } }]
        }
      })
    }
  })
  await page.onLoad({ slug: 'x' })
  page.onCtaTap({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(calls.navigate.length, 0, '非白名单路由不得跳转')
  assert.equal(calls.toast.length, 1)
})

test('CTA 支持拨号与导航两种系统能力', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      getArticle: () => Promise.resolve({
        article: {
          slug: 'x', title: 'x',
          blocks: [
            { type: 'cta', data: { text: '打电话', action: { type: 'phone', phone: '19112040740' } } },
            { type: 'cta', data: { text: '导航', action: { type: 'location', latitude: 28.9, longitude: 106.6, name: '森水长河' } } }
          ]
        }
      })
    }
  })
  await page.onLoad({ slug: 'x' })
  page.onCtaTap({ currentTarget: { dataset: { index: 0 } } })
  page.onCtaTap({ currentTarget: { dataset: { index: 1 } } })
  assert.deepEqual(calls.phone, ['19112040740'])
  assert.equal(calls.location[0].latitude, 28.9)
})

test('缺少坐标时导航 CTA 不发起调用，避免跳到错误位置', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: {
      getArticle: () => Promise.resolve({
        article: { slug: 'x', title: 'x', blocks: [{ type: 'cta', data: { text: '导航', action: { type: 'location' } } }] }
      })
    }
  })
  await page.onLoad({ slug: 'x' })
  page.onCtaTap({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(calls.location.length, 0)
  assert.equal(calls.toast.length, 1)
})

test('详情接口失败时读取缓存，仍可离线查看', async (t) => {
  const { page } = mountPage(t, detailPath, {
    storage: { 'content_detail_park-intro': FULL_ARTICLE },
    responders: { getArticle: () => Promise.reject(new Error('offline')) }
  })
  await page.onLoad({ slug: 'park-intro' })
  assert.equal(page.data.article.title, '园区介绍')
  assert.equal(page.data.fromCache, true)
  assert.equal(page.data.hasError, false)
})

test('详情接口失败且无缓存时显示错误态并可重试', async (t) => {
  let times = 0
  const { page } = mountPage(t, detailPath, {
    responders: {
      getArticle: () => {
        times += 1
        return times === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ article: FULL_ARTICLE })
      }
    }
  })
  await page.onLoad({ slug: 'park-intro' })
  assert.equal(page.data.hasError, true)
  await page.onRetry()
  assert.equal(page.data.hasError, false)
  assert.equal(page.data.article.title, '园区介绍')
})

test('详情加载成功后写入缓存供下次弱网使用', async (t) => {
  const { page, calls } = mountPage(t, detailPath, {
    responders: { getArticle: () => Promise.resolve({ article: FULL_ARTICLE }) }
  })
  await page.onLoad({ slug: 'park-intro' })
  assert.ok(calls.storage['content_detail_park-intro'], '成功后应写缓存')
})

test('详情页可分享，路径带 slug', async (t) => {
  const { page } = mountPage(t, detailPath, {
    responders: { getArticle: () => Promise.resolve({ article: FULL_ARTICLE }) }
  })
  await page.onLoad({ slug: 'park-intro' })
  const share = page.onShareAppMessage()
  assert.ok(share.path.includes('slug=park-intro'))
  assert.equal(share.title, '园区介绍')
})
