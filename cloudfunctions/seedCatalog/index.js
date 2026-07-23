// 云函数：seedCatalog —— 一次性写入园区商品/服务目录到 notices(type:'catalog')（T22）
// 用法：云端测试（无需入参），幂等可重跑。价格单位=元（展示用，非交易）。
// 上线后可在云开发控制台 notices 里直接改价，或让我重跑本函数更新。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SECTIONS = [
  {
    key: 'bar', title: '酒吧', icon: '酒',
    groups: [
      {
        name: '啤酒 · 饮料', unit: '瓶',
        items: [
          { n: '青岛崂山劲爽', p: 6 }, { n: '教士白啤酒', p: 18 }, { n: '教士黑啤酒', p: 18 },
          { n: '罗斯福8号', p: 30 }, { n: '诱惑7号', p: 23 }, { n: '浅粉象', p: 30 },
          { n: '智美红帽', p: 25 }, { n: '白熊', p: 22 }, { n: '杰克熊猫啤酒', p: 12 },
          { n: '汤力水', p: 8 }, { n: '杰克熊猫桃红', p: 12 }, { n: '麒麟番榨', p: 18 },
          { n: '喜力铝罐', p: 20 }, { n: '百威啤酒', p: 13 }, { n: '百威铝罐 330ML', p: 25 },
          { n: '科罗娜 275ML', p: 13 }, { n: '福佳白啤 275ML', p: 12 }, { n: '1664桃红 250ML', p: 16 },
          { n: '白熊 330ML', p: 22 }
        ]
      },
      {
        name: '红酒', unit: '瓶',
        items: [
          { n: '拉菲传奇波尔多干红', p: 218 },
          { n: '西班牙奥兰A1 干红', p: 70 },
          { n: '法国欧德萨红卡干红', p: 148 }
        ]
      },
      {
        name: '洋酒 · 烈酒', unit: '瓶',
        items: [
          { n: '杰克丹尼', p: 308 }, { n: '绝对伏特加', p: 218 }, { n: '百利甜', p: 218 },
          { n: '芝华士 12年', p: 368 }, { n: '尊尼获加黑牌', p: 368 },
          { n: '马爹利名仕', p: 1180 }, { n: '轩尼诗 VSOP', p: 1180 }
        ]
      },
      { name: '咖啡', unit: '杯', items: [{ n: '咖啡冰美式', p: 12 }] }
    ]
  },
  {
    key: 'store', title: '小卖部', icon: '购',
    groups: [
      {
        name: '饮料 · 食品', unit: '',
        items: [
          { n: '娃哈哈 / 营养快线', p: 7 }, { n: '旺仔牛奶', p: 8 }, { n: '加多宝', p: 6 },
          { n: '红牛', p: 12 }, { n: '阿萨姆', p: 6 }, { n: '茶π', p: 7 },
          { n: '可口可乐', p: 5 }, { n: '百事可乐', p: 5 }, { n: '东方树叶', p: 7 },
          { n: '水溶C', p: 7 }, { n: '脉动', p: 7 }, { n: '尖叫', p: 7 },
          { n: '宜间无气苏打水', p: 5 }, { n: '娃哈哈矿泉水', p: 3 }, { n: '雪碧', p: 5 },
          { n: '方便面（大）', p: 15 }, { n: '方便面（小）', p: 10 }
        ]
      },
      {
        name: '日用 · 装备', unit: '',
        items: [
          { n: '赶海服', p: 60 }, { n: '七度卫生巾（日用）', p: 12 }, { n: '自由点卫生巾（日用）', p: 15 },
          { n: '手机防水袋', p: 15 }, { n: '七度卫生巾（夜用）', p: 15 }, { n: '洞洞鞋（儿童）', p: 20 },
          { n: '洞洞鞋（成人）', p: 25 }, { n: '单管水枪', p: 15 }, { n: '双管水枪（长）', p: 15 },
          { n: '三管水枪', p: 20 }, { n: '背包水枪', p: 25 }, { n: '扑克牌', p: 5 },
          { n: '纸质麻将扑克牌', p: 5 }, { n: '掼蛋牌', p: 5 }, { n: '水桶、网杆', p: 15 }
        ]
      }
    ]
  },
  {
    key: 'rental', title: '装备租赁', icon: '租',
    rentals: [
      { n: '吊床', rent: 20, deposit: 30 },
      { n: '麻将 + 麻将桌', rent: 30, deposit: 200 },
      { n: '掼蛋桌', rent: 20, deposit: 150 }
    ]
  },
  {
    key: 'service', title: '服务', icon: '服',
    services: [
      { n: '露营风扇', deposit: 100, desc: '免费使用，仅交押金 100 元/台；用完归还至「拾光驿站」，押金全额退还。' }
    ]
  }
]

exports.main = async () => {
  const notices = db.collection('notices')
  const now = new Date()
  const existed = await notices.where({ type: 'catalog' }).limit(1).get()
  if (existed.data.length) {
    await notices.doc(existed.data[0]._id).update({ data: { sections: SECTIONS, enabled: true, updatedAt: now } })
    return { code: 0, msg: 'ok', data: { action: 'updated', sections: SECTIONS.length } }
  }
  await notices.add({ data: { type: 'catalog', sections: SECTIONS, enabled: true, createdAt: now, updatedAt: now } })
  return { code: 0, msg: 'ok', data: { action: 'created', sections: SECTIONS.length } }
}
