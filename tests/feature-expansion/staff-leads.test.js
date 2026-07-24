// Task 12 员工线索跟进
// PRD §12.4 线索状态机、敏感字段可见性、状态变化留痕
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const core = require(path.join(projectRoot, 'cloudfunctions/updateServiceLead/lead-flow.js'))
const leadsPath = path.join(projectRoot, 'miniprogram/pages/staff/leads/leads.js')
const requestPath = path.join(projectRoot, 'miniprogram/utils/request.js')
const hapticsPath = path.join(projectRoot, 'miniprogram/utils/haptics.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mountPage(t, pagePath, options = {}) {
  const originalPage = global.Page
  const originalWx = global.wx
  const originals = {}
  const calls = { request: [], toast: [], phone: [], modal: [] }
  let pageConfig

  const stub = (p, exports) => {
    originals[p] = require.cache[p]
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }

  const requestImpl = {
    call(name, data) {
      calls.request.push({ name, data })
      const responder = options.responders && options.responders[name]
      if (typeof responder === 'function') return responder(data, calls.request.filter((c) => c.name === name).length)
      if (responder) return Promise.resolve(responder)
      return Promise.reject(new Error('no responder: ' + name))
    }
  }
  requestImpl.callWithLoading = (name, data) => requestImpl.call(name, data)
  stub(requestPath, requestImpl)
  stub(hapticsPath, { haptic() {} })

  global.wx = {
    navigateTo() {}, showToast(o) { calls.toast.push(o) },
    showModal(o) { calls.modal.push(o); if (o.success) o.success({ confirm: true }) },
    showLoading() {}, hideLoading() {},
    makePhoneCall(o) { calls.phone.push(o.phoneNumber) },
    setClipboardData(o) { if (o.success) o.success() },
    stopPullDownRefresh() {}, setNavigationBarTitle() {},
    getStorageSync() { return null }, setStorageSync() {}
  }
  global.Page = (config) => { pageConfig = config }

  delete require.cache[pagePath]
  require(pagePath)

  const page = Object.assign({}, pageConfig, {
    data: clone(pageConfig.data),
    setData(patch) { Object.assign(this.data, patch) }
  })

  t.after(() => {
    if (typeof page.onUnload === 'function') page.onUnload()
    delete require.cache[pagePath]
    Object.keys(originals).forEach((p) => {
      if (originals[p]) require.cache[p] = originals[p]
      else delete require.cache[p]
    })
    global.Page = originalPage
    global.wx = originalWx
  })

  return { page, calls }
}

// ============ 权限 ============

test('只有前台/管理员可以处理线索', () => {
  assert.equal(core.canHandle(null).ok, false)
  assert.equal(core.canHandle({ status: 'pending', role: 'admin' }).ok, false, '未审批不可处理')
  assert.equal(core.canHandle({ status: 'approved', role: 'creek' }).ok, false, '检票角色不处理线索')
  assert.equal(core.canHandle({ status: 'approved', role: 'bar' }).ok, false)
  assert.equal(core.canHandle({ status: 'approved', role: 'front' }).ok, true)
  assert.equal(core.canHandle({ status: 'approved', role: 'admin' }).ok, true)
})

test('普通员工只看到分配给自己的线索，管理员看全部', () => {
  const leads = [
    { _id: 'a', assigneeOpenid: 'staff-1' },
    { _id: 'b', assigneeOpenid: 'staff-2' },
    { _id: 'c', assigneeOpenid: '' }
  ]
  const mine = core.filterVisible(leads, { _openid: 'staff-1', role: 'front' })
  assert.deepEqual(mine.map((l) => l._id), ['a', 'c'], '本人的 + 未分配的')

  const all = core.filterVisible(leads, { _openid: 'staff-9', role: 'admin' })
  assert.equal(all.length, 3, '管理员可见全部')
})

test('非管理员看不到他人线索的联系方式', () => {
  const lead = { _id: 'b', assigneeOpenid: 'staff-2', contactName: '李四', contactPhone: '13800138000', remark: '内部备注' }
  const masked = core.maskForStaff(lead, { _openid: 'staff-1', role: 'front' })
  assert.equal(masked.contactPhone.includes('****'), true, '非负责人应看到脱敏手机号')

  const own = core.maskForStaff(Object.assign({}, lead, { assigneeOpenid: 'staff-1' }), { _openid: 'staff-1', role: 'front' })
  assert.equal(own.contactPhone, '13800138000', '负责人可见完整手机号')

  const admin = core.maskForStaff(lead, { _openid: 'staff-9', role: 'admin' })
  assert.equal(admin.contactPhone, '13800138000', '管理员可见完整手机号')
})

// ============ 状态机 ============

test('状态流转必须符合状态机', () => {
  assert.equal(core.canTransit('new', 'contacted').ok, true)
  assert.equal(core.canTransit('contacted', 'qualified').ok, true)
  assert.equal(core.canTransit('qualified', 'proposal').ok, true)
  assert.equal(core.canTransit('proposal', 'won').ok, true)
  assert.equal(core.canTransit('proposal', 'lost').ok, true)
})

test('不允许跨阶段跳跃或状态回退', () => {
  assert.equal(core.canTransit('new', 'won').ok, false, '不能从新线索直接标成交')
  assert.equal(core.canTransit('contacted', 'new').ok, false, '不能回退')
})

test('终态不可再变更', () => {
  for (const s of ['won', 'lost', 'closed']) {
    assert.equal(core.canTransit(s, 'contacted').ok, false, s + ' 是终态')
  }
})

test('任何阶段都可以直接关闭', () => {
  assert.equal(core.canTransit('new', 'closed').ok, true)
  assert.equal(core.canTransit('proposal', 'closed').ok, true)
})

test('非法状态值被拒绝', () => {
  assert.equal(core.canTransit('new', 'deleted').ok, false)
  assert.equal(core.canTransit('nonsense', 'contacted').ok, false)
})

// ============ 留痕 ============

test('每次变更都记录操作人、时间与备注', () => {
  const entry = core.buildHistoryEntry(
    { status: 'new' }, 'contacted', '电话已接通，客户在比价',
    { _openid: 'staff-1', name: '小王' }, new Date('2026-08-01T10:00:00+08:00')
  )
  assert.equal(entry.from, 'new')
  assert.equal(entry.to, 'contacted')
  assert.equal(entry.note, '电话已接通，客户在比价')
  assert.equal(entry.byOpenid, 'staff-1')
  assert.equal(entry.byName, '小王')
  assert.ok(entry.at)
})

test('只改备注不改状态时也留痕', () => {
  const entry = core.buildHistoryEntry({ status: 'contacted' }, '', '补充：客户要求周末场地',
    { _openid: 'staff-1', name: '小王' }, new Date())
  assert.equal(entry.from, 'contacted')
  assert.equal(entry.to, 'contacted', '状态未变时 to 等于 from')
  assert.ok(entry.note)
})

test('构造更新补丁时不允许客户端改动敏感字段', () => {
  const patch = core.buildUpdate(
    { status: 'new' },
    { status: 'contacted', note: '已联系', nextFollowAt: '2026-08-05', contactPhone: '19900000000', _openid: 'hacker' },
    { _openid: 'staff-1', name: '小王' },
    new Date()
  )
  assert.equal(patch.status, 'contacted')
  assert.equal(patch.contactPhone, undefined, '不得通过更新接口改联系人手机号')
  assert.equal(patch._openid, undefined, '不得改归属用户')
  assert.ok(patch.nextFollowAt)
  assert.ok(Array.isArray(patch.history) || patch.history)
})

// ============ 员工线索页 ============

const LEADS = [
  { leadId: 'l1', type: 'birthday', status: 'new', contactName: '张三', contactPhone: '138****8000', createdAt: '2026-08-01' },
  { leadId: 'l2', type: 'brand', status: 'contacted', contactName: '李四', contactPhone: '139****9000', createdAt: '2026-08-02' }
]

test('无权限员工看不到线索列表', async (t) => {
  const { page } = mountPage(t, leadsPath, {
    responders: { checkStaff: () => Promise.resolve({ role: 'creek' }) }
  })
  await page.onShow()
  assert.equal(page.data.allowed, false)
  assert.equal(page.data.list.length, 0)
})

test('有权限时加载线索并可按状态筛选', async (t) => {
  const { page, calls } = mountPage(t, leadsPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'front', name: '小王' }),
      listAssignedLeads: (d) => Promise.resolve({
        list: d.status ? LEADS.filter((l) => l.status === d.status) : LEADS
      })
    }
  })
  await page.onShow()
  assert.equal(page.data.allowed, true)
  assert.equal(page.data.list.length, 2)

  await page.onFilterTap({ currentTarget: { dataset: { key: 'contacted' } } })
  assert.equal(page.data.status, 'contacted')
  assert.equal(page.data.list.length, 1)
})

test('更新状态时把备注和下次跟进时间一起提交', async (t) => {
  const { page, calls } = mountPage(t, leadsPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'front', name: '小王' }),
      listAssignedLeads: () => Promise.resolve({ list: LEADS }),
      updateServiceLead: () => Promise.resolve({ status: 'contacted' })
    }
  })
  await page.onShow()
  page.onLeadTap({ currentTarget: { dataset: { id: 'l1' } } })
  page.setData({ editStatus: 'contacted', editNote: '已电话联系', editNextFollow: '2026-08-05' })
  await page.onSaveUpdate()

  const req = calls.request.filter((c) => c.name === 'updateServiceLead')[0]
  assert.ok(req)
  assert.equal(req.data.leadId, 'l1')
  assert.equal(req.data.status, 'contacted')
  assert.equal(req.data.note, '已电话联系')
  assert.equal(req.data.nextFollowAt, '2026-08-05')
})

test('未选状态且无备注时不提交空更新', async (t) => {
  const { page, calls } = mountPage(t, leadsPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'front', name: '小王' }),
      listAssignedLeads: () => Promise.resolve({ list: LEADS })
    }
  })
  await page.onShow()
  page.onLeadTap({ currentTarget: { dataset: { id: 'l1' } } })
  page.setData({ editStatus: '', editNote: '' })
  await page.onSaveUpdate()
  assert.equal(calls.request.filter((c) => c.name === 'updateServiceLead').length, 0)
  assert.ok(calls.toast.length > 0)
})

test('可直接拨打线索联系人电话', async (t) => {
  const { page, calls } = mountPage(t, leadsPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'front', name: '小王' }),
      listAssignedLeads: () => Promise.resolve({
        list: [Object.assign({}, LEADS[0], { contactPhone: '13800138000' })]
      })
    }
  })
  await page.onShow()
  page.onCall({ currentTarget: { dataset: { phone: '13800138000' } } })
  assert.deepEqual(calls.phone, ['13800138000'])
})

test('保存失败不清空编辑内容，可重试', async (t) => {
  let times = 0
  const { page } = mountPage(t, leadsPath, {
    responders: {
      checkStaff: () => Promise.resolve({ role: 'front', name: '小王' }),
      listAssignedLeads: () => Promise.resolve({ list: LEADS }),
      updateServiceLead: () => {
        times += 1
        return times === 1 ? Promise.reject(new Error('网络异常')) : Promise.resolve({ status: 'contacted' })
      }
    }
  })
  await page.onShow()
  page.onLeadTap({ currentTarget: { dataset: { id: 'l1' } } })
  page.setData({ editStatus: 'contacted', editNote: '已联系' })
  await page.onSaveUpdate()
  assert.equal(page.data.editNote, '已联系', '失败后保留输入')
  assert.equal(page.data.saving, false)

  await page.onSaveUpdate()
  assert.equal(page.data.activeLead, null, '成功后关闭编辑面板')
})
