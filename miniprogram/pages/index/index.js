// 首页 · 游客服务门户（T05 / T25 Vibe UI / 功能扩展 Task 3）
// 模块顺序、可配置性与降级策略见 PRD §7。
// 数据链路：getHomePortal（新）→ getHomeData（旧，兼容未部署新函数的环境）→ 本地默认配置。
const request = require('../../utils/request.js')
const env = require('../../env.js')
const { haptic } = require('../../utils/haptics.js')
const { makePhoneCall } = require('../../utils/util.js')
const { resolveHomeState, NEWBIE_WELFARE } = require('../../utils/home-state.js')

// 本地默认门户配置：弱网、云函数未部署或云端无配置时使用，保证首页永不白屏。
// ⚠️ key 与 sort 必须与 cloudfunctions/seedPortalContent/seed-data.js 的 DEFAULT_SECTIONS 对应。
const LOCAL_SECTIONS = [
  { key: 'hero', type: 'hero', title: '森水长河', subtitle: '峡谷溯溪 · 山野露营 · 长河令江湖', route: '', params: {}, visible: true, sort: 10 },
  { key: 'quick_park_intro', type: 'quick_entry', title: '园区介绍', subtitle: '一分钟看懂森水长河', route: '/pages/content/list/list', params: { category: 'park_intro' }, visible: true, sort: 20 },
  { key: 'quick_activities', type: 'quick_entry', title: '精彩活动', subtitle: '今日场次与擂台', route: '/pages/content/list/list', params: { category: 'activity_story' }, visible: true, sort: 30 },
  { key: 'quick_guide', type: 'quick_entry', title: '入园攻略', subtitle: '交通 · 装备 · 注意事项', route: '/pages/guide/guide', params: {}, visible: true, sort: 40 },
  { key: 'quick_concierge', type: 'quick_entry', title: '管家服务', subtitle: '到园前后有人对接', route: '/pages/concierge/concierge', params: {}, visible: true, sort: 50 },
  { key: 'ticket_entry', type: 'primary_action', title: '门票购买', subtitle: '在线选票 · 入园扫码', route: '/pages/ticket/ticket', params: {}, visible: true, sort: 60 },
  { key: 'reservation_entry', type: 'primary_action', title: '立即预约', subtitle: '团队到园 · 研学 · 亲友聚会', route: '/pages/reservation/entry/entry', params: {}, visible: true, sort: 70 },
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
  service_birthday: '/assets/icons/forest/activity-reward.png',
  service_teambuilding: '/assets/icons/forest/booking-people.png',
  service_brand: '/assets/icons/forest/activity-badge.png',
  member_entry: '/assets/icons/forest/home-member.png'
}

// tabBar 页必须用 switchTab，navigateTo 会直接失败
const TAB_PAGES = ['/pages/index/index', '/pages/park/park', '/pages/ling/ling', '/pages/mine/mine']
const FALLBACK_NOTICE = '欢迎来到森水长河 · 入园即入江湖'
const EMPTY_SUMMARY = { unusedTicketCount: 0, upcomingReservation: null }

// 营业状态（溪降开放 10:00-16:30，园区当日运营时段）
const OPEN_FROM = 10 * 60
const OPEN_TO = 16 * 60 + 30

function computeOpenStatus(now) {
  const d = now || new Date()
  const mins = d.getHours() * 60 + d.getMinutes()
  if (mins < OPEN_FROM) return { open: false, text: '今日 10:00 开园 · 溪降 10:00-16:30' }
  if (mins <= OPEN_TO) return { open: true, text: '营业中 · 溪降 10:00-16:30' }
  return { open: false, text: '今日已闭园 · 明日 10:00 见' }
}

// 把扁平的 sections 配置分组成页面可直接渲染的结构
function groupSections(sections) {
  const list = (Array.isArray(sections) ? sections : [])
    .filter((s) => s && s.visible !== false)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((s) => Object.assign({}, s, { params: s.params || {}, icon: SECTION_ICONS[s.key] || '' }))

  const byType = (type) => list.filter((s) => s.type === type)
  const sectionMap = {}
  list.forEach((s) => { sectionMap[s.key] = s })

  return {
    sections: list,
    sectionMap,
    hero: byType('hero')[0] || null,
    quickEntries: byType('quick_entry'),
    primaryActions: byType('primary_action'),
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
    showUserStatus: false,
    // 状态驱动（阶段4）
    homeStage: 'first',
    quickBar: null,
    showNewbieWelfare: true,
    showMemberPromo: true,
    newbieWelfare: NEWBIE_WELFARE,
    openStatus: computeOpenStatus(),
    frontPhone: env.frontDeskPhone,
    // 固定日程（旺季）：前端直接控制，不被数据库历史活动覆盖；如需改活动跟我说
    activities: [
      { id: 1, time: '13:00-13:45', name: '侠客滩捕鱼', note: '巡游带客 · 捕鱼' },
      { id: 2, time: '14:20-15:00', name: '侠客打擂乐园', note: '巡游带客 · 打擂台' },
      { id: 3, time: '16:00-16:45', name: '侠客滩捕鱼', note: '巡游带客 · 捕鱼' },
      { id: 4, time: '17:00-17:45', name: '海鲜大拍卖', note: '巡游 · 拍卖' }
    ],
    campMapUrl: '', // 营地游览图云端临时链接（管理员上传后覆盖本地图）
    creekMapUrl: '', // 溪降游览图云端临时链接
    mapViewer: '', // 全屏查看的地图 src（空=关闭）
    mapViewW: 0,
    mapViewH: 0
  }, groupSections(LOCAL_SECTIONS)),

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.setData({ openStatus: computeOpenStatus() })
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
      // 状态驱动：顶部快捷条 + 新客福利 + 会员推广随用户状态变化
      homeStage: stateInfo.stage,
      quickBar: stateInfo.quickBar,
      showNewbieWelfare: stateInfo.showNewbieWelfare,
      // 会员卡模块：非会员才推（已是会员则隐藏开卡卡）
      showMemberPromo: stateInfo.showMemberPromo && !!grouped.memberSection,
      // 无票无预约时状态卡不占位（PRD §7.2）
      showUserStatus: grouped.hasUserStatusSection && (summary.unusedTicketCount > 0 || !!summary.upcomingReservation)
    }))
    // 今日活动沿用前端固定日程，不被数据库历史数据覆盖
    this.loadMaps(d.maps || {})
  },

  // 旧接口降级：只补公告与地图，入口结构用本地默认配置
  loadLegacy() {
    return request.call('getHomeData', {})
      .then((d) => {
        this.setData({ notice: (d && d.notice) || FALLBACK_NOTICE })
        this.loadMaps((d && d.maps) || {})
      })
      .catch(() => this.setData({ notice: FALLBACK_NOTICE }))
  },

  // 地图存云存储 fileID，换成临时链接用于展示与放大预览
  loadMaps(maps) {
    const fileList = [maps.camp, maps.creek].filter(Boolean)
    if (!fileList.length) return
    wx.cloud.getTempFileURL({ fileList })
      .then((res) => {
        const byId = {}
        ;(res.fileList || []).forEach((f) => { byId[f.fileID] = f.tempFileURL })
        this.setData({ campMapUrl: byId[maps.camp] || '', creekMapUrl: byId[maps.creek] || '' })
      })
      .catch(() => {})
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
  goPark() {
    haptic('light')
    wx.switchTab({ url: '/pages/park/park' })
  },

  // 顶部快捷条：有票→入园码，有预约→预约详情
  onQuickBar() {
    const q = this.data.quickBar
    if (!q) return
    haptic('light')
    const url = q.param ? q.route + '?id=' + encodeURIComponent(q.param) : q.route
    wx.navigateTo({ url, fail: () => wx.showToast({ title: '请稍后重试', icon: 'none' }) })
  },

  onNewbieWelfare() {
    haptic('light')
    wx.navigateTo({ url: this.data.newbieWelfare.route, fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' }) })
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

  // 打开全屏地图查看（云端图优先，否则用本地打包图）；支持双指缩放
  openMap(e) {
    const key = e.currentTarget.dataset.key
    const src = key === 'creek'
      ? (this.data.creekMapUrl || '/images/map-creek.jpg')
      : (this.data.campMapUrl || '/images/map-camp.jpg')
    haptic('light')
    const winW = (wx.getWindowInfo && wx.getWindowInfo().windowWidth) || 375
    wx.getImageInfo({
      src,
      success: (info) => {
        const h = Math.round(winW * info.height / info.width)
        this.setData({ mapViewer: src, mapViewW: winW, mapViewH: h })
      },
      fail: () => this.setData({ mapViewer: src, mapViewW: winW, mapViewH: winW })
    })
  },

  closeMapViewer() {
    this.setData({ mapViewer: '', mapViewW: 0, mapViewH: 0 })
  },

  onShareAppMessage() {
    return { title: '森水长河 · 你的园区随身向导，9.9 抢森水会员卡', path: '/pages/index/index' }
  },

  onShareTimeline() {
    return { title: '森水长河 · 入园即入江湖' }
  }
})
