// 云函数：getMemberQr —— 生成会员「动态核销码」（T20 防转让）
// 会员端每 60 秒调用一次刷新二维码内容；token 90 秒失效，截图转发即失效。
// token = MC.<memberCode>.<ts>.<sign>，sign = HMAC-SHA256(memberCode.ts, SECRET) 前 16 位。
// 无状态：不写库，核销时由 getMemberForVerify 用同一 SECRET 验签 + 校验时效。
//
// 部署：为本函数与 getMemberForVerify 配置**相同**环境变量 MEMBER_QR_SECRET（随机长字符串）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const crypto = require('crypto')

const SECRET = process.env.MEMBER_QR_SECRET || 'sr-dev-secret-change-me'
const TTL = 90 // 秒，二维码有效期

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '未登录' }

  const r = await db.collection('members')
    .where({ _openid: OPENID, status: 'active' })
    .orderBy('createdAt', 'desc').limit(1).get()
  if (r.data.length === 0) return { code: 404, msg: '无有效会员卡' }

  const memberCode = r.data[0].memberCode
  const ts = Math.floor(Date.now() / 1000)
  const sign = crypto.createHmac('sha256', SECRET).update(memberCode + '.' + ts).digest('hex').slice(0, 16)
  const token = 'MC.' + memberCode + '.' + ts + '.' + sign

  return { code: 0, msg: 'ok', data: { token, ttl: TTL } }
}
