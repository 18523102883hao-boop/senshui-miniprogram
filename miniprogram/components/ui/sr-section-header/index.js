// sr-section-header —— 统一区块标题（珊瑚色竖条 + 标题 + 可选右侧动作）
Component({
  properties: {
    title: { type: String, value: '' },
    extra: { type: String, value: '' },      // 右侧文字，如「查看全部」
    icon: { type: String, value: '' },       // 右侧图标名（与 extra 二选一）
    theme: { type: String, value: 'light' }
  },
  methods: {
    onExtra() { this.triggerEvent('extra') }
  }
})
