// 玩 · 长河令（T06 / T25 Vibe UI 深色沉浸页）
// 合规红线：统一用「参与令数 / 奖励令数」；禁用词表见 specs/_conventions.md；拍卖仅介绍、不做线上竞拍。
const request = require('../../utils/request.js')
const { haptic } = require('../../utils/haptics.js')

Page({
  data: {
    myLing: 0,
    story:
      '传说森水长河为「长河十二侠」镇守之地。入园即入江湖——参与擂台、完成营区试炼，即可获得「奖励令数」。持令可参与拍卖会、兑换侠客信物。令在江湖，快意用之。',
    // 悬赏榜前端固定（不读数据库旧 seed，避免钓小龙虾等测试数据再出现）；与首页日程一致
    earnList: [
      { id: 'e1', name: '侠客滩捕鱼', reward: 0, join: 0, time: '13:00 / 16:00', location: '侠客滩' },
      { id: 'e2', name: '侠客打擂乐园', reward: 0, join: 0, time: '14:20', location: '打擂台' },
      { id: 'e3', name: '海鲜大拍卖', reward: 0, join: 0, time: '17:00', location: '主舞台' }
    ],
    exchangeList: [
      { id: 'x1', name: '森水侠客水杯', cost: 800 },
      { id: 'x2', name: '愤怒的小鸟玩偶', cost: 500 },
      { id: 'x3', name: '拍卖会入场（介绍）', cost: 0 }
    ],
    npcSchedule: [
      { id: 'n1', name: '长河大侠巡游', time: '11:00 / 16:00', route: '主街 → 营地' }
    ],
    preview: null // 长按兑换预览 { name, cost }
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
    request.call('getLingContent', {}).then((d) => {
      if (!d) return
      this.setData({
        story: d.story || this.data.story,
        // earnList 用前端固定，不被数据库旧 seed 覆盖
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
  },

  goMycode() {
    haptic('light')
    wx.navigateTo({ url: '/pages/ling/mycode/mycode' })
  },

  // 悬赏项整行点击：展示参与说明
  onEarnTap(e) {
    const id = e.currentTarget.dataset.id
    const it = this.data.earnList.find((x) => x.id === id)
    if (!it) return
    haptic('light')
    const lines = [
      `时间：${it.time}`,
      `地点：${it.location}`,
      it.reward > 0 ? `奖励令数：${it.reward}` : '奖励令数：以现场公示为准',
      it.join > 0 ? `参与令数：${it.join}` : '参与令数：免费'
    ]
    wx.showModal({ title: it.name, content: lines.join('\n'), showCancel: false, confirmText: '知道了' })
  },

  // 长按兑换项：大字预览所需令数
  onExchangePreview(e) {
    const id = e.currentTarget.dataset.id
    const it = this.data.exchangeList.find((x) => x.id === id)
    if (!it) return
    haptic('light')
    this.setData({ preview: it })
  },

  closePreview() {
    this.setData({ preview: null })
  }
})
