// 企业微信二维码预留位（业主待提供，陆续填入）
// 核心约束：未配置的场景绝不渲染空图；配置后自动出现，无需改页面代码
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const qrPath = path.join(projectRoot, 'miniprogram/utils/qrcode.js')
const envPath = path.join(projectRoot, 'miniprogram/env.js')

function loadQr(envOverride) {
  delete require.cache[qrPath]
  const originalEnv = require.cache[envPath]
  if (envOverride) {
    require.cache[envPath] = { id: envPath, filename: envPath, loaded: true, exports: envOverride }
  }
  const mod = require(qrPath)
  return { mod, restore: () => {
    delete require.cache[qrPath]
    if (originalEnv) require.cache[envPath] = originalEnv
    else delete require.cache[envPath]
  } }
}

test('全部场景未配置时，一律返回未启用', (t) => {
  const { mod, restore } = loadQr({ qrcodes: {}, concierge: {} })
  t.after(restore)
  for (const scene of mod.QR_SCENES) {
    const r = mod.getQrcode(scene)
    assert.equal(r.enabled, false, scene + ' 未配置时应返回 enabled:false')
    assert.equal(r.url, '')
  }
})

test('配置某个场景后，只有该场景启用', (t) => {
  const { mod, restore } = loadQr({ qrcodes: { birthday: 'cloud://qr-birthday.png' }, concierge: {} })
  t.after(restore)
  const b = mod.getQrcode('birthday')
  assert.equal(b.enabled, true)
  assert.equal(b.url, 'cloud://qr-birthday.png')
  assert.equal(mod.getQrcode('brand').enabled, false, '未配置的场景不受影响')
})

test('未配置的场景回落到通用管家二维码（若已配）', (t) => {
  const { mod, restore } = loadQr({ qrcodes: { concierge: 'cloud://qr-concierge.png' }, concierge: {} })
  t.after(restore)
  const r = mod.getQrcode('birthday')
  assert.equal(r.enabled, true, '专属未配时应回落通用管家')
  assert.equal(r.url, 'cloud://qr-concierge.png')
  assert.equal(r.fallback, true, '需标记为回落，页面可据此调整文案')
})

test('专属二维码优先于通用管家', (t) => {
  const { mod, restore } = loadQr({
    qrcodes: { concierge: 'cloud://general.png', teamBuilding: 'cloud://team.png' }, concierge: {}
  })
  t.after(restore)
  const r = mod.getQrcode('teamBuilding')
  assert.equal(r.url, 'cloud://team.png')
  assert.equal(r.fallback, false)
})

test('未知场景名安全返回未启用，不抛错', (t) => {
  const { mod, restore } = loadQr({ qrcodes: { concierge: 'cloud://g.png' }, concierge: {} })
  t.after(restore)
  const r = mod.getQrcode('nonsense')
  assert.equal(r.enabled, false, '未知场景不得误回落到通用码')
})

test('空字符串与空白串都视为未配置', (t) => {
  const { mod, restore } = loadQr({ qrcodes: { brand: '   ' }, concierge: {} })
  t.after(restore)
  assert.equal(mod.getQrcode('brand').enabled, false)
})

test('兼容旧字段 concierge.qrcodeUrl', (t) => {
  const { mod, restore } = loadQr({ qrcodes: {}, concierge: { qrcodeUrl: 'cloud://legacy.png' } })
  t.after(restore)
  const r = mod.getQrcode('concierge')
  assert.equal(r.enabled, true, '旧字段仍应生效，避免改造期回归')
  assert.equal(r.url, 'cloud://legacy.png')
})

test('env.js 预留了全部待填场景', () => {
  delete require.cache[envPath]
  const env = require(envPath)
  for (const scene of ['concierge', 'birthday', 'teamBuilding', 'brand', 'welfare', 'complaint']) {
    assert.ok(Object.prototype.hasOwnProperty.call(env.qrcodes, scene), 'env.qrcodes 缺少场景：' + scene)
  }
})

test('sr-qrcode 组件存在且未配置时不渲染 image', () => {
  const dir = path.join(projectRoot, 'miniprogram/components/ui/sr-qrcode')
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    assert.ok(fs.existsSync(path.join(dir, 'index.' + ext)), '缺少 index.' + ext)
  }
  const wxml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8')
  // image 必须挂在 enabled 条件下，否则未配置会出现裂图
  assert.match(wxml, /wx:if="\{\{enabled\}\}"/, '二维码区块必须由 enabled 控制')
})
