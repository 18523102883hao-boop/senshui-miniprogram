const env = require('./env.js')
const auth = require('./utils/auth.js')
const store = require('./utils/store.js')

App({
  globalData: {
    openid: '',
    userInfo: null,
    member: null,
    systemInfo: null
  },

  // 静默登录的 Promise，页面可 await getApp().loginReady 等待登录完成
  loginReady: null,

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '版本过低', content: '请更新微信到最新版本后使用', showCancel: false })
      return
    }
    wx.cloud.init({ env: env.cloudEnv, traceUser: true })

    try {
      this.globalData.systemInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    } catch (e) { /* ignore */ }

    // 静默登录：wx.login → 云函数换 openid → 静默注册 users
    this.loginReady = auth.silentLogin()
      .then((res) => {
        this.globalData.openid = res.openid
        this.globalData.userInfo = res.user
        store.set({ openid: res.openid, userInfo: res.user })
        return res
      })
      .catch((err) => {
        console.error('[app] 静默登录失败', err)
        // 不阻断浏览，仅在需要授权的操作处兜底
        return null
      })

    this.checkUpdate()
  },

  checkUpdate() {
    if (!wx.getUpdateManager) return
    const um = wx.getUpdateManager()
    um.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已下载好，重启后生效',
        success: (r) => { if (r.confirm) um.applyUpdate() }
      })
    })
  }
})
