// 首页状态驱动逻辑（Vibe UI v2.0 阶段4）
// STYLE.md §8「向导首屏只回答：今天是否开放 / 我的票或预约 / 下一步」
//
// 取消「已到园」判定 —— 没有闸机/探针数据，定位在山谷精度差，无法可靠区分。
// 只用数据能确定的信号：交易记录、未使用票、有效预约、会员状态、已核销票。

// 新客福利（原 Task 17 / PRD §11.2）
// 福利内容业主尚未确认（PRD §28.8），首版引导到 9.9 会员卡（这本身就是最实在的新客福利），
// 不承诺任何未确认的具体权益，待业主定后再接领取逻辑。
const NEWBIE_WELFARE = {
  title: '新客专享',
  desc: '9.9 元开森水会员卡，得 1000 长河令 + 生日 85 折',
  cta: '了解会员卡',
  route: '/pages/member/detail/detail'
}

/**
 * 根据用户摘要解析首页状态。
 * @param {object} summary { unusedTicketCount, upcomingReservation, isMember, usedTicketCount, hasAnyOrder }
 * @returns {{stage, quickBar, showNewbieWelfare, showMemberPromo, isMember}}
 */
function resolveHomeState(summary) {
  const s = summary || {}
  const unused = Number(s.unusedTicketCount) || 0
  const resv = s.upcomingReservation || null
  const used = Number(s.usedTicketCount) || 0
  const isMember = !!s.isMember
  // 有过任何一种交易痕迹就不再是新客
  const hasOrder = !!s.hasAnyOrder || unused > 0 || used > 0 || isMember || !!resv

  // 顶部快捷条：只展示"最紧要的下一步"。
  // 有未使用票的人马上要入园，入园码优先级最高；其次是预约。
  let quickBar = null
  if (unused > 0) {
    quickBar = {
      type: 'ticket',
      text: unused + ' 张待使用门票',
      cta: '查看入园码',
      route: '/pages/ticket/wallet/wallet'
    }
  } else if (resv) {
    quickBar = {
      type: 'reservation',
      text: (resv.visitDate || '') + ' 团队预约 · ' + (resv.partySize || 0) + ' 人',
      cta: '查看预约',
      route: '/pages/reservation/detail/detail',
      param: resv.reservationId || ''
    }
  }

  let stage
  if (!hasOrder) stage = 'first'
  else if (unused > 0 || resv) stage = 'active'
  else if (isMember) stage = 'member'
  else stage = 'returning'

  return {
    stage,
    quickBar,
    showNewbieWelfare: stage === 'first',
    showMemberPromo: !isMember, // 非会员始终可推会员（新客/老客都推）
    isMember
  }
}

module.exports = { resolveHomeState, NEWBIE_WELFARE }
