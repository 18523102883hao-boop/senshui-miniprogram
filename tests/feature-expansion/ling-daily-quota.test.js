const test = require('node:test')
const assert = require('node:assert/strict')

const exchangeQuota = require('../../cloudfunctions/exchangeLing/quota-core.js')
const resolveQuota = require('../../cloudfunctions/resolveUserForLing/quota-core.js')

test('普通员工和管理员按角色获得 5000 / 10000 每日额度', () => {
  assert.equal(exchangeQuota.getDailyLimit('front'), 5000)
  assert.equal(exchangeQuota.getDailyLimit('admin'), 10000)
  assert.equal(exchangeQuota.getDailyLimit('unknown'), 0)
})

test('实体兑电子按同一客户当天累计，拆单不能超过角色额度', () => {
  const first = exchangeQuota.evaluateDailyQuota({
    role: 'front',
    direction: 'p2d',
    used: 4800,
    amount: 200
  })
  assert.deepEqual(
    {
      allowed: first.allowed,
      applied: first.applied,
      limit: first.limit,
      used: first.used,
      nextUsed: first.nextUsed,
      remaining: first.remaining
    },
    {
      allowed: true,
      applied: true,
      limit: 5000,
      used: 4800,
      nextUsed: 5000,
      remaining: 0
    }
  )

  const splitOverLimit = exchangeQuota.evaluateDailyQuota({
    role: 'front',
    direction: 'p2d',
    used: first.nextUsed,
    amount: 1
  })
  assert.equal(splitOverLimit.allowed, false)
  assert.equal(splitOverLimit.nextUsed, 5000)
  assert.equal(splitOverLimit.remaining, 0)
})

test('管理员可在普通员工已发放后继续至同一客户累计 10000', () => {
  const result = exchangeQuota.evaluateDailyQuota({
    role: 'admin',
    direction: 'p2d',
    used: 5000,
    amount: 5000
  })
  assert.equal(result.allowed, true)
  assert.equal(result.nextUsed, 10000)
  assert.equal(result.remaining, 0)

  const over = exchangeQuota.evaluateDailyQuota({
    role: 'admin',
    direction: 'p2d',
    used: result.nextUsed,
    amount: 1
  })
  assert.equal(over.allowed, false)
})

test('电子兑实体不消耗实体兑电子每日额度', () => {
  const result = exchangeQuota.evaluateDailyQuota({
    role: 'front',
    direction: 'd2p',
    used: 3200,
    amount: 1000
  })
  assert.equal(result.allowed, true)
  assert.equal(result.applied, false)
  assert.equal(result.nextUsed, 3200)
  assert.equal(result.remaining, 1800)
})

test('额度按北京时间自然日切换', () => {
  assert.equal(
    exchangeQuota.beijingDayKey(new Date('2026-07-28T15:59:59.999Z')),
    '2026-07-28'
  )
  assert.equal(
    exchangeQuota.beijingDayKey(new Date('2026-07-28T16:00:00.000Z')),
    '2026-07-29'
  )
})

test('同一客户同一天生成稳定且不暴露 openid 的额度文档 ID', () => {
  const first = exchangeQuota.dailyQuotaDocId('openid-sensitive-value', '2026-07-28')
  const same = exchangeQuota.dailyQuotaDocId('openid-sensitive-value', '2026-07-28')
  const nextDay = exchangeQuota.dailyQuotaDocId('openid-sensitive-value', '2026-07-29')

  assert.equal(first, same)
  assert.notEqual(first, nextDay)
  assert.equal(first.includes('openid-sensitive-value'), false)
  assert.match(first, /^lq_[a-f0-9]{40}$/)
})

test('扫码查询云函数与兑换云函数使用完全相同的额度规则', () => {
  assert.deepEqual(resolveQuota.ROLE_LIMITS, exchangeQuota.ROLE_LIMITS)
  const args = {
    role: 'admin',
    direction: 'p2d',
    used: 9000,
    amount: 1000
  }
  assert.deepEqual(resolveQuota.evaluateDailyQuota(args), exchangeQuota.evaluateDailyQuota(args))
  assert.equal(
    resolveQuota.dailyQuotaDocId('openid-1', '2026-07-28'),
    exchangeQuota.dailyQuotaDocId('openid-1', '2026-07-28')
  )
})
