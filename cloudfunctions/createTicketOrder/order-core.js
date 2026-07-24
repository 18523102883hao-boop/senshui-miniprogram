// 门票下单纯逻辑（PRD §8.5 / §23）
// 铁律：金额只由云端商品快照计算，客户端传的任何价格字段一律忽略。

const MAX_TOTAL_FEE = 1000000 // 单笔上限 100 万分，兜底防脏数据

/**
 * 校验下单请求并计算金额。
 * @param {object} input { product, quantity, visitDate, clientAmount }
 * @returns {{ok:boolean, msg?:string, unitPrice?:number, totalFee?:number, quantity?:number}}
 */
function resolveOrder(input) {
  const src = input || {}
  const p = src.product

  if (!p || p.status !== 'active') {
    return { ok: false, msg: '商品不存在或已下架' }
  }
  if (p.fulfillmentMode !== 'native_pay') {
    return { ok: false, msg: '该商品暂不支持在线购买' }
  }

  const quantity = Number(src.quantity)
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, msg: '购买数量不合法' }
  }
  const limit = p.purchaseLimit || 1
  if (quantity > limit) {
    return { ok: false, msg: '每单限购 ' + limit + ' 份' }
  }

  // 库存：unlimited 不校验；total/daily 按剩余判断
  if (p.stockMode === 'total' || p.stockMode === 'daily') {
    const stock = Number(p.stock) || 0
    if (stock < quantity) {
      return { ok: false, msg: '库存不足，仅剩 ' + stock + ' 份' }
    }
  }

  if (p.reservationRequired && !src.visitDate) {
    return { ok: false, msg: '该商品需选择使用日期' }
  }

  const unitPrice = p.salePrice
  if (!Number.isInteger(unitPrice) || unitPrice < 0) {
    return { ok: false, msg: '商品价格异常，请联系客服' }
  }
  const totalFee = unitPrice * quantity
  if (totalFee <= 0 || totalFee > MAX_TOTAL_FEE) {
    return { ok: false, msg: '订单金额异常' }
  }

  return { ok: true, unitPrice, totalFee, quantity, visitDate: src.visitDate || '' }
}

function normalizeIdempotencyKey(key) {
  return String(key || '').trim().slice(0, 64)
}

/**
 * 幂等：同一幂等键若已有未支付订单则复用，避免重复建单。
 * 已支付/已关闭的订单不复用（用户是想再买一单）。
 */
function pickReusableOrder(orders, key) {
  const k = normalizeIdempotencyKey(key)
  if (!k) return null
  const hit = (Array.isArray(orders) ? orders : [])
    .filter((o) => o && o.idempotencyKey === k && o.status === 'pending')[0]
  return hit || null
}

// 微信 outTradeNo 上限 32 字符
function buildOutTradeNo(prefix) {
  const p = String(prefix || 'TK').slice(0, 4)
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return (p + Date.now().toString(36).toUpperCase() + rand).slice(0, 32)
}

module.exports = { MAX_TOTAL_FEE, resolveOrder, normalizeIdempotencyKey, pickReusableOrder, buildOutTradeNo }
