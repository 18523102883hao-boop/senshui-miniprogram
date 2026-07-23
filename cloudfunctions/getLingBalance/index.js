// 云函数：getLingBalance —— 查询当前用户长河令余额（T06/T15）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const r = await db.collection('ling_accounts').where({ _openid: OPENID }).limit(1).get()
  const balance = r.data.length ? (r.data[0].balance || 0) : 0
  return { code: 0, msg: 'ok', data: { balance } }
}
