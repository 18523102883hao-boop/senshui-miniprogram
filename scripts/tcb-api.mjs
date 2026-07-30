#!/usr/bin/env node
// 云开发 HTTP API 运维工具（数据库 / 云函数调用）
//
// 为什么需要它：cloudbase CLI 存的是 2 小时有效期的临时密钥，动不动就「无有效身份信息」；
// 服务端 API Key 永不过期，配合 HTTP API 可以直接读写数据库、调用云函数。
//
// ⚠️ API Key 是 system admin 权限，绝不能写进仓库。两种传法（任选）：
//   1. 环境变量：export TCB_API_KEY='eyJ...'
//   2. 本地文件：~/.config/.cloudbase/senshui-api-key（推荐，跨会话有效）
//      建立方式：
//        printf '%s' 'eyJ...' > ~/.config/.cloudbase/senshui-api-key
//        chmod 600 ~/.config/.cloudbase/senshui-api-key
//      文件在 home 下而不是仓库里，不会被 git 收进去。
//
// 用法：
//   node scripts/tcb-api.mjs collections                    列出关键集合与文档数
//   node scripts/tcb-api.mjs get <集合> [查询JSON]           查询文档
//   node scripts/tcb-api.mjs seed                           灌入首页配置/文章/票种（幂等）
//   node scripts/tcb-api.mjs sync-home                      把本地首页模块推到云端（改首页模块后必跑）
//   node scripts/tcb-api.mjs invoke <云函数名> [入参JSON]     调用云函数
//
// 注意：
//   - 查询参数是 ?query=，不是 ?filter=（filter 会被静默忽略，导致误判"已存在"）
//   - 插入文档 body 必须是 { data: [文档] }（数组）
//   - 响应是 Strict EJSON：整数读出来是 {"$numberInt":"5800"}，云函数侧读到的是普通数字
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_ID = process.env.TCB_ENV_ID || 'cloud1-d4gzkwy3w150d2fd2'

// 环境变量优先；否则读 home 下的密钥文件（环境变量在新开的 shell 里会丢，文件不会）
const KEY_FILE = path.join(os.homedir(), '.config/.cloudbase/senshui-api-key')

function loadKey() {
  if (process.env.TCB_API_KEY) return process.env.TCB_API_KEY.trim()
  try {
    const v = fs.readFileSync(KEY_FILE, 'utf8').trim()
    if (v) return v
  } catch (e) {
    // 文件不存在或读不了，走下面的报错提示
  }
  return ''
}

const KEY = loadKey()

if (!KEY) {
  console.error('✖ 未找到 API Key')
  console.error('  方式一（推荐，跨会话有效）：')
  console.error(`    printf '%s' 'eyJ...' > ${KEY_FILE}`)
  console.error(`    chmod 600 ${KEY_FILE}`)
  console.error('  方式二：export TCB_API_KEY=\'eyJ...\'')
  console.error('  Key 来源：云开发控制台 → 环境 → 服务端 API Key')
  process.exit(1)
}

const GW = `https://${ENV_ID}.api.tcloudbasegateway.com`
const DB = `${GW}/v1/database/instances/(default)/databases/(default)`

async function call(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch (e) { /* 非 JSON 响应 */ }
  return { status: res.status, json, text }
}

const db = (method, p, body) => call(DB + p, method, body)

// EJSON：Date 需要显式转换，其余原样
function toEJSON(v) {
  if (v instanceof Date) return { $date: { $numberLong: String(v.getTime()) } }
  if (Array.isArray(v)) return v.map(toEJSON)
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v)) o[k] = toEJSON(v[k])
    return o
  }
  return v
}

// EJSON → 普通值，便于本地打印
function fromEJSON(v) {
  if (Array.isArray(v)) return v.map(fromEJSON)
  if (v && typeof v === 'object') {
    if (v.$numberInt !== undefined) return Number(v.$numberInt)
    if (v.$numberLong !== undefined) return Number(v.$numberLong)
    if (v.$numberDouble !== undefined) return Number(v.$numberDouble)
    if (v.$date) return new Date(Number(v.$date.$numberLong || v.$date))
    const o = {}
    for (const k of Object.keys(v)) o[k] = fromEJSON(v[k])
    return o
  }
  return v
}

async function ensureCollection(name) {
  const r = await db('POST', '/collections', { CollectionName: name })
  return r.status === 201 ? 'created' : 'exists'
}

async function find(col, query, limit = 100) {
  const q = query ? `?query=${encodeURIComponent(JSON.stringify(query))}&limit=${limit}` : `?limit=${limit}`
  const r = await db('GET', `/collections/${col}/documents${q}`)
  if (r.status !== 200) return null
  return ((r.json && r.json.list) || []).map(fromEJSON)
}

async function insert(col, doc) {
  const r = await db('POST', `/collections/${col}/documents`, { data: [toEJSON(doc)] })
  if (r.status >= 300) throw new Error(`${col} 写入失败 ${r.status}: ${(r.text || '').slice(0, 200)}`)
  return r.json
}

const COLLECTIONS = [
  'users', 'members', 'orders', 'tickets', 'ticket_products', 'home_configs', 'articles',
  'visit_reservations', 'feedback', 'itineraries', 'refund_requests',
  'activities', 'notices', 'staff', 'verifications', 'sessions', 'bookings', 'ling_accounts'
]

async function cmdCollections() {
  for (const c of COLLECTIONS) {
    const list = await find(c, null, 1000)
    console.log(list === null ? `✗ ${c.padEnd(20)} 不存在` : `✓ ${c.padEnd(20)} ${String(list.length).padStart(4)} 条`)
  }
}

async function cmdGet(col, queryStr) {
  const query = queryStr ? JSON.parse(queryStr) : null
  const list = await find(col, query)
  if (list === null) return console.error('✖ 集合不存在或查询失败:', col)
  console.log(JSON.stringify(list, null, 2))
}

async function cmdSeed() {
  const { DEFAULT_SECTIONS, DEFAULT_ARTICLES } = require(PROJ + '/cloudfunctions/seedPortalContent/seed-data.js')
  const { TICKET_PRODUCTS } = require(PROJ + '/cloudfunctions/seedTicketProducts/seed-tickets.js')
  const now = new Date()

  for (const c of ['home_configs', 'articles', 'ticket_products', 'tickets', 'visit_reservations',
    'feedback', 'itineraries', 'refund_requests']) {
    console.log(' 集合', c, await ensureCollection(c))
  }

  const existingCfg = await find('home_configs', null, 1)
  if (existingCfg && existingCfg.length) {
    console.log('首页配置已存在，跳过')
  } else {
    await insert('home_configs', { version: 1, sections: DEFAULT_SECTIONS, updatedAt: now, updatedBy: 'tcb-api' })
    console.log(`✓ 首页配置 ${DEFAULT_SECTIONS.length} 个模块`)
  }

  for (const a of DEFAULT_ARTICLES) {
    const hit = await find('articles', { slug: a.slug }, 1)
    if (hit && hit.length) { console.log('跳过文章', a.slug); continue }
    await insert('articles', Object.assign({}, a, { publishedAt: now, updatedAt: now }))
    console.log('✓ 文章', a.slug)
  }

  for (const p of TICKET_PRODUCTS) {
    const hit = await find('ticket_products', { sku: p.sku }, 1)
    if (hit && hit.length) { console.log('跳过票种', p.sku); continue }
    await insert('ticket_products', Object.assign({}, p, { createdAt: now, updatedAt: now }))
    console.log(`✓ 票种 ${p.sku} ¥${(p.salePrice / 100).toFixed(2)}`)
  }
}

// 把本地 seed-data 的首页模块推到云端。
// 首页模块在三处定义（种子/云函数兜底/前端本地），改动后云端不同步会导致新模块不显示 ——
// 2026-07-25 补差价入口就是这么“消失”的。
async function cmdSyncHome() {
  const { DEFAULT_SECTIONS } = require(PROJ + '/cloudfunctions/seedPortalContent/seed-data.js')
  const list = await find('home_configs', null, 1)
  if (!list || !list.length) {
    console.error('✖ 云端无首页配置，请先执行：node scripts/tcb-api.mjs seed')
    return
  }
  const doc = list[0]
  const cloudKeys = (doc.sections || []).map((s) => s.key)
  const missing = DEFAULT_SECTIONS.filter((s) => cloudKeys.indexOf(s.key) < 0).map((s) => s.key)
  console.log('云端 ' + cloudKeys.length + ' 个模块，本地 ' + DEFAULT_SECTIONS.length + ' 个')
  console.log(missing.length ? '云端缺失：' + missing.join(', ') : '模块齐全')

  const r = await db('PATCH', '/collections/home_configs/documents/' + doc._id, {
    data: { sections: toEJSON(DEFAULT_SECTIONS), updatedAt: toEJSON(new Date()) }
  })
  if (r.status >= 300) return console.error('✖ 同步失败', r.status, r.text.slice(0, 200))
  const after = (await find('home_configs', null, 1))[0]
  console.log('✓ 已同步，云端现有 ' + after.sections.length + ' 个模块')
  console.log('  主行动：' + after.sections.filter((s) => s.type === 'primary_action').map((s) => s.title).join(' / '))
}

async function cmdInvoke(name, payloadStr) {
  const r = await call(`${GW}/v1/functions/${name}`, 'POST', payloadStr ? JSON.parse(payloadStr) : {})
  console.log(r.status, r.text.slice(0, 2000))
}

const [cmd, a1, a2] = process.argv.slice(2)
const run = {
  collections: () => cmdCollections(),
  get: () => cmdGet(a1, a2),
  seed: () => cmdSeed(),
  'sync-home': () => cmdSyncHome(),
  invoke: () => cmdInvoke(a1, a2)
}[cmd]

if (!run) {
  console.log('用法: node scripts/tcb-api.mjs <collections|get|seed|sync-home|invoke> [参数]')
  process.exit(1)
}
run().catch((e) => { console.error('✖', e.message); process.exit(1) })
