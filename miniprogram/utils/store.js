// 极简全局状态：发布-订阅。避免引入第三方状态库，保持骨架轻量。
// 用法：
//   const store = require('../../utils/store.js')
//   store.subscribe(state => { ... })   // 页面 onLoad 订阅，onUnload 反订阅
//   store.set({ member: {...} })         // 更新并广播
const state = {
  openid: '',
  userInfo: null,
  member: null // 会员卡状态缓存
}
const listeners = []

function get() {
  return state
}

function set(patch) {
  Object.assign(state, patch)
  listeners.forEach((fn) => {
    try { fn(state) } catch (e) { console.error('[store] listener error', e) }
  })
}

function subscribe(fn) {
  listeners.push(fn)
  return function unsubscribe() {
    const i = listeners.indexOf(fn)
    if (i > -1) listeners.splice(i, 1)
  }
}

module.exports = { get, set, subscribe }
