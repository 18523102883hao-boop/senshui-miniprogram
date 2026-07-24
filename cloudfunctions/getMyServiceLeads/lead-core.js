// 服务线索纯逻辑（PRD §12.1-12.4）
// 一套 schema 驱动三种服务，不写三份重复逻辑。

const COMMON_FIELDS = [
  { key: 'contactName', label: '联系人', type: 'text', required: true, maxLength: 20 },
  { key: 'contactPhone', label: '联系手机', type: 'phone', required: true },
  { key: 'budget', label: '预算区间', type: 'text', required: false, maxLength: 40, placeholder: '选填' },
  { key: 'remark', label: '补充说明', type: 'textarea', required: false, maxLength: 200, placeholder: '选填' }
]

const SCHEMAS = {
  birthday: {
    type: 'birthday',
    title: '生日宴请',
    intro: '在山水间过一个生日：场地布置、餐食与活动可按人数定制。',
    fields: [
      { key: 'birthdayDate', label: '生日日期', type: 'date', required: true },
      { key: 'partySize', label: '预计人数', type: 'number', required: true, min: 1, max: 500 },
      { key: 'planPreference', label: '偏好方案', type: 'text', required: false, maxLength: 40, placeholder: '选填' }
    ].concat(COMMON_FIELDS)
  },
  team_building: {
    type: 'team_building',
    title: '公司团建',
    intro: '场地、餐饮、活动与行程可组合定制，适合半天至两天的团队行程。',
    fields: [
      { key: 'company', label: '公司/组织', type: 'text', required: true, maxLength: 40 },
      { key: 'visitDate', label: '预计日期', type: 'date', required: true },
      { key: 'partySize', label: '预计人数', type: 'number', required: true, min: 1, max: 1000 },
      { key: 'goal', label: '团建目标', type: 'text', required: true, maxLength: 60, placeholder: '如：团队协作 / 新人融入' },
      { key: 'needs', label: '餐饮/会议/活动需求', type: 'textarea', required: false, maxLength: 200, placeholder: '选填' }
    ].concat(COMMON_FIELDS)
  },
  brand: {
    type: 'brand',
    title: '品牌合作',
    intro: '场地拍摄、联名活动与内容共创，欢迎带着想法来聊。',
    fields: [
      { key: 'brandName', label: '品牌/机构', type: 'text', required: true, maxLength: 40 },
      { key: 'cooperationType', label: '合作类型', type: 'text', required: true, maxLength: 40, placeholder: '如：场地拍摄 / 联名活动' },
      { key: 'requirement', label: '需求描述', type: 'textarea', required: true, maxLength: 300 },
      { key: 'expectDate', label: '期望时间', type: 'date', required: false }
    ].concat(COMMON_FIELDS)
  }
}

function getSchema(type) {
  return SCHEMAS[String(type || '')] || null
}

function validate(type, form) {
  const schema = getSchema(type)
  if (!schema) return { ok: false, msg: '未知的服务类型' }
  const f = form || {}

  for (const field of schema.fields) {
    const v = f[field.key]
    if (field.required && (v === undefined || v === null || String(v).trim() === '')) {
      return { ok: false, msg: '请填写' + field.label }
    }
    if (field.type === 'phone' && v && !/^1[3-9]\d{9}$/.test(String(v).trim())) {
      return { ok: false, msg: '请填写正确的' + field.label }
    }
    if (field.type === 'number' && v !== undefined && v !== '') {
      const n = Number(v)
      if (!Number.isFinite(n) || n < (field.min || 0) || n > (field.max || Infinity)) {
        return { ok: false, msg: field.label + '填写不正确' }
      }
    }
  }

  if (!f.privacyAgreed) return { ok: false, msg: '请先阅读并同意隐私政策' }
  return { ok: true }
}

/**
 * 只取 schema 声明的字段落库，客户端塞的任何多余字段（如 status）一律忽略。
 */
function buildLead(type, form, ctx, now) {
  const schema = getSchema(type)
  if (!schema) return null
  const f = form || {}
  const c = ctx || {}
  const time = now instanceof Date ? now : new Date()

  const payload = {}
  for (const field of schema.fields) {
    const v = f[field.key]
    if (v === undefined || v === null) continue
    payload[field.key] = field.type === 'number'
      ? Number(v)
      : String(v).slice(0, field.maxLength || 300)
  }

  return Object.assign(payload, {
    _openid: c.openid || '',
    type: schema.type,
    idempotencyKey: String(c.idempotencyKey || ''),
    privacyAgreed: !!f.privacyAgreed,
    status: 'new', // 状态只由服务端流转，客户端指定无效
    assigneeOpenid: '',
    nextFollowAt: null,
    history: [],
    createdAt: time,
    updatedAt: time
  })
}

const REUSABLE_STATUS = ['new', 'contacted', 'qualified', 'proposal']

function pickReusable(leads, key) {
  const k = String(key || '').trim()
  if (!k) return null
  return (Array.isArray(leads) ? leads : [])
    .filter((l) => l && l.idempotencyKey === k && REUSABLE_STATUS.indexOf(l.status) >= 0)[0] || null
}

module.exports = { SCHEMAS, COMMON_FIELDS, getSchema, validate, buildLead, pickReusable }
