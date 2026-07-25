// 园区营业状态（首页与园区 Tab 共用，避免两处各算一遍导致口径不一致）
const env = require('../env.js')

const OPEN_FROM = 10 * 60      // 10:00 开园
const OPEN_TO = 16 * 60 + 30   // 16:30 停止入园

/**
 * @returns {{open:boolean, text:string, short:string}}
 */
function computeOpenStatus(now) {
  const d = now instanceof Date ? now : new Date()
  const mins = d.getHours() * 60 + d.getMinutes()
  const hours = (env.park && env.park.admissionHours) || '10:00-16:30'
  if (mins < OPEN_FROM) return { open: false, text: '今日 10:00 开园 · 入园 ' + hours, short: '未开园' }
  if (mins <= OPEN_TO) return { open: true, text: '营业中 · 入园截止 16:30', short: '营业中' }
  return { open: false, text: '今日已停止入园 · 明日 10:00 见', short: '已闭园' }
}

module.exports = { computeOpenStatus, OPEN_FROM, OPEN_TO }
