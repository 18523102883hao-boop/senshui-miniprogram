// 园区 Tab —— 园内一站式导航（Vibe UI v2.0 阶段3）
// 定位：用户在园内打开就能用的东西。地图主视野 + 今日活动 + 二销 + 补差价 + 须知。
// 数据只读现有接口，不新增业务逻辑。
const request = require('../../utils/request.js')
const env = require('../../env.js')
const { haptic } = require('../../utils/haptics.js')

// 园内服务入口（整卡可点，图标走 forest 套）
const SERVICES = [
  { key: 'catalog', title: '酒吧 · 小卖部 · 租赁', desc: '价目与配送到营位', icon: 'home-store', route: '/pages/catalog/catalog' },
  { key: 'upgrade', title: '补差价升级', desc: '单项票升套票', icon: 'home-upgrade', route: '/pages/upgrade-info/upgrade-info' },
  { key: 'notice', title: '溪降须知', desc: '开放时间 · 安全须知', icon: 'booking-safety', route: '/pages/creek-notice/creek-notice' },
  { key: 'guide', title: '入园攻略', desc: '交通 · 设施 · 咨询', icon: 'map-route', route: '/pages/guide/guide' }
]

Page({
  data: {
    park: env.park || {},
    services: SERVICES.map((s) => Object.assign({}, s, { iconPath: '/assets/icons/forest/' + s.icon + '.png' })),
    // 今日活动沿用首页固定日程口径，园内客人看时间表用
    activities: [
      { id: 1, time: '13:00', name: '侠客滩捕鱼', loc: '侠客滩' },
      { id: 2, time: '14:20', name: '侠客打擂乐园', loc: '打擂台' },
      { id: 3, time: '17:00', name: '海鲜大拍卖', loc: '主舞台' }
    ],
    campMapUrl: '',
    creekMapUrl: '',
    mapViewer: '',
    mapViewW: 0,
    mapViewH: 0,
    canNavigate: !!(env.park && env.park.latitude && env.park.longitude)
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1, theme: 'light' })
    }
    this.loadMaps()
  },

  loadMaps() {
    request.call('getHomePortal', {})
      .then((d) => this.applyMaps((d && d.maps) || {}))
      .catch(() => request.call('getHomeData', {}).then((d) => this.applyMaps((d && d.maps) || {})).catch(() => {}))
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

  // 微信内置地图导航：坐标已配则 openLocation（可一键转高德/苹果地图导航）；否则复制地址
  onNavigate() {
    haptic('light')
    const p = this.data.park || {}
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
    return { title: '森水长河 · 园区地图与现场服务', path: '/pages/park/park' }
  }
})
