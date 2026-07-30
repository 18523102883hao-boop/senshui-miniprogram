// 云函数：initDb —— 一键初始化数据库集合 + 可选种子数据（T02）
// 用法：微信开发者工具 → 云函数 initDb → 云端测试，入参 { "seed": true } 写入示例数据
// 注意：生产环境请为本函数加管理员身份校验（当前仅供开发初始化）。索引请按 scripts/db-init.md 在控制台建立。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTIONS = [
  'users', 'members', 'coupons', 'orders', 'products',
  'ling_accounts', 'ling_ledger', 'ling_daily_quotas', 'activities', 'notices',
  'staff', 'verifications',
  // 下一阶段（溪降）/ V2（商城）预建
  'sessions', 'bookings', 'rentals',
  // 本轮功能扩展（PRD §17 数据模型）
  'home_configs', 'articles', 'ticket_products', 'tickets',
  'visit_reservations', 'feedback', 'itineraries',
  'invoice_requests'
]

async function ensureCollection(name) {
  try {
    await db.createCollection(name)
    return 'created'
  } catch (e) {
    // -501001 / 已存在
    return 'exists'
  }
}

exports.main = async (event) => {
  const results = {}
  for (const c of COLLECTIONS) {
    results[c] = await ensureCollection(c)
  }

  if (event && event.seed) {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    try {
      // 种子活动必须与首页/长河令页的固定日程一致，避免旧测试数据回流覆盖前端文案
      const seedActivities = [
        { name: '侠客滩捕鱼', time: '13:00', location: '侠客滩' },
        { name: '侠客打擂乐园', time: '14:20', location: '打擂台' },
        { name: '海鲜大拍卖', time: '17:00', location: '主舞台' }
      ]
      for (const a of seedActivities) {
        await db.collection('activities').add({
          data: Object.assign({}, a, { category: 'ling', date: today, rewardLing: 0, joinLing: 0, enabled: true, createdAt: now })
        })
      }
      await db.collection('notices').add({
        data: { type: 'home', content: '欢迎来到森水长河 · 今日 17:00「海鲜大拍卖」主舞台见', enabled: true, createdAt: now }
      })
      
      // 溪降场次种子数据（今日 + 明日）
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      const sessions = [
        { date: today, startTime: '10:00', capacity: 20, remaining: 20, booked: 0, status: 'open', createdAt: now, updatedAt: now },
        { date: today, startTime: '14:00', capacity: 20, remaining: 20, booked: 0, status: 'open', createdAt: now, updatedAt: now },
        { date: tomorrow, startTime: '10:00', capacity: 20, remaining: 20, booked: 0, status: 'open', createdAt: now, updatedAt: now },
        { date: tomorrow, startTime: '14:00', capacity: 20, remaining: 20, booked: 0, status: 'open', createdAt: now, updatedAt: now }
      ]
      
      for (const s of sessions) {
        await db.collection('sessions').add({ data: s })
      }
    } catch (e) {
      results._seedError = e.message
    }
  }

  return { code: 0, msg: 'ok', data: { collections: results } }
}
