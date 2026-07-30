const crypto = require('crypto')

const ROLE_LIMITS = Object.freeze({
  front: 5000,
  admin: 10000
})

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

function toSafeInteger(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0
}

function getDailyLimit(role) {
  return ROLE_LIMITS[role] || 0
}

function beijingDayKey(value = new Date()) {
  const time = value instanceof Date ? value.getTime() : Number(value)
  const date = new Date(time + BEIJING_OFFSET_MS)
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function dailyQuotaDocId(userOpenid, dayKey) {
  const digest = crypto
    .createHash('sha256')
    .update(`ling-daily-quota:${String(userOpenid || '')}:${String(dayKey || '')}`)
    .digest('hex')
    .slice(0, 40)
  return `lq_${digest}`
}

function evaluateDailyQuota(input = {}) {
  const role = input.role
  const direction = input.direction
  const used = toSafeInteger(input.used)
  const amount = toSafeInteger(input.amount)
  const limit = getDailyLimit(role)
  const applied = direction === 'p2d'
  const requestedUsed = applied ? used + amount : used
  const allowed = !applied || (limit > 0 && amount > 0 && requestedUsed <= limit)
  const nextUsed = allowed ? requestedUsed : used

  return {
    allowed,
    applied,
    limit,
    used,
    amount,
    nextUsed,
    remaining: Math.max(0, limit - nextUsed)
  }
}

module.exports = {
  ROLE_LIMITS,
  getDailyLimit,
  beijingDayKey,
  dailyQuotaDocId,
  evaluateDailyQuota
}
