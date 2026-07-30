// 云函数：listTicketProducts —— 门票商品列表（PRD §8.3 / §18.2）
// 只返回 status=active 的商品；查询异常返回空列表，由前端展示渠道兜底。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const core = require('./catalog-core.js')

// 原生支付是否可用：关掉后所有 native_pay 商品自动降级到备用模式，无需改数据
const NATIVE_PAY_READY = process.env.NATIVE_PAY_READY !== 'false'

exports.main = async (event) => {
  const category = String((event && event.category) || '').trim().slice(0, 32)
  const where = { status: 'active' }
  if (category) where.category = category

  try {
    const r = await db.collection('ticket_products').where(where).orderBy('sort', 'asc').limit(100).get()
    const list = core.filterActive(r.data).map((p) => core.toCardItem(p, { nativePayReady: NATIVE_PAY_READY }))
    return { code: 0, msg: 'ok', data: { list, nativePayReady: NATIVE_PAY_READY } }
  } catch (e) {
    return { code: 0, msg: 'ok', data: { list: [], nativePayReady: NATIVE_PAY_READY } }
  }
}
