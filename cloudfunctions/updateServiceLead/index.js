// 云函数：updateServiceLead —— 员工更新线索状态/备注/下次跟进（PRD §12.4 / §18.4）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./lead-flow.js')

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const s = await db.collection('staff').where({ _openid: OPENID }).limit(1).get()
  const staff = s.data[0]
  const perm = core.canHandle(staff)
  if (!perm.ok) return { code: 403, msg: perm.msg }
  staff._openid = OPENID

  const leadId = String((event && event.leadId) || '').trim().slice(0, 64)
  if (!leadId) return { code: 400, msg: '缺少线索标识' }

  const r = await db.collection('service_leads').doc(leadId).get().catch(() => null)
  const lead = r && r.data
  if (!lead) return { code: 404, msg: '线索不存在' }

  // 非管理员只能处理分配给自己或未分配的线索
  if (!core.isAdmin(staff) && lead.assigneeOpenid && lead.assigneeOpenid !== OPENID) {
    return { code: 403, msg: '该线索已分配给其他同事' }
  }

  const nextStatus = String((event && event.status) || '').trim()
  const note = String((event && event.note) || '').trim()
  if (!nextStatus && !note && !(event && event.nextFollowAt)) {
    return { code: 400, msg: '请填写状态、备注或下次跟进时间' }
  }

  if (nextStatus) {
    const t = core.canTransit(lead.status, nextStatus)
    if (!t.ok) return { code: 400, msg: t.msg }
  }

  const now = new Date()
  const patch = core.buildUpdate(lead, event, staff, now)
  const history = patch.history
  delete patch.history

  // 首次跟进自动认领，避免线索无人负责
  if (!lead.assigneeOpenid && patch.assigneeOpenid === undefined) {
    patch.assigneeOpenid = OPENID
  }

  try {
    await db.collection('service_leads').doc(leadId).update({
      data: Object.assign({}, patch, { history: _.push([history]) })
    })
    return { code: 0, msg: 'ok', data: { leadId, status: patch.status || lead.status } }
  } catch (e) {
    return { code: 500, msg: '更新失败，请重试' }
  }
}
