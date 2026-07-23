// 云函数：getMemberCard —— 查询当前用户会员卡 + 权益状态 + 退款资格（T14/T15）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SEVEN_DAYS = 7 * 24 * 3600 * 1000

function fmt(d) {
  const t = new Date(d)
  const p = (n) => (n < 10 ? '0' + n : n)
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const r = await db.collection('members').where({ _openid: OPENID }).orderBy('createdAt', 'desc').limit(1).get()
  if (r.data.length === 0) return { code: 0, msg: 'ok', data: { member: null } }

  const m = r.data[0]
  const b = m.benefits || {}
  const lingGranted = !!(b.ling && b.ling.granted)

  const benefits = [
    { type: 'ling', name: `长河令 ${(b.ling && b.ling.total) || 1000}`, stateText: lingGranted ? '已发放' : '待到店发放', done: lingGranted },
    { type: 'birthday', name: '生日 85 折', stateText: m.birthday ? `生日 ${m.birthday} · 当天可用` : '未设置生日', done: false }
  ]

  // 退款资格：7 天内、未核销任一权益。任一权益 = 已发令 或 有过任何核销留痕（含生日折扣）
  const verifCount = await db.collection('verifications').where({ memberCode: m.memberCode }).count()
  const anyGranted = lingGranted || verifCount.total > 0
  const within7 = Date.now() - new Date(m.createdAt).getTime() < SEVEN_DAYS
  const refundable = !anyGranted && within7 && m.status === 'active'

  return {
    code: 0,
    msg: 'ok',
    data: {
      member: { memberCode: m.memberCode, birthday: m.birthday || '', statusText: m.status === 'active' ? '有效' : m.status, expireText: fmt(m.expireAt) },
      benefits,
      refundable
    }
  }
}
