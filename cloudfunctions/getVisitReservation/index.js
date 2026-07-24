// 云函数：getVisitReservation —— 预约详情（PRD §9.4 / §18.3）
// 本人凭 id 查看完整信息；同行人凭 shareToken 只能看脱敏摘要（不含手机号/openid）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const core = require('./reservation-core.js')

function maskPhone(phone) {
  const p = String(phone || '')
  return p.length === 11 ? p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : p
}

exports.main = async (event) => {
  const OPENID = cloud.getWXContext().OPENID
  const id = String((event && event.reservationId) || (event && event.id) || '').trim().slice(0, 64)
  const shareToken = String((event && event.shareToken) || '').trim().slice(0, 64)

  try {
    // 分享链接：只回摘要
    if (!id && shareToken) {
      const r = await db.collection('visit_reservations').where({ shareToken }).limit(1).get()
      if (!r.data.length) return { code: 404, msg: '预约不存在或已失效' }
      return { code: 0, msg: 'ok', data: { reservation: core.toShareSummary(r.data[0]), readonly: true } }
    }

    if (!id) return { code: 400, msg: '缺少预约标识' }
    const r = await db.collection('visit_reservations').doc(id).get().catch(() => null)
    const doc = r && r.data
    if (!doc) return { code: 404, msg: '预约不存在' }
    if (doc._openid !== OPENID) {
      // 非本人访问一律降级为摘要，避免越权看到联系人信息
      return { code: 0, msg: 'ok', data: { reservation: core.toShareSummary(doc), readonly: true } }
    }

    return {
      code: 0,
      msg: 'ok',
      data: {
        reservation: {
          reservationId: doc._id,
          visitDate: doc.visitDate,
          teamType: doc.teamType,
          teamName: doc.teamName,
          partySize: doc.partySize,
          contactName: doc.contactName,
          contactPhone: maskPhone(doc.contactPhone),
          remark: doc.remark || '',
          status: doc.status,
          needsManual: !!doc.needsManual,
          shareToken: doc.shareToken,
          createdAt: doc.createdAt
        },
        readonly: false
      }
    }
  } catch (e) {
    return { code: 500, msg: '加载失败' }
  }
}
