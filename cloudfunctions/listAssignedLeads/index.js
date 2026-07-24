// 云函数：listAssignedLeads —— 员工端线索列表（PRD §12.4 / §18.4）
// 普通员工只看分配给自己的 + 未分配的；管理员看全部。非负责人看到的联系方式已脱敏。
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

  const status = String((event && event.status) || '').trim()
  const where = {}
  if (status && core.ALL_STATUS.indexOf(status) >= 0) where.status = status
  if (!core.isAdmin(staff)) {
    where.assigneeOpenid = _.in([OPENID, ''])
  }

  try {
    const r = await db.collection('service_leads')
      .where(where).orderBy('createdAt', 'desc').limit(100).get()
    const list = core.filterVisible(r.data, staff)
      .map((l) => core.maskForStaff(l, staff))
      .map((l) => ({
        leadId: l._id,
        type: l.type,
        status: l.status,
        contactName: l.contactName || '',
        contactPhone: l.contactPhone || '',
        company: l.company || l.brandName || '',
        partySize: l.partySize || 0,
        visitDate: l.visitDate || l.birthdayDate || l.expectDate || '',
        budget: l.budget || '',
        remark: l.remark || '',
        nextFollowAt: l.nextFollowAt || null,
        assigneeOpenid: l.assigneeOpenid || '',
        historyCount: (l.history || []).length,
        createdAt: l.createdAt
      }))
    return { code: 0, msg: 'ok', data: { list, isAdmin: core.isAdmin(staff) } }
  } catch (e) {
    return { code: 0, msg: 'ok', data: { list: [], isAdmin: false } }
  }
}
