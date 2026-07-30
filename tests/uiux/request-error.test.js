const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')

function loadRequest(t, callFunction) {
  const originalWx = global.wx
  global.wx = { cloud: { callFunction } }
  delete require.cache[requestPath]
  const request = require(requestPath)
  t.after(() => {
    delete require.cache[requestPath]
    global.wx = originalWx
  })
  return request
}

test('云函数基础设施错误转换为可理解提示并保留诊断信息', async (t) => {
  const raw = {
    errCode: -504002,
    errMsg: 'cloud.callFunction:fail Error: errCode: -504002'
  }
  const request = loadRequest(t, () => Promise.reject(raw))

  await assert.rejects(
    request.call('invoiceService', { action: 'getMine' }),
    (error) => {
      assert.equal(error.code, -504002)
      assert.equal(error.functionName, 'invoiceService')
      assert.equal(error.raw, raw)
      assert.match(error.message, /服务暂不可用/)
      assert.doesNotMatch(error.message, /-504002/)
      return true
    }
  )
})

test('云函数业务错误仍保留服务端提示和错误码', async (t) => {
  const request = loadRequest(t, () => Promise.resolve({
    result: { code: 409, msg: '订单状态已变化' }
  }))

  await assert.rejects(
    request.call('repayOrder', {}),
    (error) => {
      assert.equal(error.code, 409)
      assert.equal(error.message, '订单状态已变化')
      return true
    }
  )
})
