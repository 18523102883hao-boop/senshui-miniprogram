// 云函数：checkStaff —— 校验当前用户员工角色（T10）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const r = await db.collection('staff')
    .where({ _openid: OPENID, status: 'approved' })
    .limit(1)
    .get()

  if (r.data.length === 0) return { code: 0, msg: 'ok', data: { role: null } }
  const s = r.data[0]
  return { code: 0, msg: 'ok', data: { role: s.role, name: s.name } }
}
