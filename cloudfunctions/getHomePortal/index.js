// 云函数：getHomePortal —— 首页门户（模块配置 + 公告 + 今日活动 + 地图 + 用户摘要）
// PRD §7 首页 / §18.1 云函数契约
// 容错原则：任何一块数据查询失败只降级该块，首页整体必须可用（含匿名与弱网）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const core = require('./portal-core.js')

// 取最新一版首页配置
async function loadSections() {
  try {
    const r = await db.collection('home_configs').orderBy('version', 'desc').limit(1).get()
    if (r.data.length && Array.isArray(r.data[0].sections)) return r.data[0].sections
  } catch (e) { /* 集合不存在时走兜底 */ }
  return []
}

async function loadNotice() {
  try {
    const r = await db.collection('notices')
      .where({ type: 'home', enabled: true })
      .orderBy('createdAt', 'desc').limit(1).get()
    if (r.data.length) {
      const n = r.data[0]
      return { content: n.content || '', level: n.level || 'info', noticeType: n.noticeType || 'general' }
    }
  } catch (e) { /* ignore */ }
  return null
}

async function loadTodayActivities() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 3600 * 1000)
  try {
    const r = await db.collection('activities')
      .where({ date: _.gte(start).and(_.lt(end)), enabled: true })
      .orderBy('time', 'asc').get()
    return r.data.map((x) => ({
      id: x._id, time: x.time, name: x.name, location: x.location, rewardLing: x.rewardLing || 0
    }))
  } catch (e) {
    return []
  }
}

async function loadMaps() {
  try {
    const r = await db.collection('notices').where({ type: 'config', key: 'homeMaps' }).limit(1).get()
    if (r.data.length && r.data[0].value) return Object.assign({ camp: '', creek: '' }, r.data[0].value)
  } catch (e) { /* ignore */ }
  return { camp: '', creek: '' }
}

// 用户摘要：失败返回 null，由 core 兜成空摘要
async function loadSummary(openid) {
  if (!openid) return null
  try {
    const [t, r] = await Promise.all([
      db.collection('tickets').where({ _openid: openid, status: 'unused' }).limit(50).get(),
      db.collection('visit_reservations')
        .where({ _openid: openid, status: _.in(['pending', 'confirmed']) })
        .orderBy('visitDate', 'asc').limit(20).get()
    ])
    return core.buildUserSummary({
      openid, now: new Date(), tickets: t.data, reservations: r.data
    })
  } catch (e) {
    return null
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''

  const [sections, notice, activities, maps, summary] = await Promise.all([
    loadSections(), loadNotice(), loadTodayActivities(), loadMaps(), loadSummary(openid)
  ])

  const data = core.buildPortalData({ sections, notice, activities, maps, summary }, new Date())
  return { code: 0, msg: 'ok', data }
}
