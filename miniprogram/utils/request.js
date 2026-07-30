// 云函数调用统一封装
// 约定：所有云函数返回 { code: 0, msg: 'ok', data: {...} }，code !== 0 视为业务错误
function transportCode(error) {
  const direct = Number(error && (error.errCode !== undefined ? error.errCode : error.code))
  if (Number.isFinite(direct)) return direct
  const text = String((error && (error.errMsg || error.message)) || '')
  const match = text.match(/errCode:\s*(-?\d+)/i)
  return match ? Number(match[1]) : 0
}

function normalizeTransportError(error, functionName) {
  if (error && error.isBusinessError) return error
  const code = transportCode(error)
  const text = String((error && (error.errMsg || error.message)) || '')
  const unavailable = code === -504002 || /cloud\.callFunction:fail/i.test(text)
  const normalized = new Error(unavailable ? '服务暂不可用，请稍后重试' : '网络或服务异常，请稍后重试')
  normalized.code = code
  normalized.functionName = functionName
  normalized.raw = error
  return normalized
}

function call(name, data = {}) {
  return Promise.resolve()
    .then(() => wx.cloud.callFunction({ name, data }))
    .then((res) => {
      const r = (res && res.result) || {}
      if (r.code !== 0) {
        const e = new Error(r.msg || '请求失败')
        e.code = r.code
        e.raw = r
        e.isBusinessError = true
        throw e
      }
      return r.data
    })
    .catch((error) => {
      throw normalizeTransportError(error, name)
    })
}

// 带 loading 的调用（.finally 兼容旧基础库，手动 hideLoading）
function callWithLoading(name, data = {}, loadingText = '加载中') {
  wx.showLoading({ title: loadingText, mask: true })
  return call(name, data).then(
    (d) => { wx.hideLoading(); return d },
    (e) => { wx.hideLoading(); throw e }
  )
}

module.exports = { call, callWithLoading, normalizeTransportError }
