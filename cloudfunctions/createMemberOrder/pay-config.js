// 支付配置读取（共享模块 · 各支付云函数目录内各存一份）
//
// 背景：云函数的环境变量是**按函数单独配置**的，而依赖 SUB_MCH_ID 的函数有 7 个
// （createTicketOrder / createMemberOrder / createSelfUpgrade / payUpgradeCharge /
//   refundMember / requestTicketRefund）。逐个配极容易漏，漏配的表现就是用户点支付
// 收到「支付未配置」——2026-07-26 购票就是这么挂的（补差价配了、购票没配）。
//
// 因此这里加一层数据库回落：configs/pay 文档写一次，所有支付函数都能读到。
// 优先级：环境变量 > 数据库。已配环境变量的函数行为完全不变。
//
// configs/pay 文档结构：
//   { _id: 'pay', subMchId: '你的子商户号' }

const CACHE_TTL = 60 * 1000

// 云函数容器会被复用，缓存避免每次下单都查一次库；60 秒足够让改配置及时生效
let cachedValue = ''
let cachedAt = 0

/**
 * 取微信支付子商户号。
 * @param {object} db cloud.database() 实例
 * @returns {Promise<string>} 子商户号；未配置时返回空串（调用方据此报错）
 */
async function getSubMchId(db) {
  const fromEnv = process.env.SUB_MCH_ID
  if (fromEnv) return fromEnv

  if (cachedValue && Date.now() - cachedAt < CACHE_TTL) return cachedValue

  const res = await db.collection('configs').doc('pay').get().catch(() => null)
  const value = (res && res.data && res.data.subMchId) || ''
  if (value) {
    cachedValue = value
    cachedAt = Date.now()
  }
  return value
}

// 缺配置时给一句能自查的提示，而不是让用户对着「请联系管理员」干等
const NOT_CONFIGURED_MSG = '支付未配置：请在云函数环境变量设置 SUB_MCH_ID，或在 configs/pay 写入 subMchId'

module.exports = { getSubMchId, NOT_CONFIGURED_MSG }
