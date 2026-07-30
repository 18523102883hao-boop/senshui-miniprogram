// 隐私合规（小程序审核阻断项）
// 微信要求：开启 __usePrivacyCheck__ 后，调用隐私接口前必须让用户同意隐私协议。
// 未挂弹窗的页面，隐私接口会直接失败且用户无从授权。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const pagesDir = path.join(projectRoot, 'miniprogram/pages')
const appJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))

// 受微信隐私保护约束的接口（wx.makePhoneCall / wx.openLocation 不在其列——
// 它们只是发起拨号/打开地图，不获取用户信息）
const PRIVACY_APIS = [
  'getPhoneNumber', 'chooseAvatar', 'chooseMedia', 'chooseImage', 'chooseVideo',
  'chooseMessageFile',
  'getLocation', 'chooseLocation', 'scanCode', 'startRecord', 'getRecorderManager',
  'getUserProfile', 'chooseAddress', 'chooseInvoiceTitle', 'getClipboardData'
]

function listPageDirs() {
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.js')) out.push(path.dirname(p))
    }
  }
  walk(pagesDir)
  return [...new Set(out)]
}

// 页面用到的隐私接口
function usedPrivacyApis(dir) {
  const used = new Set()
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(js|wxml)$/.test(f)) continue
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    for (const api of PRIVACY_APIS) {
      // 匹配 wx.api( 或 open-type="api" 或 bindapi
      if (new RegExp('(wx\\.' + api + '\\s*\\(|open-type="' + api + '"|bind' + api.toLowerCase() + ')').test(src)) {
        used.add(api)
      }
    }
  }
  return [...used]
}

function hasPrivacyPopup(dir) {
  const jsonFile = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))[0]
  const wxmlFile = fs.readdirSync(dir).filter((f) => f.endsWith('.wxml'))[0]
  if (!jsonFile || !wxmlFile) return false
  const json = fs.readFileSync(path.join(dir, jsonFile), 'utf8')
  const wxml = fs.readFileSync(path.join(dir, wxmlFile), 'utf8')
  // 组件既要注册（页面 json 或 app.json 全局），也要在模板里实际渲染
  const registered = json.includes('privacy-popup') ||
    Object.keys(appJson.usingComponents || {}).indexOf('privacy-popup') >= 0
  return registered && wxml.includes('<privacy-popup')
}

test('开启了 __usePrivacyCheck__（微信隐私新规要求）', () => {
  assert.equal(appJson.__usePrivacyCheck__, true)
})

test('所有调用隐私接口的页面都挂了隐私弹窗', () => {
  const missing = []
  for (const dir of listPageDirs()) {
    const apis = usedPrivacyApis(dir)
    if (!apis.length) continue
    if (!hasPrivacyPopup(dir)) {
      missing.push(dir.replace(pagesDir + '/', '') + ' → ' + apis.join(', '))
    }
  }
  assert.deepEqual(missing, [], '以下页面用了隐私接口但没有弹窗兜底，用户将无法授权：\n  ' + missing.join('\n  '))
})

test('隐私政策与用户协议页均已注册', () => {
  assert.ok(appJson.pages.includes('pages/legal/privacy/privacy'), '缺隐私政策页')
  assert.ok(appJson.pages.includes('pages/legal/agreement/agreement'), '缺用户服务协议页')
})

test('隐私政策覆盖实际收集的信息类型', () => {
  const src = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/legal/privacy/privacy.js'), 'utf8')
  // 与代码实际调用的隐私接口对应，漏写会被微信驳回
  for (const item of ['手机号', '头像', '相册', '位置', '订单', '生日']) {
    assert.ok(src.includes(item), '隐私政策未说明收集：' + item)
  }
})

test('隐私政策使用与微信后台一致的照片和文件声明名称', () => {
  const src = fs.readFileSync(path.join(projectRoot, 'miniprogram/pages/legal/privacy/privacy.js'), 'utf8')
  assert.match(src, /收集你选中的照片或视频信息/)
  assert.match(src, /收集你选中的文件/)
})

test('隐私弹窗组件提供同意与拒绝两条路径', () => {
  const dir = path.join(projectRoot, 'miniprogram/components/privacy-popup')
  const wxml = fs.readFileSync(path.join(dir, 'index.wxml'), 'utf8')
  // 同意必须走 open-type="agreePrivacyAuthorization"，否则授权不生效
  assert.match(wxml, /open-type="agreePrivacyAuthorization"/, '同意按钮必须用官方 open-type')
  assert.match(wxml, /bindagreeprivacyauthorization/, '缺同意回调')
  const js = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')
  assert.ok(js.includes('onDisagree') || js.includes('disagree'), '必须提供拒绝路径')
})

test('隐私弹窗如实说明照片与文件仅在用户主动选择时使用', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/components/privacy-popup/index.wxml'),
    'utf8'
  )
  assert.match(wxml, /主动选择/)
  assert.match(wxml, /照片/)
  assert.match(wxml, /文件/)
})

test('隐私弹窗可跳转完整隐私政策，满足知情权', () => {
  const js = fs.readFileSync(path.join(projectRoot, 'miniprogram/components/privacy-popup/index.js'), 'utf8')
  assert.ok(
    js.includes('openPrivacyContract') || js.includes('legal/privacy'),
    '弹窗需能查看完整隐私政策'
  )
})
