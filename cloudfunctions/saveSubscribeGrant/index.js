// 云函数：saveSubscribeGrant —— 记录用户的订阅消息授权
// 一次授权只能发一条，这里记录可用次数，发送时递减。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  if (!OPENID) return { code: 401, msg: '请先登录' }

  const tmplIds = (Array.isArray(event.tmplIds) ? event.tmplIds : []).slice(0, 10)
  if (!tmplIds.length) return { code: 400, msg: '缺少模板 ID' }
  const scene = String(event.scene || '').slice(0, 32)
  const now = new Date()

  try {
    await db.createCollection('subscribe_grants').catch(() => {})
    for (const tmplId of tmplIds) {
      const found = await db.collection('subscribe_grants')
        .where({ _openid: OPENID, tmplId }).limit(1).get()
      if (found.data.length) {
        await db.collection('subscribe_grants').doc(found.data[0]._id)
          .update({ data: { quota: _.inc(1), scene, updatedAt: now } })
      } else {
        await db.collection('subscribe_grants').add({
          data: { _openid: OPENID, tmplId, scene, quota: 1, createdAt: now, updatedAt: now }
        })
      }
    }
    return { code: 0, msg: 'ok' }
  } catch (e) {
    return { code: 500, msg: '记录授权失败' }
  }
}
