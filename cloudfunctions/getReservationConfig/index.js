// 云函数：getReservationConfig —— 团队预约规则配置（PRD §9.2 / §18.3）
// 配置存 notices(type:'config', key:'visitReservation')，运营可后台改；缺失时用保守默认值。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ⚠️ 默认值为保守估计，上线前必须由业务方确认（PRD §28.4）
const DEFAULT_CONFIG = {
  minPartySize: 10,
  maxPartySize: 200,
  advanceDays: 30,
  dailyCapacity: 500, // 0 = 不限制；确认容量后填实际值
  blockedDates: [],
  weekdayPolicy: 'self', // self | blocked | manual
  weekendPolicy: 'manual', // 周末默认转人工，避免自助预约冲掉散客
  teamTypes: [
    { key: 'company', title: '公司团建' },
    { key: 'school', title: '学校研学' },
    { key: 'family', title: '家庭亲友' },
    { key: 'club', title: '俱乐部 / 社群' },
    { key: 'other', title: '其他' }
  ],
  notice: '团队预约提交后由管家确认，确认前请勿安排车辆与行程。'
}

exports.main = async (event) => {
  let config = DEFAULT_CONFIG
  try {
    const r = await db.collection('notices').where({ type: 'config', key: 'visitReservation' }).limit(1).get()
    if (r.data.length && r.data[0].value) config = Object.assign({}, DEFAULT_CONFIG, r.data[0].value)
  } catch (e) { /* 用默认值 */ }

  // 查询某月已占用人数，供前端提示余位
  let booked = {}
  const month = String((event && event.month) || '').slice(0, 7)
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    try {
      const r = await db.collection('visit_reservations')
        .where({ visitDate: db.RegExp({ regexp: '^' + month, options: '' }), status: _.in(['pending', 'confirmed']) })
        .limit(500).get()
      r.data.forEach((x) => { booked[x.visitDate] = (booked[x.visitDate] || 0) + (x.partySize || 0) })
    } catch (e) { /* ignore */ }
  }

  return { code: 0, msg: 'ok', data: { config, booked } }
}
