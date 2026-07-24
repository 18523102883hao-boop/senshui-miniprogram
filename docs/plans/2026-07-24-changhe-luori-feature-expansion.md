# 森水长河全功能补齐 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不删除会员卡、长河令、补差价和溪降等现有功能的前提下，补齐参考长河落日园小程序体现的购票、预约、内容攻略、特色服务、订单和售后闭环。

**Architecture:** 继续使用微信原生小程序和 CloudBase。首页由云端配置驱动；内容使用结构化文章；票务、团队预约、服务线索和反馈分别使用独立业务集合，通过统一订单/预约展示层聚合到用户端。原生票务支持 `native_pay`、`external_channel`、`contact_service` 三种履约模式，避免支付资质阻塞全部功能。

**Tech Stack:** 微信原生小程序、CloudBase 云函数/云数据库/云存储/云支付、Node.js `node:test`、现有 `request.js`、现有动态二维码依赖。

---

## 开发纪律

1. 每个任务开始前重读 `.scratch/changhe-luori-benchmark/spec.md` 对应章节。
2. 测试先行；页面行为使用现有 `tests/upgrade-info-page.test.js` 的 Page 挂载方式。
3. 一个页面完成、自测、提交后再改下一个页面。
4. 不修改参考截图文件，不提交 `设计方法/长河落日圆参考图/`。
5. 不硬编码真实价格、地址、电话和设施承诺；未确认内容使用草稿配置。
6. 不删除现有路由和云函数。
7. 每个涉及金额、库存、退款或核销的任务必须补并发/幂等测试。

## Task 1：建立契约测试和公共领域常量

**Files:**

- Create: `tests/feature-expansion/contracts.test.js`
- Create: `miniprogram/utils/domain.js`
- Modify: `miniprogram/utils/const.js`
- Modify: `docs/数据模型.md`

**Step 1: 写失败测试**

测试以下稳定契约：

- 订单类型保留 `member_card`、`ticket_upgrade`，新增 `ticket_order`。
- 票券、团队预约、线索和反馈状态值唯一且完整。
- 金额格式化只接收整数分。
- 长河令禁用词不出现在新增文案常量中。

**Step 2: 运行并确认失败**

Run:

```bash
node --test tests/feature-expansion/contracts.test.js
```

Expected: FAIL，因为 `miniprogram/utils/domain.js` 尚不存在。

**Step 3: 最小实现**

在 `domain.js` 导出冻结常量和纯函数，不包含页面状态：

- `ORDER_TYPES`
- `TICKET_STATUS`
- `VISIT_RESERVATION_STATUS`
- `LEAD_STATUS`
- `FEEDBACK_STATUS`
- `fenToYuan`

**Step 4: 验证**

```bash
node --test tests/feature-expansion/contracts.test.js
node --check miniprogram/utils/domain.js
```

Expected: PASS，语法检查 0 error。

**Step 5: Commit**

```bash
git add tests/feature-expansion/contracts.test.js miniprogram/utils/domain.js miniprogram/utils/const.js docs/数据模型.md
git commit -m "test: define feature expansion domain contracts"
```

## Task 2：建立首页和内容配置数据

**Files:**

- Create: `cloudfunctions/seedPortalContent/index.js`
- Create: `cloudfunctions/seedPortalContent/package.json`
- Create: `cloudfunctions/getHomePortal/index.js`
- Create: `cloudfunctions/getHomePortal/package.json`
- Create: `cloudfunctions/listArticles/index.js`
- Create: `cloudfunctions/listArticles/package.json`
- Create: `cloudfunctions/getArticle/index.js`
- Create: `cloudfunctions/getArticle/package.json`
- Create: `tests/feature-expansion/portal-cloud.test.js`
- Modify: `cloudfunctions/initDb/index.js`
- Modify: `docs/数据模型.md`
- Modify: `scripts/db-init.md`

**Step 1: 写失败测试**

用依赖注入/纯函数测试：

- 首页模块只返回可见且在有效期内的配置。
- 模块按 `sort` 排序。
- 文章只返回 `published`。
- 首页摘要不返回其他用户的数据。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/portal-cloud.test.js
```

**Step 3: 实现集合与接口**

新增：

- `home_configs`
- `articles`

`getHomePortal` 返回：

```js
{
  notice,
  sections,
  activities,
  userSummary: {
    unusedTicketCount,
    upcomingReservation
  }
}
```

匿名/弱网时 `userSummary` 允许为空。不得因摘要查询失败导致首页整体失败。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/portal-cloud.test.js
for f in cloudfunctions/{seedPortalContent,getHomePortal,listArticles,getArticle}/index.js; do node --check "$f"; done
```

**Step 5: Commit**

```bash
git add cloudfunctions/seedPortalContent cloudfunctions/getHomePortal cloudfunctions/listArticles cloudfunctions/getArticle tests/feature-expansion/portal-cloud.test.js cloudfunctions/initDb/index.js docs/数据模型.md scripts/db-init.md
git commit -m "feat: add configurable portal content APIs"
```

## Task 3：首页门户重构

**Files:**

- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/index/index.json`
- Create: `tests/feature-expansion/index-page.test.js`
- Add/Modify: `miniprogram/assets/icons/forest/*`，仅按 `ICON_MANIFEST.md` 和 `icon-map.json`

**Step 1: 写失败测试**

断言：

- 首屏存在“门票购买”和“立即预约”。
- 快捷入口包含园区介绍、精彩活动、入园攻略、管家服务。
- 服务卡包含生日宴请、公司团建、品牌合作。
- 有票/预约摘要时显示状态卡；无摘要不占空白。
- 每个入口路由唯一且可配置。
- 原会员卡、今日活动、地图仍存在。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/index-page.test.js
```

**Step 3: 实现**

- 将 `getHomeData` 调用切换/兼容到 `getHomePortal`。
- 保留旧数据降级。
- 把硬编码入口变成带本地默认值的云端配置。
- 不在本任务实现目标子页面，只确保路由注册和入口结构完成。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/index-page.test.js
node --check miniprogram/pages/index/index.js
```

在微信开发者工具检查首屏、安全区、弱网和返回状态。

**Step 5: Commit**

```bash
git add miniprogram/pages/index tests/feature-expansion/index-page.test.js miniprogram/assets/icons/forest
git commit -m "feat: turn home into visitor service portal"
```

## Task 4：园区介绍和结构化文章页

**Files:**

- Create: `miniprogram/pages/content/list/list.js`
- Create: `miniprogram/pages/content/list/list.wxml`
- Create: `miniprogram/pages/content/list/list.wxss`
- Create: `miniprogram/pages/content/list/list.json`
- Create: `miniprogram/pages/content/detail/detail.js`
- Create: `miniprogram/pages/content/detail/detail.wxml`
- Create: `miniprogram/pages/content/detail/detail.wxss`
- Create: `miniprogram/pages/content/detail/detail.json`
- Create: `tests/feature-expansion/content-pages.test.js`
- Modify: `miniprogram/app.json`

**Step 1: 写失败测试**

覆盖：

- 分类列表、分页、空态和重试。
- 详情按区块渲染 `hero/text/image/feature_grid/service_list/timeline/faq/cta`。
- CTA 只允许白名单路由和 `openLocation/makePhoneCall`。
- 页面可分享。
- 缓存文章在接口失败时可读。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/content-pages.test.js
```

**Step 3: 实现最小文章渲染器**

不要使用任意 HTML 注入。未知区块类型忽略并记录，不得白屏。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/content-pages.test.js
node --check miniprogram/pages/content/list/list.js
node --check miniprogram/pages/content/detail/detail.js
```

**Step 5: Commit**

```bash
git add miniprogram/pages/content miniprogram/app.json tests/feature-expansion/content-pages.test.js
git commit -m "feat: add configurable park content center"
```

## Task 5：入园攻略与管家服务

**Files:**

- Create: `miniprogram/pages/guide/guide.js`
- Create: `miniprogram/pages/guide/guide.wxml`
- Create: `miniprogram/pages/guide/guide.wxss`
- Create: `miniprogram/pages/guide/guide.json`
- Create: `miniprogram/pages/concierge/concierge.js`
- Create: `miniprogram/pages/concierge/concierge.wxml`
- Create: `miniprogram/pages/concierge/concierge.wxss`
- Create: `miniprogram/pages/concierge/concierge.json`
- Create: `tests/feature-expansion/guide-concierge.test.js`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/env.js` only when business values are confirmed

**Step 1: 写失败测试**

- 攻略分类覆盖交通、检票、设施、安全和服务。
- 导航调用配置坐标，不使用参考项目坐标。
- 管家支持微信客服、电话、二维码和表单的可配置降级。
- 未配置二维码时不渲染空图。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/guide-concierge.test.js
```

**Step 3: 实现**

设施信息来自文章/配置，未确认项目显示“请咨询管家”，不得伪造“免费”“1000 个车位”等信息。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/guide-concierge.test.js
node --check miniprogram/pages/guide/guide.js
node --check miniprogram/pages/concierge/concierge.js
```

真机验证 `wx.openLocation`、电话和客服按钮。

**Step 5: Commit**

```bash
git add miniprogram/pages/guide miniprogram/pages/concierge miniprogram/app.json tests/feature-expansion/guide-concierge.test.js
git commit -m "feat: add admission guide and concierge"
```

## Task 6：门票商品和列表/详情

**Files:**

- Create: `cloudfunctions/listTicketProducts/index.js`
- Create: `cloudfunctions/listTicketProducts/package.json`
- Create: `cloudfunctions/getTicketProduct/index.js`
- Create: `cloudfunctions/getTicketProduct/package.json`
- Create: `cloudfunctions/seedTicketProducts/index.js`
- Create: `cloudfunctions/seedTicketProducts/package.json`
- Modify: `miniprogram/pages/ticket/ticket.js`
- Modify: `miniprogram/pages/ticket/ticket.wxml`
- Modify: `miniprogram/pages/ticket/ticket.wxss`
- Create: `miniprogram/pages/ticket/detail/detail.js`
- Create: `miniprogram/pages/ticket/detail/detail.wxml`
- Create: `miniprogram/pages/ticket/detail/detail.wxss`
- Create: `miniprogram/pages/ticket/detail/detail.json`
- Create: `tests/feature-expansion/ticket-catalog.test.js`
- Modify: `miniprogram/app.json`
- Modify: `docs/数据模型.md`

**Step 1: 写失败测试**

- 只展示上架商品。
- 金额来自整数分。
- 三种 `fulfillmentMode` 显示正确 CTA。
- 适用人群、证件、有效期、预约和退款规则完整。
- 未确认商品保持草稿，不出现在游客端。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/ticket-catalog.test.js
```

**Step 3: 实现**

改造现有 `pages/ticket`，保留外部渠道能力；新增详情页。种子只使用“待业务确认”安全示例，不写参考项目价格。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/ticket-catalog.test.js
for f in cloudfunctions/{listTicketProducts,getTicketProduct,seedTicketProducts}/index.js; do node --check "$f"; done
```

**Step 5: Commit**

```bash
git add cloudfunctions/listTicketProducts cloudfunctions/getTicketProduct cloudfunctions/seedTicketProducts miniprogram/pages/ticket miniprogram/app.json tests/feature-expansion/ticket-catalog.test.js docs/数据模型.md
git commit -m "feat: add multi-mode ticket catalog"
```

## Task 7：原生门票下单、支付和出票

**Files:**

- Create: `cloudfunctions/createTicketOrder/index.js`
- Create: `cloudfunctions/createTicketOrder/package.json`
- Create: `cloudfunctions/getMyTickets/index.js`
- Create: `cloudfunctions/getMyTickets/package.json`
- Create: `cloudfunctions/getTicketCode/index.js`
- Create: `cloudfunctions/getTicketCode/package.json`
- Modify: `cloudfunctions/payCallback/index.js`
- Create: `miniprogram/pages/ticket/checkout/checkout.js`
- Create: `miniprogram/pages/ticket/checkout/checkout.wxml`
- Create: `miniprogram/pages/ticket/checkout/checkout.wxss`
- Create: `miniprogram/pages/ticket/checkout/checkout.json`
- Create: `miniprogram/pages/ticket/result/result.js`
- Create: `miniprogram/pages/ticket/result/result.wxml`
- Create: `miniprogram/pages/ticket/result/result.wxss`
- Create: `miniprogram/pages/ticket/result/result.json`
- Create: `miniprogram/pages/ticket/wallet/wallet.js`
- Create: `miniprogram/pages/ticket/wallet/wallet.wxml`
- Create: `miniprogram/pages/ticket/wallet/wallet.wxss`
- Create: `miniprogram/pages/ticket/wallet/wallet.json`
- Create: `tests/feature-expansion/ticket-order.test.js`
- Modify: `miniprogram/app.json`

**Step 1: 写失败测试**

覆盖：

- 前端价格篡改无效。
- 同一幂等键不重复建单。
- 库存不足不建单。
- 支付回调重复执行只出一次票。
- 一单多张票数量准确。
- 取消支付可继续。
- 回调延迟进入“确认中”而非失败。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/ticket-order.test.js
```

**Step 3: 实现**

扩展现有 `payCallback` 的订单类型分流，不改变会员卡和补差价逻辑。使用事务处理订单状态、库存和出票。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/ticket-order.test.js
node --test tests/upgrade-info-page.test.js
for f in cloudfunctions/{createTicketOrder,getMyTickets,getTicketCode}/index.js cloudfunctions/payCallback/index.js; do node --check "$f"; done
```

**Step 5: Commit**

```bash
git add cloudfunctions/createTicketOrder cloudfunctions/getMyTickets cloudfunctions/getTicketCode cloudfunctions/payCallback miniprogram/pages/ticket miniprogram/app.json tests/feature-expansion/ticket-order.test.js
git commit -m "feat: add native ticket purchase and issuance"
```

## Task 8：门票核销和退款

**Files:**

- Create: `cloudfunctions/verifyTicket/index.js`
- Create: `cloudfunctions/verifyTicket/package.json`
- Create: `cloudfunctions/requestTicketRefund/index.js`
- Create: `cloudfunctions/requestTicketRefund/package.json`
- Create: `miniprogram/pages/staff/ticket-verify/ticket-verify.js`
- Create: `miniprogram/pages/staff/ticket-verify/ticket-verify.wxml`
- Create: `miniprogram/pages/staff/ticket-verify/ticket-verify.wxss`
- Create: `miniprogram/pages/staff/ticket-verify/ticket-verify.json`
- Create: `miniprogram/pages/refund/detail/detail.js`
- Create: `miniprogram/pages/refund/detail/detail.wxml`
- Create: `miniprogram/pages/refund/detail/detail.wxss`
- Create: `miniprogram/pages/refund/detail/detail.json`
- Create: `tests/feature-expansion/ticket-fulfillment.test.js`
- Modify: `miniprogram/pages/staff/entry/entry.js`
- Modify: `miniprogram/pages/staff/entry/entry.wxml`
- Modify: `miniprogram/app.json`

**Step 1: 写失败测试**

- 无员工权限不能核销。
- 同一票重复扫码被拦截。
- 退款中票不可核销。
- 已使用票不能自动退款。
- 自动退款和人工审核分支正确。
- 核销和退款均留痕。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/ticket-fulfillment.test.js
```

**Step 3: 实现**

退款结果必须能重试。若未配置支付退款能力，创建人工售后单并清晰提示，不得伪造退款成功。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/ticket-fulfillment.test.js
for f in cloudfunctions/{verifyTicket,requestTicketRefund}/index.js; do node --check "$f"; done
```

**Step 5: Commit**

```bash
git add cloudfunctions/verifyTicket cloudfunctions/requestTicketRefund miniprogram/pages/staff/ticket-verify miniprogram/pages/refund miniprogram/pages/staff/entry miniprogram/app.json tests/feature-expansion/ticket-fulfillment.test.js
git commit -m "feat: add ticket verification and refund"
```

## Task 9：通用团队预约

**Files:**

- Create: `cloudfunctions/getReservationConfig/index.js`
- Create: `cloudfunctions/getReservationConfig/package.json`
- Create: `cloudfunctions/createVisitReservation/index.js`
- Create: `cloudfunctions/createVisitReservation/package.json`
- Create: `cloudfunctions/getMyReservations/index.js`
- Create: `cloudfunctions/getMyReservations/package.json`
- Create: `cloudfunctions/getVisitReservation/index.js`
- Create: `cloudfunctions/getVisitReservation/package.json`
- Create: `cloudfunctions/cancelVisitReservation/index.js`
- Create: `cloudfunctions/cancelVisitReservation/package.json`
- Create: `miniprogram/pages/reservation/entry/entry.js`
- Create: `miniprogram/pages/reservation/entry/entry.wxml`
- Create: `miniprogram/pages/reservation/entry/entry.wxss`
- Create: `miniprogram/pages/reservation/entry/entry.json`
- Create: `miniprogram/pages/reservation/create/create.js`
- Create: `miniprogram/pages/reservation/create/create.wxml`
- Create: `miniprogram/pages/reservation/create/create.wxss`
- Create: `miniprogram/pages/reservation/create/create.json`
- Create: `miniprogram/pages/reservation/detail/detail.js`
- Create: `miniprogram/pages/reservation/detail/detail.wxml`
- Create: `miniprogram/pages/reservation/detail/detail.wxss`
- Create: `miniprogram/pages/reservation/detail/detail.json`
- Create: `tests/feature-expansion/visit-reservation.test.js`
- Modify: `miniprogram/app.json`
- Modify: `docs/数据模型.md`

**Step 1: 写失败测试**

- 周中自助、周末转人工、不可约日期三种规则。
- 人数上下限。
- 必填字段。
- 相同幂等键不重复预约。
- 重复团队预约提示。
- 转人工时仍保存线索。
- 取消后状态正确。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/visit-reservation.test.js
```

**Step 3: 实现**

使用 `visit_reservations`，不改溪降 `bookings` 语义。预约详情生成短期分享 token，不在 URL 暴露手机号。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/visit-reservation.test.js
for f in cloudfunctions/{getReservationConfig,createVisitReservation,getMyReservations,getVisitReservation,cancelVisitReservation}/index.js; do node --check "$f"; done
```

**Step 5: Commit**

```bash
git add cloudfunctions/getReservationConfig cloudfunctions/createVisitReservation cloudfunctions/getMyReservations cloudfunctions/getVisitReservation cloudfunctions/cancelVisitReservation miniprogram/pages/reservation miniprogram/app.json tests/feature-expansion/visit-reservation.test.js docs/数据模型.md
git commit -m "feat: add team visit reservation flow"
```

## Task 10：补齐溪降预约闭环

**Files:**

- Modify: `miniprogram/pages/booking/list/list.js`
- Modify: `miniprogram/pages/booking/create/create.js`
- Modify: `miniprogram/pages/booking/create/create.wxml`
- Modify: `miniprogram/pages/booking/detail/detail.js`
- Modify: `miniprogram/pages/booking/detail/detail.wxml`
- Replace: `miniprogram/pages/staff/creek/creek.wxml`
- Modify: `miniprogram/pages/staff/creek/creek.js`
- Modify: `miniprogram/pages/staff/creek/creek.wxss`
- Create: `cloudfunctions/frontInsertBooking/index.js`
- Create: `cloudfunctions/frontInsertBooking/package.json`
- Create: `cloudfunctions/sendBookingSubscribeMessage/index.js`
- Create: `cloudfunctions/sendBookingSubscribeMessage/package.json`
- Modify: `cloudfunctions/createBooking/index.js`
- Modify: `cloudfunctions/changeBooking/index.js`
- Modify: `cloudfunctions/closeSession/index.js`
- Create: `tests/feature-expansion/creek-booking-completion.test.js`

**Step 1: 写失败测试**

覆盖 `.scratch/creek-booking/spec.md` 中未实现项：

- 创建页查询所选场次而不是只查当天。
- 真实票号/订单关联校验。
- 改签页调用 `changeBooking` 且限一次。
- 开场前截止规则。
- 儿童安全确认。
- 订阅消息授权和发送记录。
- 员工插单与线上同池。
- 余位/核销台账。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/creek-booking-completion.test.js
```

**Step 3: 实现**

不要重写已存在的取消和核销逻辑；只修复并补齐缺口。库存变化必须原子且失败回补。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/creek-booking-completion.test.js
for f in cloudfunctions/{createBooking,changeBooking,closeSession,frontInsertBooking,sendBookingSubscribeMessage}/index.js; do node --check "$f"; done
```

真机验证预约码、取消、改签、插单、停运和重复扫码。

**Step 5: Commit**

```bash
git add miniprogram/pages/booking miniprogram/pages/staff/creek cloudfunctions/createBooking cloudfunctions/changeBooking cloudfunctions/closeSession cloudfunctions/frontInsertBooking cloudfunctions/sendBookingSubscribeMessage tests/feature-expansion/creek-booking-completion.test.js
git commit -m "feat: complete creek booking workflow"
```

## Task 11：生日、团建和品牌合作

**Files:**

- Create: `cloudfunctions/createServiceLead/index.js`
- Create: `cloudfunctions/createServiceLead/package.json`
- Create: `cloudfunctions/getMyServiceLeads/index.js`
- Create: `cloudfunctions/getMyServiceLeads/package.json`
- Create: `miniprogram/pages/service/detail/detail.js`
- Create: `miniprogram/pages/service/detail/detail.wxml`
- Create: `miniprogram/pages/service/detail/detail.wxss`
- Create: `miniprogram/pages/service/detail/detail.json`
- Create: `miniprogram/pages/service/lead/lead.js`
- Create: `miniprogram/pages/service/lead/lead.wxml`
- Create: `miniprogram/pages/service/lead/lead.wxss`
- Create: `miniprogram/pages/service/lead/lead.json`
- Create: `tests/feature-expansion/service-leads.test.js`
- Modify: `miniprogram/app.json`
- Modify: `docs/数据模型.md`

**Step 1: 写失败测试**

- `birthday/team_building/brand` 三种 schema。
- 表单字段按类型变化。
- 手机号和隐私同意校验。
- 连点只创建一个线索。
- 失败保留输入。
- 成功页提供管家和返回入口。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/service-leads.test.js
```

**Step 3: 实现**

详情复用结构化文章区块，表单复用一个页面和 schema。不得创建三套重复逻辑。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/service-leads.test.js
node --check cloudfunctions/createServiceLead/index.js
node --check miniprogram/pages/service/detail/detail.js
node --check miniprogram/pages/service/lead/lead.js
```

**Step 5: Commit**

```bash
git add cloudfunctions/createServiceLead cloudfunctions/getMyServiceLeads miniprogram/pages/service miniprogram/app.json tests/feature-expansion/service-leads.test.js docs/数据模型.md
git commit -m "feat: add birthday team and brand enquiries"
```

## Task 12：员工线索处理

**Files:**

- Create: `cloudfunctions/listAssignedLeads/index.js`
- Create: `cloudfunctions/listAssignedLeads/package.json`
- Create: `cloudfunctions/updateServiceLead/index.js`
- Create: `cloudfunctions/updateServiceLead/package.json`
- Create: `miniprogram/pages/staff/leads/leads.js`
- Create: `miniprogram/pages/staff/leads/leads.wxml`
- Create: `miniprogram/pages/staff/leads/leads.wxss`
- Create: `miniprogram/pages/staff/leads/leads.json`
- Create: `tests/feature-expansion/staff-leads.test.js`
- Modify: `miniprogram/pages/staff/entry/entry.js`
- Modify: `miniprogram/pages/staff/entry/entry.wxml`
- Modify: `miniprogram/app.json`

**Step 1: 写失败测试**

- 非授权角色不可查看。
- 只返回本人或管理员可见线索。
- 状态变化满足状态机。
- 每次变化保留操作人和备注。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/staff-leads.test.js
```

**Step 3: 实现**

首版只做列表、详情、状态、备注和下次跟进时间，不建设 CRM。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/staff-leads.test.js
for f in cloudfunctions/{listAssignedLeads,updateServiceLead}/index.js; do node --check "$f"; done
```

**Step 5: Commit**

```bash
git add cloudfunctions/listAssignedLeads cloudfunctions/updateServiceLead miniprogram/pages/staff/leads miniprogram/pages/staff/entry miniprogram/app.json tests/feature-expansion/staff-leads.test.js
git commit -m "feat: add staff lead follow-up"
```

## Task 13：统一订单中心和 4 Tab

**Files:**

- Create: `cloudfunctions/getMyOrders/index.js`
- Create: `cloudfunctions/getMyOrders/package.json`
- Create: `cloudfunctions/getOrderDetail/index.js`
- Create: `cloudfunctions/getOrderDetail/package.json`
- Modify: `miniprogram/pages/order/order.js`
- Modify: `miniprogram/pages/order/order.wxml`
- Modify: `miniprogram/pages/order/order.wxss`
- Modify: `miniprogram/pages/order/order.json`
- Create: `miniprogram/pages/order/detail/detail.js`
- Create: `miniprogram/pages/order/detail/detail.wxml`
- Create: `miniprogram/pages/order/detail/detail.wxss`
- Create: `miniprogram/pages/order/detail/detail.json`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/custom-tab-bar/index.js`
- Modify: `miniprogram/custom-tab-bar/index.wxml`
- Modify: `miniprogram/custom-tab-bar/index.wxss`
- Create: `tests/feature-expansion/order-center.test.js`

**Step 1: 写失败测试**

- 聚合会员卡、补差价和门票订单。
- 五个筛选 Tab 映射正确。
- 不同订单类型返回统一卡片字段。
- 分页游标稳定。
- 空态和继续支付/查看票券/售后操作正确。
- 4 Tab 保留长河令。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/order-center.test.js
```

**Step 3: 实现**

通过服务适配函数统一展示，不迁移或覆盖旧订单。`app.json` 和自定义 TabBar 的索引必须同步。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/order-center.test.js
node --check miniprogram/pages/order/order.js
node --check miniprogram/custom-tab-bar/index.js
```

真机逐个切换 4 个 Tab，确认返回栈和选中态。

**Step 5: Commit**

```bash
git add cloudfunctions/getMyOrders cloudfunctions/getOrderDetail miniprogram/pages/order miniprogram/app.json miniprogram/custom-tab-bar tests/feature-expansion/order-center.test.js
git commit -m "feat: add unified order center tab"
```

## Task 14：我的页面和统一预约入口

**Files:**

- Modify: `miniprogram/pages/mine/mine.js`
- Modify: `miniprogram/pages/mine/mine.wxml`
- Modify: `miniprogram/pages/mine/mine.wxss`
- Create: `miniprogram/pages/reservation/mine/mine.js`
- Create: `miniprogram/pages/reservation/mine/mine.wxml`
- Create: `miniprogram/pages/reservation/mine/mine.wxss`
- Create: `miniprogram/pages/reservation/mine/mine.json`
- Create: `tests/feature-expansion/mine-reservations.test.js`
- Modify: `miniprogram/app.json`

**Step 1: 写失败测试**

- 现有会员、卡券、长河令、令码仍可达。
- 新增票券、统一预约、行程、管家和反馈入口。
- 订单状态数字来自接口。
- 统一预约聚合团队预约和溪降预约。
- 未绑定手机号不阻止浏览，只在必要操作授权。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/mine-reservations.test.js
```

**Step 3: 实现**

避免在“我的”重复展示过多卡片；状态数字和高频入口优先，低频项放服务列表。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/mine-reservations.test.js
node --check miniprogram/pages/mine/mine.js
node --check miniprogram/pages/reservation/mine/mine.js
```

**Step 5: Commit**

```bash
git add miniprogram/pages/mine miniprogram/pages/reservation/mine miniprogram/app.json tests/feature-expansion/mine-reservations.test.js
git commit -m "feat: expand profile and reservation center"
```

## Task 15：行程创建和分享

**Files:**

- Create: `cloudfunctions/generateItinerary/index.js`
- Create: `cloudfunctions/generateItinerary/package.json`
- Create: `cloudfunctions/saveItinerary/index.js`
- Create: `cloudfunctions/saveItinerary/package.json`
- Create: `cloudfunctions/getMyItineraries/index.js`
- Create: `cloudfunctions/getMyItineraries/package.json`
- Create: `miniprogram/pages/itinerary/create/create.js`
- Create: `miniprogram/pages/itinerary/create/create.wxml`
- Create: `miniprogram/pages/itinerary/create/create.wxss`
- Create: `miniprogram/pages/itinerary/create/create.json`
- Create: `miniprogram/pages/itinerary/detail/detail.js`
- Create: `miniprogram/pages/itinerary/detail/detail.wxml`
- Create: `miniprogram/pages/itinerary/detail/detail.wxss`
- Create: `miniprogram/pages/itinerary/detail/detail.json`
- Create: `tests/feature-expansion/itinerary.test.js`
- Modify: `miniprogram/app.json`

**Step 1: 写失败测试**

- 只从开放活动/设施生成。
- 时间冲突提示。
- 用户可删除和排序。
- 保存只属于当前用户。
- 分享 token 不泄露 openid。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/itinerary.test.js
```

**Step 3: 实现**

模板规则优先，不引入 AI 或第三方路线服务。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/itinerary.test.js
for f in cloudfunctions/{generateItinerary,saveItinerary,getMyItineraries}/index.js; do node --check "$f"; done
```

**Step 5: Commit**

```bash
git add cloudfunctions/generateItinerary cloudfunctions/saveItinerary cloudfunctions/getMyItineraries miniprogram/pages/itinerary miniprogram/app.json tests/feature-expansion/itinerary.test.js
git commit -m "feat: add itinerary planner"
```

## Task 16：投诉建议和失物招领

**Files:**

- Create: `cloudfunctions/submitFeedback/index.js`
- Create: `cloudfunctions/submitFeedback/package.json`
- Create: `cloudfunctions/getMyFeedback/index.js`
- Create: `cloudfunctions/getMyFeedback/package.json`
- Create: `cloudfunctions/updateFeedback/index.js`
- Create: `cloudfunctions/updateFeedback/package.json`
- Create: `miniprogram/pages/feedback/create/create.js`
- Create: `miniprogram/pages/feedback/create/create.wxml`
- Create: `miniprogram/pages/feedback/create/create.wxss`
- Create: `miniprogram/pages/feedback/create/create.json`
- Create: `miniprogram/pages/feedback/list/list.js`
- Create: `miniprogram/pages/feedback/list/list.wxml`
- Create: `miniprogram/pages/feedback/list/list.wxss`
- Create: `miniprogram/pages/feedback/list/list.json`
- Create: `miniprogram/pages/staff/feedback/feedback.js`
- Create: `miniprogram/pages/staff/feedback/feedback.wxml`
- Create: `miniprogram/pages/staff/feedback/feedback.wxss`
- Create: `miniprogram/pages/staff/feedback/feedback.json`
- Create: `tests/feature-expansion/feedback.test.js`
- Modify: `miniprogram/app.json`

**Step 1: 写失败测试**

- 五种分类。
- 文本、图片数量和手机号校验。
- 图片路径隔离。
- 用户只能看自己的记录。
- 员工权限和状态留痕。
- 紧急情况显示电话。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/feedback.test.js
```

**Step 3: 实现**

不包含参考项目奖励承诺。图片上传失败允许用户重试，不丢失已填文本。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/feedback.test.js
for f in cloudfunctions/{submitFeedback,getMyFeedback,updateFeedback}/index.js; do node --check "$f"; done
```

**Step 5: Commit**

```bash
git add cloudfunctions/submitFeedback cloudfunctions/getMyFeedback cloudfunctions/updateFeedback miniprogram/pages/feedback miniprogram/pages/staff/feedback miniprogram/app.json tests/feature-expansion/feedback.test.js
git commit -m "feat: add feedback and lost property workflow"
```

## Task 17：新客福利官活动

**Files:**

- Create: `cloudfunctions/getWelcomeCampaign/index.js`
- Create: `cloudfunctions/getWelcomeCampaign/package.json`
- Create: `cloudfunctions/claimWelcomeBenefit/index.js`
- Create: `cloudfunctions/claimWelcomeBenefit/package.json`
- Create: `miniprogram/pages/welcome/welcome.js`
- Create: `miniprogram/pages/welcome/welcome.wxml`
- Create: `miniprogram/pages/welcome/welcome.wxss`
- Create: `miniprogram/pages/welcome/welcome.json`
- Create: `tests/feature-expansion/welcome-campaign.test.js`
- Modify: `miniprogram/app.json`

**Step 1: 写失败测试**

- 活动未开始/已结束不可领取。
- 每用户每活动限一次。
- 奖励只允许受控卡券/会员说明/长河令活动。
- 无法验证添加企微时不自动发高价值权益。
- 领取失败可重试且不重复发放。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/welcome-campaign.test.js
```

**Step 3: 实现**

默认活动关闭，待业务确认奖励和客服配置后启用。

**Step 4: 验证**

```bash
node --test tests/feature-expansion/welcome-campaign.test.js
for f in cloudfunctions/{getWelcomeCampaign,claimWelcomeBenefit}/index.js; do node --check "$f"; done
```

**Step 5: Commit**

```bash
git add cloudfunctions/getWelcomeCampaign cloudfunctions/claimWelcomeBenefit miniprogram/pages/welcome miniprogram/app.json tests/feature-expansion/welcome-campaign.test.js
git commit -m "feat: add configurable new visitor campaign"
```

## Task 18：埋点、缓存、合规和全量回归

**Files:**

- Create: `miniprogram/utils/analytics.js`
- Create: `miniprogram/utils/cache.js`
- Create: `scripts/scan-sensitive-copy.js`
- Create: `tests/feature-expansion/regression.test.js`
- Modify: `miniprogram/app.js`
- Modify: `README.md`
- Modify: `specs/README.md`
- Modify: `docs/数据模型.md`
- Modify: `scripts/db-init.md`

**Step 1: 写失败测试**

- 埋点不含手机号、openid、票码和二维码 token。
- 缓存有版本和过期时间。
- 敏感词扫描覆盖 `miniprogram/`、`cloudfunctions/` 和新 PRD 之外的发布文案。
- `app.json` 所有页面文件完整。
- 新云函数均有 `package.json`。
- 原回归测试仍通过。

**Step 2: 确认失败**

```bash
node --test tests/feature-expansion/regression.test.js
```

**Step 3: 实现**

埋点失败不得阻塞业务。缓存只存公开内容和当前用户必要摘要，不缓存完整敏感信息。

**Step 4: 全量验证**

```bash
node --test tests/*.test.js tests/feature-expansion/*.test.js
node scripts/scan-sensitive-copy.js
find miniprogram/pages -name '*.js' -print0 | xargs -0 -n1 node --check
find cloudfunctions -name 'index.js' -print0 | xargs -0 -n1 node --check
git diff --check
```

Expected:

- 全部测试 PASS。
- 合规扫描 0 blocking hit。
- JavaScript 语法 0 error。
- `git diff --check` 无输出。

然后在微信开发者工具和至少一台 iPhone/一台 Android 真机执行：

1. 首页全入口。
2. 外部渠道购票。
3. 原生购票支付沙箱/测试金额。
4. 出票和重复核销。
5. 退款。
6. 团队预约、分享和取消。
7. 溪降预约、改签、停运、插单、核销。
8. 生日/团建/品牌线索。
9. 订单中心。
10. 行程。
11. 投诉和失物。
12. 弱网和离线票码。

**Step 5: Commit**

```bash
git add miniprogram/utils miniprogram/app.js scripts tests/feature-expansion README.md specs/README.md docs/数据模型.md scripts/db-init.md
git commit -m "test: verify visitor journey feature expansion"
```

## 交付检查点

每完成 3 个 Task，停止开发并输出：

1. 已完成文件。
2. 自动化测试结果。
3. 微信开发者工具截图。
4. 当前数据迁移/部署步骤。
5. 下一批任务风险。

不要在一个未经验证的巨型提交中完成全部功能。
