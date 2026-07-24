// 云函数：updateAvatar —— 保存用户头像 / 昵称到 users（T27）
// 头像由前端 chooseAvatar 选好、上传云存储得 fileID 后传入；持久化后下次登录自动带出。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '未登录' }

  const data = { updatedAt: new Date() }
  if (event.avatarUrl) data.avatarUrl = String(event.avatarUrl)
  if (event.nickName !== undefined && event.nickName !== null) {
    data.nickName = String(event.nickName).slice(0, 20)
  }
  if (!data.avatarUrl && data.nickName === undefined) return { code: 400, msg: '无更新内容' }

  await db.collection('users').where({ _openid: OPENID }).update({ data })
  return { code: 0, msg: 'ok', data: { avatarUrl: data.avatarUrl || '', nickName: data.nickName } }
}
