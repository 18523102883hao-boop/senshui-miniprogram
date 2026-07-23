// 云函数：getHomeData —— 首页数据（今日活动 / 公告 / 地图）（T05）
// 数据来源：activities（今日 enabled）、notices（home 公告 / config 地图）。查不到则返回空，前端降级占位。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 3600 * 1000)

  let activities = []
  let notice = ''
  let mapImage = ''
  let maps = { camp: '', creek: '' }

  try {
    const a = await db.collection('activities')
      .where({ date: _.gte(start).and(_.lt(end)), enabled: true })
      .orderBy('time', 'asc')
      .get()
    activities = a.data.map((x) => ({ id: x._id, time: x.time, name: x.name, location: x.location, rewardLing: x.rewardLing || 0 }))
  } catch (e) { /* 集合不存在时忽略 */ }

  try {
    const n = await db.collection('notices').where({ type: 'home', enabled: true }).orderBy('createdAt', 'desc').limit(1).get()
    if (n.data.length) notice = n.data[0].content
  } catch (e) { /* ignore */ }

  try {
    const c = await db.collection('notices').where({ type: 'config', key: 'homeMap' }).limit(1).get()
    if (c.data.length) mapImage = c.data[0].value
  } catch (e) { /* ignore */ }

  try {
    const m = await db.collection('notices').where({ type: 'config', key: 'homeMaps' }).limit(1).get()
    if (m.data.length && m.data[0].value) maps = Object.assign(maps, m.data[0].value)
  } catch (e) { /* ignore */ }

  return { code: 0, msg: 'ok', data: { activities, notice, mapImage, maps } }
}
