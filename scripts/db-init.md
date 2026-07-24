# 数据库初始化指南（T02）

## 1. 建集合（自动）

云函数 `initDb` 会创建全部集合。上传部署后在开发者工具「云函数 → initDb → 云端测试」执行：

```json
{ "seed": true }
```

- `seed: true` 会写入 2 条示例活动 + 1 条首页公告，便于联调；正式上线前清理。
- 重复执行安全：集合已存在会跳过。

集合清单：`users` `members` `coupons` `orders` `products` `ling_accounts` `ling_ledger` `activities` `notices` `staff` `verifications` `sessions`(☆) `bookings`(☆) `rentals`(☆)

## 2. 建索引（手动，控制台）

云开发控制台 → 数据库 → 对应集合 → 索引管理，按下表建立：

| 集合 | 字段 | 唯一 |
|---|---|---|
| users | _openid | 是 |
| members | memberCode | 是 |
| members | _openid | 否 |
| orders | outTradeNo | 是 |
| ling_accounts | _openid | 是 |
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

## 7. 首页门户与内容中心（本轮功能扩展 Task 2）

新增集合：`home_configs` `articles` `ticket_products` `tickets` `visit_reservations` `service_leads` `feedback` `itineraries`
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
