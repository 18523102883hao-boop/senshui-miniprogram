// 自定义 tabBar（Vibe UI · 批2）——浅/深双主题随页面切换
// 各 tab 页在 onShow 里调用 this.getTabBar().setData({ selected, theme })
const { haptic } = require('../utils/haptics.js')

Component({
  data: {
    selected: 0,
    theme: 'light', // light | dark
    list: [
      {
        pagePath: '/pages/index/index',
        text: '向导',
        icon: '/assets/icons/tabbar/tab-guide-default.png',
        iconActive: '/assets/icons/tabbar/tab-guide-active.png',
        iconDark: '/assets/icons/ivory/map-compass.png'
      },
      {
        pagePath: '/pages/ling/ling',
        text: '长河令',
        icon: '/assets/icons/tabbar/tab-token-default.png',
        iconActive: '/assets/icons/tabbar/tab-token-active.png',
        iconDark: '/assets/icons/ivory/activity-token.png'
      },
      {
        pagePath: '/pages/mine/mine',
        text: '我的',
        icon: '/assets/icons/tabbar/tab-mine-default.png',
        iconActive: '/assets/icons/tabbar/tab-mine-active.png',
        iconDark: '/assets/icons/ivory/mine-profile.png'
      }
    ]
  },

  methods: {
    onTap(e) {
      const idx = Number(e.currentTarget.dataset.index)
      if (idx === this.data.selected) return
      haptic('light')
      wx.switchTab({ url: this.data.list[idx].pagePath })
    }
  }
})
