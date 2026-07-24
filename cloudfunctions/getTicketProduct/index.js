// 云函数：getTicketProduct —— 门票商品详情（PRD §8.4 / §18.2）
// 只有上架商品可被读取，草稿/下架直接 404，防止直链访问未发布价格。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const core = require('./catalog-core.js')

const NATIVE_PAY_READY = process.env.NATIVE_PAY_READY !== 'false'

exports.main = async (event) => {
  const productId = String((event && event.productId) || '').trim().slice(0, 64)
  const sku = String((event && event.sku) || '').trim().slice(0, 64)
  if (!productId && !sku) return { code: 400, msg: '缺少商品标识' }

  try {
    let doc = null
    if (productId) {
      const r = await db.collection('ticket_products').doc(productId).get().catch(() => null)
      doc = r && r.data
    } else {
      const r = await db.collection('ticket_products').where({ sku }).limit(1).get()
      doc = r.data[0]
    }
    if (!doc || doc.status !== 'active') return { code: 404, msg: '商品不存在或已下架' }

    // 详情在卡片模型基础上补齐规则字段（PRD §8.4）
    const product = Object.assign(core.toCardItem(doc, { nativePayReady: NATIVE_PAY_READY }), {
      galleryFileIds: doc.galleryFileIds || [],
      benefits: doc.benefits || [],
      exclusions: doc.exclusions || [],
      restrictions: doc.restrictions || [],
      validityRule: doc.validityRule || null,
      blackoutDates: doc.blackoutDates || [],
      refundRule: doc.refundRule || null,
      purchaseLimit: doc.purchaseLimit || 1,
      stockMode: doc.stockMode || 'unlimited',
      highlight: doc.highlight || ''
    })
    return { code: 0, msg: 'ok', data: { product, nativePayReady: NATIVE_PAY_READY } }
  } catch (e) {
    return { code: 500, msg: '商品加载失败' }
  }
}
