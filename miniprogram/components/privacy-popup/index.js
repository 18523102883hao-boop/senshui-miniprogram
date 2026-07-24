// 隐私授权弹窗（微信 2023.9 起强制）
// 当页面调用 getPhoneNumber / chooseAvatar 等隐私接口时，微信会触发 onNeedPrivacyAuthorization，
// 必须由用户在此弹窗点击 open-type="agreePrivacyAuthorization" 的按钮同意后才会继续。
Component({
  data: {
    visible: false,
    contractName: '《森水长河隐私保护指引》'
  },

  lifetimes: {
    attached() {
      if (!wx.onNeedPrivacyAuthorization) return // 低版本基础库：无需隐私校验
      wx.onNeedPrivacyAuthorization((resolve) => {
        this._resolve = resolve
        this.setData({ visible: true })
      })
      if (wx.getPrivacySetting) {
        wx.getPrivacySetting({
          success: (res) => {
            if (res && res.privacyContractName) {
              this.setData({ contractName: res.privacyContractName })
            }
          }
        })
      }
    }
  },

  methods: {
    // 用户同意（必须由 open-type="agreePrivacyAuthorization" 按钮触发）
    onAgree() {
      this.setData({ visible: false })
      if (this._resolve) {
        this._resolve({ event: 'agree', buttonId: 'agree-btn' })
        this._resolve = null
      }
      this.triggerEvent('agree')
    },

    // 用户拒绝：业务需给出替代路径，不得中断浏览
    onDisagree() {
      this.setData({ visible: false })
      if (this._resolve) {
        this._resolve({ event: 'disagree' })
        this._resolve = null
      }
      this.triggerEvent('disagree')
    },

    // 打开微信后台配置的隐私保护指引
    openContract() {
      if (wx.openPrivacyContract) {
        wx.openPrivacyContract({
          fail: () => wx.showToast({ title: '暂时无法打开，请稍后重试', icon: 'none' })
        })
      }
    },

    // 打开小程序内的完整政策全文
    openFullPolicy() {
      wx.navigateTo({ url: '/pages/legal/privacy/privacy' })
    },

    noop() {}
  }
})
