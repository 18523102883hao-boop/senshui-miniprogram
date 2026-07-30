// 云函数：submitFeedback —— 提交投诉/建议/表扬/失物招领（PRD §15.2 / §18.5）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const core = require('./feedback-core.js')

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const form = (event && event.form) || event || {}
  const check = core.validate(form)
  if (!check.ok) return { code: 400, msg: check.msg }

  try {
    await db.createCollection('feedback').catch(() => {})
    const doc = core.buildFeedback(form, { openid: OPENID }, new Date())
    const add = await db.collection('feedback').add({ data: doc })
    return { code: 0, msg: 'ok', data: { feedbackId: add._id, status: doc.status } }
  } catch (e) {
    return { code: 500, msg: '提交失败，请稍后重试' }
  }
}
