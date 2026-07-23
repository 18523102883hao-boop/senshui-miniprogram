// 统一触觉反馈（Vibe UI · 交付包 reference-code 采用）
// 纪律：只在「动作被系统接受」时振动，不在 touchstart 触发；滚动/浏览不振动。
//   light  — 普通选择（选中项目、切换分类）
//   medium — 领取长河令、预约成功、支付成功
//   heavy  — 取消 / 风险确认
const HAPTIC = { light: 'light', medium: 'medium', heavy: 'heavy' }

function haptic(type = HAPTIC.light) {
  try {
    wx.vibrateShort({ type })
  } catch (e) {
    try { wx.vibrateShort() } catch (_) { /* 低版本静默 */ }
  }
}

module.exports = { HAPTIC, haptic }
