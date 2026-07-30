const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const projectRoot = path.resolve(__dirname, '../..')

test('线索页面和云函数已从运行代码中删除', () => {
  const retiredPaths = [
    'miniprogram/pages/service/lead',
    'miniprogram/pages/service/mine',
    'miniprogram/pages/staff/leads',
    'cloudfunctions/createServiceLead',
    'cloudfunctions/getMyServiceLeads',
    'cloudfunctions/listAssignedLeads',
    'cloudfunctions/updateServiceLead'
  ]

  for (const relativePath of retiredPaths) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, relativePath)),
      false,
      '仍存在废弃路径：' + relativePath
    )
  }
})

test('小程序路由、员工入口和我的页面不再暴露线索功能', () => {
  const app = fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8')
  const staff = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/staff/entry/entry.js'),
    'utf8'
  )
  const mine = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/mine/mine.js'),
    'utf8'
  )
  const sources = [app, staff, mine].join('\n')

  assert.doesNotMatch(sources, /pages\/service\/lead/)
  assert.doesNotMatch(sources, /pages\/service\/mine/)
  assert.doesNotMatch(sources, /pages\/staff\/leads/)
  assert.doesNotMatch(sources, /goLeads/)
  assert.doesNotMatch(sources, /我的咨询/)
})

test('活动领域模型和初始化代码不再读写服务线索集合', () => {
  const files = [
    'miniprogram/utils/const.js',
    'miniprogram/utils/domain.js',
    'cloudfunctions/initDb/index.js',
    'scripts/tcb-api.mjs'
  ]
  const sources = files
    .map((file) => fs.readFileSync(path.join(projectRoot, file), 'utf8'))
    .join('\n')

  assert.doesNotMatch(sources, /service_leads/)
  assert.doesNotMatch(sources, /LEAD_STATUS/)
  assert.doesNotMatch(sources, /SERVICE_LEADS/)
})

test('咨询型门票直接进入管家且没有废弃表单兜底', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/ticket/detail/detail.js'),
    'utf8'
  )

  assert.match(source, /pages\/concierge\/concierge/)
  assert.doesNotMatch(source, /pages\/service\/lead/)
})
