const MAX_AMOUNT = 1000000
const MAX_QUANTITY = 10

function cleanLabel(value) {
  return String(value || '票种升级').trim().slice(0, 40) || '票种升级'
}

function resolveCharge(input) {
  const source = input || {}
  if (source.item) {
    const item = source.item
    if (!item || item.enabled === false || !item.id || !Number.isInteger(item.price) || item.price <= 0) {
      return { ok: false, msg: '升级项不存在或已下架' }
    }
    const quantity = source.quantity == null ? 1 : Number(source.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { ok: false, msg: '人数须为 1 至 10 人' }
    }
    const amount = item.price * quantity
    if (!Number.isSafeInteger(amount) || amount > MAX_AMOUNT) {
      return { ok: false, msg: '金额不合法（1 分 ~ 1 万元）' }
    }
    return {
      ok: true,
      amount,
      unitPrice: item.price,
      quantity,
      itemId: item.id,
      itemLabel: cleanLabel(item.label)
    }
  }

  const amount = Number(source.amount)
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { ok: false, msg: '金额不合法（1 分 ~ 1 万元）' }
  }
  return {
    ok: true,
    amount,
    unitPrice: amount,
    quantity: 1,
    itemId: null,
    itemLabel: cleanLabel(source.itemLabel)
  }
}

module.exports = {
  MAX_AMOUNT,
  MAX_QUANTITY,
  resolveCharge
}
