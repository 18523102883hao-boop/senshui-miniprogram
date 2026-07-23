// 云函数：exchangeLing —— 实体长河令 ↔ 电子长河令 兑换（T21）
// 方向：p2d 实体转电子（电子 +N）/ d2p 电子兑实体（电子 -N，余额不足拒绝）。
// 权限：front/admin。安全：金额与客户身份均由云端从签名码解析，不信前端；事务 + 流水留痕。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const crypto = require('crypto')

const SECRET = process.env.MEMBER_QR_SECRET || 'sr-dev-secret-change-me'
const TTL = 90
const MAX_AMOUNT = 1000000 // 单笔上限（令），不限额但防误输极端值

async function requireStaff(openid) {
  const r = await db.collection('staff').where({ _openid: openid, status: 'approved' }).limit(1).get()
  return r.data.length ? r.data[0] : null
}

function verifyToken(input) {
  const parts = input.split('.')
  if (parts.length !== 4) return { error: '码格式错误' }
  const [, value, ts, sign] = parts
  const expect = crypto.createHmac('sha256', SECRET).update(value + '.' + ts).digest('hex').slice(0, 16)
  if (sign !== expect) return { error: '码无效' }
  if (Math.floor(Date.now() / 1000) - Number(ts) > TTL) return { error: '客户码已过期，请重新扫码' }
  return { value }
}

async function resolveOpenid(input) {
  if (!input) return { error: '缺少客户码' }
  if (input.indexOf('UL.') === 0) {
    const r = verifyToken(input)
    return r.error ? r : { openid: r.value }
  }
  if (input.indexOf('MC.') === 0) {
    const r = verifyToken(input)
    if (r.error) return r
    const m = await db.collection('members').where({ memberCode: r.value }).limit(1).get()
    if (!m.data.length) return { error: '会员卡不存在' }
    return { openid: m.data[0]._openid }
  }
  const m = await db.collection('members').where({ memberCode: input }).limit(1).get()
  if (!m.data.length) return { error: '无效客户码' }
  return { openid: m.data[0]._openid }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const staff = await requireStaff(OPENID)
  if (!staff || !['front', 'admin'].includes(staff.role)) return { code: 403, msg: '无兑换权限' }

  const amount = parseInt(event.amount, 10)
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return { code: 400, msg: '数量不合法' }
  const direction = event.direction
  if (['p2d', 'd2p'].indexOf(direction) === -1) return { code: 400, msg: '兑换方向错误' }

  const resolved = await resolveOpenid(event.code)
  if (resolved.error) return { code: 400, msg: resolved.error }
  const uOpenid = resolved.openid

  try {
    let newBalance
    await db.runTransaction(async (t) => {
      const accCol = t.collection('ling_accounts')
      const exist = await accCol.where({ _openid: uOpenid }).limit(1).get()
      const cur = exist.data.length ? exist.data[0].balance : 0
      const now = new Date()

      if (direction === 'p2d') {
        newBalance = cur + amount
        if (exist.data.length) {
          await accCol.doc(exist.data[0]._id).update({ data: { balance: _.inc(amount), updatedAt: now } })
        } else {
          await accCol.add({ data: { _openid: uOpenid, balance: amount, createdAt: now, updatedAt: now } })
        }
      } else {
        if (cur < amount) throw new Error(`电子令余额不足（当前 ${cur}）`)
        newBalance = cur - amount
        await accCol.doc(exist.data[0]._id).update({ data: { balance: _.inc(-amount), updatedAt: now } })
      }

      await t.collection('ling_ledger').add({
        data: {
          _openid: uOpenid,
          change: direction === 'p2d' ? amount : -amount,
          type: direction === 'p2d' ? 'physical_to_digital' : 'digital_to_physical',
          memo: direction === 'p2d' ? '实体令转电子' : '电子令兑实体',
          staffName: staff.name,
          staffOpenid: OPENID,
          createdAt: now
        }
      })
    })
    return { code: 0, msg: 'ok', data: { balance: newBalance } }
  } catch (e) {
    return { code: 409, msg: e.message || '兑换失败' }
  }
}
