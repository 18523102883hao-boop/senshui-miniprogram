// 通用工具函数
function pad(n) { return n < 10 ? '0' + n : '' + n }

// 分 → 元字符串
function fen2yuan(fen) {
  return (Number(fen || 0) / 100).toFixed(2)
}

// 时间戳 / Date → 格式化字符串
function formatDate(input, fmt = 'YYYY-MM-DD') {
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return ''
  return fmt
    .replace('YYYY', d.getFullYear())
    .replace('MM', pad(d.getMonth() + 1))
    .replace('DD', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()))
    .replace('ss', pad(d.getSeconds()))
}

// 防抖
function debounce(fn, wait = 400) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

// 拨打电话
function makePhoneCall(phoneNumber) {
  if (!phoneNumber) return
  wx.makePhoneCall({ phoneNumber: String(phoneNumber) })
}

module.exports = { fen2yuan, formatDate, debounce, makePhoneCall }
