// 云函数：setMap —— 管理员保存园区地图 fileID（T24）
// 存于 notices(type:'config', key:'homeMaps').value = { camp: fileID, creek: fileID }
// 由小程序管理员端「园区地图管理」上传图片后调用。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '未登录' }

  const staffRes = await db.collection('staff').where({ _openid: OPENID, status: 'approved' }).limit(1).get()
  if (!staffRes.data.length || staffRes.data[0].role !== 'admin') {
    return { code: 403, msg: '需要管理员权限' }
  }

  const key = event.key
  const fileID = String(event.fileID || '')
  if (['camp', 'creek'].indexOf(key) === -1 || !fileID) return { code: 400, msg: '参数错误' }

  const notices = db.collection('notices')
  const now = new Date()
  const existed = await notices.where({ type: 'config', key: 'homeMaps' }).limit(1).get()

  if (existed.data.length) {
    const value = Object.assign({ camp: '', creek: '' }, existed.data[0].value || {})
    value[key] = fileID
    await notices.doc(existed.data[0]._id).update({ data: { value, updatedAt: now } })
  } else {
    const value = { camp: '', creek: '' }
    value[key] = fileID
    await notices.add({ data: { type: 'config', key: 'homeMaps', value, createdAt: now, updatedAt: now } })
  }

  return { code: 0, msg: 'ok', data: { key } }
}
