// 支付配置读取（共享模块 · 各支付云函数目录内各存一份）
//
// 背景：云函数的环境变量是**按函数单独配置**的，而依赖 SUB_MCH_ID 的函数有 7 个
// （createTicketOrder / createMemberOrder / createSelfUpgrade / payUpgradeCharge /
//   refundMember / requestTicketRefund / repayOrder）。逐个配极容易漏，漏配的表现
// 就是用户点支付收到「支付未配置」——2026-07-26 购票就是这么挂的。
//
// 读取优先级：环境变量 > 数据库 configs/pay。已配环境变量的函数行为完全不变。
//
// 自举（业主 2026-07-26 明确不想配 7 次）：
//   只要**任意一个**函数从环境变量读到了子商户号，就顺手镜像一份到 configs/pay，
//   其余没配环境变量的函数随后都能读到。写库失败不影响支付，最坏情况只是没镜像成。
//
// configs/pay 文档结构：
//   { _id: 'pay', subMchId: '子商户号', source: 'env-mirror', updatedAt: Date }

const CACHE_TTL = 60 * 1000

// 云函数容器会被复用，缓存避免每次下单都查一次库；60 秒足够让改配置及时生效
let cachedValue = ''
let cachedAt = 0
// 镜像每个容器只尝试一次，不给每次下单都加一次写库开销
let mirrorTried = false

// 把环境变量里的值镜像到数据库。刻意不 await——支付链路一秒都不该为它等待。
//
// 整个函数被 try/catch 包住：镜像是纯粹的锦上添花，任何失败（包括 db 对象
// 结构意外、权限不足、集合建不出来）都必须被吞掉，绝不能反过来打断支付。
function mirrorToDb(db, value) {
  if (mirrorTried) return
  mirrorTried = true

  try {
    const write = () => db.collection('configs').doc('pay').set({
      data: { subMchId: value, source: 'env-mirror', updatedAt: new Date() }
    })

    // 集合不存在时 set 会失败，补建一次再写；仍失败就放弃
    Promise.resolve()
      .then(write)
      .catch(() => Promise.resolve().then(() => db.createCollection('configs')).then(write))
      .catch(() => {})
  } catch (e) {
    // 同步抛错也要吞掉
  }
}

/**
 * 取微信支付子商户号。
 * @param {object} db cloud.database() 实例
 * @returns {Promise<string>} 子商户号；未配置时返回空串（调用方据此报错）
 */
async function getSubMchId(db) {
  const fromEnv = process.env.SUB_MCH_ID
  if (fromEnv) {
    mirrorToDb(db, fromEnv)
    return fromEnv
  }

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
