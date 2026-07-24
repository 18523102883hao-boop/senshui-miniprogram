// 云函数：getMyServiceLeads —— 我的咨询记录（PRD §18.4）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }
  try {
    const r = await db.collection('service_leads')
      .where({ _openid: OPENID }).orderBy('createdAt', 'desc').limit(50).get()
    const list = r.data.map((l) => ({
      leadId: l._id, type: l.type, status: l.status,
      contactName: l.contactName, createdAt: l.createdAt,
      // 用户端只回自己填的摘要，不回内部跟进记录
      summary: l.company || l.brandName || l.birthdayDate || ''
    }))
    return { code: 0, msg: 'ok', data: { list } }
  } catch (e) {
    return { code: 0, msg: 'ok', data: { list: [] } }
  }
}
