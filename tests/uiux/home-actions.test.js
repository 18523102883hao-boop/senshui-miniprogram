// 首页四大主行动（购票 / 预约 / 补差价升级 / 溪降保险）
// 业主 2026-07-28：保险是溪降行前必需服务，必须与其他转化入口统一呈现
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

test('首页默认包含四个主行动：购票 / 预约 / 补差价升级 / 溪降保险', (t) => {
  const { page } = mountIndex(t)
  const keys = page.data.primaryActions.map((a) => a.key)
  assert.deepEqual(keys, ['ticket_entry', 'reservation_entry', 'upgrade_entry', 'insurance_entry'])
})

test('四个主行动都有明确层级（靠排版区分，不靠配色）', (t) => {
  // 业主 2026-07-25 反馈：不需要特别标识，符合整体调性即可，靠排版体现轻重缓急
  const { page } = mountIndex(t)
  for (const a of page.data.primaryActions) {
    assert.ok(['primary', 'secondary'].includes(a.level), a.key + ' 缺少层级定义')
    assert.equal(a.accent, undefined, '不再按行动配不同颜色')
  }
})

test('购票是主卡，其余三个入口为次卡（主次分明）', (t) => {
  const { page } = mountIndex(t)
  const primary = page.data.primaryActions.filter((a) => a.level === 'primary')
  const secondary = page.data.primaryActions.filter((a) => a.level === 'secondary')
  assert.equal(primary.length, 1, '只能有一个主卡')
  assert.equal(primary[0].key, 'ticket_entry')
  assert.equal(secondary.length, 3)
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

test('溪降保险进入二维码识别引导页，不再尝试 web-view', (t) => {
  const { page, calls } = mountIndex(t)
  const insurance = page.data.primaryActions.find((a) => a.key === 'insurance_entry')
  assert.ok(insurance)
  assert.equal(insurance.route, '/pages/insurance/insurance')
  assert.deepEqual(insurance.params, {})

  page.onSectionTap({ currentTarget: { dataset: { key: 'insurance_entry' } } })
  assert.equal(calls.navigate[0], '/pages/insurance/insurance')
  const registered = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8')).pages
  assert.ok(registered.includes('pages/insurance/insurance'), '保险引导页必须已注册')
})

test('旧云端配置缺保险入口时自动补齐，且保留云端文案与排序', async (t) => {
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
  assert.deepEqual(page.data.primaryActions.map((a) => a.title), ['补差价', '买票', '溪降保险'])
  // 云端下发的也要补齐层级，否则渲染会缺样式
  for (const a of page.data.primaryActions) assert.ok(a.level, a.key + ' 缺 level')
})

test('种子配置与云函数兜底都含补差价及保险入口，且两处一致', () => {
  const seedKeys = seedData.DEFAULT_SECTIONS.map((s) => s.key)
  assert.ok(seedKeys.includes('upgrade_entry'), '种子配置缺补差价入口')
  assert.ok(seedKeys.includes('insurance_entry'), '种子配置缺溪降保险入口')
  const fallback = portalCore.DEFAULT_SECTIONS.map((s) => s.key + ':' + s.sort)
  const seed = seedData.DEFAULT_SECTIONS.map((s) => s.key + ':' + s.sort)
  assert.deepEqual(fallback, seed, '云函数兜底与种子配置必须一致')
})

test('四大行动依次排在用户状态卡之前', () => {
  const byKey = {}
  seedData.DEFAULT_SECTIONS.forEach((s) => { byKey[s.key] = s })
  const t1 = byKey.ticket_entry.sort
  const t2 = byKey.reservation_entry.sort
  const t3 = byKey.upgrade_entry.sort
  const t4 = byKey.insurance_entry.sort
  assert.ok(t1 < t2 && t2 < t3 && t3 < t4, '购票 → 预约 → 补差价 → 保险 顺序')
  assert.ok(t4 < byKey.user_status.sort, '四大行动应在用户状态卡之前')
})
