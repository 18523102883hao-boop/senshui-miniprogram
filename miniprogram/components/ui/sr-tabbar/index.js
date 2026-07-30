// sr-tabbar —— 二级页面常驻底部导航（业主 2026-07-25）
//
// 背景：微信的 tabBar（含自定义）只在 app.json tabBar.list 声明的 4 个页面显示，
// navigateTo 打开的页面不显示，这是平台机制无法配置改变。
// 业主希望「在补差价页也能直接切 Tab，而不是先返回再点」，因此在浏览类二级页面
// 手动渲染一条同款导航，点击走 switchTab。
//
// ⚠️ 只在「浏览类」页面用（说明、目录、列表、详情）。
// 下单 / 支付 / 退款 / 表单提交等任务流页面不要用 —— 误点会中断流程并丢失已填内容。
const { haptic } = require('../../../utils/haptics.js')

// 与 custom-tab-bar 保持一致；改动请同步两处（由 tests/uiux/tabbar.test.js 锁定）
const TABS = [
  { pagePath: '/pages/index/index', text: '向导', icon: '/assets/icons/tabbar/tab-guide-default.png' },
  { pagePath: '/pages/park/park', text: '园区', icon: '/assets/icons/tabbar/tab-park-default.png' },
  { pagePath: '/pages/ling/ling', text: '长河令', icon: '/assets/icons/tabbar/tab-token-default.png' },
  { pagePath: '/pages/mine/mine', text: '我的', icon: '/assets/icons/tabbar/tab-mine-default.png' }
]

Component({
  properties: {
    // 深色页面（长河令风格的二级页）传 dark
    theme: { type: String, value: 'light' }
  },
  data: { list: TABS },
  methods: {
    onTap(e) {
      const idx = Number(e.currentTarget.dataset.index)
      const item = TABS[idx]
      if (!item) return
      haptic('light')
      // 二级页面不属于任何 tab，一律 switchTab（会自动关闭当前页面栈）
      wx.switchTab({ url: item.pagePath })
    }
  }
})
