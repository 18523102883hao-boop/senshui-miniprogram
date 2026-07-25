// 企业微信 / 客服二维码取用（Vibe UI v2.0）
//
// 业主会陆续提供各场景二维码，因此这里做成「一处配置、多处消费」：
//   - 配置在 env.js 的 qrcodes
//   - 页面统一调 getQrcode(scene)，不散写路径
//   - 未配置的场景返回 enabled:false，页面据此**不渲染二维码区块**（绝不出现裂图）
//   - 专属码未配时回落到通用管家码，并标记 fallback，页面可调整文案
const env = require('../env.js')

// 与 env.qrcodes 的键一一对应
const QR_SCENES = ['concierge', 'birthday', 'teamBuilding', 'brand', 'welfare', 'complaint']

const SCENE_LABEL = {
  concierge: '园区管家',
  birthday: '生日宴请顾问',
  teamBuilding: '团建顾问',
  brand: '品牌合作商务',
  welfare: '新客福利官',
  complaint: '投诉建议专员'
}

function pick(value) {
  return String(value || '').trim()
}

/**
 * 取某场景的二维码。
 * @param {string} scene QR_SCENES 之一
 * @returns {{enabled:boolean, url:string, label:string, fallback:boolean}}
 */
function getQrcode(scene) {
  const key = String(scene || '')
  const empty = { enabled: false, url: '', label: SCENE_LABEL[key] || '客服', fallback: false }
  // 未知场景不得误回落到通用码
  if (QR_SCENES.indexOf(key) < 0) return empty

  const map = env.qrcodes || {}
  const own = pick(map[key])
  if (own) return { enabled: true, url: own, label: SCENE_LABEL[key], fallback: false }

  // 兼容旧字段：concierge.qrcodeUrl（改造期不回归）
  const legacy = pick((env.concierge || {}).qrcodeUrl)
  const general = pick(map.concierge) || legacy
  if (general) {
    return {
      enabled: true,
      url: general,
      label: key === 'concierge' ? SCENE_LABEL.concierge : SCENE_LABEL.concierge,
      fallback: key !== 'concierge'
    }
  }
  return empty
}

module.exports = { QR_SCENES, SCENE_LABEL, getQrcode }
