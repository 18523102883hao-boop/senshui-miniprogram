// sr-icon —— 统一图标出口（Vibe UI v2.0）
// 只做「名称 + 主题 + 尺寸 → 路径」的映射，路径规则来自 icon-map.json：
//   浅色页 assets/icons/forest/，深色页 assets/icons/ivory/，状态 assets/icons/status/
// 页面不再散落写死路径，换图只改这里。
Component({
  properties: {
    // 图标名，与资源包文件名一致（不含扩展名），如 'chevron-right'
    name: { type: String, value: '' },
    // light（forest）| dark（ivory）| status
    theme: { type: String, value: 'light' },
    // sm 32rpx | md 44rpx | lg 56rpx | xl 72rpx，也可传具体 rpx 数字
    size: { type: String, value: 'md' },
    // 是否反白（用于深色底上的浅色图标）
    invert: { type: Boolean, value: false }
  },
  data: { src: '', sizeRpx: 44 },
  observers: {
    'name, theme, size': function (name, theme, size) {
      if (!name) return this.setData({ src: '' })
      const dir = theme === 'dark' ? 'ivory' : (theme === 'status' ? 'status' : 'forest')
      const preset = { sm: 32, md: 44, lg: 56, xl: 72 }
      const px = preset[size] || parseInt(size, 10) || 44
      this.setData({ src: '/assets/icons/' + dir + '/' + name + '.png', sizeRpx: px })
    }
  }
})
