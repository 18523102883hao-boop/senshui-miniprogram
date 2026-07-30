const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const pagePath = path.join(projectRoot, 'miniprogram/pages/staff/data-export/data-export.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const utilPath = path.join(projectRoot, 'miniprogram/utils/util.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, responder) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], download: [], open: [], toast: [] }
  let config

  function stub(file, exports) {
    originals[file] = require.cache[file]
    require.cache[file] = { id: file, filename: file, loaded: true, exports }
  }

  stub(requestPath, {
    call(name, data) {
      calls.request.push({ name, data })
      return responder(name, data)
    }
  })
  stub(hapticsPath, { haptic() {} })
  delete require.cache[utilPath]

  global.wx = {
    cloud: {
      downloadFile(input) {
        calls.download.push(input.fileID)
        input.success({ tempFilePath: '/tmp/森水长河.xlsx' })
      }
    },
    openDocument(input) {
      calls.open.push(input)
      input.success()
    },
    showToast(input) { calls.toast.push(input.title) }
  }
  global.Page = (pageConfig) => { config = pageConfig }
  delete require.cache[pagePath]
  const exports = require(pagePath)
  const page = Object.assign({}, config, {
    data: clone(config.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
    delete require.cache[pagePath]
    Object.keys(originals).forEach((file) => {
      if (originals[file]) require.cache[file] = originals[file]
      else delete require.cache[file]
    })
    global.Page = originalPage
    global.wx = originalWx
  })
  return { page, calls, exports }
}

test('导出页支持选择数据类型和字段，并生成一个多工作表 Excel', async (t) => {
  const { page, calls } = mountPage(t, (name, data) => {
    assert.equal(name, 'adminOperationsLedger')
    assert.equal(data.action, 'export')
    assert.ok(data.datasets.includes('funds_summary'))
    assert.ok(data.datasets.includes('verification_details'))
    assert.ok(Array.isArray(data.fields.verification_details))
    return Promise.resolve({
      fileId: 'cloud://env/admin-exports/report.xlsx',
      fileName: '森水长河-经营数据.xlsx',
      sheetNames: ['导出说明', '收入与资金汇总', '核销明细']
    })
  })

  await page.onLoad({ from: '1000', to: '2000' })
  await page.onExport()

  assert.equal(calls.request.length, 1)
  assert.deepEqual(calls.download, ['cloud://env/admin-exports/report.xlsx'])
  assert.equal(calls.open[0].fileType, 'xlsx')
  assert.equal(calls.open[0].showMenu, true)
  assert.equal(page.data.exporting, false)
})

test('至少保留一个数据类型且必选审计字段不能取消', async (t) => {
  const { page, calls } = mountPage(t, () => Promise.resolve({}))
  await page.onLoad({ from: '1000', to: '2000' })

  page.setData({
    datasets: page.data.datasets.map((item, index) => Object.assign({}, item, {
      selected: index === 0
    }))
  })
  page.onDatasetToggle({ currentTarget: { dataset: { key: page.data.datasets[0].key } } })
  assert.equal(calls.toast[0], '至少选择一种数据')

  const first = page.data.datasets[0]
  const requiredField = first.fields.find((field) => field.required)
  page.onFieldToggle({
    currentTarget: { dataset: { dataset: first.key, field: requiredField.key } }
  })
  assert.equal(calls.toast[1], '该字段为审计必需项')
})

test('导出页包含日期模式、多选说明、加载和错误恢复状态', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/data-export/data-export.wxml'),
    'utf8'
  )
  const wxss = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/data-export/data-export.wxss'),
    'utf8'
  )
  const app = JSON.parse(fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8'))

  assert.match(wxml, /今天/)
  assert.match(wxml, /本月/)
  assert.match(wxml, /自定义/)
  assert.match(wxml, /一个 Excel 文件/)
  assert.match(wxml, /每类数据一个工作表/)
  assert.match(wxml, /导出并打开/)
  assert.match(wxml, /exporting/)
  assert.doesNotMatch(wxss, /#[0-9A-Fa-f]{3,8}/)
  assert.match(wxss, /safe-area-inset-bottom/)
  assert.match(wxss, /var\(--sr-radius/)
  assert.ok(app.pages.includes('pages/staff/data-export/data-export'))
})
