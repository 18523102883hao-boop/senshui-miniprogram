// 四 Tab 自定义 tabBar 契约（向导 / 园区 / 长河令 / 我的）
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const tabbarJs = path.join(projectRoot, 'miniprogram/custom-tab-bar/index.js')
const appJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))

function mountTabBar(t) {
  const originalComponent = global.Component
  const originalWx = global.wx
  const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')
  const originalHaptics = require.cache[hapticsPath]
  require.cache[hapticsPath] = { id: hapticsPath, filename: hapticsPath, loaded: true, exports: { haptic() {} } }

  const calls = { switchTab: [] }
  global.wx = { switchTab(o) { calls.switchTab.push(o.url) } }
  let config
  global.Component = (c) => { config = c }
  delete require.cache[tabbarJs]
  require(tabbarJs)

  const inst = Object.assign({}, config.methods, {
    data: JSON.parse(JSON.stringify(config.data)),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
    delete require.cache[tabbarJs]
    if (originalHaptics) require.cache[hapticsPath] = originalHaptics
    else delete require.cache[hapticsPath]
    global.Component = originalComponent
    global.wx = originalWx
  })
  return { inst, calls }
}

test('tabBar 为四个一级入口：向导 / 园区 / 长河令 / 我的', (t) => {
  const { inst } = mountTabBar(t)
  assert.deepEqual(inst.data.list.map((x) => x.text), ['向导', '园区', '长河令', '我的'])
})

test('四个 Tab 指向的页面都在 app.json 注册且为 tabBar 页', (t) => {
  const { inst } = mountTabBar(t)
  const tabPaths = appJson.tabBar.list.map((x) => x.pagePath)
  for (const item of inst.data.list) {
    const p = item.pagePath.replace(/^\//, '')
    assert.ok(appJson.pages.includes(p), p + ' 未在 pages 注册')
    assert.ok(tabPaths.includes(p), p + ' 未声明为 tabBar 页')
  }
})

test('app.json tabBar.list 与组件顺序一致', (t) => {
  const { inst } = mountTabBar(t)
  const jsonPaths = appJson.tabBar.list.map((x) => x.pagePath)
  const compPaths = inst.data.list.map((x) => x.pagePath.replace(/^\//, ''))
  assert.deepEqual(jsonPaths, compPaths)
})

test('每个 Tab 都有选中/未选中/深色三态图标且文件存在', (t) => {
  const { inst } = mountTabBar(t)
  for (const item of inst.data.list) {
    for (const key of ['icon', 'iconActive', 'iconDark']) {
      assert.ok(item[key], item.text + ' 缺少 ' + key)
      const p = path.join(projectRoot, 'miniprogram', item[key])
      assert.ok(fs.existsSync(p), '图标不存在：' + item[key])
    }
  }
})

test('点击非当前 Tab 用 switchTab 跳转', (t) => {
  const { inst, calls } = mountTabBar(t)
  inst.setData({ selected: 0 })
  inst.onTap({ currentTarget: { dataset: { index: 1 } } })
  assert.deepEqual(calls.switchTab, ['/pages/park/park'])
})

test('点击当前 Tab 不重复跳转', (t) => {
  const { inst, calls } = mountTabBar(t)
  inst.setData({ selected: 2 })
  inst.onTap({ currentTarget: { dataset: { index: 2 } } })
  assert.equal(calls.switchTab.length, 0)
})

test('支持浅/深双主题切换', (t) => {
  const { inst } = mountTabBar(t)
  assert.ok(['light', 'dark'].includes(inst.data.theme))
})
