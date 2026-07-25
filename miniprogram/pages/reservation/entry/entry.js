// 预约中心（Vibe UI v2.0 · 纯企微直连）
// 业主 2026-07-25 决策：取消自助预约表单——客户自助提交不好管理，容易漏单；
// 团队到园统一走「加管家微信 / 致电」，由工作人员登记与确认，责任到人。
const env = require('../../../env.js')
const { haptic } = require('../../../utils/haptics.js')
const { makePhoneCall } = require('../../../utils/util.js')

// 可安排的团队类型（仅作说明，不再让客户填表选择）
const SCENES = [
  { key: 'company', title: '公司团建', desc: '半天至两天行程 · 餐饮与场地可组合' },
  { key: 'school', title: '学校研学', desc: '安全动线 · 分组带队' },
  { key: 'family', title: '亲友聚会', desc: '生日、纪念日与家庭出游' }
]

Page({
  data: {
    contactFirst: true,
    contactScene: 'concierge',
    phone: env.frontDeskPhone,
    scenes: SCENES
  },

  onCall() {
    haptic('light')
    makePhoneCall(this.data.phone)
  },

  onShareAppMessage() {
    return { title: '森水长河 · 团队到园预约', path: '/pages/reservation/entry/entry' }
  }
})
