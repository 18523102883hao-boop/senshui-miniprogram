// 云函数：getLingContent —— 长河令内容（擂台列表 / 兑换预览 / 故事）（T06）
// 合规：字段统一「奖励令数 reward / 参与令数 join」。查不到则返回空对象，前端保留占位内容。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const data = {}

  try {
    const a = await db.collection('activities').where({ category: 'ling', enabled: true }).orderBy('time', 'asc').get()
    if (a.data.length) {
      data.earnList = a.data.map((x) => ({ id: x._id, name: x.name, reward: x.rewardLing || 0, join: x.joinLing || 0, time: x.time, location: x.location }))
    }
  } catch (e) { /* ignore */ }

  try {
    // story / exchangeList / npcSchedule 存于 notices(type: 'ling_config')
    const c = await db.collection('notices').where({ type: 'ling_config' }).limit(1).get()
    if (c.data.length) {
      const v = c.data[0]
      if (v.story) data.story = v.story
      if (v.exchangeList) data.exchangeList = v.exchangeList
      if (v.npcSchedule) data.npcSchedule = v.npcSchedule
    }
  } catch (e) { /* ignore */ }

  return { code: 0, msg: 'ok', data }
}
