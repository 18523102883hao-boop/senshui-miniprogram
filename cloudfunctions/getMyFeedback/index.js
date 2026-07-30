// 云函数：getMyFeedback —— 我的反馈记录（PRD §18.5）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }
  try {
    const r = await db.collection('feedback')
      .where({ _openid: OPENID }).orderBy('createdAt', 'desc').limit(50).get()
    const list = r.data.map((f) => ({
      feedbackId: f._id,
      type: f.type,
      content: f.content,
      images: f.images || [],
      status: f.status,
      reply: f.reply || '',
      createdAt: f.createdAt
    }))
    return { code: 0, msg: 'ok', data: { list } }
  } catch (e) {
    return { code: 0, msg: 'ok', data: { list: [] } }
  }
}
