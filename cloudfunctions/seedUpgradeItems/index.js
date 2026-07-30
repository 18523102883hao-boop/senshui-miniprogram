// 云函数：seedUpgradeItems —— 一次性写入补差价升级价目表（T20）
// 用法：微信开发者工具 → 云函数 seedUpgradeItems → 云端测试（无需入参）。幂等，可重复执行。
// 上线后建议删除本函数，或在此加管理员校验（与 initDb 一致，当前仅供运维初始化）。
//
// 价目来源（客户提供，金额单位=分）：
//   成人单营地(158) → 升溪降 +20
//   亲子单营地(198) → 升溪降 大人+68 / 儿童+29.9（拆两项）
//   儿童单营地(98)  → 升溪降 +29.9
//   成人单溪降(68)  → 升营地 +110
//   双人单溪降(128) → 升营地 +114/人
//   儿童单溪降(29.9)→ 升营地 +98
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 定价不变量：单项票价 + 升级差价 = 对应套票价（成人 178）。
// 溪降 2026-07-26 调价（单人 58→68，双人 88→128，每人 44→64）后，
// 「溪降→营地」的差价必须同步下调，否则先买溪降再升级会比直接买套票还贵。
const UPGRADE_ITEMS = [
  { id: 'camp_adult_to_creek',        label: '成人单营地 → 升溪降',        price: 2000,  note: '等同178套票：营地全部权益+溪降体验',            enabled: true },
  { id: 'camp_family_to_creek_adult', label: '亲子单营地 → 升溪降（大人）', price: 6800,  note: '大人可玩溪降（= 单人溪降票价）',              enabled: true },
  { id: 'camp_family_to_creek_child', label: '亲子单营地 → 升溪降（儿童）', price: 2990,  note: '儿童限身高120厘米（含）至150厘米（含）',       enabled: true },
  { id: 'camp_child_to_creek',        label: '儿童单营地 → 升溪降',        price: 2990,  note: '儿童限身高120厘米（含）至150厘米（含）',       enabled: true },
  { id: 'creek_adult_to_camp',        label: '成人单溪降 → 升营地',        price: 11000, note: '自助烧烤火锅畅吃、饮品畅饮、60长河令、全天活动', enabled: true },
  { id: 'creek_double_to_camp',       label: '双人单溪降 → 升营地（每人）', price: 11400, note: '每份对应1张原票；支持一次购买1至10份', enabled: true },
  { id: 'creek_child_to_camp',        label: '儿童单溪降 → 升营地',        price: 9800,  note: '儿童营地全权益',                             enabled: true }
]

exports.main = async () => {
  const notices = db.collection('notices')
  const now = new Date()

  const existed = await notices.where({ type: 'ticket_config' }).limit(1).get()
  if (existed.data.length) {
    // 已有 ticket_config：仅更新 upgradeList，保留其它字段（channels/priceList 等）
    await notices.doc(existed.data[0]._id).update({
      data: { upgradeList: UPGRADE_ITEMS, updatedAt: now }
    })
    return { code: 0, msg: 'ok', data: { action: 'updated', count: UPGRADE_ITEMS.length } }
  }

  await notices.add({
    data: { type: 'ticket_config', upgradeList: UPGRADE_ITEMS, enabled: true, createdAt: now, updatedAt: now }
  })
  return { code: 0, msg: 'ok', data: { action: 'created', count: UPGRADE_ITEMS.length } }
}
