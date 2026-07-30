const DECLARATION_GUIDES = {
  photo: {
    title: '图片隐私声明未生效',
    declaration: '收集你选中的照片或视频信息'
  },
  file: {
    title: '文件隐私声明未生效',
    declaration: '收集你选中的文件'
  }
}

function errorMessage(error) {
  return String(error && (error.errMsg || error.message) || '')
}

function isUndeclaredPrivacyScopeError(error) {
  const message = errorMessage(error)
  const errCode = Number(error && (error.errCode || error.errno))
  return /api scope is not declared/i.test(message) ||
    (/scope/i.test(message) && /privacy agreement/i.test(message)) ||
    errCode === 112
}

function showDeclarationGuide(type) {
  const guide = DECLARATION_GUIDES[type]
  if (!guide) return
  wx.showModal({
    title: guide.title,
    content: '请管理员进入微信小程序后台：设置—服务内容声明—用户隐私保护指引，声明「' +
      guide.declaration +
      '」并提交。审核生效通常约需 5 分钟，生效后请重新进入小程序再试。',
    showCancel: false,
    confirmText: '我知道了'
  })
}

module.exports = {
  DECLARATION_GUIDES,
  isUndeclaredPrivacyScopeError,
  showDeclarationGuide
}
