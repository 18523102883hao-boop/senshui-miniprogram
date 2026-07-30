// Vibe UI v2.0 基础组件契约测试
// 依据 STYLE.md：设计令牌唯一来源、图标只来自资源包、按压三档、动效只用 transform/opacity
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const appWxss = fs.readFileSync(path.join(projectRoot, 'miniprogram/app.wxss'), 'utf8')
const appJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))
const iconMap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'icon-map.json'), 'utf8'))
const uiDir = path.join(projectRoot, 'miniprogram/components/ui')

function mountComponent(t, name) {
  const originalComponent = global.Component
  let config
  global.Component = (c) => { config = c }
  const p = path.join(uiDir, name, 'index.js')
  delete require.cache[p]
  require(p)
  t.after(() => {
    delete require.cache[p]
    global.Component = originalComponent
  })

  const data = {}
  Object.keys(config.properties || {}).forEach((k) => { data[k] = config.properties[k].value })
  Object.assign(data, config.data || {})

  const events = []
  const inst = Object.assign({}, config.methods, {
    data,
    setData(patch) { Object.assign(this.data, patch) },
    triggerEvent(n, detail) { events.push({ name: n, detail }) },
    _observers: config.observers || {},
    _lifetimes: config.lifetimes || {},
    // 手动触发 observer（小程序运行时行为的最小模拟）
    setProps(patch) {
      Object.assign(this.data, patch)
      Object.keys(this._observers).forEach((keys) => {
        const fields = keys.split(',').map((s) => s.trim())
        if (fields.some((f) => Object.prototype.hasOwnProperty.call(patch, f))) {
          this._observers[keys].apply(this, fields.map((f) => this.data[f]))
        }
      })
    }
  })
  return { inst, events, config }
}

// ============ 设计令牌 ============

test('app.wxss 令牌严格对齐 STYLE.md v2.0', () => {
  const expected = {
    '--sr-bg': '#F6F4F0',
    '--sr-bg-card': '#FFFFFF',
    '--sr-bg-sunken': '#EEEDE7',
    '--sr-primary': '#244B36',
    '--sr-primary-deep': '#173628',
    '--sr-primary-light': '#4F7963',
    '--sr-gold': '#D5A43A',
    '--sr-seal': '#F07055',
    '--sr-text': '#172019',
    '--sr-text-sub': '#667069',
    '--sr-dark-bg': '#101512',
    '--sr-dark-card': '#18201B',
    '--sr-dark-card-2': '#202A23'
  }
  for (const token of Object.keys(expected)) {
    const re = new RegExp(token.replace(/-/g, '\\-') + ':\\s*' + expected[token], 'i')
    assert.match(appWxss, re, `${token} 应为 ${expected[token]}`)
  }
})

test('按压反馈按 STYLE.md §7 分三档', () => {
  assert.match(appWxss, /\.sr-touch--card\s*\{\s*transform:\s*scale\(0\.985\)/)
  assert.match(appWxss, /\.sr-touch--press\s*\{\s*transform:\s*scale\(0\.97\)/)
  assert.match(appWxss, /\.sr-touch--cta\s*\{\s*transform:\s*scale\(0\.96\)/)
  // 大卡片不得使用 .94（会导致页面抖动）
  assert.equal(/scale\(0\.94\)/.test(appWxss), false, '不得再出现 scale(.94)')
})

test('动效时长令牌落在 STYLE.md 规定区间', () => {
  const ranges = {
    '--sr-dur-fast': [120, 160],
    '--sr-dur-switch': [200, 240],
    '--sr-dur-enter': [280, 340],
    '--sr-dur-sheet': [300, 360]
  }
  for (const token of Object.keys(ranges)) {
    const m = appWxss.match(new RegExp(token.replace(/-/g, '\\-') + ':\\s*(\\d+)ms'))
    assert.ok(m, token + ' 未定义')
    const v = Number(m[1])
    const [lo, hi] = ranges[token]
    assert.ok(v >= lo && v <= hi, `${token}=${v}ms 应在 ${lo}-${hi}ms`)
  }
})

test('不加载任何网络字体或外部图标库', () => {
  for (const bad of ['@font-face', 'fontawesome', 'font-awesome', 'iconfont', 'cdn.', 'https://at.alicdn']) {
    assert.equal(appWxss.toLowerCase().includes(bad), false, '不得引入：' + bad)
  }
})

// ============ sr-icon ============

test('sr-icon 按主题映射到正确的资源目录', (t) => {
  const { inst } = mountComponent(t, 'sr-icon')
  inst.setProps({ name: 'chevron-right', theme: 'light', size: 'md' })
  assert.equal(inst.data.src, '/assets/icons/forest/chevron-right.png')

  inst.setProps({ name: 'chevron-right', theme: 'dark' })
  assert.equal(inst.data.src, '/assets/icons/ivory/chevron-right.png')

  inst.setProps({ name: 'status-warning', theme: 'status' })
  assert.equal(inst.data.src, '/assets/icons/status/status-warning.png')
})

test('sr-icon 尺寸预设与自定义值都支持', (t) => {
  const { inst } = mountComponent(t, 'sr-icon')
  inst.setProps({ name: 'close', theme: 'light', size: 'sm' })
  assert.equal(inst.data.sizeRpx, 32)
  inst.setProps({ name: 'close', theme: 'light', size: 'xl' })
  assert.equal(inst.data.sizeRpx, 72)
  inst.setProps({ name: 'close', theme: 'light', size: '96' })
  assert.equal(inst.data.sizeRpx, 96)
})

test('sr-icon 无名称时不渲染，避免出现 404 图片', (t) => {
  const { inst } = mountComponent(t, 'sr-icon')
  inst.setProps({ name: '', theme: 'light', size: 'md' })
  assert.equal(inst.data.src, '')
})

test('项目内引用的图标全部真实存在（无 404）', () => {
  const dirs = ['miniprogram/pages', 'miniprogram/components']
  const refs = new Set()
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(wxml|js)$/.test(e.name)) {
        const src = fs.readFileSync(p, 'utf8')
        const m = src.match(/\/assets\/icons\/[a-z]+\/[a-z0-9-]+\.png/g) || []
        m.forEach((x) => refs.add(x))
      }
    }
  }
  dirs.forEach((d) => walk(path.join(projectRoot, d)))
  const missing = [...refs].filter((r) => !fs.existsSync(path.join(projectRoot, 'miniprogram', r)))
  assert.deepEqual(missing, [], '以下图标被引用但不存在：' + missing.join(', '))
})

test('在用图标均可在 icon-map.json 中找到定义', () => {
  const names = new Set((iconMap.icons || []).map((i) => i.name))
  const used = fs.readdirSync(path.join(projectRoot, 'miniprogram/assets/icons/forest'))
    .filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', ''))
  const unknown = used.filter((n) => !names.has(n))
  assert.deepEqual(unknown, [], '这些图标不在 icon-map.json 里：' + unknown.join(', '))
})

// ============ 状态组件 ============

test('sr-empty-state 有动作时才触发事件', (t) => {
  const { inst, events } = mountComponent(t, 'sr-empty-state')
  inst.onAction()
  assert.equal(events.length, 1)
  assert.equal(events[0].name, 'action')
})

test('sr-error-state 默认按钮文案全站统一为「重新加载」', (t) => {
  const { inst, events } = mountComponent(t, 'sr-error-state')
  assert.equal(inst.data.actionText, '重新加载')
  inst.onRetry()
  assert.equal(events[0].name, 'retry')
})

test('sr-skeleton 行数至少为 1，避免传 0 时空白', (t) => {
  const { inst } = mountComponent(t, 'sr-skeleton')
  inst.setProps({ rows: 0 })
  assert.equal(inst.data.items.length, 1)
  inst.setProps({ rows: 4 })
  assert.equal(inst.data.items.length, 4)
})

test('sr-skeleton 只用 opacity 动画，不触发重排', () => {
  const css = fs.readFileSync(path.join(uiDir, 'sr-skeleton/index.wxss'), 'utf8')
  // 只取 @keyframes 花括号内部，别把后面的普通规则算进来
  const blocks = css.match(/@keyframes[^{]*\{[\s\S]*?\}\s*\}/g) || []
  assert.ok(blocks.length > 0, '应有骨架动画')
  for (const block of blocks) {
    assert.match(block, /opacity/)
    for (const bad of ['width:', 'height:', 'margin', 'left:', 'top:']) {
      assert.equal(block.includes(bad), false, '骨架动画不得动 ' + bad)
    }
  }
})

test('sr-section-header 右侧动作可触发', (t) => {
  const { inst, events } = mountComponent(t, 'sr-section-header')
  inst.onExtra()
  assert.equal(events[0].name, 'extra')
})

// ============ 组件规范 ============

test('所有 ui 组件都声明为 component 且提供四件套', () => {
  for (const name of fs.readdirSync(uiDir)) {
    const dir = path.join(uiDir, name)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(fs.existsSync(path.join(dir, 'index.' + ext)), `${name} 缺少 index.${ext}`)
    }
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))
    assert.equal(json.component, true, name + ' 必须声明 component: true')
  }
})

test('基础组件不直接调用云函数或支付（业务留在页面）', () => {
  for (const name of fs.readdirSync(uiDir)) {
    const p = path.join(uiDir, name, 'index.js')
    if (!fs.existsSync(p)) continue
    const src = fs.readFileSync(p, 'utf8')
    for (const bad of ['wx.cloud', 'requestPayment', 'utils/request', 'callFunction']) {
      assert.equal(src.includes(bad), false, `${name} 不得直接调用 ${bad}`)
    }
  }
})

test('组件已全局注册，页面无需重复声明', () => {
  const g = appJson.usingComponents || {}
  for (const n of ['sr-icon', 'sr-empty-state', 'sr-error-state', 'sr-skeleton', 'sr-section-header']) {
    assert.ok(g[n], n + ' 未在 app.json 全局注册')
  }
})
