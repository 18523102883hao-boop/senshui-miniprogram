# 数据库初始化指南（T02）

## 1. 建集合（自动）

云函数 `initDb` 会创建全部集合。上传部署后在开发者工具「云函数 → initDb → 云端测试」执行：

```json
{ "seed": true }
```

- `seed: true` 会写入 2 条示例活动 + 1 条首页公告，便于联调；正式上线前清理。
- 重复执行安全：集合已存在会跳过。

集合清单：`users` `members` `coupons` `orders` `products` `ling_accounts` `ling_ledger` `ling_daily_quotas` `activities` `notices` `staff` `verifications` `sessions`(☆) `bookings`(☆) `rentals`(☆)

## 2. 建索引（手动，控制台）

云开发控制台 → 数据库 → 对应集合 → 索引管理，按下表建立：

| 集合 | 字段 | 唯一 |
|---|---|---|
| users | _openid | 是 |
| members | memberCode | 是 |
| members | _openid | 否 |
| orders | outTradeNo | 是 |
| ling_accounts | _openid | 是 |
| ling_daily_quotas | dayKey | 否（可选，用于按日运维查询） |
| staff | _openid | 是 |
| activities | date | 否 |

> `outTradeNo`、`memberCode` 唯一索引是**防重复发卡的第二道保险**，务必建立。

## 3. 权限设置

数据库集合默认权限建议设为「仅管理端可写，所有用户不可读写」，所有读写都经由云函数（云函数以管理员身份操作，绕过安全规则）。这样客户端无法直接改库。

## 4. 支付相关

- 云开发环境关联微信支付商户号（**前置条件，未开通则所有收款失败**）。
- 为 `createMemberOrder`、`refundMember`、`payUpgradeCharge`（T20）配置环境变量 `SUB_MCH_ID`（子商户号，三者相同）。
- `payCallback` 由 `unifiedOrder(functionName:'payCallback')` 自动回调，无需额外配置；已按 `type` 分流处理会员卡 / 补差价收款。

## 5. 补差价收款（T20）

1. **灌价目表**：部署 `seedUpgradeItems` 后在「云函数 → 云端测试」执行一次（无需入参），写入升级价目到 `notices(type:'ticket_config').upgradeList`。幂等可重跑，改价后重跑即可。
2. **建议索引**（orders 集合，加速员工查询与汇总）：`staffOpenid + status + paidAt` 普通索引。
3. **小程序码调试**：`createUpgradeCharge` 用 `wxacode.getUnlimited` 生成的码指向 `envVersion` 指定版本。未发布正式版时，给云函数配环境变量 `QR_ENV_VERSION=trial`（体验版）方可真机扫码；正式发布后改回 `release`。
4. **收款权限**：收款员工需在 `staff` 集合 `status='approved'` 且 `role∈{front, admin}`；查看全员汇总需 `role='admin'`。

## 6. 会员权益调整 + 动态会员码（T20）

- **权益变更**：会员卡去掉「酒水」「85 折券」，改为「1000 长河令 + 生日当天 85 折」。购卡时必填生日（存 `members.birthday` = `MM-DD`）。旧卡若已发酒/券不受影响，新发卡按新权益。
- **动态会员码**：会员码升级为 90 秒时效的动态 token（防截图转让）。需给 `getMemberQr` 与 `getMemberForVerify` 配置**相同**的环境变量 `MEMBER_QR_SECRET`（一段随机长字符串，如 `openssl rand -hex 32` 生成）。两者密钥必须一致，否则核销验签失败。
- **部署**：新增 `getMemberQr`，重新部署 `createMemberOrder`、`payCallback`、`getMemberForVerify`、`verifyBenefit`、`getMemberCard`、`refundMember`。
- **二维码库**：会员卡页动态码依赖 `weapp-qrcode-canvas-2d`，需在开发者工具「构建 npm」；未构建则降级为占位（无法扫码）。

### 6.1 长河令实体转电子每日额度（2026-07-28）

- 新增集合 `ling_daily_quotas`，权限必须设为“所有用户不可读写”，仅云函数访问。
- 额度按同一客户、北京时间自然日累计：`front` 5000 令/日，`admin` 10000 令/日。
- 电子兑实体和会员卡赠送不计入该额度。
- 部署 `exchangeLing`、`resolveUserForLing`、`initDb` 后，再执行一次 `initDb`（`seed:false` 即可）。
- 前端显示的剩余额度仅用于操作提示，最终约束由 `exchangeLing` 的事务校验负责。

## 7. 首页门户与内容中心（本轮功能扩展 Task 2）

新增集合：`home_configs` `articles` `ticket_products` `tickets` `visit_reservations` `feedback` `itineraries`
（`initDb` 已包含，重新部署后再执行一次即可，已存在的集合会跳过。）

**新增云函数（需在开发者工具逐个上传部署）**：

| 云函数 | 作用 |
|---|---|
| `seedPortalContent` | 写入首页模块配置 + 3 篇种子文章 |
| `getHomePortal` | 首页门户数据（模块 / 公告 / 今日活动 / 地图 / 用户摘要） |
| `listArticles` | 内容列表（按分类分页） |
| `getArticle` | 内容详情（按 slug 或 id，仅 published 可读） |

**灌内容**：部署后在「云函数 → seedPortalContent → 云端测试」执行一次：

```json
{}
```

- 不带参数：已有首页配置则跳过，只补缺失的文章（可重复执行）。
- `{ "force": true }`：写入新版本首页配置并覆盖同 slug 文章（改版后用）。

**建议索引**：

| 集合 | 字段 | 唯一 |
|---|---|---|
| home_configs | version | 否 |
| articles | slug | 是 |
| articles | status, category, publishedAt | 否 |
| tickets | _openid, status | 否 |
| visit_reservations | _openid, status, visitDate | 否 |

> `getHomePortal` 的用户摘要查询失败会被吞掉并降级为空摘要——首页在匿名、弱网、集合尚未创建时都必须能打开。

## 8. 门票目录（本轮功能扩展 Task 6）

**新增云函数**：`listTicketProducts`、`getTicketProduct`、`seedTicketProducts`

**灌票种**：部署后在「云函数 → seedTicketProducts → 云端测试」执行：

```json
{}
```

- 不带参数：已存在的 sku 跳过（可重复执行）。
- `{ "force": true }`：按 sku 覆盖更新——**改价后用这个**。

**改价流程**：改 `docs/业务参数.md` → 改 `cloudfunctions/seedTicketProducts/seed-tickets.js` → 重新部署 → `{"force": true}`。

**建议索引**：

| 集合 | 字段 | 唯一 |
|---|---|---|
| ticket_products | sku | 是 |
| ticket_products | status, category, sort | 否 |

**支付未就绪时的降级开关**：给 `listTicketProducts` 与 `getTicketProduct` 配环境变量 `NATIVE_PAY_READY=false`，
所有原生支付票种会自动降级到「咨询管家」，不需要改数据库。恢复时删掉该变量即可。

## 9. 原生门票下单与出票（本轮功能扩展 Task 7）

**新增云函数**：`createTicketOrder`、`getMyTickets`、`getTicketCode`
**需重新部署**：`payCallback`（新增 `ticket_order` 分支，会员卡与补差价逻辑未改动）

**环境变量**：

| 云函数 | 变量 | 说明 |
|---|---|---|
| createTicketOrder | `SUB_MCH_ID` | 与 createMemberOrder 相同的子商户号 |
| createTicketOrder | `NATIVE_PAY_READY` | 设 `false` 可临时关停在线购票 |
| getTicketCode | `TICKET_QR_SECRET` | 随机长串；**必须与 verifyTicket 相同**（Task 8 用） |

**必须建的索引**（防重复出票的第二道保险）：

| 集合 | 字段 | 唯一 |
|---|---|---|
| tickets | ticketNo | **是** |
| tickets | _openid, status | 否 |
| tickets | orderId | 否 |
| orders | _openid, idempotencyKey | 否 |

> ⚠️ 部署 `payCallback` 后请复测一次**会员卡购买**与**补差价收款**，确认既有链路正常。

## 10. 门票核销与退款（本轮功能扩展 Task 8）

**新增云函数**：`verifyTicket`、`requestTicketRefund`

**环境变量**：

| 云函数 | 变量 | 说明 |
|---|---|---|
| verifyTicket | `TICKET_QR_SECRET` | **必须与 getTicketCode 完全一致**，否则入园码验签必失败 |
| requestTicketRefund | `SUB_MCH_ID` | 同其他支付函数 |
| requestTicketRefund | `PAY_REFUND_ENABLED` | 设 `false` 时所有退款转人工售后单（不会伪造成功） |

**新增集合**：`refund_requests`（人工售后单）。`initDb` 未包含，首次调用会自动创建；也可在控制台手动建。

**核销流程**：员工模式 → 门票核销 → 扫游客入园码（或手输票号）→ **先预览票券信息 → 再点确认核销**。
并发/重复扫码由条件更新拦截（status 必须仍是 unused/reserved），第二次会提示"该票券已核销"。

**退款分支**：
- 未使用票 + 退款能力可用 → 自动原路退款，退款单号由「订单号 + 票号集合」推导，重试不会退两次。
- 已核销票 → 按购买须知不可退，转人工售后单。
- 退款发起失败 → 票券状态回滚为 unused，用户可重试。

## 11. 团队预约（本轮功能扩展 Task 9）

**新增云函数**：`getReservationConfig`、`createVisitReservation`、`getMyReservations`、`getVisitReservation`、`cancelVisitReservation`

**预约规则配置**：在 `notices` 集合手动加一条（不加则用云函数内的保守默认值）：

```json
{
  "type": "config",
  "key": "visitReservation",
  "value": {
    "minPartySize": 10,
    "maxPartySize": 200,
    "advanceDays": 30,
    "dailyCapacity": 0,
    "blockedDates": [],
    "weekdayPolicy": "self",
    "weekendPolicy": "manual",
    "notice": "团队预约提交后由管家确认，确认前请勿安排车辆与行程。"
  }
}
```

- `weekdayPolicy` / `weekendPolicy`：`self`（自助预约）/ `manual`（转人工，仍会落库保住意向）/ `blocked`（不可约）
- `dailyCapacity`：0 表示不限制。**上线前请填实际每日团队接待上限。**
- `blockedDates`：如 `["2026-08-15"]`

**建议索引**：

| 集合 | 字段 | 唯一 |
|---|---|---|
| visit_reservations | shareToken | 是 |
| visit_reservations | _openid, status | 否 |
| visit_reservations | visitDate, status | 否 |

> 分享给同行人只带 `shareToken`，非本人访问一律降级为脱敏摘要（无手机号、无 openid）。

## 12. 部署与运维通道（重要）

### 为什么 cloudbase CLI 总是「无有效身份信息」

`cloudbase login` 把凭证写进 `~/.config/.cloudbase/auth.json`，其中：

- `tmpSecretId` / `tmpSecretKey` —— **有效期只有 2 小时**（看 `tmpExpired` 字段）
- `refreshToken` —— 有效期 30 天，但 **CLI 3.6.4 不会自动拿它续期**

所以每次登录后隔一两个小时再用，就一定报「无有效身份信息」。这不是配置问题，重新登录也只能再撑 2 小时。**不要再依赖它。**

### 通道 A：部署云函数代码 —— 微信开发者工具 CLI

```bash
scripts/deploy-functions.sh              # 部署本轮全部待部署函数
scripts/deploy-functions.sh fn1 fn2      # 只部署指定函数
scripts/deploy-functions.sh --list       # 列出云端已有函数
```

底层是 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy`，
复用开发者工具的登录态，**不会过期**。

**前置（一次性）**：微信开发者工具 → 设置 → 安全设置 → **服务端口：开启**。
没开会报 `IDE service port disabled`。

### 通道 B：数据库读写与调用云函数 —— 服务端 API Key + HTTP API

```bash
export TCB_API_KEY='eyJ...'              # 云开发控制台 → 环境 → 服务端 API Key
node scripts/tcb-api.mjs collections     # 列出集合与文档数
node scripts/tcb-api.mjs get ticket_products '{"sku":"creek_single"}'
node scripts/tcb-api.mjs seed            # 灌首页配置/文章/票种（幂等）
node scripts/tcb-api.mjs invoke initDb '{}'
```

API Key 永不过期，权限是 system admin。**绝不能提交进仓库**，只走环境变量。

**踩过的坑**（写进脚本注释了，避免重犯）：

| 坑 | 正确做法 |
|---|---|
| `?filter=` 被静默忽略，导致误判"数据已存在" | 用 `?query=` |
| 插入报 `Invalid request body` | body 必须是 `{ data: [文档] }`（数组） |
| 建集合报 `collectionName is required` | 字段名是 `CollectionName`（大写 C） |
| 读出来 `{"$numberInt":"5800"}` | 这是 Strict EJSON 响应格式，库里存的是整数，云函数读到的是普通数字 |

### 两条通道的能力边界

| 操作 | 通道 A（工具 CLI） | 通道 B（HTTP API） |
|---|---|---|
| 部署云函数代码 | ✅ | ❌ 不支持 |
| 读写数据库 | ❌ | ✅ |
| 调用云函数 | ❌ | ✅ |
| 配置环境变量 | ❌ | ❌ **只能在云开发控制台操作** |
| 建数据库索引 | ❌ | ❌ **只能在云开发控制台操作** |

## 13. 溪降预约闭环补齐（本轮功能扩展 Task 10）

**新增云函数**：`frontInsertBooking`（前台插单）、`getSessionLedger`（场次台账）、
`saveSubscribeGrant`（记录订阅授权）、`sendBookingSubscribeMessage`（提醒/停运通知）
**需重新部署**：`createBooking`、`changeBooking`、`cancelBooking`

**重要改动：不再自行生成票号冒充购票凭证**

原 `createBooking` 会生成 `CK20260809...` 形式的"票号"，看起来像购票凭证但其实是系统自造的（PRD §9.5 明令禁止）。现在改为：

- 云端只生成**预约单号** `bookingNo`（`BK` 前缀），与门票号明确区分
- 购票凭证记在 `booking.ticketRef`：
  - `source: 'native'` —— 用户在小程序买的溪降票，自动关联，`verified: true`，同时把票置为 `reserved`（防一票多约）
  - `source: 'external'` —— 用户手输的抖音/美团券号，`verified: false`，**现场人工核验**
  - `source: 'front'` —— 前台插单
- 取消预约会把 `native` 票释放回 `unused`

**环境变量**：

| 云函数 | 变量 | 默认 | 说明 |
|---|---|---|---|
| changeBooking / cancelBooking | `BOOKING_CUTOFF_MINUTES` | 60 | 开场前多少分钟截止改签/取消 |

**订阅消息**：模板 ID 配在 `miniprogram/env.js` 的 `subscribeTmplIds.booking`。
**留空则不弹授权**，不影响预约主流程；在小程序后台申请到模板后填入即可生效。

**新增集合**：`subscribe_grants`（订阅授权次数，首次调用自动创建）。

**修复的老 bug**：预约列表跳创建页时没传日期，创建页又只查当天场次 —— 预约次日及以后的场次必然报"场次不存在"。

## 15. 溪降预约功能下线（2026-07-25）

业主决定：**溪降不再走场次预约**。业务上本就是「无需预约、凭券码直接入园」（见 docs/业务参数.md §3），
小程序里的场次预约与实际经营方式不符，故下线。

**已从小程序移除**：
- 用户端：`pages/booking/{list,create,detail}`
- 员工端：`pages/staff/creek`（场次台账 / 前台插单）
- 预约中心的「溪降场次预约」入口、员工端「溪降检票核销」入口
- 首页「立即预约」副标题改为「团队到园 · 研学 · 亲友聚会」

**保留不变**（溪降本身仍在正常经营）：
- 溪降票销售：`creek_single` / `creek_double` / `creek_child` / `combo_single`
- 溪降须知页、入园攻略里的溪降安全条款
- 门票核销（`verifyTicket`）覆盖溪降票入园核销

**云函数**：`listSessions`、`createBooking`、`changeBooking`、`cancelBooking`、`holdSeat`、`releaseSeat`、
`closeSession`、`verifyBooking`、`frontInsertBooking`、`getSessionLedger`、`getMyBookings` 代码保留但**不再被调用**。
云端已部署的函数不必删除（留着不影响，删了反而丢历史数据）。

**如需恢复**：`git revert` 本次提交即可，页面与测试都在 git 历史里。

## 16. 投诉建议与失物招领（原 Task 16）

**新增云函数**：`submitFeedback`、`getMyFeedback` —— **需要部署**

**入口**：我的 → 投诉建议 · 失物招领

**类型**：投诉 / 建议 / 表扬 / 失物招领
**状态**：submitted → processing → resolved / closed（只能由服务端流转）

**合规处理**（已被测试锁定）：
- 状态文案只说进展，**不承诺处理时限**（PRD §28.9 待业务方确认）
- 不照搬参考项目的"查明奖励 1000 元"承诺
- 紧急问题在提交页与成功页都保留拨号入口

**图片**：最多 6 张，先传云存储再提交；**图片上传失败不阻断文字提交**（用户诉求比截图重要）。

**建议索引**：`feedback` 集合 `_openid + createdAt`、`status + createdAt`

## 17. 首页模块改动后必须同步云端（重要）

首页模块在**三处**定义，改动后必须全部同步，否则新模块不会显示：

| 位置 | 作用 |
|---|---|
| `cloudfunctions/seedPortalContent/seed-data.js` | 种子数据（单一真源）|
| `cloudfunctions/getHomePortal/portal-core.js` | 云函数兜底（云端无配置时用）|
| `miniprogram/pages/index/index.js` 的 `LOCAL_SECTIONS` | 前端兜底（弱网/云函数未部署时用）|
| **云数据库 `home_configs`** | **实际生效的配置** ← 最容易漏 |

**云端有配置时会覆盖所有兜底**，所以只改代码不改数据库，新模块不会出现。

改完模块后跑：

```bash
export TCB_API_KEY='eyJ...'
node scripts/tcb-api.mjs sync-home
```

> 2026-07-25 补差价升级入口就是因为漏了这步而“消失”的——本地三处都加了，云端还是旧的 15 个模块。
> 前三处的一致性由 `tests/uiux/home-actions.test.js` 锁定；云端只能靠这条命令同步。

## 18. 已完成订单申请开票（2026-07-28）

**新增云函数**：`invoiceService`
**需重新部署**：`getMyOrders`、`refundMember`、`requestTicketRefund`、`initDb`

部署后执行一次：

```bash
node scripts/tcb-api.mjs invoke initDb '{}'
```

确认已创建 `invoice_requests` 集合，并在云开发控制台手动建立：

| 集合 | 字段 | 唯一 |
|---|---|---|
| invoice_requests | _openid, outTradeNo | 是 |
| invoice_requests | status, updatedAt | 否 |

> `_openid + outTradeNo` 唯一复合索引是防止快速重复提交产生两条申请的数据库兜底，必须建立。

集合权限设为“所有用户不可读写”。游客只可经 `invoiceService` 读取本人申请；完整抬头、税号及银行资料只对已审批管理员开放。

**回归重点**：

- 正常已完成订单可申请，退款中/已退款订单不可申请。
- 已开票订单自助退款会提示先联系工作人员处理红字发票。
- 待审核或审核中的申请在退款受理后自动关闭。
- 部分退票后重新申请时，金额按当前未退款票券重新计算。

## 19. 管理员运营与对账（2026-07-28）

**新增云函数**：`adminOperationsLedger`

第一阶段读取现有业务数据，不新增集合。部署：

```bash
scripts/deploy-functions.sh adminOperationsLedger
```

在云开发控制台确认以下普通索引，避免月度/自定义范围查询退化为全表扫描：

| 集合 | 字段 |
|---|---|
| orders | paidAt |
| tickets | usedAt |
| tickets | refundedAt |
| members | refundedAt |
| refund_requests | createdAt |
| verifications | createdAt |
| ling_ledger | createdAt |

集合权限继续保持“所有用户不可读写”。报表云函数会再次查询 `staff`，只允许
`status=approved` 且 `role=admin` 的员工访问。

> 页面显示的是小程序业务账，不是微信商户结算账；核销票面金额和长河令不会计入净收。
