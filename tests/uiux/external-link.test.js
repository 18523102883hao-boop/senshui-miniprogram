const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const modulePath = path.join(projectRoot, 'miniprogram/utils/external-link.js')

function mountExternalLink(t, options = {}) {
  const originalWx = global.wx
  const calls = {
    miniProgram: [],
    navigate: [],
    clipboard: [],
    toast: []
  }

  global.wx = {
    navigateToMiniProgram(payload) {
      calls.miniProgram.push(payload)
      if (options.miniProgramFail && payload.fail) payload.fail({ errMsg: 'navigateToMiniProgram:fail' })
    },
    navigateTo(payload) {
      calls.navigate.push(payload.url)
      if (options.navigateFail && payload.fail) payload.fail({ errMsg: 'navigateTo:fail' })
    },
    setClipboardData(payload) {
      calls.clipboard.push(payload.data)
      if (payload.success) payload.success()
    },
    showToast(payload) {
      calls.toast.push(payload)
    }
  }

  delete require.cache[modulePath]
  const externalLink = require(modulePath)
  t.after(() => {
    delete require.cache[modulePath]
    global.wx = originalWx
  })
  return { externalLink, calls }
}

test('业务方提供小程序 AppID 时优先直跳保险小程序', (t) => {
  const { externalLink, calls } = mountExternalLink(t)
  externalLink.openWebview({
    url: 'https://cpsm.baoyouwang.com/QRCode/example',
    title: '溪降保险',
    miniProgramAppId: 'wx1234567890abcdef',
    miniProgramPath: 'pages/insurance/index?scene=river'
  })

  assert.equal(calls.miniProgram.length, 1)
  assert.equal(calls.miniProgram[0].appId, 'wx1234567890abcdef')
  assert.equal(calls.miniProgram[0].path, 'pages/insurance/index?scene=river')
  assert.equal(calls.navigate.length, 0)
})

test('保险方小程序直跳失败时自动回落到业务域名 web-view', (t) => {
  const { externalLink, calls } = mountExternalLink(t, { miniProgramFail: true })
  externalLink.openWebview({
    url: 'https://cpsm.baoyouwang.com/QRCode/example',
    title: '溪降保险',
    miniProgramAppId: 'wx1234567890abcdef',
    miniProgramPath: 'pages/insurance/index'
  })

  assert.equal(calls.miniProgram.length, 1)
  assert.equal(calls.navigate.length, 1)
  assert.match(decodeURIComponent(calls.navigate[0]), /cpsm\.baoyouwang\.com\/QRCode\/example/)
})

test('未提供保险方小程序 AppID 时保持现有业务域名 web-view 链路', (t) => {
  const { externalLink, calls } = mountExternalLink(t)
  externalLink.openWebview({
    url: 'https://cpsm.baoyouwang.com/QRCode/example',
    title: '溪降保险'
  })

  assert.equal(calls.miniProgram.length, 0)
  assert.equal(calls.navigate.length, 1)
})
