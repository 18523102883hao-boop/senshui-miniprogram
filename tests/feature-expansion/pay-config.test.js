// 支付子商户号读取（2026-07-26）
//
// 背景：云函数的环境变量按函数单独配置，依赖 SUB_MCH_ID 的函数有 7 个。
// 补差价配了、购票漏配，用户点支付就收到「支付未配置」。
// 加数据库回落后 configs/pay 写一次即可全部生效。
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const CONFIG_PATH = path.join(projectRoot, 'cloudfunctions/createTicketOrder/pay-config.js')

// 模块内有 60 秒缓存，每个用例都重新加载以保证隔离
function loadFresh() {
  delete require.cache[CONFIG_PATH]
  return require(CONFIG_PATH)
}

// db 替身：get 用于回落读取，set/createCollection 是自举镜像会用到的
function fakeDb(doc, onGet) {
  return {
    collection: (name) => ({
      doc: (id) => ({
        get: () => {
          if (onGet) onGet(name, id)
          return doc ? Promise.resolve({ data: doc }) : Promise.reject(new Error('not found'))
        },
        set: () => Promise.resolve({})
      })
    }),
    createCollection: () => Promise.resolve({})
  }
}

test('环境变量优先：已配的函数行为完全不变，不查库', async () => {
  const cfg = loadFresh()
  const original = process.env.SUB_MCH_ID
  process.env.SUB_MCH_ID = '1900000109'
  let queried = false
  try {
    const v = await cfg.getSubMchId(fakeDb({ subMchId: 'from-db' }, () => { queried = true }))
    assert.equal(v, '1900000109')
    assert.equal(queried, false, '有环境变量时不该多查一次库')
  } finally {
    if (original === undefined) delete process.env.SUB_MCH_ID
    else process.env.SUB_MCH_ID = original
  }
})

test('环境变量缺失时回落数据库 configs/pay', async () => {
  const cfg = loadFresh()
  const original = process.env.SUB_MCH_ID
  delete process.env.SUB_MCH_ID
  try {
    let asked = null
    const v = await cfg.getSubMchId(fakeDb({ subMchId: '1900000110' }, (c, id) => { asked = c + '/' + id }))
    assert.equal(v, '1900000110')
    assert.equal(asked, 'configs/pay', '应读 configs 集合的 pay 文档')
  } finally {
    if (original !== undefined) process.env.SUB_MCH_ID = original
  }
})

test('两处都没配：返回空串，由调用方报错，绝不拿空商户号去下单', async () => {
  const cfg = loadFresh()
  const original = process.env.SUB_MCH_ID
  delete process.env.SUB_MCH_ID
  try {
    assert.equal(await cfg.getSubMchId(fakeDb(null)), '', '查不到时必须返回空串')
    assert.equal(await cfg.getSubMchId(fakeDb({})), '', '文档存在但没有 subMchId 也算未配置')
  } finally {
    if (original !== undefined) process.env.SUB_MCH_ID = original
  }
})

test('读到值后走缓存，不是每次下单都查库', async () => {
  const cfg = loadFresh()
  const original = process.env.SUB_MCH_ID
  delete process.env.SUB_MCH_ID
  try {
    let hits = 0
    const db = fakeDb({ subMchId: '1900000111' }, () => { hits++ })
    await cfg.getSubMchId(db)
    await cfg.getSubMchId(db)
    await cfg.getSubMchId(db)
    assert.equal(hits, 1, '容器复用期内应命中缓存')
  } finally {
    if (original !== undefined) process.env.SUB_MCH_ID = original
  }
})

test('未配置的报错文案要能自查，不能只说「联系管理员」', () => {
  const cfg = loadFresh()
  assert.match(cfg.NOT_CONFIGURED_MSG, /SUB_MCH_ID/, '要指出环境变量名')
  assert.match(cfg.NOT_CONFIGURED_MSG, /configs/, '要指出数据库回落位置')
})

test('所有走微信支付的云函数都用同一份配置读取，不再各读各的 env', () => {
  const fs = require('node:fs')
  const PAY_FNS = [
    'createTicketOrder', 'createMemberOrder', 'createSelfUpgrade',
    'payUpgradeCharge', 'refundMember', 'requestTicketRefund', 'repayOrder'
  ]
  for (const fn of PAY_FNS) {
    const dir = path.join(projectRoot, 'cloudfunctions', fn)
    assert.ok(fs.existsSync(path.join(dir, 'pay-config.js')), fn + ' 缺 pay-config.js')
    const src = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')
    assert.match(src, /payConfig\.getSubMchId\(db\)/, fn + ' 应通过共享模块取子商户号')
    assert.ok(!/const SUB_MCH_ID = process\.env\.SUB_MCH_ID/.test(src),
      fn + ' 不应再在模块顶层直接读环境变量（配置改了要等容器回收才生效）')
  }
})

// 业主 2026-07-26 明确不想给 7 个函数逐个配环境变量：
// 只要任意一个函数读到了环境变量，就镜像一份到数据库，其余函数随后都能读到。
test('读到环境变量时把值镜像到 configs/pay，省掉逐个配置', async () => {
  const cfg = loadFresh()
  const original = process.env.SUB_MCH_ID
  process.env.SUB_MCH_ID = '1900000112'
  try {
    let written = null
    const db = {
      collection: () => ({
        doc: () => ({
          set: (payload) => { written = payload.data; return Promise.resolve({}) },
          get: () => Promise.reject(new Error('n/a'))
        })
      }),
      createCollection: () => Promise.resolve({})
    }
    await cfg.getSubMchId(db)
    await new Promise((r) => setImmediate(r)) // 镜像是 fire-and-forget
    assert.ok(written, '应把子商户号镜像到数据库')
    assert.equal(written.subMchId, '1900000112')
  } finally {
    if (original === undefined) delete process.env.SUB_MCH_ID
    else process.env.SUB_MCH_ID = original
  }
})

test('镜像写库失败绝不影响支付', async () => {
  const cfg = loadFresh()
  const original = process.env.SUB_MCH_ID
  process.env.SUB_MCH_ID = '1900000113'
  try {
    const db = {
      collection: () => ({ doc: () => ({ set: () => Promise.reject(new Error('无权限')) }) }),
      createCollection: () => Promise.reject(new Error('无权限'))
    }
    const v = await cfg.getSubMchId(db)
    await new Promise((r) => setImmediate(r))
    assert.equal(v, '1900000113', '写库失败也必须正常返回子商户号')
  } finally {
    if (original === undefined) delete process.env.SUB_MCH_ID
    else process.env.SUB_MCH_ID = original
  }
})

test('镜像每个容器只写一次，不给每次下单加写库开销', async () => {
  const cfg = loadFresh()
  const original = process.env.SUB_MCH_ID
  process.env.SUB_MCH_ID = '1900000114'
  try {
    let writes = 0
    const db = {
      collection: () => ({ doc: () => ({ set: () => { writes++; return Promise.resolve({}) } }) }),
      createCollection: () => Promise.resolve({})
    }
    await cfg.getSubMchId(db)
    await cfg.getSubMchId(db)
    await cfg.getSubMchId(db)
    await new Promise((r) => setImmediate(r))
    assert.equal(writes, 1, '同一容器内只该镜像一次')
  } finally {
    if (original === undefined) delete process.env.SUB_MCH_ID
    else process.env.SUB_MCH_ID = original
  }
})

test('db 对象结构异常时镜像必须静默失败，不能带崩支付', async () => {
  const cfg = loadFresh()
  const original = process.env.SUB_MCH_ID
  process.env.SUB_MCH_ID = '1900000115'
  try {
    // collection() 返回的对象连 doc 都没有——镜像会同步抛错
    const brokenDb = { collection: () => ({}) }
    const v = await cfg.getSubMchId(brokenDb)
    assert.equal(v, '1900000115', '镜像挂了也必须正常返回子商户号')
  } finally {
    if (original === undefined) delete process.env.SUB_MCH_ID
    else process.env.SUB_MCH_ID = original
  }
})
