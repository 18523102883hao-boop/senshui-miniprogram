// 玩 · 长河令（T06）——内容承载页
// 合规红线：统一用「参与令数 / 奖励令数」；禁用词表见 specs/_conventions.md；拍卖仅介绍、不做线上竞拍。
const request = require('../../utils/request.js')

Page({
  data: {
    myLing: 0,
    story:
      '传说森水长河为「长河十二侠」镇守之地。入园即入江湖——参与擂台、完成营区试炼，即可获得「奖励令数」。持令可参与拍卖会、兑换侠客信物。令在江湖，快意用之。',
    earnList: [
      { id: 'e1', name: '钓小龙虾擂台', reward: 30, join: 10, time: '14:00', location: '溪畔' },
      { id: 'e2', name: '摸鱼捉螃蟹', reward: 20, join: 0, time: '10:30', location: '滩涂营地' },
      { id: 'e3', name: '套鸭子 · 投篮球', reward: 15, join: 5, time: '全天', location: '游戏区' }
    ],
    exchangeList: [
      { id: 'x1', name: '森水侠客水杯', cost: 800 },
      { id: 'x2', name: '愤怒的小鸟玩偶', cost: 500 },
      { id: 'x3', name: '拍卖会入场（介绍）', cost: 0 }
    ],
    npcSchedule: [
      { id: 'n1', name: '长河大侠巡游', time: '11:00 / 16:00', route: '主street → 营地' }
    ]
  },

  onLoad() {
    this.loadContent()
  },

  onShow() {
    this.loadMyLing()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1, theme: 'dark' })
    }
  },

  loadContent() {
    // TODO：擂台/兑换表来自 activities 集合（后台可配），见 specs/T06
    request.call('getLingContent', {}).then((d) => {
      if (!d) return
      this.setData({
        story: d.story || this.data.story,
        earnList: d.earnList || this.data.earnList,
        exchangeList: d.exchangeList || this.data.exchangeList,
        npcSchedule: d.npcSchedule || this.data.npcSchedule
      })
    }).catch(() => {})
  },

  loadMyLing() {
    // 会员卡发放的令先记电子账（ling_accounts），未登录/未开卡则为 0
    request.call('getLingBalance', {})
      .then((d) => this.setData({ myLing: (d && d.balance) || 0 }))
      .catch(() => {})
  }
})
