// 云函数：getUpgradeItems —— 拉取补差价升级价目表（T20）
// 数据源：notices(type:'ticket_config').upgradeList = [{ id, label, price(分), enabled }]
// 员工端「发起收款」页用；查不到返回空数组，前端可降级为纯手输金额。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 401, msg: '未登录' }

  let items = []
  try {
    const c = await db.collection('notices').where({ type: 'ticket_config' }).limit(1).get()
    const list = (c.data[0] && c.data[0].upgradeList) || []
    items = list
      .filter(i => i && i.enabled !== false && Number.isInteger(i.price) && i.price > 0)
      .map(i => ({ id: i.id, label: i.label || '票种升级', price: i.price }))
  } catch (e) { /* 配置缺失时静默降级 */ }

  return { code: 0, msg: 'ok', data: { items } }
}
