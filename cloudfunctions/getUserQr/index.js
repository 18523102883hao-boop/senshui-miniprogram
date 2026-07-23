// 云函数：getUserQr —— 生成用户「我的令码」动态码（T21 长河令兑换）
// 任何登录用户（不限会员）在「长河令」页出示，员工扫码定位其电子令账户。
// token = UL.<openid>.<ts>.<sign>，90 秒失效，防截图转让。复用 MEMBER_QR_SECRET 同一密钥。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const crypto = require('crypto')

const SECRET = process.env.MEMBER_QR_SECRET || 'sr-dev-secret-change-me'
const TTL = 90

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '未登录' }

  const ts = Math.floor(Date.now() / 1000)
  const sign = crypto.createHmac('sha256', SECRET).update(OPENID + '.' + ts).digest('hex').slice(0, 16)
  const token = 'UL.' + OPENID + '.' + ts + '.' + sign

  return { code: 0, msg: 'ok', data: { token, ttl: TTL } }
}
