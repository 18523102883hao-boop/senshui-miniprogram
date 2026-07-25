// 园区营业状态（首页与园区 Tab 共用，避免两处各算一遍导致口径不一致）
//
// ⚠️ 营地与溪降时间不同，必须分别标注：
//    营地 10:00-21:00（19:00 停止供餐）· 溪降 10:00-16:30（停止检票）
//    只写一个时间会让客人以为整个园区都是那个时段。
const env = require('../env.js')

function toMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

function hoursConfig() {
  const h = (env.park && env.park.hours) || {}
  return {
    camp: h.camp || { label: '营地', open: '10:00', close: '21:00', cutoff: '19:00', cutoffLabel: '停止供餐' },
    creek: h.creek || { label: '溪降', open: '10:00', close: '16:30', closeLabel: '停止检票' }
  }
}

/**
 * 单个项目的当前状态。
 * cutoff 表示中途节点（如营地 19:00 停止供餐），到点后仍在营业但该服务停止。
 * @returns {{key,label,range,isOpen,state,text,note}}
 */
function itemStatus(key, cfg, nowMins) {
  const openM = toMinutes(cfg.open)
  const closeM = toMinutes(cfg.close)
  const cutM = cfg.cutoff ? toMinutes(cfg.cutoff) : null
  const isOpen = nowMins >= openM && nowMins <= closeM

  let state, text
  if (nowMins < openM) {
    state = 'before'
    text = cfg.open + ' 开始'
  } else if (nowMins > closeM) {
    state = 'ended'
    text = '今日已结束'
  } else if (cutM !== null && nowMins > cutM) {
    // 仍在营业，但中途服务已停（营地过了 19:00 点不了餐）
    state = 'partial'
    text = '已' + (cfg.cutoffLabel || '停止部分服务')
  } else {
    state = 'open'
    text = cfg.closeLabel ? (cfg.close + ' ' + cfg.closeLabel) : (cfg.close + ' 结束')
  }

  return {
    key,
    label: cfg.label,
    open: cfg.open,
    close: cfg.close,
    range: cfg.open + '-' + cfg.close,
    // 供详细说明用，如「19:00 停止供餐」
    note: cfg.cutoff ? (cfg.cutoff + ' ' + (cfg.cutoffLabel || '')) : (cfg.closeLabel || ''),
    isOpen,
    state,
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

  const anyOpen = items.some((i) => i.isOpen)
  const allBefore = items.every((i) => i.state === 'before')
  let headline
  if (allBefore) headline = '今日 ' + cfg.camp.open + ' 开园'
  else if (anyOpen) headline = '营业中'
  else headline = '今日已闭园'

  return { open: anyOpen, headline, items }
}

module.exports = { computeOpenStatus, hoursConfig, toMinutes }
