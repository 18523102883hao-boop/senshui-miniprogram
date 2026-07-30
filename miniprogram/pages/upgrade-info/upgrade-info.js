// 补差价升级（T22 / T26 自助购买版）
// 客户先选当前票种 → 选择升级项目 → 底部面板确认 → 微信支付；金额由云端锁定。
const request = require('../../utils/request.js')
const util = require('../../utils/util.js')
const { haptic } = require('../../utils/haptics.js')

const GROUPS = [
  {
    key: 'creek',
    choice: '溪降票',
    eyebrow: '已购溪降票',
    target: '升级营地',
    dir: '溪降票 → 营地',
    description: '在溪降之外，补齐营地全天权益',
    items: [
      { itemId: 'creek_adult_to_camp', name: '成人单溪降', orig: '68', add: '+¥110', addFen: 11000, benefit: '自助烧烤火锅畅吃、饮品畅饮、60 长河令、全天活动' },
      { itemId: 'creek_double_to_camp', name: '双人单溪降 · 每人', orig: '128', add: '+¥114', addFen: 11400, benefit: '可一次为多位持票人支付，每份升级为 178 套票全权益' },
      { itemId: 'creek_child_to_camp', name: '儿童单溪降', orig: '29.9', add: '+¥98', addFen: 9800, benefit: '持票儿童限身高 120 厘米（含）至 150 厘米（含）' }
    ]
  },
  {
    key: 'camp',
    choice: '营地票',
    eyebrow: '已购营地票',
    target: '加玩溪降',
    dir: '营地票 → 溪降',
    description: '保留原营地权益，再解锁溪降体验',
    items: [
      { itemId: 'camp_adult_to_creek', name: '成人单营地', orig: '158', add: '+¥20', addFen: 2000, benefit: '等同 178 套票：营地全部权益 + 溪降体验' },
      { itemId: 'camp_family_to_creek_adult', name: '亲子单营地 · 大人', orig: '198', add: '+¥68', addFen: 6800, benefit: '大人可玩溪降' },
      { itemId: 'camp_family_to_creek_child', name: '亲子单营地 · 儿童', orig: '198', add: '+¥29.9', addFen: 2990, benefit: '儿童限身高 120 厘米（含）至 150 厘米（含）' },
      { itemId: 'camp_child_to_creek', name: '儿童单营地', orig: '98', add: '+¥29.9', addFen: 2990, benefit: '加玩溪降；限身高 120 厘米（含）至 150 厘米（含）' }
    ]
  }
]

function amountText(amountFen) {
  const value = (Number(amountFen) / 100).toFixed(2).replace(/\.?0+$/, '')
  return '¥' + value
}

Page({
  data: {
    groups: GROUPS,
    activeGroupIndex: 0,
    activeGroup: GROUPS[0],
    visibleItems: GROUPS[0].items,
    benefits: [
      '权益与直接购买 178 元套票完全一致',
      '正常发放长河令',
      '可正常参与营地内所有互动活动',
      '支付成功后向现场工作人员出示即可升级'
    ],
    buy: null, // 底部购买面板 { itemId, name, add, benefit }
    staffRef: '', // 接待员工手机号后四位（选填）
    staffExpanded: false,
    quantity: 1,
    canChooseQuantity: false,
    totalAmountText: '',
    paying: false,
    success: null
  },

  // 先确定当前持有的票种，再展示对应升级项目
  onDirectionTap(e) {
    if (this.data.paying) return
    const index = Number(e.currentTarget.dataset.index)
    const group = this.data.groups[index]
    if (!group || index === this.data.activeGroupIndex) return
    haptic('light')
    this.setData({
      activeGroupIndex: index,
      activeGroup: group,
      visibleItems: group.items,
      buy: null,
      quantity: 1,
      canChooseQuantity: false,
      totalAmountText: '',
      success: null
    })
  },

  // 整行点按 → 打开购买面板
  onItemTap(e) {
    if (this.data.paying) return
    const ii = Number(e.currentTarget.dataset.ii)
    const item = this.data.visibleItems[ii]
    if (!item) return
    haptic('light')
    const quantity = 1
    this.setData({
      buy: item,
      quantity,
      canChooseQuantity: true,
      totalAmountText: amountText(item.addFen * quantity),
      success: null
    })
  },

  onMinus() {
    if (this.data.paying || !this.data.buy || this.data.quantity <= 1) return
    haptic('light')
    const quantity = this.data.quantity - 1
    this.setData({
      quantity,
      totalAmountText: amountText(this.data.buy.addFen * quantity)
    })
  },

  onPlus() {
    if (this.data.paying || !this.data.buy || this.data.quantity >= 10) return
    haptic('light')
    const quantity = this.data.quantity + 1
    this.setData({
      quantity,
      totalAmountText: amountText(this.data.buy.addFen * quantity)
    })
  },

  closeBuy() {
    if (this.data.paying) return
    this.setData({ buy: null })
  },

  noop() {},

  toggleStaff() {
    if (this.data.paying) return
    haptic('light')
    this.setData({ staffExpanded: !this.data.staffExpanded })
  },

  onStaffRef(e) {
    const staffRef = String((e.detail && e.detail.value) || '')
      .replace(/\D/g, '')
      .slice(0, 4)
    this.setData({ staffRef })
  },

  clearSuccess() {
    this.setData({ success: null })
  },

  onPay() {
    const buy = this.data.buy
    if (!buy || this.data.paying) return
    if (this.data.staffRef && !/^\d{4}$/.test(this.data.staffRef)) {
      wx.showToast({ title: '请输入员工手机号后四位', icon: 'none' })
      return Promise.resolve()
    }
    this.setData({ paying: true })
    return request.callWithLoading('createSelfUpgrade', {
      itemId: buy.itemId,
      staffRef: this.data.staffRef,
      quantity: this.data.quantity
    }, '下单中')
      .then((d) => new Promise((resolve, reject) => {
        wx.requestPayment(Object.assign({}, d.payment, {
          success: () => resolve(d),
          fail: reject
        }))
      }))
      .then((d) => {
        haptic('medium')
        const purchasedQuantity = Number(d.quantity) || this.data.quantity
        this.setData({
          paying: false,
          buy: null,
          staffRef: '',
          staffExpanded: false,
          quantity: 1,
          canChooseQuantity: false,
          totalAmountText: '',
          success: {
            itemLabel: d.itemLabel || buy.name,
            amountYuan: util.fen2yuan(d.amount),
            quantity: purchasedQuantity
          }
        })
      })
      .catch((err) => {
        this.setData({ paying: false })
        const msg = (err && err.errMsg) || (err && err.message) || ''
        if (msg.indexOf('cancel') > -1) return // 用户主动取消
        wx.showToast({ title: (err && err.message) || '支付未完成', icon: 'none' })
      })
  }
})
