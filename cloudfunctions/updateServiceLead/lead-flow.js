// 线索状态机与可见性（PRD §12.4）
// 首版只做状态、备注、下次跟进时间，不建 CRM。

const HANDLE_ROLES = ['front', 'admin']

// 允许的状态流转：只能往前推进或直接关闭，不能跳跃、不能回退
const TRANSITIONS = {
  new: ['contacted', 'closed'],
  contacted: ['qualified', 'lost', 'closed'],
  qualified: ['proposal', 'lost', 'closed'],
  proposal: ['won', 'lost', 'closed'],
  won: [],
  lost: [],
  closed: []
}

const ALL_STATUS = Object.keys(TRANSITIONS)

function canHandle(staff) {
  if (!staff) return { ok: false, msg: '请先在员工模式登记' }
  if (staff.status !== 'approved') return { ok: false, msg: '员工身份待审核' }
  if (HANDLE_ROLES.indexOf(staff.role) < 0) return { ok: false, msg: '当前角色无线索处理权限' }
  return { ok: true }
}

function isAdmin(staff) {
  return !!staff && staff.role === 'admin'
}

/**
 * 可见范围：管理员看全部；普通员工看分配给自己的 + 尚未分配的。
 */
function filterVisible(leads, staff) {
  const list = Array.isArray(leads) ? leads : []
  if (isAdmin(staff)) return list.slice()
  const me = (staff && staff._openid) || ''
  return list.filter((l) => l && (l.assigneeOpenid === me || !l.assigneeOpenid))
}

function maskPhone(phone) {
  const p = String(phone || '')
  return p.length === 11 ? p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : p
}

/**
 * 敏感字段可见性：负责人与管理员可见完整联系方式，其他人脱敏。
 */
function maskForStaff(lead, staff) {
  const l = Object.assign({}, lead || {})
  const me = (staff && staff._openid) || ''
  const allowed = isAdmin(staff) || l.assigneeOpenid === me
  if (!allowed) {
    l.contactPhone = maskPhone(l.contactPhone)
    delete l.remark // 内部备注不给非负责人
  }
  return l
}

function canTransit(from, to) {
  if (ALL_STATUS.indexOf(from) < 0) return { ok: false, msg: '当前状态非法' }
  if (ALL_STATUS.indexOf(to) < 0) return { ok: false, msg: '目标状态非法' }
  if (from === to) return { ok: true }
  const allowed = TRANSITIONS[from] || []
  if (allowed.indexOf(to) < 0) {
    return { ok: false, msg: '不允许从「' + from + '」直接变更为「' + to + '」' }
  }
  return { ok: true }
}

function buildHistoryEntry(lead, nextStatus, note, staff, now) {
  const from = (lead && lead.status) || 'new'
  return {
    from,
    to: nextStatus || from, // 只改备注时 to 等于 from
    note: String(note || '').slice(0, 200),
    byOpenid: (staff && staff._openid) || '',
    byName: (staff && staff.name) || '',
    at: now instanceof Date ? now : new Date()
  }
}

// 允许通过更新接口修改的字段白名单 —— 联系方式、归属人等一律不可改
const UPDATABLE = ['status', 'nextFollowAt', 'assigneeOpenid']

function buildUpdate(lead, input, staff, now) {
  const i = input || {}
  const time = now instanceof Date ? now : new Date()
  const patch = { updatedAt: time }

  if (i.status && i.status !== (lead && lead.status)) patch.status = i.status
  if (i.nextFollowAt) patch.nextFollowAt = i.nextFollowAt
  if (isAdmin(staff) && i.assigneeOpenid !== undefined) patch.assigneeOpenid = String(i.assigneeOpenid || '')

  patch.history = buildHistoryEntry(lead, patch.status, i.note, staff, time)
  return patch
}

module.exports = {
  HANDLE_ROLES, TRANSITIONS, ALL_STATUS, UPDATABLE,
  canHandle, isAdmin, filterVisible, maskForStaff, maskPhone,
  canTransit, buildHistoryEntry, buildUpdate
}
