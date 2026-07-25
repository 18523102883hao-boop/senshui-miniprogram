// 首页三大主行动（购票 / 预约 / 补差价升级）
// 业主 2026-07-25：补差价是高频重要功能，必须上首页；三者需统一且醒目的视觉标识
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const indexPath = path.join(projectRoot, 'miniprogram/pages/index/index.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')
const seedData = require(path.join(projectRoot, 'cloudfunctions/seedPortalContent/seed-data.js'))
const portalCore = require(path.join(projectRoot, 'cloudfunctions/getHomePortal/portal-core.js'))

function clone(v) { return JSON.parse(JSON.stringify(v)) }

function mountIndex(t, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], navigate: [], switchTab: [], toast: [] }
  let pageConfig

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }
  stub(requestPath, {
    call(name, data) {
      calls.request.push({ name, data })
      if (name === 'getHomePortal') {
        if (options.portalError) return Promise.reject(new Error('x'))
        return Promise.resolve(options.portal || { sections: [], userSummary: null })
      }
      return Promise.resolve({})
    },
    callWithLoading(n, d) { return this.call(n, d) }
  })
  stub(hapticsPath, { haptic() {} })

  global.wx = {
    cloud: { getTempFileURL: () => Promise.resolve({ fileList: [] }) },
    getWindowInfo: () => ({ windowWidth: 375 }),
    getImageInfo: (o) => o.fail && o.fail({}),
    navigateTo(o) { calls.navigate.push(o.url); if (options.navigateFail && o.fail) o.fail({}) },
    switchTab(o) { calls.switchTab.push(o.url) },
    showToast(o) { calls.toast.push(o) },
    stopPullDownRefresh() {}
  }
  global.Page = (c) => { pageConfig = c }
  delete require.cache[indexPath]
  require(indexPath)

  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) { Object.assign(this.data, patch) }
  })
  t.after(() => {
    delete require.cache[indexPath]
    Object.keys(originals).forEach((p) => {
      if (originals[p]) require.cache[p] = originals[p]
      else delete require.cache[p]
    })
    global.Page = originalPage
    global.wx = originalWx
  })
  return { page, calls }
}

test('首页默认包含三个主行动：购票 / 预约 / 补差价升级', (t) => {
  const { page } = mountIndex(t)
  const keys = page.data.primaryActions.map((a) => a.key)
  assert.deepEqual(keys, ['ticket_entry', 'reservation_entry', 'upgrade_entry'])
})

test('三个主行动各有独立视觉标识（accent），互不重复', (t) => {
  const { page } = mountIndex(t)
  const accents = page.data.primaryActions.map((a) => a.accent)
  for (const a of accents) assert.ok(a, '每个主行动都要有 accent 标识')
  assert.equal(new Set(accents).size, accents.length, 'accent 必须互不相同，才能一眼区分')
})

test('购票是主卡，预约与补差价为次卡（主次分明）', (t) => {
  const { page } = mountIndex(t)
  const primary = page.data.primaryActions.filter((a) => a.level === 'primary')
  const secondary = page.data.primaryActions.filter((a) => a.level === 'secondary')
  assert.equal(primary.length, 1, '只能有一个主卡')
  assert.equal(primary[0].key, 'ticket_entry')
  assert.equal(secondary.length, 2)
})

test('补差价升级指向已有的说明页，不是死链', (t) => {
  const { page } = mountIndex(t)
  const upgrade = page.data.primaryActions.filter((a) => a.key === 'upgrade_entry')[0]
  assert.ok(upgrade)
  assert.equal(upgrade.route, '/pages/upgrade-info/upgrade-info')
  const registered = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8')).pages
  assert.ok(registered.includes('pages/upgrade-info/upgrade-info'), '目标页必须已注册')
})

test('点击补差价升级能正常跳转', (t) => {
  const { page, calls } = mountIndex(t)
  page.onSectionTap({ currentTarget: { dataset: { key: 'upgrade_entry' } } })
  assert.equal(calls.navigate[0], '/pages/upgrade-info/upgrade-info')
})

test('云端配置可覆盖三大行动的文案与排序', async (t) => {
  const { page } = mountIndex(t, {
    portal: {
      sections: [
        { key: 'upgrade_entry', type: 'primary_action', title: '补差价', route: '/pages/upgrade-info/upgrade-info', params: {}, visible: true, sort: 10 },
        { key: 'ticket_entry', type: 'primary_action', title: '买票', route: '/pages/ticket/ticket', params: {}, visible: true, sort: 20 }
      ],
      userSummary: null
    }
  })
  await page.loadData()
  assert.deepEqual(page.data.primaryActions.map((a) => a.title), ['补差价', '买票'])
  // 即使云端下发也要带上视觉标识，否则渲染会缺样式
  for (const a of page.data.primaryActions) assert.ok(a.accent, a.key + ' 缺 accent')
})

test('种子配置与云函数兜底都含补差价入口，且两处一致', () => {
  const seedKeys = seedData.DEFAULT_SECTIONS.map((s) => s.key)
  assert.ok(seedKeys.includes('upgrade_entry'), '种子配置缺补差价入口')
  const fallback = portalCore.DEFAULT_SECTIONS.map((s) => s.key + ':' + s.sort)
  const seed = seedData.DEFAULT_SECTIONS.map((s) => s.key + ':' + s.sort)
  assert.deepEqual(fallback, seed, '云函数兜底与种子配置必须一致')
})

test('三大行动的 sort 连续且排在用户状态卡之前', () => {
  const byKey = {}
  seedData.DEFAULT_SECTIONS.forEach((s) => { byKey[s.key] = s })
  const t1 = byKey.ticket_entry.sort
  const t2 = byKey.reservation_entry.sort
  const t3 = byKey.upgrade_entry.sort
  assert.ok(t1 < t2 && t2 < t3, '购票 → 预约 → 补差价 顺序')
  assert.ok(t3 < byKey.user_status.sort, '三大行动应在用户状态卡之前')
})
