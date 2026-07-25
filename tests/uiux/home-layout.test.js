// 首页精简与视觉收敛（业主 2026-07-25 反馈：太乱、要滑两屏）
// 原则：层级靠排版（尺寸/位置/留白），不靠堆颜色；首页只服务「园外决策」场景
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const indexWxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/index/index.wxml'), 'utf8')
const indexWxss = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/index/index.wxss'), 'utf8')
const indexPath = path.join(projectRoot, 'miniprogram/pages/index/index.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(v) { return JSON.parse(JSON.stringify(v)) }

function mountIndex(t, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { navigate: [], switchTab: [] }
  let pageConfig
  const stub = (p, e) => { originals[p] = require.cache[p]; require.cache[p] = { id: p, filename: p, loaded: true, exports: e } }
  stub(requestPath, {
    call(name) {
      if (name === 'getHomePortal') {
        return options.portalError ? Promise.reject(new Error('x'))
          : Promise.resolve(options.portal || { sections: [], userSummary: null })
      }
      return Promise.resolve({})
    },
    callWithLoading(n, d) { return this.call(n, d) }
  })
  stub(hapticsPath, { haptic() {} })
  global.wx = {
    cloud: { getTempFileURL: () => Promise.resolve({ fileList: [] }) },
    getWindowInfo: () => ({ windowWidth: 375 }),
    navigateTo(o) { calls.navigate.push(o.url) },
    switchTab(o) { calls.switchTab.push(o.url) },
    showToast() {}, stopPullDownRefresh() {}
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
    Object.keys(originals).forEach((p) => { if (originals[p]) require.cache[p] = originals[p]; else delete require.cache[p] })
    global.Page = originalPage
    global.wx = originalWx
  })
  return { page, calls }
}

// ============ 视觉收敛 ============

test('三大主行动不再各用一种渐变（层级靠排版而非堆色）', () => {
  // 原实现给购票/预约/补差价各配了珊瑚/绿/金三种渐变，一屏五个色块导致杂乱
  for (const cls of ['.act--coral', '.act--gold']) {
    assert.equal(indexWxss.includes(cls), false, '不应再有多色渐变类：' + cls)
  }
})

test('首页渐变色块数量受控（STYLE.md 禁止所有模块都用渐变）', () => {
  const gradients = indexWxss.match(/linear-gradient/g) || []
  assert.ok(gradients.length <= 3, '首页渐变不应超过 3 处，实际 ' + gradients.length)
})

test('主行动仍有明确主次：一个主卡 + 两个次卡', (t) => {
  const { page } = mountIndex(t)
  const primary = page.data.primaryActions.filter((a) => a.level === 'primary')
  const secondary = page.data.primaryActions.filter((a) => a.level === 'secondary')
  assert.equal(primary.length, 1)
  assert.equal(primary[0].key, 'ticket_entry')
  assert.equal(secondary.length, 2)
})

// ============ 内容精简 ============

test('首页不再重复推会员：会员入口并入园区信息头', () => {
  // 业主 2026-07-25：Hero、会员卡、导航卡三块合并为一个板块放最顶端
  assert.equal(indexWxml.includes('newbie__badge'), false, '独立的新客福利卡已移除')
  assert.equal(indexWxml.includes('class="promo'), false, '独立会员卡已并入 sr-park-header')
  assert.match(indexWxml, /<sr-park-header/, '应使用合并后的园区信息头组件')
  assert.match(indexWxml, /show-member/, '会员入口由组件按状态显隐')
})

test('园区信息头同时承载品牌 / 营业状态 / 地址导航 / 会员入口', () => {
  const dir = path.join(projectRoot, 'miniprogram/components/ui/sr-park-header')
  const wxml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8')
  assert.match(wxml, /ph__name/, '缺品牌名')
  assert.match(wxml, /status\.text/, '缺营业状态')
  assert.match(wxml, /address/, '缺地址')
  assert.match(wxml, /onNavigate/, '缺导航动作')
  assert.match(wxml, /ph__member/, '缺会员入口')
})

test('首页与园区 Tab 复用同一个信息头，口径不会漂移', () => {
  const park = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/park/park.wxml'), 'utf8')
  assert.match(park, /<sr-park-header/, '园区 Tab 应复用同组件')
  assert.match(park, /show-member="\{\{false\}\}"/, '园区 Tab 不推销会员')
})

test('今日活动已移至园区 Tab，首页不再重复', () => {
  assert.equal(indexWxml.includes('今日江湖事'), false, '今日活动属于园内信息，归园区 Tab')
})

test('园区已是一级 Tab，首页不再放导览入口卡', () => {
  assert.equal(indexWxml.includes('park-entry'), false, 'tabBar 已有园区入口，首页卡片冗余')
})

test('特色服务不占首页横滑区（低频需求移至管家页）', () => {
  assert.equal(indexWxml.includes('svc-scroll'), false, '生日/团建/品牌属低频，不占首屏')
})

test('首页顶层模块数量控制在 8 个以内', () => {
  // 统计顶层区块注释，避免首页重新膨胀
  const blocks = indexWxml.match(/^  <!-- \d+\./gm) || []
  assert.ok(blocks.length <= 8, '首页顶层模块不应超过 8 个，实际 ' + blocks.length)
})

// ============ 保留的核心能力 ============

test('三大主行动仍在首页且可跳转', (t) => {
  const { page, calls } = mountIndex(t)
  assert.deepEqual(page.data.primaryActions.map((a) => a.key), ['ticket_entry', 'reservation_entry', 'upgrade_entry'])
  page.onSectionTap({ currentTarget: { dataset: { key: 'upgrade_entry' } } })
  assert.equal(calls.navigate[0], '/pages/upgrade-info/upgrade-info')
})

test('会员卡对非会员可见，会员则隐藏', (t) => {
  const { page } = mountIndex(t)
  assert.equal(page.data.showMemberPromo, true)
})

test('四个快捷入口保留', (t) => {
  const { page } = mountIndex(t)
  assert.equal(page.data.quickEntries.length, 4)
})

test('有票/预约的提示由顶部快捷条承担，不再另设状态卡', (t) => {
  // 快捷条更靠上更醒目，两者并存等于同一信息说两遍
  const { page } = mountIndex(t)
  assert.equal(page.data.showUserStatus, undefined, 'status-card 已下线')
  assert.ok('quickBar' in page.data, '改由 quickBar 承担')
})
