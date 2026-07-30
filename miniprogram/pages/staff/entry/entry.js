// 员工模式入口 —— 按角色稳定编排的现场工作台
// 身份查询失败与未登记严格分开；管理员概览失败不阻断高频任务。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')

const ROLE_TEXT = {
  front: '前台',
  creek: '溪降检票',
  bar: '酒吧 / 小卖部',
  admin: '管理员'
}

const TASKS = {
  charge: {
    key: 'charge',
    title: '补差价收款',
    desc: '出示收款码 · 客户扫码升级',
    route: '/pages/staff/charge/charge',
    icon: '/assets/icons/forest/home-upgrade.png'
  },
  ticketVerify: {
    key: 'ticketVerify',
    title: '门票核销',
    desc: '扫入园码 · 先预览再确认',
    route: '/pages/staff/ticket-verify/ticket-verify',
    icon: '/assets/icons/forest/home-ticket.png'
  },
  lingExchange: {
    key: 'lingExchange',
    title: '长河令兑换',
    desc: '实体与电子长河令互兑',
    route: '/pages/staff/ling-exchange/ling-exchange',
    icon: '/assets/icons/forest/activity-token.png'
  },
  memberVerify: {
    key: 'memberVerify',
    title: '会员核销台',
    desc: '核销长河令与生日权益',
    route: '/pages/staff/verify/verify',
    icon: '/assets/icons/forest/home-member.png'
  },
  operations: {
    key: 'operations',
    title: '运营与对账',
    desc: '业务账 · 核销 · 长河令汇总',
    route: '/pages/staff/operations/operations',
    icon: '/assets/icons/forest/activity-schedule.png'
  },
  invoices: {
    key: 'invoices',
    title: '开票管理',
    desc: '审核申请 · 上传电子发票',
    route: '/pages/staff/invoices/invoices',
    icon: '/assets/icons/forest/mine-orders.png'
  },
  maps: {
    key: 'maps',
    title: '园区地图管理',
    desc: '上传或更换园区游览图',
    route: '/pages/staff/maps/maps',
    icon: '/assets/icons/forest/home-map.png'
  }
}

const ROLE_LAYOUT = {
  front: {
    primary: 'charge',
    frequent: ['ticketVerify', 'lingExchange', 'memberVerify'],
    manage: []
  },
  creek: {
    primary: 'ticketVerify',
    frequent: ['memberVerify'],
    manage: []
  },
  bar: {
    primary: 'memberVerify',
    frequent: [],
    manage: []
  },
  admin: {
    primary: 'ticketVerify',
    frequent: ['charge', 'memberVerify', 'lingExchange'],
    manage: ['operations', 'invoices', 'maps']
  }
}

function taskByKey(key) {
  return key && TASKS[key] ? Object.assign({}, TASKS[key]) : null
}

function buildTaskLayout(role) {
  const layout = ROLE_LAYOUT[role] || { primary: '', frequent: [], manage: [] }
  const primary = taskByKey(layout.primary)
  const frequent = layout.frequent.map(taskByKey).filter(Boolean)
  const manage = layout.manage.map(taskByKey).filter(Boolean)
  return {
    primary,
    frequent,
    manage,
    all: [primary].concat(frequent, manage).filter(Boolean)
  }
}

function todayRange(now) {
  const current = now instanceof Date ? now : new Date()
  const from = new Date(current.getFullYear(), current.getMonth(), current.getDate())
  const to = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)
  return { from: from.getTime(), to: to.getTime() }
}

function fenText(value) {
  return (Math.round(Number(value) || 0) / 100).toFixed(2)
}

function emptyDashboard() {
  return {
    actualNetIncomeText: '--',
    admittedPeopleCount: '--',
    verifiedTicketCount: '--',
    pendingInvoiceCount: '--',
    anomalyCount: '--'
  }
}

let requestSequence = 0

const pageConfig = {
  data: {
    viewState: 'loading',
    role: null,
    staffName: '',
    roleText: '',
    primaryTask: null,
    frequentTasks: [],
    manageTasks: [],
    dashboard: emptyDashboard(),
    dashboardLoading: false,
    dashboardError: false,
    form: { name: '', phone: '', inviteCode: '' }
  },

  onShow() {
    return this.check()
  },

  onPullDownRefresh() {
    return this.check().finally(() => wx.stopPullDownRefresh())
  },

  check() {
    const sequence = ++requestSequence
    this.setData({
      viewState: 'loading',
      dashboardError: false
    })
    return request.call('checkStaff', {})
      .then((data) => {
        if (sequence !== requestSequence) return undefined
        const role = (data && data.role) || null
        if (!role) {
          this.setData({
            viewState: 'unbound',
            role: null,
            staffName: '',
            roleText: '',
            primaryTask: null,
            frequentTasks: [],
            manageTasks: []
          })
          return undefined
        }

        const layout = buildTaskLayout(role)
        this.setData({
          viewState: 'bound',
          role,
          staffName: (data && data.name) || '',
          roleText: ROLE_TEXT[role] || role,
          primaryTask: layout.primary,
          frequentTasks: layout.frequent,
          manageTasks: layout.manage
        })
        return role === 'admin' ? this.loadDashboard(sequence) : undefined
      })
      .catch(() => {
        if (sequence !== requestSequence) return undefined
        this.setData({
          viewState: 'error',
          role: null,
          dashboardLoading: false
        })
        return undefined
      })
  },

  loadDashboard(sequence) {
    const range = todayRange()
    this.setData({
      dashboard: emptyDashboard(),
      dashboardLoading: true,
      dashboardError: false
    })
    return Promise.allSettled([
      request.call('adminOperationsLedger', {
        action: 'summary',
        from: range.from,
        to: range.to
      }),
      request.call('invoiceService', { action: 'staffSummary' })
    ]).then((results) => {
      if (sequence !== requestSequence || this.data.role !== 'admin') return
      const dashboard = emptyDashboard()
      const ledgerResult = results[0]
      const invoiceResult = results[1]

      if (ledgerResult.status === 'fulfilled') {
        const ledger = ledgerResult.value || {}
        const finance = ledger.finance || {}
        const operations = ledger.operations || {}
        const anomalies = ledger.anomalies || {}
        dashboard.actualNetIncomeText = fenText(finance.actualNetIncome)
        dashboard.admittedPeopleCount = Number(operations.admittedPeopleCount) || 0
        dashboard.verifiedTicketCount = Number(
          operations.verifiedTicketCount != null
            ? operations.verifiedTicketCount
            : operations.ticketVerifiedCount
        ) || 0
        dashboard.anomalyCount = Number(anomalies.total != null
          ? anomalies.total
          : finance.anomalyCount) || 0
      }
      if (invoiceResult.status === 'fulfilled') {
        dashboard.pendingInvoiceCount = Number(
          invoiceResult.value && invoiceResult.value.pendingCount
        ) || 0
      }

      this.setData({
        dashboard,
        dashboardLoading: false,
        dashboardError: results.some((item) => item.status === 'rejected')
      })
    })
  },

  onRetry() {
    return this.check()
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  bind() {
    const { name, phone, inviteCode } = this.data.form
    if (!name || !phone || !inviteCode) {
      wx.showToast({ title: '请填写姓名、手机号和口令', icon: 'none' })
      return Promise.resolve()
    }
    return request.callWithLoading('bindStaff', { name, phone, inviteCode }, '提交中')
      .then(() => {
        wx.showToast({ title: '登记成功', icon: 'success' })
        return this.check()
      })
      .catch((err) => wx.showToast({ title: err.message || '登记失败', icon: 'none' }))
  },

  onTaskTap(e) {
    const route = e.currentTarget && e.currentTarget.dataset.route
    if (!route) return
    haptic('light')
    wx.navigateTo({ url: route })
  },

  // 兼容既有入口与自动化测试，页面统一使用 onTaskTap。
  goOperations() {
    this.onTaskTap({ currentTarget: { dataset: { route: TASKS.operations.route } } })
  },

  goInvoices() {
    this.onTaskTap({ currentTarget: { dataset: { route: TASKS.invoices.route } } })
  }
}

if (typeof Page === 'function') Page(pageConfig)

module.exports = {
  TASKS,
  ROLE_LAYOUT,
  buildTaskLayout,
  todayRange,
  emptyDashboard,
  pageConfig
}
