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

test('默认展示溪降票方向，并将营地票放在第二位', (t) => {
  const { page, calls } = mountPage(t)

  assert.equal(page.data.activeGroupIndex, 0)
  assert.deepEqual(page.data.groups.map((group) => group.key), ['creek', 'camp'])
  assert.deepEqual(
    page.data.visibleItems.map((item) => item.itemId),
    [
      'creek_adult_to_camp',
      'creek_double_to_camp',
      'creek_child_to_camp'
    ]
  )

  page.onDirectionTap({ currentTarget: { dataset: { index: 1 } } })

  assert.equal(page.data.activeGroupIndex, 1)
  assert.deepEqual(
    page.data.visibleItems.map((item) => item.itemId),
    [
      'camp_adult_to_creek',
      'camp_family_to_creek_adult',
      'camp_family_to_creek_child',
      'camp_child_to_creek'
    ]
  )
  assert.equal(page.data.buy, null)
  assert.deepEqual(calls.haptic, ['light'])
})

test('点击当前方向项目时打开对应的支付确认面板', (t) => {
  const { page } = mountPage(t)

  page.onItemTap({ currentTarget: { dataset: { ii: 1 } } })

  assert.equal(page.data.buy.itemId, 'creek_double_to_camp')
  assert.equal(page.data.buy.add, '+¥114')
  assert.equal(page.data.quantity, 1)
  assert.equal(page.data.canChooseQuantity, true)
  assert.equal(page.data.totalAmountText, '¥114')
})

test('全部升级项目购买数量均在 1 与 10 之间切换并同步总额', (t) => {
  const { page, calls } = mountPage(t)

  page.onItemTap({ currentTarget: { dataset: { ii: 0 } } })
  page.onMinus()
  assert.equal(page.data.quantity, 1)
  assert.equal(page.data.totalAmountText, '¥110')

  for (let index = 0; index < 12; index += 1) page.onPlus()
  assert.equal(page.data.quantity, 10, '数量不得大于 10')
  assert.equal(page.data.totalAmountText, '¥1100')
  assert.equal(calls.haptic.length, 10, '打开面板和 9 次有效加数量各反馈一次')
})

test('员工手机尾号输入区默认收起并只保留前四位数字', (t) => {
  const { page, calls } = mountPage(t)

  assert.equal(page.data.staffExpanded, false)
  page.toggleStaff()
  page.onStaffRef({ detail: { value: '12a345' } })

  assert.equal(page.data.staffExpanded, true)
  assert.equal(page.data.staffRef, '1234')
  assert.deepEqual(calls.haptic, ['light'])
})

test('七个云端升级 itemId 与展示补差金额保持原映射', (t) => {
  const { page } = mountPage(t)
  const mapping = page.data.groups
    .flatMap((group) => group.items)
    .map((item) => [item.itemId, item.add])

  assert.deepEqual(mapping, [
    ['creek_adult_to_camp', '+¥110'],
    ['creek_double_to_camp', '+¥114'],
    ['creek_child_to_camp', '+¥98'],
    ['camp_adult_to_creek', '+¥20'],
    ['camp_family_to_creek_adult', '+¥68'],
    ['camp_family_to_creek_child', '+¥29.9'],
    ['camp_child_to_creek', '+¥29.9']
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

  page.onDirectionTap({ currentTarget: { dataset: { index: 1 } } })
  page.onItemTap({ currentTarget: { dataset: { ii: 2 } } })
  page.setData({ staffRef: '8000' })
  await page.onPay()

  assert.deepEqual(calls.request, [{
    name: 'createSelfUpgrade',
    data: {
      itemId: 'camp_family_to_creek_child',
      staffRef: '8000',
      quantity: 1
    },
    loadingText: '下单中'
  }])
  assert.deepEqual(page.data.success, {
    itemLabel: '儿童营地升级溪降',
    amountYuan: '29.90',
    quantity: 1
  })
  assert.equal(page.data.buy, null)
  assert.equal(page.data.staffRef, '')
  assert.equal(page.data.paying, false)
  assert.deepEqual(calls.haptic, ['light', 'light', 'medium'])
  assert.deepEqual(calls.modal, [])
})

test('任意升级项目支付请求携带当前购买数量', async (t) => {
  const { page, calls } = mountPage(t, {
    requestResult: {
      payment: { nonceStr: 'test-payment' },
      amount: 33000,
      quantity: 3,
      itemLabel: '成人单溪降 → 升营地'
    }
  })

  page.onItemTap({ currentTarget: { dataset: { ii: 0 } } })
  page.onPlus()
  page.onPlus()
  await page.onPay()

  assert.equal(calls.request[0].data.itemId, 'creek_adult_to_camp')
  assert.equal(calls.request[0].data.quantity, 3)
  assert.deepEqual(page.data.success, {
    itemLabel: '成人单溪降 → 升营地',
    amountYuan: '330.00',
    quantity: 3
  })
})

test('员工手机号尾号不足四位时不创建支付订单', async (t) => {
  const { page, calls } = mountPage(t)

  page.onItemTap({ currentTarget: { dataset: { ii: 0 } } })
  page.setData({ staffRef: '123', staffExpanded: true })
  await page.onPay()

  assert.equal(calls.request.length, 0)
  assert.equal(page.data.paying, false)
  assert.equal(page.data.buy.itemId, 'creek_adult_to_camp')
  assert.equal(calls.toast.length, 1)
  assert.match(calls.toast[0].title, /后四位/)
})

test('用户取消微信支付时保留项目和员工信息以便重试', async (t) => {
  const { page, calls } = mountPage(t, {
    paymentError: { errMsg: 'requestPayment:fail cancel' }
  })

  page.onItemTap({ currentTarget: { dataset: { ii: 0 } } })
  page.setData({ staffRef: '8000', staffExpanded: true })
  await page.onPay()

  assert.equal(page.data.buy.itemId, 'creek_adult_to_camp')
  assert.equal(page.data.staffRef, '8000')
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
  assert.match(wxml, /bindtap="onMinus"/)
  assert.match(wxml, /bindtap="onPlus"/)
  assert.match(wxml, /\{\{totalAmountText\}\}/)
  assert.match(wxml, /购买数量/)
  assert.match(wxml, /需持有对应数量的原票/)
  assert.doesNotMatch(wxml, /立即补差/)
  assert.doesNotMatch(wxml, /\{\{comboPrice\}\}/)
})

test('页面包含选填员工归属说明和结构化支付成功状态', () => {
  const wxml = fs.readFileSync(wxmlPath, 'utf8')

  assert.match(wxml, /bindtap="toggleStaff"/)
  assert.match(wxml, /wx:if="\{\{staffExpanded\}\}"/)
  assert.match(wxml, /不影响升级权益/)
  assert.match(wxml, /员工手机尾号后四位/)
  assert.match(wxml, /type="number"/)
  assert.match(wxml, /maxlength="4"/)
  assert.doesNotMatch(wxml, /员工姓名或手机号/)
  assert.match(wxml, /wx:if="\{\{success\}\}"/)
  assert.match(wxml, /\{\{success\.itemLabel\}\}/)
  assert.match(wxml, /\{\{success\.amountYuan\}\}/)
  assert.match(wxml, /\{\{success\.quantity\}\}/)
})

test('固定确认层位于无 transform 的页面根节点下', () => {
  const wxml = fs.readFileSync(wxmlPath, 'utf8')

  assert.match(wxml, /<view class="upgrade-page sr-page">\s*<view class="upgrade-stage sr-enter">/)
  assert.doesNotMatch(wxml, /<view class="upgrade-page sr-page sr-enter">/)
})

test('关键操作满足最小触控尺寸，底部面板兼顾安全区和玻璃回退', () => {
  const wxss = fs.readFileSync(wxssPath, 'utf8')

  assert.match(wxss, /\.direction\s*\{[^}]*min-height:\s*88rpx/s)
  assert.match(wxss, /\.upgrade-row\s*\{[^}]*min-height:\s*88rpx/s)
  assert.match(wxss, /\.quantity-stepper__button\s*\{[^}]*width:\s*88rpx[^}]*height:\s*88rpx/s)
  assert.match(wxss, /\.sheet__close\s*\{[^}]*width:\s*88rpx[^}]*height:\s*88rpx/s)
  assert.match(wxss, /\.sheet-mask\s*\{[^}]*top:\s*0[^}]*right:\s*0[^}]*bottom:\s*0[^}]*left:\s*0/s)
  assert.match(wxss, /env\(safe-area-inset-bottom\)/)
  assert.match(wxss, /backdrop-filter:\s*blur\(/)
  assert.match(wxss, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.96\)/)
  assert.doesNotMatch(wxss, /animation[^;]*infinite/)
})
