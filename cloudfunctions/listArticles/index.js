// 云函数：listArticles —— 内容列表（园区介绍 / 攻略 / 服务 / 活动故事）
// PRD §10 内容中心 / §18.1。分页用 skip 游标，前端传上一页返回的 nextCursor。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const core = require('./articles-core.js')

exports.main = async (event) => {
  const category = core.normalizeCategory(event && event.category)
  const pageSize = core.normalizePageSize(event && event.pageSize)
  const cursor = Math.max(0, parseInt((event && event.cursor) || 0, 10) || 0)

  const where = { status: 'published' }
  if (category) where.category = category

  try {
    const r = await db.collection('articles')
      .where(where)
      .orderBy('publishedAt', 'desc')
      .skip(cursor)
      .limit(pageSize + 1) // 多取 1 条判断是否还有下一页
      .get()

    const hasMore = r.data.length > pageSize
    const page = core.filterPublished(r.data.slice(0, pageSize)).map(core.toListItem)
    return {
      code: 0,
      msg: 'ok',
      data: { list: page, hasMore, nextCursor: hasMore ? cursor + pageSize : null }
    }
  } catch (e) {
    // 集合不存在或查询异常时返回空列表，由前端展示空态而不是报错页
    return { code: 0, msg: 'ok', data: { list: [], hasMore: false, nextCursor: null } }
  }
}
