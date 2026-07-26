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

function openChannels() {
  const cfg = env.channels || {}
  const finderUserName = cfg.finderUserName || ''
  // 基础库 2.21.2 以下没有这个能力，直接走复制兜底
  if (!finderUserName || typeof wx.openChannelsUserProfile !== 'function') {
    copyFallback(cfg.homepage, '视频号暂未配置')
    return true
  }
  wx.openChannelsUserProfile({
    finderUserName,
    // ID 不对或用户没关注视频号权限时会 fail，此时给复制链接的出路
    fail: () => copyFallback(cfg.homepage)
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
