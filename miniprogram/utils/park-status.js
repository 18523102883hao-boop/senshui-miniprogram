// 园区营业状态（首页与园区 Tab 共用，避免两处各算一遍导致口径不一致）
//
// ⚠️ 营地与溪降营业时间不同（营地 10:00-18:00，溪降 10:00-16:30），
//    必须分别标注 —— 只写一个时间会让客人以为整个园区都是那个时段。
const env = require('../env.js')

function toMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

function hoursConfig() {
  const h = (env.park && env.park.hours) || {}
  return {
    camp: h.camp || { label: '营地', open: '10:00', close: '18:00' },
    creek: h.creek || { label: '溪降', open: '10:00', close: '16:30' }
  }
}

/**
 * 单个项目的当前状态。
 * @returns {{key, label, open, close, isOpen, text}}
 */
function itemStatus(key, cfg, nowMins) {
  const openM = toMinutes(cfg.open)
  const closeM = toMinutes(cfg.close)
  let text
  if (nowMins < openM) text = cfg.open + ' 开始'
  else if (nowMins <= closeM) text = '进行中 · ' + cfg.close + ' 截止'
  else text = '今日已结束'
  return {
    key,
    label: cfg.label,
    open: cfg.open,
    close: cfg.close,
    range: cfg.open + '-' + cfg.close,
    isOpen: nowMins >= openM && nowMins <= closeM,
    text
  }
}

/**
 * 园区整体状态 + 各项目分别状态。
 * @returns {{open:boolean, headline:string, items:Array}}
 */
function computeOpenStatus(now) {
  const d = now instanceof Date ? now : new Date()
  const mins = d.getHours() * 60 + d.getMinutes()
  const cfg = hoursConfig()
  const items = [itemStatus('camp', cfg.camp, mins), itemStatus('creek', cfg.creek, mins)]

  // 只要有一个项目在营业，园区就算营业中
  const anyOpen = items.some((i) => i.isOpen)
  const allBefore = items.every((i) => mins < toMinutes(i.open))
  let headline
  if (allBefore) headline = '今日 ' + cfg.camp.open + ' 开园'
  else if (anyOpen) headline = '营业中'
  else headline = '今日已闭园'

  return { open: anyOpen, headline, items }
}

module.exports = { computeOpenStatus, hoursConfig, toMinutes }
