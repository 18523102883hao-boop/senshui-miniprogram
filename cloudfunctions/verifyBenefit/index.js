// 云函数：verifyBenefit —— 会员权益核销（长河令 / 生日 85 折）（T14 / T20）
// 核销动作只能由已审批员工发起。
//   · 长河令：一次性发放，事务防重复。
//   · 生日 85 折：服务端二次校验「当天为本人生日」，可反复核销，仅留痕（不改 granted）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const verificationCore = require('./verification-core.js')

async function requireStaff(openid) {
  const r = await db.collection('staff').where({ _openid: openid, status: 'approved' }).limit(1).get()
  return r.data.length ? r.data[0] : null
}

// 北京时间今天 MM-DD（服务器 UTC，+8 小时取月日）
function todayMD() {
  const t = new Date(Date.now() + 8 * 3600 * 1000)
  const p = (n) => (n < 10 ? '0' + n : n)
  return `${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`
}

// 事务内发放长河令：ling_accounts 累加 + ledger 流水
async function grantLing(t, openid, amount, memberCode, staff) {
  const col = t.collection('ling_accounts')
  const now = new Date()
  const exist = await col.where({ _openid: openid }).limit(1).get()
  if (exist.data.length) {
    await col.doc(exist.data[0]._id).update({ data: { balance: _.inc(amount), updatedAt: now } })
  } else {
    await col.add({ data: { _openid: openid, balance: amount, createdAt: now, updatedAt: now } })
  }
  await t.collection('ling_ledger').add({
    data: {
      _openid: openid,
      change: amount,
      type: 'member_grant',
      memo: '会员卡赠送',
      memberCode,
      staffName: staff.name,
      staffOpenid: staff._openid,
      createdAt: now
    }
  })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { memberCode, benefitType } = event
  if (!memberCode || !benefitType) return { code: 400, msg: '参数不完整' }
  if (['ling', 'birthday'].indexOf(benefitType) === -1) return { code: 400, msg: '未知权益类型' }

  // 1) 员工权限
  const staff = await requireStaff(OPENID)
  if (!staff) return { code: 403, msg: '无核销权限' }
  const identityCheck = verificationCore.validateIdentityCheck(benefitType, event.identityChecked)
  if (!identityCheck.ok) return { code: 400, msg: identityCheck.message }

  // 2) 定位会员卡 + 前置校验
  const memRes = await db.collection('members').where({ memberCode }).limit(1).get()
  if (memRes.data.length === 0) return { code: 404, msg: '会员卡不存在' }
  const member = memRes.data[0]
  if (member.status !== 'active') return { code: 400, msg: '会员卡状态异常' }
  if (new Date(member.expireAt).getTime() < Date.now()) return { code: 400, msg: '会员卡已过期' }

  // 生日 85 折：非当天直接拒绝（服务端二次校验，不信前端）
  if (benefitType === 'birthday') {
    if (!member.birthday) return { code: 400, msg: '该会员未设置生日' }
    if (member.birthday !== todayMD()) return { code: 400, msg: '仅生日当天可享 85 折' }
  }

  // 3) 事务核销
  try {
    await db.runTransaction(async (t) => {
      const m = await t.collection('members').doc(member._id).get()
      const cur = m.data.benefits || {}
      const now = new Date()

      if (benefitType === 'ling') {
        if (cur.ling && cur.ling.granted) throw new Error('长河令已发放')
        await grantLing(t, member._openid, (cur.ling && cur.ling.total) || 1000, memberCode, staff)
        await t.collection('members').doc(member._id).update({ data: { 'benefits.ling.granted': true, updatedAt: now } })
      }
      // benefitType === 'birthday'：可反复，不改 benefits，仅下方留痕

      // 核销留痕（全量）
      await t.collection('verifications').add({
        data: {
          type: 'member_benefit',
          benefitType,
          memberCode,
          memberId: member._id,
          userOpenid: member._openid,
          staffOpenid: OPENID,
          staffName: staff.name,
          identityChecked: benefitType === 'birthday' ? true : false,
          createdAt: now
        }
      })
    })
    return { code: 0, msg: 'ok', data: { done: true } }
  } catch (e) {
    return { code: 409, msg: e.message || '核销失败' }
  }
}
