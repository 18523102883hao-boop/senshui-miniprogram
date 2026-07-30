const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const corePath = path.join(projectRoot, 'cloudfunctions/cancelPendingOrder/cancel-core.js')

function loadCore() {
  delete require.cache[corePath]
  return require(corePath)
}

test('三类待支付订单允许取消，其他业务类型不允许', () => {
  const core = loadCore()
  for (const type of ['member_card', 'ticket_order', 'ticket_upgrade']) {
    assert.deepEqual(core.resolve({ type, status: 'pending' }), { ok: true })
  }
  const unsupported = core.resolve({ type: 'rental_order', status: 'pending' })
  assert.equal(unsupported.ok, false)
  assert.equal(unsupported.code, 400)
  assert.match(unsupported.msg, /不支持取消/)
})

test('已支付、退款、过期和已取消订单均不能再取消', () => {
  const core = loadCore()
  const cases = [
    ['paid', /已支付/],
    ['paid_dup', /已支付/],
    ['refunding', /退款/],
    ['refunded', /退款/],
    ['expired', /关闭/],
    ['cancelled', /已取消/]
  ]
  for (const [status, message] of cases) {
    const result = core.resolve({ type: 'ticket_order', status })
    assert.equal(result.ok, false, status)
    assert.equal(result.code, 409, status)
    assert.match(result.msg, message, status)
  }
})

test('取消补丁保留记录并写入取消审计字段', () => {
  const core = loadCore()
  const now = new Date('2026-07-28T05:00:00.000Z')
  const patch = core.buildPatch(now)
  assert.equal(patch.status, 'cancelled')
  assert.equal(patch.cancelReason, 'user_cancelled')
  assert.equal(patch.cancelledAt, now)
  assert.equal(patch.updatedAt, now)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, '_openid'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'amount'), false)
})

test('取消订单模块与部署契约文件最终必须存在', () => {
  assert.equal(
    fs.existsSync(path.join(projectRoot, 'cloudfunctions/cancelPendingOrder/package.json')),
    true,
    '缺少 cancelPendingOrder/package.json'
  )
})

test('取消云函数只操作当前用户订单，并在事务内重新校验状态', () => {
  const indexPath = path.join(projectRoot, 'cloudfunctions/cancelPendingOrder/index.js')
  assert.equal(fs.existsSync(indexPath), true, '缺少 cancelPendingOrder/index.js')

  const source = fs.readFileSync(indexPath, 'utf8')
  assert.match(source, /cloud\.getWXContext\(\)\.OPENID/)
  assert.match(source, /_openid:\s*OPENID/)
  assert.match(source, /outTradeNo/)
  assert.match(source, /db\.runTransaction/)
  assert.match(source, /cancelCore\.resolve/)
  assert.match(source, /cancelCore\.buildPatch/)
  assert.doesNotMatch(source, /\.remove\s*\(/, '取消订单不得删除原始订单')
})

test('部署配置与批量部署脚本包含取消订单云函数', () => {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'cloudbaserc.json'), 'utf8'))
  const names = (config.functions || []).map((item) => item.name)
  assert.ok(names.includes('cancelPendingOrder'), 'cloudbaserc.json 未注册 cancelPendingOrder')

  const script = fs.readFileSync(path.join(projectRoot, 'scripts/deploy-functions.sh'), 'utf8')
  assert.match(script, /\bcancelPendingOrder\b/)
})
