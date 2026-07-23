// 登录 / 授权：静默登录 + 手机号延后授权
const request = require('./request.js')
const { FUNCTIONS } = require('./const.js')

// 静默登录：调用 login 云函数（内部 cloud.getWXContext 拿 openid），静默注册/更新 users
function silentLogin() {
  return request.call(FUNCTIONS.LOGIN, {})
}

// 手机号授权：新版 getPhoneNumber 返回 code，交由云函数换取手机号并写入 users
// 用法：<button open-type="getPhoneNumber" bindgetphonenumber="onGetPhone" />
function bindPhone(code) {
  return request.call(FUNCTIONS.BIND_PHONE, { code })
}

// 确保已登录（拿到 openid）。用于下单 / 核销等必须登录的操作前置。
function ensureLogin() {
  const app = getApp()
  if (app.globalData.openid) return Promise.resolve(app.globalData)
  return (app.loginReady || silentLogin()).then((res) => {
    if (res && res.openid) {
      app.globalData.openid = res.openid
      app.globalData.userInfo = res.user
    }
    return app.globalData
  })
}

module.exports = { silentLogin, bindPhone, ensureLogin }
