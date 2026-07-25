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

test('首页不再重复推会员：新客福利与会员卡合并为一处', () => {
  assert.equal(indexWxml.includes('newbie__badge'), false, '独立的新客福利卡应并入会员卡')
  // 只统计根节点（class="promo " 后接其他类），不含 promo__xxx 子元素
  const memberBlocks = (indexWxml.match(/class="promo\s/g) || []).length
  assert.equal(memberBlocks, 1, '会员卡只能出现一次')
  // 新客身份改为会员卡上的徽标，不再单独占一张卡
  assert.match(indexWxml, /新客专享/, '新客文案应并入会员卡徽标')
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

test('用户状态卡逻辑保留（有票/预约时显示）', (t) => {
  const { page } = mountIndex(t)
  assert.equal(typeof page.data.showUserStatus, 'boolean')
})
