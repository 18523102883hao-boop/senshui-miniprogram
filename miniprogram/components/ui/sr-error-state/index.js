// sr-error-state —— 统一错误态；按钮文案全站固定为「重新加载」
Component({
  properties: {
    title: { type: String, value: '加载失败' },
    desc: { type: String, value: '检查网络后可重试' },
    actionText: { type: String, value: '重新加载' },
    theme: { type: String, value: 'light' }
  },
  methods: {
    onRetry() { this.triggerEvent('retry') }
  }
})
