// ============================================================
// 全局常量：集合名 / 云函数名 / 会员权益 / 主题色 / 长河令术语 / 合规
// ============================================================

// 云数据库集合名（与 scripts/db-init 保持一致）
const COLLECTIONS = {
  USERS: 'users',
  MEMBERS: 'members',
  COUPONS: 'coupons',
  ORDERS: 'orders',
  PRODUCTS: 'products',
  LING_ACCOUNTS: 'ling_accounts',
  LING_LEDGER: 'ling_ledger',
  ACTIVITIES: 'activities',
  NOTICES: 'notices',
  STAFF: 'staff',
  VERIFICATIONS: 'verifications',
  // 下一阶段（溪降预约）
  SESSIONS: 'sessions',
  BOOKINGS: 'bookings',
  // V2（商城）
  RENTALS: 'rentals'
}

// 云函数名
const FUNCTIONS = {
  LOGIN: 'login',
  BIND_PHONE: 'bindPhone',
  CREATE_MEMBER_ORDER: 'createMemberOrder',
  PAY_CALLBACK: 'payCallback',
  VERIFY_BENEFIT: 'verifyBenefit',
  // 溪降预约
  LIST_SESSIONS: 'listSessions',
  HOLD_SEAT: 'holdSeat',
  RELEASE_SEAT: 'releaseSeat',
  CLOSE_SESSION: 'closeSession',
  CREATE_BOOKING: 'createBooking',
  CHANGE_BOOKING: 'changeBooking',
  CANCEL_BOOKING: 'cancelBooking',
  GET_MY_BOOKINGS: 'getMyBookings'
}

// 森水会员卡权益配置（金额单位：分）（T20 调整：去酒、券改生日 85 折）
const MEMBER_CARD = {
  price: 990, // 9.9 元
  lingAmount: 1000, // 赠送长河令
  birthdayDiscount: 0.85, // 生日当天 85 折
  validDays: 365
}

// 会员权益核销类型（对应 verifyBenefit 云函数 benefitType）
const BENEFIT_TYPE = {
  LING: 'ling', // 发放 1000 长河令
  BIRTHDAY: 'birthday' // 生日当天 85 折
}

// 主题色（供 JS 内联样式使用，wxss 见 app.wxss 变量）
const THEME = {
  bg: '#F6F4F0',
  bgCard: '#FFFFFF',
  primary: '#244B36',
  primaryLight: '#3A6B4F',
  seal: '#F07055',
  gold: '#D5A43A',
  text: '#2B2B2B',
  textSub: '#6B6B6B'
}

// 长河令术语（合规：全站统一用语，禁用词表见 specs/_conventions.md）
const LING = {
  name: '长河令',
  earn: '奖励令数',
  cost: '参与令数'
}

module.exports = { COLLECTIONS, FUNCTIONS, MEMBER_CARD, BENEFIT_TYPE, THEME, LING }
