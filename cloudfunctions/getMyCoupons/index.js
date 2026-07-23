// 云函数：getMyCoupons —— 我的卡券列表（85 折券）（T15）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function fmt(d) {
  const t = new Date(d)
  const p = (n) => (n < 10 ? '0' + n : n)
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

const STATUS_TEXT = { unused: '未使用', used: '已使用', expired: '已过期' }

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const r = await db.collection('coupons').where({ _openid: OPENID }).orderBy('createdAt', 'desc').get()
  const now = Date.now()

  const list = r.data.map((c) => {
    let status = c.status || 'unused'
    if (status === 'unused' && new Date(c.expireAt).getTime() < now) status = 'expired'
    return {
      id: c._id,
      title: '85 折券',
      status,
      statusText: STATUS_TEXT[status] || status,
      expireText: fmt(c.expireAt)
    }
  })

  return { code: 0, msg: 'ok', data: { list } }
}
