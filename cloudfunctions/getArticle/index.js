// 云函数：getArticle —— 文章详情（按 slug 或 id）
// PRD §10 内容中心 / §18.1。未发布内容一律不可通过直链访问。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const core = require('./article-core.js')

exports.main = async (event) => {
  const slug = String((event && event.slug) || '').trim().slice(0, 64)
  const id = String((event && event.id) || '').trim().slice(0, 64)
  if (!slug && !id) return { code: 400, msg: '缺少文章标识' }

  try {
    let docs = []
    if (id) {
      const r = await db.collection('articles').doc(id).get().catch(() => null)
      docs = r && r.data ? [r.data] : []
    } else {
      const r = await db.collection('articles').where({ slug }).limit(1).get()
      docs = r.data
    }

    const article = core.pickPublished(docs)
    if (!article) return { code: 404, msg: '内容不存在或已下架' }
    return { code: 0, msg: 'ok', data: { article } }
  } catch (e) {
    return { code: 500, msg: '内容加载失败' }
  }
}
