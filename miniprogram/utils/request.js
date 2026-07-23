// 云函数调用统一封装
// 约定：所有云函数返回 { code: 0, msg: 'ok', data: {...} }，code !== 0 视为业务错误
function call(name, data = {}) {
  return wx.cloud
    .callFunction({ name, data })
    .then((res) => {
      const r = (res && res.result) || {}
      if (r.code !== 0) {
        const e = new Error(r.msg || '请求失败')
        e.code = r.code
        e.raw = r
        throw e
      }
      return r.data
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

module.exports = { call, callWithLoading }
