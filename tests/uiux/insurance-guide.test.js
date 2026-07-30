const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const pageBase = path.join(projectRoot, 'miniprogram/pages/insurance/insurance')
const pagePath = pageBase + '.js'
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')
const posterPath = path.join(projectRoot, 'miniprogram/images/insurance-purchase-qr.jpg')
const purchaseUrl = 'https://cpsm.baoyouwang.com/QRCode/c5114feb-5203-4c07-b5cc-0ccd937b9733'
const replacementPosterSha256 = '472b7f749c3104d81515cb9b583015534f25e845157b11225374a93b80f15eef'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originalHaptics = require.cache[hapticsPath]
  const calls = { preview: [], clipboard: [], toast: [], phone: [] }
  let config

  require.cache[hapticsPath] = {
    id: hapticsPath,
    filename: hapticsPath,
    loaded: true,
    exports: { haptic() {} }
  }
  global.wx = {
    previewImage(payload) {
      calls.preview.push(payload)
      if (options.previewFail && payload.fail) payload.fail(new Error('preview failed'))
    },
    setClipboardData(payload) {
      calls.clipboard.push(payload.data)
      if (options.clipboardFail) {
        if (payload.fail) {
          payload.fail({
            errMsg: 'setClipboardData:fail api scope is not declared in the privacy agreement'
          })
        }
        return
      }
      if (payload.success) payload.success()
    },
    showToast(payload) {
      calls.toast.push(payload)
    },
    makePhoneCall(payload) {
      calls.phone.push(payload.phoneNumber)
    }
  }
  global.Page = (pageConfig) => { config = pageConfig }

  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, config, {
    data: clone(config.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
    delete require.cache[pagePath]
    if (originalHaptics) require.cache[hapticsPath] = originalHaptics
    else delete require.cache[hapticsPath]
    global.Page = originalPage
    global.wx = originalWx
  })

  return { page, calls }
}

test('保险二维码引导页资源完整且已注册', () => {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    assert.ok(fs.existsSync(pageBase + ext), '缺少保险引导页文件：' + ext)
  }
  assert.ok(fs.existsSync(posterPath), '缺少保险二维码预览海报')
  const actualSha256 = crypto.createHash('sha256')
    .update(fs.readFileSync(posterPath))
    .digest('hex')
  assert.equal(actualSha256, replacementPosterSha256, '保险二维码海报尚未替换为用户提供的新图')

  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))
  assert.ok(app.pages.includes('pages/insurance/insurance'), '保险引导页尚未注册')
})

test('点击二维码使用微信原生图片预览，支持长按识别', (t) => {
  const { page, calls } = mountPage(t)
  page.previewQr()

  assert.equal(calls.preview.length, 1)
  assert.equal(calls.preview[0].current, '/images/insurance-purchase-qr.jpg')
  assert.deepEqual(calls.preview[0].urls, ['/images/insurance-purchase-qr.jpg'])
  assert.equal(calls.preview[0].showmenu, true)
})

test('图片预览失败时给出可理解的重试提示', (t) => {
  const { page, calls } = mountPage(t, { previewFail: true })
  page.previewQr()

  assert.equal(calls.toast.at(-1).icon, 'none')
  assert.match(calls.toast.at(-1).title, /预览失败/)
})

test('复制投保链接作为二维码识别失败时的兜底', (t) => {
  const { page, calls } = mountPage(t)
  page.copyPurchaseLink()

  assert.deepEqual(calls.clipboard, [purchaseUrl])
  assert.equal(page.data.manualCopyVisible, false)
})

test('系统剪贴板不可用时展示可长按复制的完整链接', (t) => {
  const { page, calls } = mountPage(t, { clipboardFail: true })
  page.copyPurchaseLink()

  assert.deepEqual(calls.clipboard, [purchaseUrl])
  assert.equal(page.data.manualCopyVisible, true)
  assert.match(calls.toast.at(-1).title, /长按下方链接复制/)
})

test('页面清楚说明长按识别步骤和第三方服务边界', () => {
  const wxml = fs.readFileSync(pageBase + '.wxml', 'utf8')
  assert.match(wxml, /bindtap="previewQr"/)
  assert.match(wxml, /长按识别/)
  assert.match(wxml, /bindtap="copyPurchaseLink"/)
  assert.match(wxml, /保游网/)
  assert.match(wxml, /第三方/)
  assert.match(wxml, /投保、支付、保单与理赔/)
  assert.match(wxml, /user-select="true"/)
  assert.match(wxml, /<privacy-popup/)
})
