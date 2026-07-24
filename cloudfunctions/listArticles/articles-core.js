// listArticles 的纯逻辑（PRD §10 内容中心 / §17.2 articles）
const PAGE_SIZE = 10
const ALLOWED_CATEGORIES = ['park_intro', 'guide', 'service', 'activity_story']

function toTime(value) {
  if (!value) return 0
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return isNaN(t) ? 0 : t
}

/**
 * 只保留已发布文章，按发布时间倒序（不修改入参）。
 */
function filterPublished(list) {
  return (Array.isArray(list) ? list : [])
    .filter((a) => a && a.status === 'published')
    .sort((a, b) => toTime(b.publishedAt) - toTime(a.publishedAt))
}

/**
 * 列表项：不返回正文 blocks，减少流量与包体。
 */
function toListItem(article) {
  const a = article || {}
  return {
    id: a._id || '',
    slug: a.slug || '',
    category: a.category || '',
    title: a.title || '',
    summary: a.summary || '',
    coverFileId: a.coverFileId || '',
    publishedAt: a.publishedAt || null
  }
}

function normalizeCategory(category) {
  const c = String(category || '').trim()
  return ALLOWED_CATEGORIES.indexOf(c) >= 0 ? c : ''
}

function normalizePageSize(size) {
  const n = parseInt(size, 10)
  if (!n || n < 1) return PAGE_SIZE
  return Math.min(n, 20)
}

module.exports = { PAGE_SIZE, ALLOWED_CATEGORIES, filterPublished, toListItem, normalizeCategory, normalizePageSize }
