// 云函数：createServiceLead —— 提交生日/团建/品牌合作线索（PRD §12 / §18.4）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const core = require('./lead-core.js')

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const type = String((event && event.type) || '').trim()
  const idempotencyKey = String((event && event.idempotencyKey) || '').trim().slice(0, 64)
  if (!idempotencyKey) return { code: 400, msg: '缺少幂等键' }

  const form = (event && event.form) || {}
  const check = core.validate(type, form)
  if (!check.ok) return { code: 400, msg: check.msg }

  try {
    await db.createCollection('service_leads').catch(() => {})
    const mine = await db.collection('service_leads')
      .where({ _openid: OPENID, idempotencyKey }).limit(5).get()
    const reused = core.pickReusable(mine.data, idempotencyKey)
    if (reused) return { code: 0, msg: 'ok', data: { leadId: reused._id, reused: true } }

    const doc = core.buildLead(type, form, { openid: OPENID, idempotencyKey }, new Date())
    const add = await db.collection('service_leads').add({ data: doc })
    return { code: 0, msg: 'ok', data: { leadId: add._id, type: doc.type, status: doc.status } }
  } catch (e) {
    return { code: 500, msg: '提交失败，请稍后重试' }
  }
}
