// 自助补差升级订单纯逻辑。
// 金额只取云端 upgradeList 的配置单价，客户端不传、也不能覆盖金额。

const MAX_QUANTITY = 10
const MAX_TOTAL_FEE = 1000000

function resolveStaffReference(input) {
  const value = String(input || '').trim().slice(0, 20)
  if (!value) return { value: '', lookup: 'empty', phonePattern: '' }
  if (/^\d{4}$/.test(value)) {
    return {
      value,
      lookup: 'phone_tail',
      phonePattern: value + '$'
    }
  }
  // 已发布的旧客户端仍可能提交姓名或完整手机号，保留精确匹配兼容。
  return { value, lookup: 'legacy_exact', phonePattern: '' }
}

function resolveUpgradeOrder(input) {
  const src = input || {}
  const item = src.item

  if (!item || item.enabled === false || !Number.isInteger(item.price) || item.price <= 0) {
    return { ok: false, msg: '升级项不存在或已下架' }
  }

  // 旧客户端没有 quantity 字段，按 1 份继续兼容。
  const rawQuantity = src.quantity === undefined || src.quantity === null
    ? 1
    : Number(src.quantity)
  if (!Number.isInteger(rawQuantity) || rawQuantity < 1 || rawQuantity > MAX_QUANTITY) {
    return { ok: false, msg: '购买数量不合法' }
  }

  const totalFee = item.price * rawQuantity
  if (!Number.isInteger(totalFee) || totalFee <= 0 || totalFee > MAX_TOTAL_FEE) {
    return { ok: false, msg: '订单金额异常' }
  }

  return {
    ok: true,
    quantity: rawQuantity,
    unitPrice: item.price,
    totalFee,
    itemLabel: item.label || '票种升级'
  }
}

module.exports = {
  MAX_QUANTITY,
  MAX_TOTAL_FEE,
  resolveStaffReference,
  resolveUpgradeOrder
}
