// 云函数：bindStaff —— 员工登记（姓名 + 手机号 + 员工口令）（T10 / T23 简化）
// 口令正确即自动通过并按口令分配角色，无需后台审批、无需 getPhoneNumber。
// 口令配置在环境变量：STAFF_CODE_ADMIN / STAFF_CODE_FRONT / STAFF_CODE_CREEK / STAFF_CODE_BAR
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CODES = [
  { code: process.env.STAFF_CODE_ADMIN || '', role: 'admin' },
  { code: process.env.STAFF_CODE_FRONT || '', role: 'front' },
  { code: process.env.STAFF_CODE_CREEK || '', role: 'creek' },
  { code: process.env.STAFF_CODE_BAR || '', role: 'bar' }
]

function roleForCode(input) {
  const hit = CODES.find((c) => c.code && c.code === input)
  return hit ? hit.role : null
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '未登录' }

  const name = String(event.name || '').trim()
  const phone = String(event.phone || '').trim()
  const inviteCode = String(event.inviteCode || '').trim()

  if (!name) return { code: 400, msg: '请填写姓名' }
  if (!/^1\d{10}$/.test(phone)) return { code: 400, msg: '请填写正确的手机号' }
  if (!inviteCode) return { code: 400, msg: '请填写员工口令' }

  const role = roleForCode(inviteCode)
  if (!role) return { code: 403, msg: '员工口令不正确，请向管理员索取' }

  const col = db.collection('staff')
  const now = new Date()
  const existed = await col.where({ _openid: OPENID }).limit(1).get()

  if (existed.data.length) {
    await col.doc(existed.data[0]._id).update({
      data: { name, phone, role, status: 'approved', updatedAt: now }
    })
  } else {
    await col.add({
      data: { _openid: OPENID, name, phone, role, status: 'approved', createdAt: now, updatedAt: now }
    })
  }

  return { code: 0, msg: 'ok', data: { role, status: 'approved' } }
}
