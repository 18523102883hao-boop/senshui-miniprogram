#!/usr/bin/env node
/**
 * 敏感词扫描（T17 合规红线）
 * 扫描 miniprogram/ 下 .wxml/.js/.json/.wxss 文案，命中禁用词即非 0 退出，可纳入提审前 / CI 流程。
 * 用法：node scripts/check-sensitive-words.js
 */
const fs = require('fs')
const path = require('path')

// 禁用词表（与 specs/_conventions.md §6 一致）
const WORDS = ['押注', '下注', '翻倍', '稳赚', '以小博大', '博彩', '赌']
const EXTS = ['.wxml', '.js', '.json', '.wxss']
const SKIP_DIRS = ['miniprogram_npm', 'node_modules', '.git']

const ROOT = path.join(__dirname, '..', 'miniprogram')
const hits = []

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const stat = fs.statSync(p)
    if (stat.isDirectory()) {
      if (SKIP_DIRS.includes(name)) continue
      walk(p)
    } else if (EXTS.includes(path.extname(name))) {
      scan(p)
    }
  }
}

function scan(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    WORDS.forEach((w) => {
      if (line.includes(w)) {
        hits.push({ file: path.relative(path.join(__dirname, '..'), file), line: i + 1, word: w, text: line.trim() })
      }
    })
  })
}

if (!fs.existsSync(ROOT)) {
  console.error('未找到 miniprogram/ 目录')
  process.exit(2)
}

walk(ROOT)

if (hits.length) {
  console.error(`\x1b[31m❌ 命中敏感词 ${hits.length} 处：\x1b[0m`)
  hits.forEach((h) => console.error(`  ${h.file}:${h.line}  [${h.word}]  ${h.text}`))
  process.exit(1)
} else {
  console.log('\x1b[32m✅ 敏感词扫描通过，0 命中\x1b[0m')
}
