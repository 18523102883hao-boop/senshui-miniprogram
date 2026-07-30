// 入园攻略（功能扩展 Task 5）
// PRD §10.3。已确认信息按业主口径展示；未确认设施一律「请咨询管家」，不编造。
// 数据分两层：本地默认分组（永远可用）+ 云端 visit-guide 文章（可选补充）。
// 业主 2026-07-26 起攻略内容全部固化在本地分组，种子不再预置这篇文章；
// 运营若要追加内容，在 articles 里新建 slug=visit-guide 即可自动出现在页尾。
const request = require('../../utils/request.js')
const env = require('../../env.js')
const { haptic } = require('../../utils/haptics.js')
const { makePhoneCall } = require('../../utils/util.js')

const ASK = '请咨询管家' // 未确认项统一文案（PRD §28.7）

// 营业与入园时间由 env.park.hours 推导，避免和首页/园区页写成两套口径。
// 营地与溪降时段不同，必须分开写，否则客人会按溪降时间理解整个园区。
function businessHoursText(hours) {
  const h = hours || {}
  const camp = h.camp, creek = h.creek
  if (!camp || !creek) return ASK
  const campPart = camp.label + ' ' + camp.open + '-' + camp.close +
    (camp.cutoff ? '（' + camp.cutoff + ' ' + camp.cutoffLabel + '）' : '')
  return campPart + '；' + creek.label + ' ' + creek.open + '-' + creek.close
}

function admissionHoursText(hours) {
  const h = hours || {}
  const camp = h.camp, creek = h.creek
  if (!camp || !creek) return ASK
  return creek.label + ' ' + creek.close + ' ' + (creek.closeLabel || '停止检票') +
    '；' + camp.label + '营业时间内可入园'
}

// 溪降游玩注意事项（业主 2026-07-26：与原「运营补充」合并，放在园区设施之后）
const CREEK_TIPS = [
  '速干衣裤与备用衣物',
  '溯溪鞋或防滑鞋',
  '防晒与驱蚊'
]
const BLOCK_TYPES = ['hero', 'text', 'image', 'gallery', 'list', 'notice', 'feature_grid', 'service_list', 'timeline', 'faq', 'cta']

// status: 'confirmed' = 业主已确认；'ask' = 待确认，显示「请咨询管家」
function buildGroups(park) {
  const p = park || {}
  return [
    {
      key: 'transport',
      title: '如何到达',
      icon: '/assets/icons/forest/map-route.png',
      items: [
        { title: '园区地址', desc: p.address || ASK, status: p.address ? 'confirmed' : 'ask' },
        { title: '公共交通', desc: '黑山镇招呼站（公交站）下车，步行约 10 米', status: 'confirmed' },
        { title: '自驾导航', desc: p.latitude && p.longitude ? '点击下方「一键导航」' : '搜索「森水长河」或复制地址导航', status: 'confirmed' },
        { title: '停车信息', desc: '园区提供免费停车位', status: 'confirmed' },
        { title: '接驳与摆渡车', desc: '溪降票含摆渡车，具体班次以现场安排为准', status: 'confirmed' }
      ]
    },
    {
      key: 'admission',
      title: '营业与入园',
      icon: '/assets/icons/forest/home-open-status.png',
      items: [
        { title: '营业时间', desc: businessHoursText(p.hours), status: 'confirmed' },
        { title: '入园时间', desc: admissionHoursText(p.hours), status: 'confirmed' },
        { title: '是否需要预约', desc: '溪降无需预约，高峰期可能排队；营地需提前 1 天预约', status: 'confirmed' }
      ]
    },
    {
      key: 'facility',
      title: '园区设施',
      icon: '/assets/icons/forest/map-service-center.png',
      items: [
        { title: '餐饮', desc: '营地票含自助火锅 / 烧烤 / 鸡汤饭', status: 'confirmed' },
        { title: '装备与安全设备', desc: '溪降票含安全设备与救生衣', status: 'confirmed' },
        { title: '淋浴与更衣', desc: '提供淋浴与更衣间', status: 'confirmed' }
      ]
    },
    {
      // 业主 2026-07-26：原「运营补充」与页尾的溪降提醒合并成一项，紧跟园区设施
      key: 'creek_notice',
      title: '溪降游玩注意事项',
      icon: '/assets/icons/forest/booking-safety.png',
      tipsTitle: '建议携带',
      tips: CREEK_TIPS,
      items: [
        // 不写「以工作人员判断为准」——判定口径统一指向票详情页的须知，避免两处说法不一
        { title: '参与条件', desc: '溪降项目对年龄、身高和身体状况有要求，以溪降票详情页的须知为准', status: 'confirmed' }
      ]
    },
    {
      key: 'safety',
      title: '安全提醒',
      icon: '/assets/icons/forest/booking-safety.png',
      items: [
        // 身高与强度是已确认的安全规则，写死默认值，env 可覆盖
        { title: '身高限制', desc: p.heightLimit || '成人限制身高 150 厘米（含）以上；儿童限制身高 120 厘米（含）至 150 厘米（含）', status: 'confirmed' },
        { title: '溪降强度', desc: p.creekNote || '溪降全程约 2 公里，游玩时长约 1.5 小时', status: 'confirmed' },
        { title: '身体状况', desc: '孕妇、心脑血管疾病及其他不适宜剧烈运动者请勿参加', status: 'confirmed' },
        { title: '天气与水位', desc: '遇强降雨或上游涨水会临时停运，以现场公告为准', status: 'confirmed' }
      ]
    },
    {
      key: 'service',
      title: '咨询与服务',
      icon: '/assets/icons/forest/customer-service.png',
      items: [
        { title: '游客咨询', desc: '前台电话 ' + (env.frontDeskPhone || ASK), status: env.frontDeskPhone ? 'confirmed' : 'ask' },
        { title: '投诉建议', desc: '可在小程序「我的」提交，或联系前台', status: 'confirmed' },
        { title: '失物招领', desc: '请联系前台或管家登记', status: 'confirmed' },
        { title: '装备租赁', desc: '见小程序「商品与服务」价目表', status: 'confirmed' }
      ]
    }
  ]
}

// 这几块内容已固化到本地「溪降游玩注意事项」分组，云端旧 article 里还留着同名区块，
// 一起渲染就会出现两份。按标题/内容过滤掉，云端以后新增别的区块仍会正常显示。
const LOCALIZED_LIST_TITLES = ['建议携带', '一天怎么安排']
const LOCALIZED_NOTICE = /溪降项目对年龄/

function isLocalized(block) {
  const data = block.data || {}
  if (block.type === 'list') return LOCALIZED_LIST_TITLES.indexOf(data.title) >= 0
  if (block.type === 'notice') return LOCALIZED_NOTICE.test(data.text || '')
  return false
}

function sanitizeBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && BLOCK_TYPES.indexOf(b.type) >= 0)
    .filter((b) => !isLocalized(b))
    .map((b) => ({ type: b.type, data: b.data || {} }))
}

Page({
  data: {
    park: env.park || {},
    frontPhone: env.frontDeskPhone,
    groups: buildGroups(env.park),
    article: null, // 云端补充内容（可选）
    blocks: [],
    hasError: false,
    canNavigate: !!(env.park && env.park.latitude && env.park.longitude)
  },

  onLoad() {
    return this.loadArticle()
  },

  // 云端攻略是"补充/覆盖"，拉不到不影响本地分组
  loadArticle() {
    return request.call('getArticle', { slug: 'visit-guide' })
      .then((d) => {
        const article = d && d.article
        if (!article) return
        this.setData({ article, blocks: sanitizeBlocks(article.blocks) })
      })
      .catch(() => {
        this.setData({ hasError: false }) // 本地内容可用，不算错误
      })
  },

  onNavigate() {
    haptic('light')
    const p = this.data.park || {}
    // 坐标未确认时绝不调用导航，改为复制地址（PRD §28.7）
    if (!p.latitude || !p.longitude) {
      wx.setClipboardData({ data: p.address || '' })
      wx.showToast({ title: '地址已复制，可粘贴到地图 App', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      name: p.name || '森水长河',
      address: p.address || '',
      scale: 16
    })
  },

  onCallFront() {
    makePhoneCall(this.data.frontPhone)
  },

  goConcierge() {
    haptic('light')
    wx.navigateTo({
      url: '/pages/concierge/concierge',
      fail: () => wx.showToast({ title: '该功能即将开放', icon: 'none' })
    })
  },

  onShareAppMessage() {
    return { title: '森水长河 · 入园攻略', path: '/pages/guide/guide' }
  }
})
