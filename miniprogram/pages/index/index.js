// 首页 · 向导（T05）
// 数据来源：activities / notices 集合（后台可配）。骨架先用占位数据，联调见 specs/T05。
const request = require('../../utils/request.js')

Page({
  data: {
    notice: '',
    // 固定日程（旺季）：前端直接控制，每天稳定显示；如需改活动跟我说
    activities: [
      { id: 1, time: '13:00-13:45', name: '侠客滩捕鱼', note: '巡游带客 · 捕鱼' },
      { id: 2, time: '14:20-15:00', name: '侠客打擂乐园', note: '巡游带客 · 打擂台' },
      { id: 3, time: '16:00-16:45', name: '侠客滩捕鱼', note: '巡游带客 · 捕鱼' },
      { id: 4, time: '17:00-17:45', name: '森水长河夺宝大会', note: '巡游 · 拍卖' }
    ],
    campMapUrl: '', // 营地游览图云端临时链接（管理员上传后覆盖本地图）
    creekMapUrl: '', // 溪降游览图云端临时链接
    mapViewer: '', // 全屏查看的地图 src（空=关闭）
    // 园区指南入口（会员卡在上方独立卡片，见 wxml）
    quickLinks: [
      { key: 'catalog', title: '商品与服务', desc: '酒水·小卖部·租赁' },
      { key: 'upgrade', title: '补差价升级', desc: '单项票升套票' },
      { key: 'notice', title: '溪降须知', desc: '开放·安全须知' }
    ]
  },

  onLoad() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  // TODO：接入 getHomeData 云函数或直接读集合（见 specs/T05）。失败降级为占位内容。
  loadData() {
    return request
      .call('getHomeData', {})
      .then((d) => {
        this.setData({ notice: d.notice || '' })
        this.loadMaps((d && d.maps) || {})
      })
      .catch(() => {
        this.setData({ notice: '欢迎来到森水长河 · 入园即入江湖' })
      })
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

  onTapQuick(e) {
    const key = e.currentTarget.dataset.key
    const routes = {
      catalog: '/pages/catalog/catalog',
      upgrade: '/pages/upgrade-info/upgrade-info',
      notice: '/pages/creek-notice/creek-notice'
      // 溪降预约 / 买门票暂不开放，后续恢复：
      // creek: '/pages/booking/list/list', ticket: '/pages/ticket/ticket'
    }
    if (routes[key]) wx.navigateTo({ url: routes[key] })
  },

  goMember() {
    wx.navigateTo({ url: '/pages/member/detail/detail' })
  },

  // 打开全屏地图查看（云端图优先，否则用本地打包图）
  openMap(e) {
    const key = e.currentTarget.dataset.key
    const src = key === 'creek'
      ? (this.data.creekMapUrl || '/images/map-creek.jpg')
      : (this.data.campMapUrl || '/images/map-camp.jpg')
    this.setData({ mapViewer: src })
  },

  closeMapViewer() {
    this.setData({ mapViewer: '' })
  },

  onShareAppMessage() {
    return { title: '森水长河 · 你的园区随身向导，9.9 抢森水会员卡', path: '/pages/index/index' }
  },

  onShareTimeline() {
    return { title: '森水长河 · 入园即入江湖' }
  }
})
