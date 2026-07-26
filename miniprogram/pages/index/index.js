// 首页 · 游客服务门户（T05 / T25 Vibe UI / 功能扩展 Task 3）
// 模块顺序、可配置性与降级策略见 PRD §7。
// 数据链路：getHomePortal（新）→ getHomeData（旧，兼容未部署新函数的环境）→ 本地默认配置。
const request = require('../../utils/request.js')
const env = require('../../env.js')
const externalLink = require('../../utils/external-link.js')
const { haptic } = require('../../utils/haptics.js')
const { makePhoneCall } = require('../../utils/util.js')
const { resolveHomeState } = require('../../utils/home-state.js')

// 本地默认门户配置：弱网、云函数未部署或云端无配置时使用，保证首页永不白屏。
// ⚠️ key 与 sort 必须与 cloudfunctions/seedPortalContent/seed-data.js 的 DEFAULT_SECTIONS 对应。
const LOCAL_SECTIONS = [
  { key: 'hero', type: 'hero', title: '森水长河', subtitle: '峡谷溯溪 · 山野露营 · 长河令江湖', route: '', params: {}, visible: true, sort: 10 },
  // 园区介绍 / 精彩活动直接跳公众号文章与视频号，不再进二级列表（业主 2026-07-26）
  { key: 'quick_park_intro', type: 'quick_entry', title: '园区介绍', subtitle: '图文详解', route: 'external:article', params: { url: env.links.parkIntroArticle, title: '园区介绍' }, visible: true, sort: 20 },
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
  { key: 'today_activities', type: 'activities', title: '今日江湖事', subtitle: '', route: '', params: {}, visible: true, sort: 130 },
  { key: 'park_map', type: 'map', title: '园区地图', subtitle: '营地图 · 溪降图', route: '', params: {}, visible: true, sort: 140 },
  { key: 'footer', type: 'footer', title: '联系与帮助', subtitle: '客服电话 · 协议与政策', route: '', params: {}, visible: true, sort: 150 }
]

// 图标由前端按 key 映射（云端配置只管文案与跳转，换图不必改数据库）
const SECTION_ICONS = {
  quick_park_intro: '/assets/icons/forest/map-info.png',
  quick_activities: '/assets/icons/forest/home-activity.png',
  quick_guide: '/assets/icons/forest/map-route.png',
  quick_concierge: '/assets/icons/forest/customer-service.png',
  ticket_entry: '/assets/icons/forest/home-ticket.png',
  reservation_entry: '/assets/icons/forest/home-reservation.png',
  upgrade_entry: '/assets/icons/forest/home-upgrade.png',
  service_birthday: '/assets/icons/forest/activity-reward.png',
  service_teambuilding: '/assets/icons/forest/booking-people.png',
  service_brand: '/assets/icons/forest/activity-badge.png',
  member_entry: '/assets/icons/forest/home-member.png'
}

// 三大主行动的层级（业主反馈：不用特别标识，靠排版体现轻重缓急）
// 三张卡统一白底，只用「方卡网格 + 标题色」拉开主次
const ACTION_STYLE = {
  ticket_entry: { level: 'primary' },
  reservation_entry: { level: 'secondary' },
  upgrade_entry: { level: 'secondary' }
}
// 云端新增未知主行动时按次卡渲染，保证不会出现没有层级定义的卡片
const ACTION_STYLE_FALLBACK = { level: 'secondary' }

// 网格跨度：两列排布，落单的最后一张通栏，永远不留半个空位。
// 3 张 → 方/方/通栏；4 张 → 全方卡；1 张 → 通栏。数量随云端配置变也不会塌。
function actionSpan(index, total) {
  return (total % 2 === 1 && index === total - 1) ? 'full' : 'half'
}

// tabBar 页必须用 switchTab，navigateTo 会直接失败
const TAB_PAGES = ['/pages/index/index', '/pages/park/park', '/pages/ling/ling', '/pages/mine/mine']
const FALLBACK_NOTICE = '欢迎来到森水长河 · 入园即入江湖'
const EMPTY_SUMMARY = { unusedTicketCount: 0, upcomingReservation: null }

// 内容迁移映射（业主 2026-07-26）
// 园区介绍与精彩活动的内容已经搬到公众号和视频号，站内二级列表页对这两个分类
// 不再有内容。但云端 home_configs 存的仍是旧 route，而云端配置会整体覆盖本地
// 兜底（见 applyPortal），所以这里按 key 重定向一次，不必等云端配置同步。
//
// 只接管仍指向站内内容列表页的旧配置：云端一旦改成别的（含同步后的外链）就
// 尊重云端。这条映射是幂等的，云端同步完成后删掉即可。
const CONTENT_MIGRATED = {
  quick_park_intro: {
    route: externalLink.ARTICLE,
    params: { url: env.links.parkIntroArticle, title: '园区介绍' },
    subtitle: '图文详解'
  },
  quick_activities: {
    route: externalLink.CHANNELS,
    params: {},
    subtitle: '视频号直击'
  }
}
const MIGRATED_FROM = '/pages/content/list/list'

function migrateSection(section) {
  const next = CONTENT_MIGRATED[section.key]
  if (!next) return section
  if (section.route && section.route.indexOf(MIGRATED_FROM) !== 0) return section
  return Object.assign({}, section, next)
}

// 把扁平的 sections 配置分组成页面可直接渲染的结构
function groupSections(sections) {
  const list = (Array.isArray(sections) ? sections : [])
    .filter((s) => s && s.visible !== false)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map(migrateSection)
    .map((s) => Object.assign({}, s, { params: s.params || {}, icon: SECTION_ICONS[s.key] || '' }))

  const byType = (type) => list.filter((s) => s.type === type)
  const sectionMap = {}
  list.forEach((s) => { sectionMap[s.key] = s })

  // 主行动附加视觉标识；云端下发的也会被补齐，避免缺样式
  const actionList = byType('primary_action')
  const primaryActions = actionList.map((s, i) => Object.assign(
    {}, s, ACTION_STYLE[s.key] || ACTION_STYLE_FALLBACK,
    { span: actionSpan(i, actionList.length) }
  ))

  return {
    sections: list,
    sectionMap,
    hero: byType('hero')[0] || null,
    quickEntries: byType('quick_entry'),
    primaryActions,
    serviceCards: byType('service_card'),
    memberSection: byType('member')[0] || null,
    footerSection: byType('footer')[0] || null,
    hasUserStatusSection: !!sectionMap.user_status,
    showActivities: byType('activities').length > 0,
    showMap: byType('map').length > 0
  }
}

Page({
  data: Object.assign({
    notice: '',
    userSummary: EMPTY_SUMMARY,
    // 状态驱动（阶段4）
    homeStage: 'first',
    quickBar: null,
    showMemberPromo: true,
    frontPhone: env.frontDeskPhone
  }, groupSections(LOCAL_SECTIONS)),

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData() // 返回首页时刷新票券/预约摘要
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0, theme: 'light' })
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  loadData() {
    return request.call('getHomePortal', {})
      .then((d) => this.applyPortal(d))
      .catch(() => this.loadLegacy()) // 新云函数未部署/异常时不影响使用
  },

  applyPortal(portal) {
    const d = portal || {}
    const noticeText = d.notice && typeof d.notice === 'object' ? d.notice.content : d.notice
    const sections = Array.isArray(d.sections) && d.sections.length ? d.sections : LOCAL_SECTIONS
    const grouped = groupSections(sections)
    const summary = d.userSummary || EMPTY_SUMMARY
    const stateInfo = resolveHomeState(summary)
    this.setData(Object.assign({}, grouped, {
      notice: noticeText || FALLBACK_NOTICE,
      userSummary: summary,
      // 状态驱动：顶部快捷条与会员推广随用户状态变化
      homeStage: stateInfo.stage,
      quickBar: stateInfo.quickBar,
      // 会员卡模块：非会员才推（已是会员则隐藏开卡卡）
      showMemberPromo: stateInfo.showMemberPromo && !!grouped.memberSection
    }))
  },

  // 旧接口降级：只补公告与地图，入口结构用本地默认配置
  loadLegacy() {
    return request.call('getHomeData', {})
      .then((d) => {
        this.setData({ notice: (d && d.notice) || FALLBACK_NOTICE })
      })
      .catch(() => this.setData({ notice: FALLBACK_NOTICE }))
  },

  buildUrl(route, params) {
    const p = params || {}
    const qs = Object.keys(p)
      .filter((k) => p[k] !== undefined && p[k] !== null && p[k] !== '')
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(p[k]))
      .join('&')
    return qs ? route + '?' + qs : route
  },

  // 统一跳转：tab 页走 switchTab，未上线页面给出提示而不是静默失败（PRD §7.4）
  goRoute(route, params) {
    if (!route) return
    haptic('light')
    // 公众号文章 / 视频号不走页面路由
    if (externalLink.open(route, params)) return
    if (TAB_PAGES.indexOf(route) >= 0) {
      wx.switchTab({ url: route })
      return
    }
    wx.navigateTo({
      url: this.buildUrl(route, params),
      fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
    })
  },

  onSectionTap(e) {
    const key = e.currentTarget.dataset.key
    const section = this.data.sectionMap[key]
    if (!section) return
    this.goRoute(section.route, section.params)
  },

  // 状态卡：有票看入园码，有预约看预约详情
  // 顶部快捷条：有票→入园码，有预约→预约详情
  // 会员条来自 sr-park-header 组件的事件
  onMemberTap() {
    const sec = this.data.sectionMap && this.data.sectionMap.member_entry
    haptic('light')
    wx.navigateTo({
      url: (sec && sec.route) || '/pages/member/detail/detail',
      fail: () => wx.showToast({ title: '请稍后重试', icon: 'none' })
    })
  },

  onQuickBar() {
    const q = this.data.quickBar
    if (!q) return
    haptic('light')
    const url = q.param ? q.route + '?id=' + encodeURIComponent(q.param) : q.route
    wx.navigateTo({ url, fail: () => wx.showToast({ title: '请稍后重试', icon: 'none' }) })
  },

  goMyTickets() {
    this.goRoute('/pages/ticket/wallet/wallet', {})
  },

  goMyReservation() {
    const r = this.data.userSummary.upcomingReservation
    if (!r) return
    this.goRoute('/pages/reservation/detail/detail', { id: r.reservationId })
  },

  callFront() {
    makePhoneCall(this.data.frontPhone)
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/legal/privacy/privacy' })
  },

  goAgreement() {
    wx.navigateTo({ url: '/pages/legal/agreement/agreement' })
  },

  onShareAppMessage() {
    return { title: '森水长河 · 你的园区随身向导，9.9 抢森水会员卡', path: '/pages/index/index' }
  },

  onShareTimeline() {
    return { title: '森水长河 · 入园即入江湖' }
  }
})
