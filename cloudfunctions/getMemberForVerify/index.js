// 云函数：getMemberForVerify —— 员工端按（动态/静态）会员码拉取权益核销状态（T14 / T20）
// T20：入参 memberCode 可能是动态码 token（MC.<code>.<ts>.<sign>）；解析验签 + 校验时效后得真实 memberCode。
// 权益调整：长河令（一次性）+ 生日当天 85 折（仅生日当天可核销、可反复）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const crypto = require('crypto')

const SECRET = process.env.MEMBER_QR_SECRET || 'sr-dev-secret-change-me'
const TTL = 90 // 秒，与 getMemberQr 一致

function fmt(d) {
  const t = new Date(d)
  const p = (n) => (n < 10 ? '0' + n : n)
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

// 北京时间今天的 MM-DD（云函数服务器为 UTC，+8 小时取月日）
function todayMD() {
  const t = new Date(Date.now() + 8 * 3600 * 1000)
  const p = (n) => (n < 10 ? '0' + n : n)
  return `${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`
}

// 解析入参：动态 token 验签 + 时效；否则按静态会员码处理（兼容）
function resolveMemberCode(input) {
  if (input && input.indexOf('MC.') === 0) {
    const parts = input.split('.')
    if (parts.length !== 4) return { error: '会员码格式错误' }
    const memberCode = parts[1]
    const ts = parts[2]
    const sign = parts[3]
    const expect = crypto.createHmac('sha256', SECRET).update(memberCode + '.' + ts).digest('hex').slice(0, 16)
    if (sign !== expect) return { error: '会员码无效' }
    if (Math.floor(Date.now() / 1000) - Number(ts) > TTL) return { error: '会员码已过期，请让会员刷新' }
    return { memberCode }
  }
  return { memberCode: input } // 静态码兼容
}

async function requireStaff(openid) {
  const r = await db.collection('staff').where({ _openid: openid, status: 'approved' }).limit(1).get()
  return r.data.length ? r.data[0] : null
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const staff = await requireStaff(OPENID)
  if (!staff) return { code: 403, msg: '无核销权限' }

  if (!event.memberCode) return { code: 400, msg: '缺少会员码' }
  const resolved = resolveMemberCode(event.memberCode)
  if (resolved.error) return { code: 400, msg: resolved.error }

  const r = await db.collection('members').where({ memberCode: resolved.memberCode }).limit(1).get()
  if (r.data.length === 0) return { code: 404, msg: '会员卡不存在' }

  const m = r.data[0]
  const b = m.benefits || {}
  const expired = new Date(m.expireAt).getTime() < Date.now()
  const active = m.status === 'active' && !expired
  const lingGranted = !!(b.ling && b.ling.granted)
  const isBirthday = !!m.birthday && m.birthday === todayMD()

  const benefits = [
    {
      type: 'ling',
      name: `长河令 ${(b.ling && b.ling.total) || 1000}`,
      stateText: lingGranted ? '已发放' : '待发放',
      canVerify: active && !lingGranted
    },
    {
      type: 'birthday',
      name: '生日 85 折',
      stateText: !m.birthday ? '未设置生日' : (isBirthday ? '今天生日 · 可核销' : `生日 ${m.birthday} · 非当天`),
      canVerify: active && isBirthday
    }
  ]

  return {
    code: 0,
    msg: 'ok',
    data: {
      memberCode: resolved.memberCode, // 返回真实码，供员工端后续核销
      member: { nickName: '会员', expireText: fmt(m.expireAt), statusText: active ? '有效' : (expired ? '已过期' : m.status) },
      benefits
    }
  }
}
