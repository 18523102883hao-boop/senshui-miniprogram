// 云函数：resolveUserForLing —— 员工扫码定位客户并返回电子令余额（T21）
// 支持：UL 我的令码 / MC 会员动态码 / 静态会员码。仅 front/admin 可调。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const crypto = require('crypto')

const SECRET = process.env.MEMBER_QR_SECRET || 'sr-dev-secret-change-me'
const TTL = 90

async function requireStaff(openid) {
  const r = await db.collection('staff').where({ _openid: openid, status: 'approved' }).limit(1).get()
  return r.data.length ? r.data[0] : null
}

// 验签 + 时效，返回 token 载荷（openid 或 memberCode）
function verifyToken(input) {
  const parts = input.split('.')
  if (parts.length !== 4) return { error: '码格式错误' }
  const [, value, ts, sign] = parts
  const expect = crypto.createHmac('sha256', SECRET).update(value + '.' + ts).digest('hex').slice(0, 16)
  if (sign !== expect) return { error: '码无效' }
  if (Math.floor(Date.now() / 1000) - Number(ts) > TTL) return { error: '码已过期，请让客户刷新' }
  return { value }
}

// 解析任意码 → openid
async function resolveOpenid(input) {
  if (!input) return { error: '缺少客户码' }
  if (input.indexOf('UL.') === 0) {
    const r = verifyToken(input)
    return r.error ? r : { openid: r.value }
  }
  if (input.indexOf('MC.') === 0) {
    const r = verifyToken(input)
    if (r.error) return r
    const m = await db.collection('members').where({ memberCode: r.value }).limit(1).get()
    if (!m.data.length) return { error: '会员卡不存在' }
    return { openid: m.data[0]._openid }
  }
  // 静态会员码兼容
  const m = await db.collection('members').where({ memberCode: input }).limit(1).get()
  if (!m.data.length) return { error: '无效客户码' }
  return { openid: m.data[0]._openid }
}

function maskOpenid(openid) {
  if (!openid || openid.length < 8) return '客户'
  return openid.slice(0, 4) + '****' + openid.slice(-4)
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const staff = await requireStaff(OPENID)
  if (!staff || !['front', 'admin'].includes(staff.role)) return { code: 403, msg: '无兑换权限' }

  const resolved = await resolveOpenid(event.code)
  if (resolved.error) return { code: 400, msg: resolved.error }

  const acc = await db.collection('ling_accounts').where({ _openid: resolved.openid }).limit(1).get()
  const balance = acc.data.length ? acc.data[0].balance : 0

  return { code: 0, msg: 'ok', data: { userOpenid: resolved.openid, userLabel: maskOpenid(resolved.openid), balance } }
}
