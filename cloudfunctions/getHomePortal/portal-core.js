// getHomePortal 的纯逻辑（不依赖 wx-server-sdk，便于本地 node --test）
// 依据 PRD §7.2 模块顺序、§7.3 首页配置、§17.1 home_configs

// 兜底模块：云端 home_configs 为空或读取失败时使用，保证首页不白屏。
// ⚠️ 必须与 cloudfunctions/seedPortalContent/seed-data.js 的 DEFAULT_SECTIONS 保持一致
// （云函数各自独立打包无法共享文件，一致性由 tests/feature-expansion/portal-cloud.test.js 锁定）。
const DEFAULT_SECTIONS = [
  { key: 'hero', type: 'hero', title: '森水长河', subtitle: '峡谷溯溪 · 山野露营 · 长河令江湖', imageFileId: '', route: '', params: {}, visible: true, sort: 10 },
  // 园区介绍 / 精彩活动直接跳公众号与视频号，不再进二级列表（业主 2026-07-26）
  { key: 'quick_park_intro', type: 'quick_entry', title: '园区介绍', subtitle: '图文详解', route: 'external:article', params: { url: 'https://mp.weixin.qq.com/s/hQGfn7c55rXqPVuXWhLgNQ', title: '园区介绍' }, visible: true, sort: 20 },
  { key: 'quick_activities', type: 'quick_entry', title: '精彩活动', subtitle: '视频号直击', route: 'external:channels', params: {}, visible: true, sort: 30 },
  { key: 'quick_guide', type: 'quick_entry', title: '入园攻略', subtitle: '交通与装备', route: '/pages/guide/guide', params: {}, visible: true, sort: 40 },
  { key: 'quick_concierge', type: 'quick_entry', title: '管家服务', subtitle: '有人对接', route: '/pages/concierge/concierge', params: {}, visible: true, sort: 50 },
  { key: 'ticket_entry', type: 'primary_action', title: '门票购买', subtitle: '在线选票 · 入园扫码', route: '/pages/ticket/ticket', params: {}, visible: true, sort: 60 },
  { key: 'reservation_entry', type: 'primary_action', title: '立即预约', subtitle: '团队到园 · 研学 · 亲友聚会', route: '/pages/reservation/entry/entry', params: {}, visible: true, sort: 70 },
  { key: 'upgrade_entry', type: 'primary_action', title: '补差价升级', subtitle: '单项票升套票 · 现场办理', route: '/pages/upgrade-info/upgrade-info', params: {}, visible: true, sort: 75 },
  { key: 'user_status', type: 'user_status', title: '我的行程', subtitle: '未使用门票与即将到来的预约', route: '', params: {}, visible: true, sort: 80 },
  { key: 'service_birthday', type: 'service_card', title: '生日宴请', subtitle: '在山水间过一个生日', route: '/pages/service/detail/detail', params: { type: 'birthday' }, visible: true, sort: 90 },
  { key: 'service_teambuilding', type: 'service_card', title: '公司团建', subtitle: '定制行程与场地', route: '/pages/service/detail/detail', params: { type: 'teambuilding' }, visible: true, sort: 100 },
  { key: 'service_brand', type: 'service_card', title: '品牌合作', subtitle: '场地拍摄与联名活动', route: '/pages/service/detail/detail', params: { type: 'brand' }, visible: true, sort: 110 },
  { key: 'member_entry', type: 'member', title: '森水会员卡 · 长河令', subtitle: '9.9 元开卡 · 1000 长河令 + 生日 85 折', route: '/pages/member/detail/detail', params: {}, visible: true, sort: 120 },
  { key: 'today_activities', type: 'activities', title: '今日活动', subtitle: '', route: '', params: {}, visible: true, sort: 130 },
  { key: 'park_map', type: 'map', title: '园区地图', subtitle: '营地图 · 溪降图', route: '', params: {}, visible: true, sort: 140 },
  { key: 'footer', type: 'footer', title: '联系与帮助', subtitle: '客服电话 · 协议与政策', route: '', params: {}, visible: true, sort: 150 }
]

// 预约摘要只认这两个状态（与 miniprogram/utils/domain.js 的 VISIT_RESERVATION_STATUS 对齐）
const ACTIVE_RESERVATION_STATUS = ['pending', 'confirmed']
const EMPTY_SUMMARY = { unusedTicketCount: 0, usedTicketCount: 0, isMember: false, hasAnyOrder: false, upcomingReservation: null }

function toTime(value) {
  if (value === null || value === undefined || value === '') return null
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return isNaN(t) ? null : t
}

// 日期串（YYYY-MM-DD）按当天 23:59:59 判断是否过期，避免当天预约被提前隐藏
function endOfDay(value) {
  const t = toTime(value)
  if (t === null) return null
  const d = new Date(t)
  if (typeof value === 'string' && value.length <= 10) {
    return t + 24 * 3600 * 1000 - 1
  }
  return d.getTime()
}

function isWithinWindow(section, nowTs) {
  const starts = toTime(section.startsAt)
  const ends = toTime(section.endsAt)
  if (starts !== null && nowTs < starts) return false
  if (ends !== null && nowTs >= ends) return false
  return true
}

/**
 * 过滤出当前可见的首页模块并按 sort 升序返回（不修改入参）。
 */
function filterSections(sections, now) {
  const nowTs = toTime(now) || Date.now()
  const list = Array.isArray(sections) ? sections : []
  return list
    .filter((s) => s && s.visible !== false && isWithinWindow(s, nowTs))
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
}

/**
 * 首页用户状态卡摘要。
 * 二次按 _openid 过滤：即使查询条件写错也不会把别人的票券/预约带到首页。
 */
function buildUserSummary(input) {
  const src = input || {}
  const openid = src.openid
  if (!openid) return Object.assign({}, EMPTY_SUMMARY)
  const nowTs = toTime(src.now) || Date.now()

  const ownTickets = (Array.isArray(src.tickets) ? src.tickets : []).filter((t) => t && t._openid === openid)
  const unused = ownTickets.filter((t) => t.status === 'unused')
  const used = ownTickets.filter((t) => t.status === 'used')

  const reservations = (Array.isArray(src.reservations) ? src.reservations : [])
    .filter((r) => r && r._openid === openid && ACTIVE_RESERVATION_STATUS.indexOf(r.status) >= 0)
    .filter((r) => {
      const end = endOfDay(r.visitDate)
      return end === null || end >= nowTs
    })
    .sort((a, b) => (toTime(a.visitDate) || 0) - (toTime(b.visitDate) || 0))

  const next = reservations[0]
  return {
    unusedTicketCount: unused.length,
    usedTicketCount: used.length,
    // 首页状态驱动用：是否会员、是否有过任何交易（新客判定）
    isMember: !!src.isMember,
    hasAnyOrder: !!src.hasAnyOrder || ownTickets.length > 0 || !!src.isMember || reservations.length > 0,
    upcomingReservation: next
      ? {
        reservationId: next._id || '',
        type: next.type || '',
        visitDate: next.visitDate || '',
        timeSlot: next.timeSlot || '',
        partySize: next.partySize || 0,
        status: next.status
      }
      : null
  }
}

/**
 * 组装首页返回体。任何一块数据缺失都只降级该块，不让整页失败。
 */
function buildPortalData(input, now) {
  const src = input || {}
  const sections = filterSections(src.sections, now)
  return {
    notice: src.notice || null,
    sections: sections.length ? sections : filterSections(DEFAULT_SECTIONS, now),
    activities: Array.isArray(src.activities) ? src.activities : [],
    maps: src.maps || { camp: '', creek: '' },
    userSummary: src.summary || Object.assign({}, EMPTY_SUMMARY)
  }
}

module.exports = {
  DEFAULT_SECTIONS,
  EMPTY_SUMMARY,
  filterSections,
  buildUserSummary,
  buildPortalData
}
