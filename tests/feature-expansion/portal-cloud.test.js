// Task 2 云函数纯逻辑测试
// 云函数 index.js 依赖 wx-server-sdk（本地无此依赖），因此把可测逻辑抽到同目录的 *-core.js，
// 这些文件不 require 任何云端 SDK，测试直接加载。
// 依据 PRD：§7 首页、§10 内容中心、§17.1 home_configs、§17.2 articles、§18.1 云函数契约
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')
const portalCore = require(path.join(projectRoot, 'cloudfunctions/getHomePortal/portal-core.js'))
const articlesCore = require(path.join(projectRoot, 'cloudfunctions/listArticles/articles-core.js'))
const articleCore = require(path.join(projectRoot, 'cloudfunctions/getArticle/article-core.js'))
const seedData = require(path.join(projectRoot, 'cloudfunctions/seedPortalContent/seed-data.js'))

const NOW = new Date('2026-08-01T10:00:00+08:00')
const PAST = new Date('2026-07-01T00:00:00+08:00')
const FUTURE = new Date('2026-09-01T00:00:00+08:00')

test('首页模块只返回可见且在有效期内的配置', () => {
  const sections = [
    { key: 'always', visible: true, sort: 1 },
    { key: 'hidden', visible: false, sort: 2 },
    { key: 'not-started', visible: true, sort: 3, startsAt: FUTURE },
    { key: 'ended', visible: true, sort: 4, endsAt: PAST },
    { key: 'in-window', visible: true, sort: 5, startsAt: PAST, endsAt: FUTURE }
  ]
  const keys = portalCore.filterSections(sections, NOW).map((s) => s.key)
  assert.deepEqual(keys, ['always', 'in-window'])
})

test('首页模块按 sort 升序返回，且不修改入参数组', () => {
  const sections = [
    { key: 'c', visible: true, sort: 30 },
    { key: 'a', visible: true, sort: 10 },
    { key: 'b', visible: true, sort: 20 }
  ]
  const snapshot = sections.map((s) => s.key)
  const keys = portalCore.filterSections(sections, NOW).map((s) => s.key)
  assert.deepEqual(keys, ['a', 'b', 'c'])
  assert.deepEqual(sections.map((s) => s.key), snapshot, '不得原地排序调用方数组')
})

test('首页摘要只统计当前用户的票券与预约', () => {
  const summary = portalCore.buildUserSummary({
    openid: 'me',
    now: NOW,
    tickets: [
      { _openid: 'me', status: 'unused' },
      { _openid: 'me', status: 'used' },
      { _openid: 'other', status: 'unused' }
    ],
    reservations: [
      { _openid: 'other', status: 'confirmed', visitDate: '2026-08-05', partySize: 30 },
      { _openid: 'me', status: 'confirmed', visitDate: '2026-08-09', partySize: 12 },
      { _openid: 'me', status: 'confirmed', visitDate: '2026-08-03', partySize: 8 },
      { _openid: 'me', status: 'cancelled', visitDate: '2026-08-02', partySize: 5 }
    ]
  })
  assert.equal(summary.unusedTicketCount, 1)
  assert.equal(summary.upcomingReservation.visitDate, '2026-08-03', '取最近一条有效预约')
  assert.equal(summary.upcomingReservation.partySize, 8)
})

test('已过期的预约不计入首页摘要', () => {
  const summary = portalCore.buildUserSummary({
    openid: 'me',
    now: NOW,
    tickets: [],
    reservations: [{ _openid: 'me', status: 'confirmed', visitDate: '2026-07-20', partySize: 8 }]
  })
  assert.equal(summary.upcomingReservation, null)
})

test('匿名访问返回空摘要而不是抛错', () => {
  const summary = portalCore.buildUserSummary({ openid: '', now: NOW })
  assert.deepEqual(summary, { unusedTicketCount: 0, upcomingReservation: null })
})

test('摘要查询失败时首页仍返回完整骨架', () => {
  const data = portalCore.buildPortalData({
    notice: null,
    sections: [{ key: 'hero', visible: true, sort: 10 }],
    activities: null,
    summary: null // 模拟摘要查询异常被吞掉
  }, NOW)
  assert.equal(data.sections.length, 1)
  assert.deepEqual(data.activities, [])
  assert.deepEqual(data.userSummary, { unusedTicketCount: 0, upcomingReservation: null })
  assert.equal(data.notice, null)
})

test('云端无配置时回退到内置默认模块', () => {
  const data = portalCore.buildPortalData({ sections: [], summary: null }, NOW)
  assert.ok(data.sections.length > 0, '空配置必须回退默认模块，首页不能白屏')
})

test('文章列表只返回已发布内容并按发布时间倒序', () => {
  const list = articlesCore.filterPublished([
    { slug: 'a', status: 'published', publishedAt: new Date('2026-07-01') },
    { slug: 'b', status: 'draft', publishedAt: new Date('2026-07-05') },
    { slug: 'c', status: 'archived', publishedAt: new Date('2026-07-06') },
    { slug: 'd', status: 'published', publishedAt: new Date('2026-07-10') }
  ])
  assert.deepEqual(list.map((a) => a.slug), ['d', 'a'])
})

test('文章列表项不泄露正文块，只返回摘要字段', () => {
  const item = articlesCore.toListItem({
    _id: 'x1', slug: 'park-intro', category: 'park_intro', title: '园区介绍',
    summary: '一句话简介', coverFileId: 'cloud://cover.png',
    blocks: [{ type: 'text', data: { text: '正文' } }],
    status: 'published', publishedAt: new Date('2026-07-10')
  })
  assert.equal(item.blocks, undefined, '列表不返回正文，减少包体与流量')
  assert.equal(item.slug, 'park-intro')
  assert.equal(item.title, '园区介绍')
  assert.equal(item.summary, '一句话简介')
})

test('文章详情拒绝未发布内容', () => {
  assert.equal(articleCore.pickPublished([{ slug: 'a', status: 'draft' }]), null)
  assert.equal(articleCore.pickPublished([{ slug: 'a', status: 'archived' }]), null)
  assert.equal(articleCore.pickPublished([]), null)
  const doc = articleCore.pickPublished([{ slug: 'a', status: 'published', blocks: [] }])
  assert.equal(doc.slug, 'a')
})

test('文章正文块过滤未知类型，避免前端渲染空白', () => {
  const doc = articleCore.pickPublished([{
    slug: 'a', status: 'published',
    blocks: [{ type: 'text', data: { text: 'hi' } }, { type: 'unknown', data: {} }, { type: 'image', data: { fileId: 'f' } }]
  }])
  assert.deepEqual(doc.blocks.map((b) => b.type), ['text', 'image'])
})

test('默认首页模块包含购票与预约两个主转化入口', () => {
  const keys = seedData.DEFAULT_SECTIONS.map((s) => s.key)
  assert.ok(keys.includes('ticket_entry'), '缺少门票购买入口')
  assert.ok(keys.includes('reservation_entry'), '缺少立即预约入口')
  assert.ok(keys.includes('member_entry'), '会员卡与长河令入口必须保留')
})

test('默认首页模块 key 唯一、sort 唯一，且都配了跳转目标', () => {
  const sections = seedData.DEFAULT_SECTIONS
  const keys = sections.map((s) => s.key)
  const sorts = sections.map((s) => s.sort)
  assert.equal(new Set(keys).size, keys.length, 'key 必须唯一')
  assert.equal(new Set(sorts).size, sorts.length, 'sort 必须唯一，避免排序抖动')
  for (const s of sections) {
    assert.equal(typeof s.type, 'string')
    assert.ok(s.title, `${s.key} 缺少标题`)
    if (s.route) assert.ok(s.route.startsWith('/pages/'), `${s.key} 的 route 必须是绝对页面路径`)
  }
})

test('getHomePortal 的兜底模块与种子配置保持一致，避免两处漂移', () => {
  const fallback = portalCore.DEFAULT_SECTIONS.map((s) => s.key + ':' + s.sort)
  const seed = seedData.DEFAULT_SECTIONS.map((s) => s.key + ':' + s.sort)
  assert.deepEqual(fallback, seed)
})

test('种子文案不含合规禁用词，也不含参考项目品牌', () => {
  const banned = ['押注', '下注', '翻倍', '稳赚', '以小博大', '赌', '博彩', '长河落日']
  const text = JSON.stringify(seedData.DEFAULT_SECTIONS) + JSON.stringify(seedData.DEFAULT_ARTICLES)
  for (const word of banned) {
    assert.equal(text.includes(word), false, `不得出现：${word}`)
  }
})

test('种子文章均为已发布且分类合法', () => {
  const allowed = ['park_intro', 'guide', 'service', 'activity_story']
  for (const a of seedData.DEFAULT_ARTICLES) {
    assert.equal(a.status, 'published')
    assert.ok(a.slug, '文章必须有 slug')
    assert.ok(allowed.includes(a.category), `分类非法：${a.category}`)
    assert.ok(Array.isArray(a.blocks) && a.blocks.length > 0, `${a.slug} 缺少正文块`)
  }
  const slugs = seedData.DEFAULT_ARTICLES.map((a) => a.slug)
  assert.equal(new Set(slugs).size, slugs.length, 'slug 必须唯一')
})
