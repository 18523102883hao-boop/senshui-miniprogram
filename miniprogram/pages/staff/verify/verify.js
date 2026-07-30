// 会员核销台（T14 员工端）
// 扫会员码 → 拉取权益状态 → 逐项核销（长河令 / 生日 85 折）。核销走 verifyBenefit 云函数（服务端幂等+留痕）。
const request = require('../../../utils/request.js')

Page({
  data: {
    role: null,
    memberCode: '',
    member: null, // { nickName, expireText }
    benefits: [], // [{ type, name, stateText, canVerify }]
    busy: false
  },

  onLoad() {
    this.checkRole()
  },

  checkRole() {
    request.call('checkStaff', {})
      .then((d) => {
        if (!d || !d.role) return this.noPermission()
        this.setData({ role: d.role })
      })
      .catch(() => this.noPermission())
  },

  noPermission() {
    wx.showModal({
      title: '无权限',
      content: '请先在员工模式绑定工牌并通过审批',
      showCancel: false,
      success: () => wx.navigateBack()
    })
  },

  scan() {
    wx.scanCode({
      onlyFromCamera: true,
      success: (res) => this.loadMember(res.result),
      fail: () => {}
    })
  },

  loadMember(code) {
    // code 可能是动态会员码 token；云端解析验签后返回真实 memberCode，后续核销用它
    request.callWithLoading('getMemberForVerify', { memberCode: code }, '查询中')
      .then((d) => {
        this.setData({
          memberCode: d.memberCode || code,
          member: d.member,
          benefits: d.benefits || []
        })
      })
      .catch((err) => wx.showToast({ title: err.message || '无效会员码', icon: 'none' }))
  },

  doVerify(e) {
    const type = e.currentTarget.dataset.type
    if (this.data.busy) return Promise.resolve()
    if (type === 'birthday') {
      return this.confirmBirthdayIdentity()
        .then((confirmed) => {
          if (!confirmed) return null
          return this.submitVerification(type, true)
        })
    }
    return this.submitVerification(type, false)
  },

  confirmBirthdayIdentity() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '核对本人身份证',
        content: '请客户出示本人身份证，并确认是持卡本人、证件生日与会员生日一致。',
        confirmText: '已核对',
        cancelText: '暂不核销',
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false)
      })
    })
  },

  submitVerification(type, identityChecked) {
    this.setData({ busy: true })
    return request.callWithLoading('verifyBenefit', {
      memberCode: this.data.memberCode,
      benefitType: type,
      identityChecked
    }, '核销中')
      .then(() => {
        wx.showToast({ title: '核销成功', icon: 'success' })
        return this.reload()
      })
      .catch((err) => wx.showToast({ title: err.message || '核销失败', icon: 'none' }))
      .then(() => this.setData({ busy: false }))
  },

  reload() {
    if (!this.data.memberCode) return Promise.resolve()
    return request.call('getMemberForVerify', { memberCode: this.data.memberCode })
      .then((d) => this.setData({ member: d.member, benefits: d.benefits || [] }))
      .catch(() => {})
  }
})
