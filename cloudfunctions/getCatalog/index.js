// 云函数：getCatalog —— 读取园区商品/服务目录（T22）。登录即可，供客户查看。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  let sections = []
  try {
    const c = await db.collection('notices').where({ type: 'catalog' }).limit(1).get()
    if (c.data.length && c.data[0].enabled !== false) sections = c.data[0].sections || []
  } catch (e) { /* 静默降级空 */ }
  return { code: 0, msg: 'ok', data: { sections } }
}
