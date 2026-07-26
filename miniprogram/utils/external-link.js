// 微信生态内的外链跳转（公众号文章 / 视频号）
//
// 约定：section.route 以 'external:' 开头的走这里，不进 wx.navigateTo。
// 云端下发配置时也只需把 route 改成这个前缀，不必改代码。
//
//   external:article  —— params.url 指向公众号文章，用 web-view 承载
//   external:channels —— 打开视频号主页，参数从 env.channels 读
const env = require('../env.js')

const ARTICLE = 'external:article'
const CHANNELS = 'external:channels'

function toast(title) {
  wx.showToast({ title, icon: 'none' })
}

// 兜底：把链接塞进剪贴板，让用户回微信里自己打开
function copyFallback(url, hint) {
  if (!url) {
    toast(hint || '暂时打不开，请联系管家')
    return
  }
  wx.setClipboardData({
    data: url,
    success: () => toast('链接已复制，可在微信中打开'),
    fail: () => toast(hint || '暂时打不开，请联系管家')
  })
}

function openArticle(params) {
  const url = (params && params.url) || ''
  if (!/^https:\/\//.test(url)) {
    toast('内容暂未配置')
    return true
  }
  const title = (params && params.title) || ''
  wx.navigateTo({
    url: '/pages/webview/webview?url=' + encodeURIComponent(url) +
         (title ? '&title=' + encodeURIComponent(title) : ''),
    fail: () => copyFallback(url)
  })
  return true
}

// 视频号打不开时的引导：比微信自己弹的「暂时打不开，请联系商家」清楚得多
function guideToChannels(cfg) {
  wx.showModal({
    title: '森水长河视频号',
    content: '复制链接后在微信里打开，就能看到最新的活动视频',
    confirmText: '复制链接',
    cancelText: '知道了',
    success: (res) => { if (res.confirm) copyFallback(cfg.homepage) }
  })
}

function openChannels() {
  const cfg = env.channels || {}
  const finderUserName = cfg.finderUserName || ''

  // verified 为 false 时**不调**微信 API：
  // finderUserName 填错的话，微信会先弹自己的「暂时打不开，请联系商家」，
  // 我们的 fail 回调再补一个提示，用户连着看两个错误更懵。
  // 拿到视频号助手里的准确 ID、真机验证通过后，把 env.channels.verified 改成 true。
  if (!cfg.verified || !finderUserName || typeof wx.openChannelsUserProfile !== 'function') {
    guideToChannels(cfg)
    return true
  }

  wx.openChannelsUserProfile({
    finderUserName,
    fail: () => guideToChannels(cfg)
  })
  return true
}

/**
 * 尝试按外链方式打开。
 * @returns {boolean} true = 已处理（调用方不要再 navigateTo）
 */
function open(route, params) {
  if (route === ARTICLE) return openArticle(params)
  if (route === CHANNELS) return openChannels()
  return false
}

function isExternal(route) {
  return typeof route === 'string' && route.indexOf('external:') === 0
}

module.exports = { open, isExternal, ARTICLE, CHANNELS }
