// 首页状态驱动逻辑（阶段4）
// 取消「已到园」（无法从数据可靠判定）；只用确定信号：交易记录 / 未使用票 / 预约 / 会员 / 已核销
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const { resolveHomeState } = require(path.join(projectRoot, 'miniprogram/utils/home-state.js'))

test('从没交易的新客：显示卖点、购票主行动与新客福利，无顶部快捷条', () => {
  const s = resolveHomeState({ unusedTicketCount: 0, upcomingReservation: null, isMember: false, usedTicketCount: 0, hasAnyOrder: false })
  assert.equal(s.stage, 'first')
  assert.equal(s.quickBar, null)
  assert.equal(s.showNewbieWelfare, true)
  assert.equal(s.showMemberPromo, true)
})

test('有未使用门票：顶部快捷条优先指向入园码', () => {
  const s = resolveHomeState({ unusedTicketCount: 2, upcomingReservation: null, isMember: false, hasAnyOrder: true })
  assert.ok(s.quickBar)
  assert.equal(s.quickBar.type, 'ticket')
  assert.match(s.quickBar.text, /2/)
  assert.equal(s.quickBar.route, '/pages/ticket/wallet/wallet')
  assert.equal(s.stage, 'active')
  assert.equal(s.showNewbieWelfare, false, '已交易不再是新客')
})

test('有票又有预约时，入园码优先于预约（用户马上要入园）', () => {
  const s = resolveHomeState({
    unusedTicketCount: 1,
    upcomingReservation: { reservationId: 'r1', visitDate: '2026-08-09', partySize: 12 },
    isMember: false, hasAnyOrder: true
  })
  assert.equal(s.quickBar.type, 'ticket')
})

test('只有预约没有票：快捷条指向预约详情', () => {
  const s = resolveHomeState({
    unusedTicketCount: 0,
    upcomingReservation: { reservationId: 'r1', visitDate: '2026-08-09', partySize: 12 },
    isMember: false, hasAnyOrder: true
  })
  assert.equal(s.quickBar.type, 'reservation')
  assert.equal(s.quickBar.route, '/pages/reservation/detail/detail')
  assert.equal(s.quickBar.param, 'r1')
})

test('会员：隐藏开卡推广，标记会员态', () => {
  const s = resolveHomeState({ unusedTicketCount: 0, upcomingReservation: null, isMember: true, hasAnyOrder: true })
  assert.equal(s.isMember, true)
  assert.equal(s.showMemberPromo, false, '已是会员不再推开卡')
  assert.equal(s.showNewbieWelfare, false)
  assert.equal(s.stage, 'member')
})

test('老客（有已核销票但当前无未使用票）：进入复购态', () => {
  const s = resolveHomeState({ unusedTicketCount: 0, upcomingReservation: null, isMember: false, usedTicketCount: 3, hasAnyOrder: true })
  assert.equal(s.stage, 'returning')
  assert.equal(s.showNewbieWelfare, false)
  assert.equal(s.showMemberPromo, true, '非会员老客仍可推会员')
})

test('空 summary 安全降级为新客态', () => {
  const s = resolveHomeState(null)
  assert.equal(s.stage, 'first')
  assert.equal(s.quickBar, null)
})

test('会员即使有票，也不显示新客福利', () => {
  const s = resolveHomeState({ unusedTicketCount: 2, isMember: true, hasAnyOrder: true })
  assert.equal(s.showNewbieWelfare, false)
  assert.equal(s.quickBar.type, 'ticket', '会员有票仍优先入园码')
})

test('新客福利文案不承诺未经确认的具体权益', () => {
  const { NEWBIE_WELFARE } = require(path.join(projectRoot, 'miniprogram/utils/home-state.js'))
  const text = JSON.stringify(NEWBIE_WELFARE)
  for (const w of ['必得', '100%', '免费送', '稳赚', '抽奖']) {
    assert.equal(text.includes(w), false, '不得出现夸大承诺：' + w)
  }
  assert.ok(NEWBIE_WELFARE.title)
  assert.ok(NEWBIE_WELFARE.route)
})
