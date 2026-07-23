// 云函数：getTicketConfig —— 购票渠道 / 价目 / 升级说明（T16）
// 存于 notices(type: 'ticket_config')。查不到返回空对象，前端保留占位。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const data = {}
  try {
    const c = await db.collection('notices').where({ type: 'ticket_config' }).limit(1).get()
    if (c.data.length) {
      const v = c.data[0]
      if (v.channels) data.channels = v.channels
      if (v.priceList) data.priceList = v.priceList
      if (v.upgradeNote) data.upgradeNote = v.upgradeNote
    }
  } catch (e) { /* ignore */ }
  return { code: 0, msg: 'ok', data }
}
