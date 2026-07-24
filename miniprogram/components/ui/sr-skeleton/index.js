// sr-skeleton —— 统一骨架屏（此前 8 页各写一遍，4 页干脆白屏）
// 只做 transform/opacity 动画，低端机不掉帧。
Component({
  properties: {
    // card 卡片列表 | list 图文列表 | article 文章 | form 表单
    type: { type: String, value: 'card' },
    rows: { type: Number, value: 3 },
    theme: { type: String, value: 'light' }
  },
  data: { items: [] },
  observers: {
    rows: function (n) {
      this.setData({ items: Array.from({ length: Math.max(1, n) }, (_, i) => i) })
    }
  },
  lifetimes: {
    attached() {
      this.setData({ items: Array.from({ length: Math.max(1, this.data.rows) }, (_, i) => i) })
    }
  }
})
