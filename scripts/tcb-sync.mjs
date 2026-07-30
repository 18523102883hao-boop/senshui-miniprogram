#!/usr/bin/env node
// 云端同步工具（价格 / 首页配置 / 支付配置）
//
// 为什么不用 cloudbase CLI：CLI 自己的登录态校验有 bug（`tcb login` 明明成功，
// 随后每条命令仍报「无有效身份信息」）。但它写下的临时密钥本身是有效的，
// 这里直接拿那份密钥配 @cloudbase/node-sdk 用。
//
// 前置：
//   1) 跑一次 `tcb login`（凭证有效期约 2 小时，过期重跑）
//   2) SDK 装在 scratchpad 里，通过 SDK_DIR 环境变量指路；未指定时按下面的默认值找
//
// 用法：
//   node scripts/tcb-sync.mjs status          查看云端价格 / 配置现状
//   node scripts/tcb-sync.mjs prices          把本地票价与补差价推到云端
//   node scripts/tcb-sync.mjs home            把首页外链配置推到云端
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_ID = process.env.TCB_ENV_ID || 'cloud1-d4gzkwy3w150d2fd2'
const SDK_DIR = process.env.SDK_DIR || ''

const require = createRequire(import.meta.url)

function loadSdk() {
  const candidates = [SDK_DIR, path.join(PROJ, 'node_modules')].filter(Boolean)
  for (const dir of candidates) {
    try {
      return require(path.join(dir, '@cloudbase/node-sdk'))
    } catch (e) { /* 换下一个 */ }
  }
  console.error('✖ 找不到 @cloudbase/node-sdk')
  console.error('  先装：npm install @cloudbase/node-sdk')
  console.error('  再用 SDK_DIR=<该 node_modules 路径> 指路')
  process.exit(1)
}

function loadCredential() {
  const p = path.join(os.homedir(), '.config/.cloudbase/auth.json')
  let cred
  try {
    cred = JSON.parse(fs.readFileSync(p, 'utf8')).credential
  } catch (e) {
    console.error('✖ 未登录，先执行：tcb login')
    process.exit(1)
  }
  if (!cred || !cred.tmpSecretId) {
    console.error('✖ 凭证不完整，重新执行：tcb login')
    process.exit(1)
  }
  if (cred.tmpExpired && Date.now() > Number(cred.tmpExpired)) {
    console.error('✖ 临时密钥已过期（' + new Date(Number(cred.tmpExpired)).toLocaleString() + '），重新执行：tcb login')
    process.exit(1)
  }
  return cred
}

const tcb = loadSdk()
const cred = loadCredential()
const app = tcb.init({
  env: ENV_ID,
  secretId: cred.tmpSecretId,
  secretKey: cred.tmpSecretKey,
  sessionToken: cred.tmpToken
})
const db = app.database()

const yuan = (fen) => '¥' + (fen / 100).toFixed(2).replace(/\.00$/, '')

// ---------- 现状 ----------
async function cmdStatus() {
  const { TICKET_PRODUCTS } = require(path.join(PROJ, 'cloudfunctions/seedTicketProducts/seed-tickets.js'))
  const localBySku = Object.fromEntries(TICKET_PRODUCTS.map((p) => [p.sku, p.salePrice]))

  console.log('— 票价（云端 vs 本地）—')
  const cloud = await db.collection('ticket_products').limit(50).get()
  for (const p of cloud.data.sort((a, b) => (a.sort || 0) - (b.sort || 0))) {
    const local = localBySku[p.sku]
    const same = local === p.salePrice
    console.log(`  ${same ? '✓' : '✗'} ${String(p.sku).padEnd(16)} 云端 ${yuan(p.salePrice).padEnd(9)}` +
      (same ? '' : ` ← 本地 ${yuan(local)}`))
  }

  console.log('\n— 补差价（云端 vs 本地）—')
  const upgradeSrc = fs.readFileSync(path.join(PROJ, 'cloudfunctions/seedUpgradeItems/index.js'), 'utf8')
  const localUp = {}
  for (const m of upgradeSrc.matchAll(/id: '([a-z_]+)',\s*label: '([^']+)',\s*price: (\d+)/g)) {
    localUp[m[1]] = { label: m[2], price: Number(m[3]) }
  }
  const cfg = await db.collection('notices').where({ type: 'ticket_config' }).limit(1).get()
  const cloudUp = (cfg.data[0] && cfg.data[0].upgradeList) || []
  for (const u of cloudUp) {
    const local = localUp[u.id]
    const same = local && local.price === u.price
    console.log(`  ${same ? '✓' : '✗'} ${String(u.id).padEnd(28)} 云端 ${yuan(u.price).padEnd(9)}` +
      (same ? '' : ` ← 本地 ${local ? yuan(local.price) : '(本地无此项)'}`))
  }

  console.log('\n— 支付配置 —')
  const pay = await db.collection('configs').doc('pay').get().catch(() => null)
  const p = pay && pay.data[0]
  console.log(p ? `  ✓ configs/pay 尾号 ${String(p.subMchId).slice(-4)}` : '  ✗ configs/pay 不存在')
}

// ---------- 价格 ----------
async function cmdPrices() {
  const { TICKET_PRODUCTS } = require(path.join(PROJ, 'cloudfunctions/seedTicketProducts/seed-tickets.js'))
  console.log('— 票价 —')
  for (const p of TICKET_PRODUCTS) {
    const hit = await db.collection('ticket_products').where({ sku: p.sku }).limit(1).get()
    if (!hit.data.length) { console.log('  跳过（云端无此票种）:', p.sku); continue }
    const old = hit.data[0].salePrice
    if (old === p.salePrice) { console.log(`  = ${p.sku.padEnd(16)} ${yuan(old)}`); continue }
    await db.collection('ticket_products').doc(hit.data[0]._id).update({
      salePrice: p.salePrice, marketPrice: p.marketPrice, updatedAt: new Date()
    })
    console.log(`  ✓ ${p.sku.padEnd(16)} ${yuan(old)} → ${yuan(p.salePrice)}`)
  }

  console.log('\n— 补差价 —')
  const upgradeSrc = fs.readFileSync(path.join(PROJ, 'cloudfunctions/seedUpgradeItems/index.js'), 'utf8')
  const items = []
  for (const m of upgradeSrc.matchAll(/\{ id: '([a-z_]+)',\s*label: '([^']+)',\s*price: (\d+),\s*note: '([^']*)',\s*enabled: (true|false) \}/g)) {
    items.push({ id: m[1], label: m[2], price: Number(m[3]), note: m[4], enabled: m[5] === 'true' })
  }
  if (!items.length) throw new Error('未能从 seedUpgradeItems 解析出升级项')

  const cfg = await db.collection('notices').where({ type: 'ticket_config' }).limit(1).get()
  if (!cfg.data.length) throw new Error('云端无 ticket_config，请先部署并调用 seedUpgradeItems')
  const before = Object.fromEntries(((cfg.data[0].upgradeList) || []).map((u) => [u.id, u.price]))

  await db.collection('notices').doc(cfg.data[0]._id).update({
    upgradeList: items, updatedAt: new Date()
  })
  for (const it of items) {
    const old = before[it.id]
    console.log(old === it.price
      ? `  = ${it.id.padEnd(28)} ${yuan(it.price)}`
      : `  ✓ ${it.id.padEnd(28)} ${old === undefined ? '(新增)' : yuan(old)} → ${yuan(it.price)}`)
  }
}

// ---------- 首页外链 ----------
async function cmdHome() {
  const { DEFAULT_SECTIONS } = require(path.join(PROJ, 'cloudfunctions/seedPortalContent/seed-data.js'))
  const wanted = Object.fromEntries(
    DEFAULT_SECTIONS.filter((s) => String(s.route).startsWith('external:')).map((s) => [s.key, s])
  )
  const r = await db.collection('home_configs').limit(1).get()
  if (!r.data.length) throw new Error('云端无 home_configs')
  const doc = r.data[0]

  const next = doc.sections.map((s) => {
    const w = wanted[s.key]
    return w ? { ...s, route: w.route, params: w.params, subtitle: w.subtitle } : s
  })
  await db.collection('home_configs').doc(doc._id).update({
    sections: next, updatedAt: new Date(), updatedBy: 'tcb-sync'
  })
  for (const key of Object.keys(wanted)) {
    const s = next.find((x) => x.key === key)
    console.log(`  ✓ ${key.padEnd(20)} ${s.route}${s.params && s.params.url ? '  ' + s.params.url.slice(0, 46) + '…' : ''}`)
  }
}

const CMDS = { status: cmdStatus, prices: cmdPrices, home: cmdHome }
const cmd = process.argv[2] || 'status'
if (!CMDS[cmd]) {
  console.error('用法: node scripts/tcb-sync.mjs <status|prices|home>')
  process.exit(1)
}
CMDS[cmd]().catch((e) => {
  console.error('✖', e.message || e)
  process.exit(1)
})
