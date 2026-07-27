// 首页模块与内容中心的默认种子数据（PRD §7.2 模块顺序 / §17.1 / §17.2）
// 纯数据文件，不依赖云 SDK，便于本地测试与前端弱网降级参考。
// 注意：route 必须指向真实存在（或本轮将建成）的页面，不允许"点了无反应"。

// 首页模块。sort 以 10 递增，方便运营在中间插入模块。
const DEFAULT_SECTIONS = [
  {
    key: 'hero',
    type: 'hero',
    title: '森水长河',
    subtitle: '峡谷溯溪 · 山野露营 · 长河令江湖',
    imageFileId: '',
    route: '',
    params: {},
    visible: true,
    sort: 10
  },
  {
    key: 'quick_park_intro',
    type: 'quick_entry',
    title: '园区介绍',
    subtitle: '图文详解',
    // 内容在公众号上随时更新，小程序不再维护副本（业主 2026-07-26）
    route: 'external:article',
    params: { url: 'https://mp.weixin.qq.com/s/2xr8EjCVa1MUOkFEeIMC9A', title: '园区介绍' },
    visible: true,
    sort: 20
  },
  {
    key: 'quick_activities',
    type: 'quick_entry',
    title: '精彩活动',
    subtitle: '图文详解',
    route: 'external:article',
    params: { url: 'https://mp.weixin.qq.com/s/LHxIYlwBJi3QqC1bxaa5LA', title: '精彩活动' },
    visible: true,
    sort: 30
  },
  {
    key: 'quick_guide',
    type: 'quick_entry',
    title: '入园攻略',
    subtitle: '交通 · 装备 · 注意事项',
    route: '/pages/guide/guide',
    params: {},
    visible: true,
    sort: 40
  },
  {
    key: 'quick_concierge',
    type: 'quick_entry',
    title: '管家服务',
    subtitle: '到园前后有人对接',
    route: '/pages/concierge/concierge',
    params: {},
    visible: true,
    sort: 50
  },
  {
    key: 'ticket_entry',
    type: 'primary_action',
    title: '门票购买',
    subtitle: '在线选票 · 入园扫码',
    route: '/pages/ticket/ticket',
    params: {},
    visible: true,
    sort: 60
  },
  {
    key: 'reservation_entry',
    type: 'primary_action',
    title: '立即预约',
    subtitle: '团队到园 · 研学 · 亲友聚会',
    route: '/pages/reservation/entry/entry',
    params: {},
    visible: true,
    sort: 70
  },
  {
    key: 'upgrade_entry',
    type: 'primary_action',
    title: '补差价升级',
    subtitle: '单项票升套票 · 现场办理',
    route: '/pages/upgrade-info/upgrade-info',
    params: {},
    visible: true,
    sort: 75
  },
  {
    key: 'user_status',
    type: 'user_status',
    title: '我的行程',
    subtitle: '未使用门票与即将到来的预约',
    route: '',
    params: {},
    visible: true,
    sort: 80
  },
  {
    key: 'service_birthday',
    type: 'service_card',
    title: '生日宴请',
    subtitle: '在山水间过一个生日',
    route: '/pages/service/detail/detail',
    params: { type: 'birthday' },
    visible: true,
    sort: 90
  },
  {
    key: 'service_teambuilding',
    type: 'service_card',
    title: '公司团建',
    subtitle: '定制行程与场地',
    route: '/pages/service/detail/detail',
    params: { type: 'teambuilding' },
    visible: true,
    sort: 100
  },
  {
    key: 'service_brand',
    type: 'service_card',
    title: '品牌合作',
    subtitle: '场地拍摄与联名活动',
    route: '/pages/service/detail/detail',
    params: { type: 'brand' },
    visible: true,
    sort: 110
  },
  {
    key: 'member_entry',
    type: 'member',
    title: '森水会员卡 · 长河令',
    subtitle: '9.9 元开卡 · 1000 长河令 + 生日 85 折',
    route: '/pages/member/detail/detail',
    params: {},
    visible: true,
    sort: 120
  },
  {
    key: 'today_activities',
    type: 'activities',
    title: '今日活动',
    subtitle: '',
    route: '',
    params: {},
    visible: true,
    sort: 130
  },
  {
    key: 'park_map',
    type: 'map',
    title: '园区地图',
    subtitle: '营地图 · 溪降图',
    route: '',
    params: {},
    visible: true,
    sort: 140
  },
  {
    key: 'footer',
    type: 'footer',
    title: '联系与帮助',
    subtitle: '客服电话 · 协议与政策',
    route: '',
    params: {},
    visible: true,
    sort: 150
  }
]

// 内容中心种子文章。正文块类型限 text / image / list / notice（见 getArticle 的白名单）。
const DEFAULT_ARTICLES = [
  {
    slug: 'park-intro',
    category: 'park_intro',
    title: '森水长河是什么样的园区',
    summary: '峡谷溪流 + 营地 + 江湖玩法，一天可以怎么安排',
    coverFileId: '',
    status: 'published',
    blocks: [
      { type: 'text', data: { text: '森水长河依峡谷溪流而建，把溯溪、露营和"长河令"江湖玩法放在同一片山水里。' } },
      { type: 'list', data: { title: '园区分区', items: ['溪降峡谷区', '滩涂营地区', '侠客滩与打擂台', '主舞台与集市'] } },
      { type: 'notice', data: { text: '溪降开放时间 10:00-16:30，遇强降雨或上游涨水会临时停运，以现场公告为准。' } }
    ]
  },
  {
    slug: 'concierge-service',
    category: 'service',
    title: '管家服务能帮你做什么',
    summary: '行前咨询、到园对接、团队与特殊场景安排',
    coverFileId: '',
    status: 'published',
    blocks: [
      { type: 'text', data: { text: '管家会在到园前确认人数与时间，到园后对接换装、装备和活动场次。' } },
      { type: 'list', data: { title: '常见需求', items: ['团队到园动线安排', '生日与纪念日布置', '摄影与跟拍协调', '餐食与营地加购'] } }
    ]
  }
]

module.exports = { DEFAULT_SECTIONS, DEFAULT_ARTICLES }
