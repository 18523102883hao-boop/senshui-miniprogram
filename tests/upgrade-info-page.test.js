const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/upgrade-info/upgrade-info.js')
const wxmlPath = path.join(projectRoot, 'miniprogram/pages/upgrade-info/upgrade-info.wxml')
const wxssPath = path.join(projectRoot, 'miniprogram/pages/upgrade-info/upgrade-info.wxss')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originalRequest = require.cache[requestPath]
  const originalHaptics = require.cache[hapticsPath]
  const calls = { request: [], haptic: [], toast: [], modal: [] }
  let pageConfig

  require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: {
      callWithLoading(name, data, loadingText) {
        calls.request.push({ name, data, loadingText })
        return Promise.resolve(options.requestResult || {
          payment: { nonceStr: 'test-payment' },
          amount: 2000,
          itemLabel: '成人单营地升级'
        })
      }
    }
  }
  require.cache[hapticsPath] = {
    id: hapticsPath,
    filename: hapticsPath,
    loaded: true,
    exports: {
      haptic(type) {
        calls.haptic.push(type)
      }
    }
  }

  global.wx = {
    requestPayment(paymentOptions) {
      if (options.paymentError) {
        return paymentOptions.fail(options.paymentError)
      }
      return paymentOptions.success({})
    },
    showToast(payload) {
      calls.toast.push(payload)
    },
    showModal(payload) {
      calls.modal.push(payload)
    }
  }
  global.Page = (config) => {
    pageConfig = config
  }

  delete require.cache[pagePath]
  require(pagePath)

  const page = {
    ...pageConfig,
    data: clone(pageConfig.data),
    setData(patch) {
      Object.assign(this.data, patch)
    }
  }

  t.after(() => {
    delete require.cache[pagePath]
    if (originalRequest) require.cache[requestPath] = originalRequest
    else delete require.cache[requestPath]
    if (originalHaptics) require.cache[hapticsPath] = originalHaptics
    else delete require.cache[hapticsPath]
    global.Page = originalPage
    global.wx = originalWx
  })

  return { page, calls }
}

test('默认展示营地票方向，并可切换为溪降票方向', (t) => {
  const { page, calls } = mountPage(t)

  assert.equal(page.data.activeGroupIndex, 0)
  assert.deepEqual(
    page.data.visibleItems.map((item) => item.itemId),
    [
      'camp_adult_to_creek',
      'camp_family_to_creek_adult',
      'camp_family_to_creek_child',
      'camp_child_to_creek'
    ]
  )

  page.onDirectionTap({ currentTarget: { dataset: { index: 1 } } })

  assert.equal(page.data.activeGroupIndex, 1)
  assert.deepEqual(
    page.data.visibleItems.map((item) => item.itemId),
    [
      'creek_adult_to_camp',
      'creek_double_to_camp',
      'creek_child_to_camp'
    ]
  )
  assert.equal(page.data.buy, null)
  assert.deepEqual(calls.haptic, ['light'])
})

test('点击当前方向项目时打开对应的支付确认面板', (t) => {
  const { page } = mountPage(t)

  page.onDirectionTap({ currentTarget: { dataset: { index: 1 } } })
  page.onItemTap({ currentTarget: { dataset: { ii: 1 } } })

  assert.equal(page.data.buy.itemId, 'creek_double_to_camp')
  assert.equal(page.data.buy.add, '+¥134')
})

test('接待员工输入区默认收起并可按需展开', (t) => {
  const { page, calls } = mountPage(t)

  assert.equal(page.data.staffExpanded, false)
  page.toggleStaff()

  assert.equal(page.data.staffExpanded, true)
  assert.deepEqual(calls.haptic, ['light'])
})

test('七个云端升级 itemId 与展示补差金额保持原映射', (t) => {
  const { page } = mountPage(t)
  const mapping = page.data.groups
    .flatMap((group) => group.items)
    .map((item) => [item.itemId, item.add])

  assert.deepEqual(mapping, [
    ['camp_adult_to_creek', '+¥20'],
    ['camp_family_to_creek_adult', '+¥58'],
    ['camp_family_to_creek_child', '+¥29.9'],
    ['camp_child_to_creek', '+¥29.9'],
    ['creek_adult_to_camp', '+¥120'],
    ['creek_double_to_camp', '+¥134'],
    ['creek_child_to_camp', '+¥98']
  ])
  assert.equal(new Set(mapping.map(([itemId]) => itemId)).size, 7)
})

test('支付继续提交原 itemId 和 staffRef，并使用云端金额生成结果态', async (t) => {
  const { page, calls } = mountPage(t, {
    requestResult: {
      payment: { nonceStr: 'test-payment' },
      amount: 2990,
      itemLabel: '儿童营地升级溪降'
    }
  })

  page.onItemTap({ currentTarget: { dataset: { ii: 2 } } })
  page.setData({ staffRef: '小森' })
  await page.onPay()

  assert.deepEqual(calls.request, [{
    name: 'createSelfUpgrade',
    data: {
      itemId: 'camp_family_to_creek_child',
      staffRef: '小森'
    },
    loadingText: '下单中'
  }])
  assert.deepEqual(page.data.success, {
    itemLabel: '儿童营地升级溪降',
    amountYuan: '29.90'
  })
  assert.equal(page.data.buy, null)
  assert.equal(page.data.staffRef, '')
  assert.equal(page.data.paying, false)
  assert.deepEqual(calls.haptic, ['light', 'medium'])
  assert.deepEqual(calls.modal, [])
})

test('用户取消微信支付时保留项目和员工信息以便重试', async (t) => {
  const { page, calls } = mountPage(t, {
    paymentError: { errMsg: 'requestPayment:fail cancel' }
  })

  page.onItemTap({ currentTarget: { dataset: { ii: 0 } } })
  page.setData({ staffRef: '小森', staffExpanded: true })
  await page.onPay()

  assert.equal(page.data.buy.itemId, 'camp_adult_to_creek')
  assert.equal(page.data.staffRef, '小森')
  assert.equal(page.data.staffExpanded, true)
  assert.equal(page.data.paying, false)
  assert.equal(page.data.success, null)
  assert.deepEqual(calls.toast, [])
})

test('页面按当前票种逐步展示升级选项，不再使用重复行动文案', () => {
  const wxml = fs.readFileSync(wxmlPath, 'utf8')

  assert.match(wxml, /bindtap="onDirectionTap"/)
  assert.match(wxml, /wx:for="\{\{visibleItems\}\}"/)
  assert.match(wxml, /当前票面价/)
  assert.match(wxml, /本次补差/)
  assert.doesNotMatch(wxml, /立即补差/)
  assert.doesNotMatch(wxml, /\{\{comboPrice\}\}/)
})

test('页面包含选填员工归属说明和结构化支付成功状态', () => {
  const wxml = fs.readFileSync(wxmlPath, 'utf8')

  assert.match(wxml, /bindtap="toggleStaff"/)
  assert.match(wxml, /wx:if="\{\{staffExpanded\}\}"/)
  assert.match(wxml, /不影响升级权益/)
  assert.match(wxml, /wx:if="\{\{success\}\}"/)
  assert.match(wxml, /\{\{success\.itemLabel\}\}/)
  assert.match(wxml, /\{\{success\.amountYuan\}\}/)
})

test('关键操作满足最小触控尺寸，底部面板兼顾安全区和玻璃回退', () => {
  const wxss = fs.readFileSync(wxssPath, 'utf8')

  assert.match(wxss, /\.direction\s*\{[^}]*min-height:\s*88rpx/s)
  assert.match(wxss, /\.upgrade-row\s*\{[^}]*min-height:\s*88rpx/s)
  assert.match(wxss, /\.sheet__close\s*\{[^}]*width:\s*88rpx[^}]*height:\s*88rpx/s)
  assert.match(wxss, /env\(safe-area-inset-bottom\)/)
  assert.match(wxss, /backdrop-filter:\s*blur\(/)
  assert.match(wxss, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.96\)/)
  assert.doesNotMatch(wxss, /animation[^;]*infinite/)
})
