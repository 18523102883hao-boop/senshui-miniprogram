// getArticle 的纯逻辑（PRD §10 内容中心 / §17.2 articles）

// 正文块白名单：前端只实现了这几种渲染器，未知类型直接丢弃，避免出现空白段落
const ALLOWED_BLOCK_TYPES = ['text', 'image', 'list', 'notice', 'gallery']

function sanitizeBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && ALLOWED_BLOCK_TYPES.indexOf(b.type) >= 0)
    .map((b) => ({ type: b.type, data: b.data || {} }))
}

/**
 * 从查询结果中取出唯一一篇已发布文章；草稿/归档/空结果一律返回 null。
 */
function pickPublished(docs) {
  const list = Array.isArray(docs) ? docs : []
  const doc = list.filter((d) => d && d.status === 'published')[0]
  if (!doc) return null
  return {
    id: doc._id || '',
    slug: doc.slug || '',
    category: doc.category || '',
    title: doc.title || '',
    summary: doc.summary || '',
    coverFileId: doc.coverFileId || '',
    blocks: sanitizeBlocks(doc.blocks),
    publishedAt: doc.publishedAt || null,
    updatedAt: doc.updatedAt || null
  }
}

module.exports = { ALLOWED_BLOCK_TYPES, sanitizeBlocks, pickPublished }
