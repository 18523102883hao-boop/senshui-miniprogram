// 云函数：seedTicketProducts —— 写入票种数据
// 用法：开发者工具 → 云端测试
//   {}               已存在的 sku 跳过，只补新增
//   { "force": true } 按 sku 覆盖更新（改价后用）
// 注意：生产环境应加管理员校验，当前仅供运营初始化。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { TICKET_PRODUCTS } = require('./seed-tickets.js')

exports.main = async (event) => {
  const force = !!(event && event.force)
  const now = new Date()
  const result = { created: 0, updated: 0, skipped: 0 }

  try {
    await db.createCollection('ticket_products')
  } catch (e) { /* 已存在 */ }

  try {
    for (const p of TICKET_PRODUCTS) {
      const found = await db.collection('ticket_products').where({ sku: p.sku }).limit(1).get()
      const payload = Object.assign({}, p, { updatedAt: now })
      if (!found.data.length) {
        await db.collection('ticket_products').add({ data: Object.assign({ createdAt: now }, payload) })
        result.created += 1
      } else if (force) {
        await db.collection('ticket_products').doc(found.data[0]._id).update({ data: payload })
        result.updated += 1
      } else {
        result.skipped += 1
      }
    }
    return { code: 0, msg: 'ok', data: result }
  } catch (e) {
    return { code: 500, msg: '票种写入失败：' + (e && e.message) }
  }
}
