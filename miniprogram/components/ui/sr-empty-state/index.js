// sr-empty-state —— 统一空态（此前在 12 个页面各写一遍）
Component({
  properties: {
    icon: { type: String, value: 'map-info' },   // forest 图标名
    title: { type: String, value: '暂无内容' },
    desc: { type: String, value: '' },
    actionText: { type: String, value: '' },      // 传了才显示按钮
    theme: { type: String, value: 'light' }       // light | dark
  },
  methods: {
    onAction() { this.triggerEvent('action') }
  }
})
