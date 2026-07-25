// sr-park-header —— 园区信息头（业主 2026-07-25：三个板块合并为一个）
//
// 合并了原来分散的三块：
//   ① 首页 Hero（品牌名 + 定位语 + 营业状态）
//   ② 园区 Tab 导航卡（地址 + 导航按钮）
//   ③ 首页会员卡（9.9 开卡入口）
// 一屏之内回答：这是哪 / 今天开不开 / 怎么去 / 有什么优惠。
//
// 会员条可关（园区 Tab 不推销），导航坐标未配置时降级为复制地址。
const env = require('../../../utils/../env.js')
const { computeOpenStatus } = require('../../../utils/park-status.js')

Component({
  properties: {
    // 是否显示底部会员条（已是会员或不需要推销的页面传 false）
    showMember: { type: Boolean, value: false },
    // 会员条徽标文案：新客专享 / SVIP
    memberBadge: { type: String, value: '新客专享' }
  },
  data: {
    parkName: '',
    tagline: '',
    address: '',
    status: { open: false, text: '' },
    canNavigate: false
  },
  lifetimes: {
    attached() { this.refresh() }
  },
  pageLifetimes: {
    // 从后台回到前台时刷新营业状态（跨过 10:00/16:30 时文案要变）
    show() { this.refresh() }
  },
  methods: {
    refresh() {
      const p = env.park || {}
      this.setData({
        parkName: p.name || '森水长河',
        tagline: '峡谷溯溪 · 山野露营 · 长河令江湖',
        address: p.address || '',
        status: computeOpenStatus(),
        canNavigate: !!(p.latitude && p.longitude)
      })
    },

    onNavigate() {
      const p = env.park || {}
      // 坐标未配置时不调导航，避免把用户导到 (0,0)
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

    onMember() {
      this.triggerEvent('member')
    }
  }
})
