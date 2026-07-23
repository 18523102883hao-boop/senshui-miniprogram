// 云函数：login —— 静默登录（wx.login 换 openid）+ 静默注册/更新 users（T04）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const { OPENID, UNIONID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '无法获取用户身份' }

  const users = db.collection('users')
  const now = new Date()
  const existed = await users.where({ _openid: OPENID }).limit(1).get()

  let user
  if (existed.data.length === 0) {
    // 云函数内 add 不会自动写 _openid，需手动写入
    const res = await users.add({
      data: { _openid: OPENID, unionid: UNIONID || '', phone: '', nickName: '', avatarUrl: '', createdAt: now, updatedAt: now }
    })
    user = { _id: res._id, phone: '' }
  } else {
    user = existed.data[0]
    await users.doc(user._id).update({ data: { updatedAt: now } })
  }

  return {
    code: 0,
    msg: 'ok',
    data: { openid: OPENID, user: { id: user._id, phone: user.phone || '', nickName: user.nickName || '', avatarUrl: user.avatarUrl || '' } }
  }
}
