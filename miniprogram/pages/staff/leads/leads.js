// 员工端 · 线索跟进（功能扩展 Task 12）
// PRD §12.4：首版只做列表、状态、备注、下次跟进时间，不建 CRM。
const request = require('../../../utils/request.js')
const { haptic } = require('../../../utils/haptics.js')
const { makePhoneCall } = require('../../../utils/util.js')

const HANDLE_ROLES = ['front', 'admin']

const FILTERS = [
  { key: '', title: '全部' },
  { key: 'new', title: '新线索' },
  { key: 'contacted', title: '已联系' },
  { key: 'qualified', title: '已确认意向' },
  { key: 'proposal', title: '已报方案' },
  { key: 'won', title: '已成交' }
]

// 与云端 lead-flow.js 的 TRANSITIONS 保持一致
const NEXT_STATUS = {
  new: ['contacted', 'closed'],
  contacted: ['qualified', 'lost', 'closed'],
  qualified: ['proposal', 'lost', 'closed'],
  proposal: ['won', 'lost', 'closed'],
  won: [], lost: [], closed: []
}

const STATUS_TEXT = {
  new: '新线索', contacted: '已联系', qualified: '已确认意向',
  proposal: '已报方案', won: '已成交', lost: '已流失', closed: '已关闭'
}

const TYPE_TEXT = { birthday: '生日宴请', team_building: '公司团建', brand: '品牌合作' }

Page({
  data: {
    checked: false,
    allowed: false,
    isAdmin: false,
    staffName: '',
    filters: FILTERS,
    status: '',
    list: [],
    loading: false,
    statusText: STATUS_TEXT,
    typeText: TYPE_TEXT,
    // 编辑面板
    activeLead: null,
    nextOptions: [],
    editStatus: '',
    editNote: '',
    editNextFollow: '',
    saving: false
  },

  onShow() {
    return this.checkPermission().then(() => {
      if (this.data.allowed) return this.loadLeads()
    })
  },

  onPullDownRefresh() {
    return this.loadLeads().then(() => wx.stopPullDownRefresh())
  },

  checkPermission() {
    return request.call('checkStaff', {})
      .then((d) => {
        const role = (d && d.role) || null
        this.setData({
          checked: true,
          allowed: HANDLE_ROLES.indexOf(role) >= 0,
          isAdmin: role === 'admin',
          staffName: (d && d.name) || ''
        })
      })
      .catch(() => this.setData({ checked: true, allowed: false }))
  },

  loadLeads() {
    this.setData({ loading: true })
    return request.call('listAssignedLeads', { status: this.data.status })
      .then((d) => {
        this.setData({
          list: (d && d.list) || [],
          isAdmin: !!(d && d.isAdmin),
          loading: false
        })
      })
      .catch(() => this.setData({ loading: false, list: [] }))
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key || ''
    haptic('light')
    this.setData({ status: key })
    return this.loadLeads()
  },

  onLeadTap(e) {
    const id = e.currentTarget.dataset.id
    const lead = this.data.list.filter((l) => l.leadId === id)[0]
    if (!lead) return
    haptic('light')
    this.setData({
      activeLead: lead,
      nextOptions: (NEXT_STATUS[lead.status] || []).map((s) => ({ key: s, title: STATUS_TEXT[s] || s })),
      editStatus: '',
      editNote: '',
      editNextFollow: ''
    })
  },

  // 面板内部点击不穿透到遮罩
  noop() {},

  closePanel() {
    this.setData({ activeLead: null, editStatus: '', editNote: '', editNextFollow: '' })
  },

  onStatusPick(e) {
    this.setData({ editStatus: e.currentTarget.dataset.key })
  },

  onNoteInput(e) { this.setData({ editNote: e.detail.value }) },
  onFollowChange(e) { this.setData({ editNextFollow: e.detail.value }) },

  onCall(e) {
    const phone = e.currentTarget.dataset.phone
    if (!phone || phone.indexOf('*') >= 0) {
      wx.showToast({ title: '该线索由其他同事负责', icon: 'none' })
      return
    }
    makePhoneCall(phone)
  },

  onSaveUpdate() {
    if (this.data.saving) return Promise.resolve()
    const lead = this.data.activeLead
    if (!lead) return Promise.resolve()
    if (!this.data.editStatus && !String(this.data.editNote).trim() && !this.data.editNextFollow) {
      wx.showToast({ title: '请选择状态或填写备注', icon: 'none' })
      return Promise.resolve()
    }

    this.setData({ saving: true })
    return request.call('updateServiceLead', {
      leadId: lead.leadId,
      status: this.data.editStatus,
      note: this.data.editNote,
      nextFollowAt: this.data.editNextFollow
    })
      .then(() => {
        haptic('medium')
        wx.showToast({ title: '已更新', icon: 'success' })
        this.setData({ saving: false, activeLead: null, editStatus: '', editNote: '', editNextFollow: '' })
        return this.loadLeads()
      })
      .catch((err) => {
        // 失败保留编辑内容，可直接重试
        this.setData({ saving: false })
        wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' })
      })
  }
})
