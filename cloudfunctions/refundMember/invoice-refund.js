const CANCELLABLE_STATUSES = ['submitted', 'reviewing']

function resolve(invoice) {
  const status = invoice && invoice.status
  if (status === 'issued') {
    return {
      ok: false,
      code: 409,
      shouldCancel: false,
      msg: '该订单已开具电子发票，请联系工作人员处理红字发票后再申请退款'
    }
  }
  return {
    ok: true,
    code: 0,
    shouldCancel: CANCELLABLE_STATUSES.indexOf(status) >= 0,
    msg: ''
  }
}

function buildCancellationPatch(invoice, now) {
  const source = invoice || {}
  const time = now instanceof Date ? now : new Date(now || Date.now())
  return {
    status: 'cancelled_refund',
    updatedAt: time,
    history: (Array.isArray(source.history) ? source.history : []).concat([{
      from: source.status || '',
      to: 'cancelled_refund',
      byType: 'system',
      byOpenid: '',
      byName: '',
      note: '订单已进入退款流程，系统自动关闭开票申请',
      at: time
    }])
  }
}

module.exports = { CANCELLABLE_STATUSES, resolve, buildCancellationPatch }
