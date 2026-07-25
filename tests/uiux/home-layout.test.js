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
  assert.match(wxml, /status\.items/, '缺营业状态（须分营地/溪降）')
  assert.match(wxml, /address/, '缺地址')
  assert.match(wxml, /onNavigate/, '缺导航动作')
  assert.match(wxml, /ph__member/, '缺会员入口')
})

test('园区 Tab 不重复首页的品牌信息头', () => {
  // 业主 2026-07-25：园区页顶部与首页重复，取消
  const park = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/park/park.wxml'), 'utf8')
  assert.equal(/<sr-park-header/.test(park), false, '品牌头只在首页出现一次')
})

test('园区 Tab 按园内使用场景排布：今日安排在最前', () => {
  const park = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/park/park.wxml'), 'utf8')
  const order = ['today', 'maps', 'svc-grid', 'help']
  let last = -1
  for (const cls of order) {
    const i = park.indexOf('class="' + cls)
    assert.ok(i > 0, '缺区块：' + cls)
    assert.ok(i > last, cls + ' 顺序不对，园内客人先看今日安排再找路')
    last = i
  }
})

test('园区页营业时间也分营地与溪降', () => {
  const park = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/park/park.wxml'), 'utf8')
  assert.match(park, /today__hour/, '缺分项目营业时间')
  const js = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/park/park.js'), 'utf8')
  assert.match(js, /computeOpenStatus/, '应复用共享的营业状态计算')
})

test('园区页标出下一场活动，已过场次弱化', () => {
  const js = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/park/park.js'), 'utf8')
  assert.match(js, /markSchedule/, '缺场次标记逻辑')
  const css = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/park/park.wxss'), 'utf8')
  assert.match(css, /\.act-item\.is-next/, '缺下一场高亮样式')
  assert.match(css, /\.act-item\.is-passed/, '缺已过场次弱化样式')
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

// ============ 营地与溪降时间分列（业主 2026-07-25：两者不同，合并会误导）============

test('营地与溪降营业时间分别配置，不再共用一个字段', () => {
  delete require.cache[path.join(projectRoot, 'miniprogram/env.js')]
  const env = require(path.join(projectRoot, 'miniprogram/env.js'))
  const h = env.park.hours
  assert.ok(h && h.camp && h.creek, 'park.hours 需含 camp 与 creek')
  assert.notEqual(h.camp.close, h.creek.close, '两者结束时间本就不同，配成一样说明配错了')
})

test('营业状态按项目分别计算：营地未结束时溪降可能已结束', () => {
  const { computeOpenStatus } = require(path.join(projectRoot, 'miniprogram/utils/park-status.js'))
  // 17:00：营地开到 21:00 仍在营业，溪降 16:30 已停止检票
  const s = computeOpenStatus(new Date(2026, 6, 25, 17, 0))
  const camp = s.items.filter((i) => i.key === 'camp')[0]
  const creek = s.items.filter((i) => i.key === 'creek')[0]
  assert.equal(camp.isOpen, true, '17:00 营地仍营业')
  assert.equal(creek.isOpen, false, '17:00 溪降已结束')
  assert.equal(s.open, true, '有项目营业即算园区营业中')
})

test('营地 19:00 后仍营业但标为已停止供餐（不能与营业中同状态）', () => {
  const { computeOpenStatus } = require(path.join(projectRoot, 'miniprogram/utils/park-status.js'))
  const s = computeOpenStatus(new Date(2026, 6, 25, 20, 0))
  const camp = s.items.filter((i) => i.key === 'camp')[0]
  assert.equal(camp.isOpen, true, '20:00 营地仍在营业')
  assert.equal(camp.state, 'partial', '过了 19:00 应标为部分服务停止')
  assert.match(camp.text, /供餐/, '需明确告知已停止供餐，避免客人白跑一趟点餐')
})

test('营地 19:00 前是完整营业状态', () => {
  const { computeOpenStatus } = require(path.join(projectRoot, 'miniprogram/utils/park-status.js'))
  const camp = computeOpenStatus(new Date(2026, 6, 25, 18, 0)).items.filter((i) => i.key === 'camp')[0]
  assert.equal(camp.state, 'open')
})

test('开园前与闭园后的整体状态正确', () => {
  const { computeOpenStatus } = require(path.join(projectRoot, 'miniprogram/utils/park-status.js'))
  assert.equal(computeOpenStatus(new Date(2026, 6, 25, 9, 0)).open, false, '9:00 未开园')
  assert.equal(computeOpenStatus(new Date(2026, 6, 25, 22, 0)).open, false, '22:00 已闭园')
  assert.equal(computeOpenStatus(new Date(2026, 6, 25, 20, 0)).open, true, '20:00 营地仍开')
})

test('溪降结束文案是「停止检票」而非「结束」（业务口径）', () => {
  const { computeOpenStatus } = require(path.join(projectRoot, 'miniprogram/utils/park-status.js'))
  const creek = computeOpenStatus(new Date(2026, 6, 25, 11, 0)).items.filter((i) => i.key === 'creek')[0]
  assert.match(creek.text, /停止检票/)
})

// ============ 二级页面常驻导航（业主：补差价页看不到 Tab）============

test('浏览类二级页面挂了常驻导航', () => {
  const shouldHave = [
    'upgrade-info/upgrade-info', 'catalog/catalog', 'guide/guide',
    'concierge/concierge', 'ticket/ticket', 'order/order', 'content/list/list'
  ]
  for (const name of shouldHave) {
    const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages', name + '.wxml'), 'utf8')
    assert.match(wxml, /<sr-tabbar/, name + ' 缺常驻导航')
  }
})

test('任务流页面不加常驻导航（误点会中断流程、丢失已填内容）', () => {
  const shouldNotHave = [
    'ticket/checkout/checkout', 'ticket/result/result',
    'refund/detail/detail', 'service/lead/lead', 'feedback/create/create'
  ]
  for (const name of shouldNotHave) {
    const wxml = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages', name + '.wxml'), 'utf8')
    assert.equal(/<sr-tabbar/.test(wxml), false, name + ' 是任务流，不应加常驻导航')
  }
})

test('常驻导航与 custom-tab-bar 的四个入口保持一致', () => {
  const stb = fs.readFileSync(path.join(projectRoot, 'miniprogram/components/ui/sr-tabbar/index.js'), 'utf8')
  const ctb = fs.readFileSync(path.join(projectRoot, 'miniprogram/custom-tab-bar/index.js'), 'utf8')
  for (const p of ['/pages/index/index', '/pages/park/park', '/pages/ling/ling', '/pages/mine/mine']) {
    assert.ok(stb.includes(p), 'sr-tabbar 缺 ' + p)
    assert.ok(ctb.includes(p), 'custom-tab-bar 缺 ' + p)
  }
})

test('常驻导航用 switchTab 跳转（navigateTo 到 tab 页会失败）', () => {
  const src = fs.readFileSync(path.join(projectRoot, 'miniprogram/components/ui/sr-tabbar/index.js'), 'utf8')
  assert.match(src, /wx\.switchTab/)
  assert.equal(/wx\.navigateTo/.test(src), false, '不得用 navigateTo')
})

test('挂了常驻导航的页面都留了底部避让空间', () => {
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (e.name.endsWith('.wxml')) out.push(p)
    }
    return out
  }
  const missing = []
  for (const wxml of walk(path.join(projectRoot, 'miniprogram/pages'))) {
    if (!fs.readFileSync(wxml, 'utf8').includes('<sr-tabbar')) continue
    const wxss = wxml.replace('.wxml', '.wxss')
    if (!fs.existsSync(wxss)) { missing.push(wxml); continue }
    const css = fs.readFileSync(wxss, 'utf8')
    if (!/padding-bottom:\s*calc\([^)]*rpx/.test(css)) {
      missing.push(wxml.replace(path.join(projectRoot, 'miniprogram/pages/'), ''))
    }
  }
  assert.deepEqual(missing, [], '以下页面底部内容会被导航遮挡：\n  ' + missing.join('\n  '))
})
