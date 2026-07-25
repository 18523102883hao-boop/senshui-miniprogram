// Task 3 首页门户测试（PRD §7 首页 / §20 UX 与状态要求）
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/index/index.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// options.portal: getHomePortal 返回值；options.portalError: 让 getHomePortal 失败
function mountPage(t, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originalRequest = require.cache[requestPath]
  const originalHaptics = require.cache[hapticsPath]
  const calls = { request: [], navigate: [], switchTab: [], toast: [] }
  let pageConfig

  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      call(name, data) {
        calls.request.push({ name, data })
        if (name === 'getHomePortal') {
          if (options.portalError) return Promise.reject(new Error('FUNCTION_NOT_FOUND'))
          return Promise.resolve(options.portal || { sections: [], activities: [], userSummary: null })
        }
        if (name === 'getHomeData') {
          if (options.legacyError) return Promise.reject(new Error('offline'))
          return Promise.resolve(options.legacy || { notice: '旧公告', maps: {} })
        }
        return Promise.resolve({})
      },
      callWithLoading(name, data) {
        return this.call(name, data)
      }
    }
  }
  require.cache[hapticsPath] = {
    id: hapticsPath,
    filename: hapticsPath,
    loaded: true,
    exports: { haptic() {} }
  }

  global.wx = {
    cloud: { getTempFileURL: () => Promise.resolve({ fileList: [] }) },
    getWindowInfo: () => ({ windowWidth: 375 }),
    getImageInfo: (o) => o.fail && o.fail({}),
    navigateTo(o) {
      calls.navigate.push(o.url)
      if (options.navigateFail && o.fail) o.fail({ errMsg: 'page not found' })
    },
    switchTab(o) { calls.switchTab.push(o.url) },
    showToast(o) { calls.toast.push(o) },
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
    if (originalRequest) require.cache[requestPath] = originalRequest
    else delete require.cache[requestPath]
    if (originalHaptics) require.cache[hapticsPath] = originalHaptics
    else delete require.cache[hapticsPath]
    global.Page = originalPage
    global.wx = originalWx
  })

  return { page, calls }
}

function titles(list) {
  return (list || []).map((s) => s.title)
}

test('首屏默认即含「门票购买」与「立即预约」两个主转化入口', (t) => {
  const { page } = mountPage(t)
  const names = titles(page.data.primaryActions)
  assert.ok(names.includes('门票购买'), '缺少门票购买入口')
  assert.ok(names.includes('立即预约'), '缺少立即预约入口')
})

test('快捷入口包含园区介绍、精彩活动、入园攻略、管家服务', (t) => {
  const { page } = mountPage(t)
  assert.deepEqual(titles(page.data.quickEntries), ['园区介绍', '精彩活动', '入园攻略', '管家服务'])
})

test('特色服务卡包含生日宴请、公司团建、品牌合作', (t) => {
  const { page } = mountPage(t)
  assert.deepEqual(titles(page.data.serviceCards), ['生日宴请', '公司团建', '品牌合作'])
})

test('会员卡仍在首页；今日活动与地图已移交园区 Tab', (t) => {
  // 业主 2026-07-25：首页内容过多要滑两屏，园内信息归「园区」Tab
  const { page } = mountPage(t)
  assert.ok(page.data.memberSection, '会员卡入口丢失')
  assert.equal(page.data.activities, undefined, '今日活动应由园区 Tab 承载')
  assert.equal(page.data.mapViewer, undefined, '地图应由园区 Tab 承载')
})

test('每个入口的路由+参数组合唯一，避免两个卡片跳到同一页却无法区分', (t) => {
  const { page } = mountPage(t)
  const routed = page.data.sections.filter((s) => s.route)
  const urls = routed.map((s) => page.buildUrl(s.route, s.params))
  assert.equal(new Set(urls).size, urls.length, '入口路由重复：' + urls.join(', '))
  for (const url of urls) assert.ok(url.startsWith('/pages/'), '路由必须是绝对路径：' + url)
})

test('云端配置可以隐藏模块、改标题、改排序', async (t) => {
  const { page } = mountPage(t, {
    portal: {
      notice: { content: '今日 16:30 后停止入园' },
      sections: [
        { key: 'ticket_entry', type: 'primary_action', title: '限时门票', route: '/pages/ticket/ticket', params: {}, visible: true, sort: 20 },
        { key: 'reservation_entry', type: 'primary_action', title: '立即预约', route: '/pages/reservation/entry/entry', params: {}, visible: true, sort: 10 }
      ],
      activities: [],
      userSummary: null
    }
  })
  await page.loadData()
  assert.deepEqual(titles(page.data.primaryActions), ['立即预约', '限时门票'], '应按云端 sort 排序并采用云端标题')
  assert.equal(page.data.quickEntries.length, 0, '云端未下发的模块不应再显示')
  assert.equal(page.data.notice, '今日 16:30 后停止入园')
})

test('有未使用票或即将到来的预约时显示状态卡', async (t) => {
  const { page } = mountPage(t, {
    portal: {
      sections: [],
      activities: [],
      userSummary: {
        unusedTicketCount: 2,
        upcomingReservation: { visitDate: '2026-08-09', partySize: 12, status: 'confirmed', timeSlot: '10:00' }
      }
    }
  })
  await page.loadData()
  assert.equal(page.data.showUserStatus, true)
  assert.equal(page.data.userSummary.unusedTicketCount, 2)
  assert.equal(page.data.userSummary.upcomingReservation.visitDate, '2026-08-09')
})

test('无票无预约时状态卡不占位', async (t) => {
  const { page } = mountPage(t, {
    portal: { sections: [], activities: [], userSummary: { unusedTicketCount: 0, upcomingReservation: null } }
  })
  await page.loadData()
  assert.equal(page.data.showUserStatus, false)
})

test('getHomePortal 尚未部署时回退旧接口，首页入口结构完整', async (t) => {
  const { page, calls } = mountPage(t, { portalError: true, legacy: { notice: '旧公告', maps: {} } })
  await page.loadData()
  const names = calls.request.map((c) => c.name)
  assert.ok(names.includes('getHomePortal'))
  assert.ok(names.includes('getHomeData'), '新接口失败必须回退旧接口')
  assert.equal(page.data.notice, '旧公告')
  assert.ok(titles(page.data.primaryActions).includes('门票购买'), '降级后仍要有购票入口')
})

test('两个接口都失败时仍显示本地默认门户，不白屏', async (t) => {
  const { page } = mountPage(t, { portalError: true, legacyError: true })
  await page.loadData()
  assert.ok(page.data.sections.length > 0)
  assert.ok(titles(page.data.quickEntries).length > 0)
  assert.ok(page.data.notice, '兜底公告不能为空')
})

test('点击入口按配置跳转，参数拼接到 url', (t) => {
  const { page, calls } = mountPage(t)
  page.onSectionTap({ currentTarget: { dataset: { key: 'quick_park_intro' } } })
  assert.equal(calls.navigate[0], '/pages/content/list/list?category=park_intro')
})

test('目标页面尚未上线时给出提示，不允许点了无反应', (t) => {
  const { page, calls } = mountPage(t, { navigateFail: true })
  page.onSectionTap({ currentTarget: { dataset: { key: 'quick_concierge' } } })
  assert.equal(calls.toast.length, 1, '跳转失败必须给出提示')
  assert.ok(/即将开放|敬请期待/.test(calls.toast[0].title))
})

test('tabBar 页面用 switchTab 跳转，避免 navigateTo 失败', (t) => {
  const { page, calls } = mountPage(t)
  page.goRoute('/pages/ling/ling', {})
  assert.deepEqual(calls.switchTab, ['/pages/ling/ling'])
  assert.equal(calls.navigate.length, 0)
})

test('无 route 的展示型模块点击不跳转', (t) => {
  const { page, calls } = mountPage(t)
  page.onSectionTap({ currentTarget: { dataset: { key: 'today_activities' } } })
  assert.equal(calls.navigate.length, 0)
  assert.equal(calls.switchTab.length, 0)
})
