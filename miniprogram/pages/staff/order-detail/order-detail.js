const request = require('../../../utils/request.js')
const util = require('../../../utils/util.js')

const ORDER_STATUS = {
  pending: '待支付',
  paid: '已支付',
  refunded: '已退款',
  refunding: '退款中',
  cancelled: '已取消',
  paid_dup: '已支付（重复回调）'
}
const ORDER_TYPE = {
  member_card: '会员卡',
  ticket_order: '门票订单',
  ticket_upgrade: '补差价',
  rental_order: '租赁订单',
  retail_order: '零售订单'
}
const TICKET_STATUS = {
  unused: '待使用',
  reserved: '已预约',
  used: '已核销',
  refund_pending: '退款中',
  refunded: '已退款',
  expired: '已过期',
  void: '已作废'
}
const REFUND_STATUS = {
  pending: '待处理',
  reviewing: '处理中',
  refunding: '退款中',
  refunded: '已退款',
  rejected: '已驳回',
  failed: '退款失败'
}

function amountText(value) {
  return util.fen2yuan(Number(value) || 0)
}

function dateText(value) {
  return value ? util.formatDate(value, 'YYYY-MM-DD HH:mm') : '未记录'
}

function decorateTicket(item) {
  const source = item || {}
  const unknown = !!source.admissionCountUnknown
  const people = Number(source.admissionCount) || 0
  return Object.assign({}, source, {
    statusText: TICKET_STATUS[source.status] || source.status || '未记录',
    unitPriceText: amountText(source.unitPrice),
    countText: unknown ? '1 张 / 实际人数待核对' : `1 张 / ${people} 人`,
    usedAtText: dateText(source.usedAt),
    refundedAtText: dateText(source.refundedAt)
  })
}

function decorateDetail(data) {
  const source = data || {}
  const tickets = (source.tickets || []).map(decorateTicket)
  const quantity = Number(source.quantity) || tickets.length
  const people = Number(source.admittedPeopleCount) || 0
  const contact = source.contact || {}
  const staff = source.staff || {}
  const refund = source.refund
    ? Object.assign({}, source.refund, {
      statusText: REFUND_STATUS[source.refund.status] || source.refund.status || '未记录',
      refundFeeText: amountText(source.refund.refundFee),
      createdAtText: dateText(source.refund.createdAt),
      updatedAtText: dateText(source.refund.updatedAt)
    })
    : null
  const invoice = source.invoice
    ? Object.assign({}, source.invoice, {
      statusText: source.invoice.statusText || source.invoice.status || '未记录',
      invoiceAmountText: amountText(source.invoice.invoiceAmount),
      submittedAtText: dateText(source.invoice.submittedAt),
      issuedAtText: dateText(source.invoice.issuedAt)
    })
    : null
  return Object.assign({}, source, {
    title: source.title || '历史订单',
    typeText: ORDER_TYPE[source.type] || source.type || '未记录',
    statusText: ORDER_STATUS[source.status] || source.status || '未记录',
    amountText: amountText(source.amount),
    quantityText: quantity ? `${quantity} 张` : '未记录',
    peopleText: people ? `${people} 人` : '未记录',
    visitDateText: source.visitDate || '未记录',
    contactText: contact.name || contact.phoneTail
      ? [contact.name, contact.phoneTail ? `手机尾号 ${contact.phoneTail}` : ''].filter(Boolean).join(' · ')
      : '未记录',
    staffText: staff.name || staff.staffNo
      ? [staff.name, staff.staffNo ? `工号 ${staff.staffNo}` : ''].filter(Boolean).join(' · ')
      : '未记录',
    createdAtText: dateText(source.createdAt),
    paidAtText: dateText(source.paidAt),
    updatedAtText: dateText(source.updatedAt),
    payment: Object.assign({}, source.payment || {}, {
      amountText: amountText(source.payment && source.payment.amount != null
        ? source.payment.amount
        : source.amount),
      statusText: source.paidAt ? '支付成功' : '未记录',
      paidAtText: dateText(source.payment && source.payment.paidAt
        ? source.payment.paidAt
        : source.paidAt)
    }),
    refund,
    invoice,
    tickets,
    history: (source.history || []).map((item) => Object.assign({}, item, {
      label: item.label || '操作记录',
      note: item.note || '',
      atText: dateText(item.at)
    }))
  })
}

const pageConfig = {
  data: {
    orderNo: '',
    detail: null,
    loaded: false,
    loading: false,
    denied: false,
    notFound: false,
    hasError: false
  },

  onLoad(options) {
    const orderNo = String((options && options.orderNo) || '').trim().slice(0, 48)
    if (!orderNo) {
      this.setData({ loaded: true, hasError: true })
      return Promise.resolve()
    }
    this.setData({ orderNo })
    return this.load()
  },

  onPullDownRefresh() {
    return this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    if (!this.data.orderNo) return Promise.resolve()
    this.setData({
      loading: true,
      loaded: false,
      denied: false,
      notFound: false,
      hasError: false
    })
    return request.call('adminOperationsLedger', {
      action: 'orderDetail',
      orderNo: this.data.orderNo
    })
      .then((data) => {
        this.setData({
          detail: decorateDetail(data),
          loaded: true,
          loading: false,
          denied: false,
          notFound: false,
          hasError: false
        })
      })
      .catch((error) => {
        const code = error && error.code
        this.setData({
          detail: null,
          loaded: true,
          loading: false,
          denied: code === 403,
          notFound: code === 404,
          hasError: code !== 403 && code !== 404
        })
      })
  },

  onRetry() {
    return this.load()
  }
}

if (typeof Page === 'function') Page(pageConfig)

module.exports = {
  ORDER_STATUS,
  ORDER_TYPE,
  TICKET_STATUS,
  REFUND_STATUS,
  decorateTicket,
  decorateDetail,
  pageConfig
}
