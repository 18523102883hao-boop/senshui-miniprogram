// 云函数：seedPortalContent —— 写入首页模块配置与内容中心种子数据
// 用法：开发者工具 → 云函数 seedPortalContent → 云端测试
//   {}              已有配置则跳过，只补缺失的文章
//   { "force": true } 强制写入新版本配置并覆盖同 slug 文章
// 注意：生产环境应加管理员校验，当前仅供运营初始化使用。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { DEFAULT_SECTIONS, DEFAULT_ARTICLES } = require('./seed-data.js')

async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (e) { /* 已存在 */ }
}

async function seedSections(force, now, openid) {
  const existing = await db.collection('home_configs').orderBy('version', 'desc').limit(1).get()
  if (existing.data.length && !force) {
    return { action: 'skipped', version: existing.data[0].version }
  }
  const version = existing.data.length ? (existing.data[0].version || 0) + 1 : 1
  await db.collection('home_configs').add({
    data: { version, sections: DEFAULT_SECTIONS, updatedAt: now, updatedBy: openid || 'seed' }
  })
  return { action: 'created', version }
}

async function seedArticles(force, now) {
  const result = { created: 0, updated: 0, skipped: 0 }
  for (const a of DEFAULT_ARTICLES) {
    const found = await db.collection('articles').where({ slug: a.slug }).limit(1).get()
    const payload = Object.assign({}, a, { publishedAt: now, updatedAt: now })
    if (!found.data.length) {
      await db.collection('articles').add({ data: payload })
      result.created += 1
    } else if (force) {
      await db.collection('articles').doc(found.data[0]._id).update({ data: payload })
      result.updated += 1
    } else {
      result.skipped += 1
    }
  }
  return result
}

exports.main = async (event) => {
  const force = !!(event && event.force)
  const now = new Date()
  const openid = cloud.getWXContext().OPENID || ''

  await ensureCollection('home_configs')
  await ensureCollection('articles')

  try {
    const sections = await seedSections(force, now, openid)
    const articles = await seedArticles(force, now)
    return { code: 0, msg: 'ok', data: { sections, articles } }
  } catch (e) {
    return { code: 500, msg: '种子写入失败：' + (e && e.message) }
  }
}
