// 门票退款纯逻辑（PRD §8.5 / 业务参数 §4）
// 铁律：没有真正发起退款就绝不告诉用户"退款成功"，一律转人工售后单。

const REFUNDABLE = ['unused', 'reserved']

/**
 * 决定退款走向。
 * @returns {{mode:'auto'|'manual'|'reject', refundFee?:number, totalFee?:number, ticketNos?:string[], msg?:string}}
 */
function planRefund(input) {
  const src = input || {}
  const order = src.order || {}
  const tickets = Array.isArray(src.tickets) ? src.tickets : []

  if (order.status !== 'paid' && order.status !== 'paid_dup') {
    return { mode: 'reject', msg: '该订单当前状态不支持退款' }
  }

  const usable = tickets.filter((t) => t && REFUNDABLE.indexOf(t.status) >= 0)
  const consumed = tickets.filter((t) => t && (t.status === 'used'))

  if (!tickets.length) {
    return { mode: 'reject', msg: '没有可退的票券' }
  }
  if (!usable.length) {
    // 全部已核销：按业主规则「任一项目核销后未使用项目金额不可退」，转人工判断
    return {
      mode: 'manual',
      msg: consumed.length ? '票券已核销，请联系客服人工处理' : '没有可自动退款的票券，已转人工审核',
      ticketNos: tickets.map((t) => t.ticketNo)
    }
  }

  const refundFee = usable.reduce((sum, t) => sum + (Number(t.unitPrice) || 0), 0)
  if (!Number.isInteger(refundFee) || refundFee <= 0) {
    return { mode: 'manual', msg: '退款金额异常，已转人工审核', ticketNos: usable.map((t) => t.ticketNo) }
  }

  // 支付退款能力未开通时不得伪造成功
  if (!src.payRefundEnabled) {
    return {
      mode: 'manual',
      msg: '已提交人工审核，客服会在核实后为你办理退款',
      refundFee,
      totalFee: order.totalFee || 0,
      ticketNos: usable.map((t) => t.ticketNo)
    }
  }

  return {
    mode: 'auto',
    refundFee,
    totalFee: order.totalFee || 0,
    ticketNos: usable.map((t) => t.ticketNo)
  }
}

/**
 * 退款单号：由订单号 + 票号集合决定，重试时保持稳定，避免重复退款。
 */
function buildOutRefundNo(outTradeNo, ticketNos) {
  const sorted = (Array.isArray(ticketNos) ? ticketNos.slice() : []).sort().join('')
  let hash = 0
  for (let i = 0; i < sorted.length; i += 1) {
    hash = ((hash << 5) - hash + sorted.charCodeAt(i)) | 0
  }
  return ('R' + String(outTradeNo || '') + Math.abs(hash).toString(36).toUpperCase()).slice(0, 64)
}

module.exports = { REFUNDABLE, planRefund, buildOutRefundNo }
