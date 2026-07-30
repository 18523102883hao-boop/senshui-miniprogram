// 投诉建议 / 失物招领纯逻辑（PRD §15.2）
// 合规：不承诺未经业务方确认的处理时限，不照搬参考项目的悬赏承诺。

const MAX_IMAGES = 6
const MAX_CONTENT = 500
const MIN_CONTENT = 5

const FEEDBACK_TYPES = [
  { key: 'complaint', title: '投诉', placeholder: '请描述遇到的问题、时间和地点，便于我们核实' },
  { key: 'suggestion', title: '建议', placeholder: '你希望我们改进什么？' },
  { key: 'praise', title: '表扬', placeholder: '哪位同事或哪个环节让你满意？' },
  { key: 'lost_found', title: '失物招领', placeholder: '请描述物品特征、遗失时间与大致位置' }
]

const STATUS = ['submitted', 'processing', 'resolved', 'closed']

// 对用户展示的状态文案：只说到哪一步，不承诺多久（时限业务方未确认，PRD §28.9）
const STATUS_TEXT = {
  submitted: '已提交',
  processing: '处理中',
  resolved: '已处理',
  closed: '已关闭'
}

function typeKeys() {
  return FEEDBACK_TYPES.map((t) => t.key)
}

function validate(form) {
  const f = form || {}
  if (typeKeys().indexOf(String(f.type || '')) < 0) return { ok: false, msg: '请选择反馈类型' }

  const content = String(f.content || '').trim()
  if (!content) return { ok: false, msg: '请填写具体内容' }
  if (content.length < MIN_CONTENT) return { ok: false, msg: '请再详细描述一下，便于我们核实处理' }
  if (content.length > MAX_CONTENT) return { ok: false, msg: '内容不超过 ' + MAX_CONTENT + ' 字' }

  const images = Array.isArray(f.images) ? f.images : []
  if (images.length > MAX_IMAGES) return { ok: false, msg: '最多上传 ' + MAX_IMAGES + ' 张图片' }

  // 勾了「可以电话联系我」就必须留下能打通的号码，否则等于没留
  if (f.allowCall && !/^1[3-9]\d{9}$/.test(String(f.phone || '').trim())) {
    return { ok: false, msg: '选择电话联系需填写正确的手机号' }
  }
  return { ok: true }
}

// 字段白名单：客户端塞的 status 等一律丢弃
function buildFeedback(form, ctx, now) {
  const f = form || {}
  const c = ctx || {}
  const time = now instanceof Date ? now : new Date()
  return {
    _openid: c.openid || '',
    type: String(f.type || ''),
    content: String(f.content || '').trim().slice(0, MAX_CONTENT),
    images: (Array.isArray(f.images) ? f.images : []).slice(0, MAX_IMAGES).map((x) => String(x)),
    relatedOrderNo: String(f.relatedOrderNo || '').slice(0, 32),
    allowCall: !!f.allowCall,
    phone: f.allowCall ? String(f.phone || '').trim().slice(0, 20) : '',
    status: 'submitted', // 只能由服务端流转
    reply: '',
    handledBy: '',
    createdAt: time,
    updatedAt: time
  }
}

module.exports = { MAX_IMAGES, MAX_CONTENT, MIN_CONTENT, FEEDBACK_TYPES, STATUS, STATUS_TEXT, typeKeys, validate, buildFeedback }
