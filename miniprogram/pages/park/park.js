// 园区 Tab —— 园内一站式（Vibe UI v2.0）
// 定位：客人已经在园区（或正赶来）时打开就能用的东西。
// 顺序按园内使用频次排：今日安排 → 地图 → 现场服务 → 到园与求助。
// 品牌信息头已在首页，此处不重复（业主 2026-07-25 反馈）。
const request = require('../../utils/request.js')
const env = require('../../env.js')
const { haptic } = require('../../utils/haptics.js')
const { makePhoneCall } = require('../../utils/util.js')
const { computeOpenStatus } = require('../../utils/park-status.js')

// 园内服务入口
const SERVICES = [
  { key: 'catalog', title: '酒吧 · 小卖部 · 租赁', desc: '价目与配送到营位', icon: 'home-store', route: '/pages/catalog/catalog' },
  { key: 'upgrade', title: '补差价升级', desc: '单项票升套票', icon: 'home-upgrade', route: '/pages/upgrade-info/upgrade-info' },
  { key: 'notice', title: '溪降须知', desc: '开放时间 · 安全须知', icon: 'booking-safety', route: '/pages/creek-notice/creek-notice' },
  { key: 'guide', title: '入园攻略', desc: '交通 · 设施 · 咨询', icon: 'map-route', route: '/pages/guide/guide' }
]

// 固定日程（旺季）；如需改活动跟我说
const SCHEDULE = [
  { id: 1, time: '13:00', name: '侠客滩捕鱼', loc: '侠客滩' },
  { id: 2, time: '14:20', name: '侠客打擂乐园', loc: '打擂台' },
  { id: 3, time: '16:00', name: '侠客滩捕鱼', loc: '侠客滩' },
  { id: 4, time: '17:00', name: '海鲜大拍卖', loc: '主舞台' }
]

function toMinutes(hhmm) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

// 标记已过场次与「下一场」——园内客人最关心的就是下一场几点
function markSchedule(now) {
  const mins = now.getHours() * 60 + now.getMinutes()
  let nextFound = false
  return SCHEDULE.map((a) => {
    const start = toMinutes(a.time)
    const passed = mins > start + 45 // 场次约 45 分钟
    const next = !passed && !nextFound && mins <= start
    if (next) nextFound = true
    return Object.assign({}, a, { passed, next })
  })
}

function todayText(now) {
  const w = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]
  return (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' + w
}

Page({
  data: {
    todayText: '',
    hours: [],
    activities: [],
    services: SERVICES.map((s) => Object.assign({}, s, { iconPath: '/assets/icons/forest/' + s.icon + '.png' })),
    frontPhone: env.frontDeskPhone,
    canNavigate: !!(env.park && env.park.latitude && env.park.longitude),
    campMapUrl: '',
    creekMapUrl: '',
    mapViewer: '',
    mapViewW: 0,
    mapViewH: 0
  },

  onShow() {
    this.refreshTime()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1, theme: 'light' })
    }
    this.loadMaps()
  },

  // 时间相关的都在 onShow 重算：用户可能挂着小程序跨过了某个场次
  refreshTime() {
    const now = new Date()
    const status = computeOpenStatus(now)
    this.setData({
      todayText: todayText(now),
      hours: status.items,
      activities: markSchedule(now)
    })
  },

  loadMaps() {
    request.call('getHomePortal', {})
      .then((d) => this.applyMaps((d && d.maps) || {}))
      .catch(() => {})
  },

  applyMaps(maps) {
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

  // 微信内置地图：坐标已配则 openLocation（可一键转高德/苹果导航），否则复制地址
  onNavigate() {
    haptic('light')
    const p = env.park || {}
    if (!p.latitude || !p.longitude) {
      wx.setClipboardData({ data: p.address || '' })
      wx.showToast({ title: '地址已复制，可粘贴到地图 App', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      name: p.name || '森水长河',
      address: p.address || '',
      scale: 16
    })
  },

  onCallFront() {
    makePhoneCall(this.data.frontPhone)
  },

  onServiceTap(e) {
    const key = e.currentTarget.dataset.key
    const svc = this.data.services.filter((s) => s.key === key)[0]
    if (!svc) return
    haptic('light')
    wx.navigateTo({ url: svc.route, fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' }) })
  },

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
    return { title: '森水长河 · 园区地图与今日安排', path: '/pages/park/park' }
  }
})
