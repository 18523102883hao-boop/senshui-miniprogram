# 森水长河 · 游客向导小程序（Funriver）

微信原生小程序 + 云开发 CloudBase。游客在森水长河的随身向导：行前买票看攻略、在园查活动约玩法点单、离园留会员促复购。

> 本仓库由 Claude 搭建 **V1 核心骨架 + 会员卡支付发卡核销闭环**；其余功能以 `specs/` 下的规格文档交付，可由其他 AI 工具接续开发。产品规划基准见 `森水向导小程序_PRD与开发规划_v1.0.docx` 与 `docs/`。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | 微信原生小程序 + TDesign（可选增强） |
| 后端 | 微信云开发 CloudBase：云函数 + 云数据库 + 云存储 + 云支付 |
| 视觉 | 「长河令江湖」主题：米白 `#F5F1E9` + 墨绿 `#2A4D3A` + 朱砂 `#B23A2E`（见 `miniprogram/app.wxss`） |
| 消息 | 订阅消息（预约提醒 / 接单通知 / 停运通知，逐步接入） |

---

## 目录结构

```
森水长河小程序/
├── project.config.json          # 已改为云开发结构（miniprogramRoot / cloudfunctionRoot）
├── miniprogram/                 # 小程序主体
│   ├── app.js / app.json / app.wxss
│   ├── env.js                   # ⚠️ 部署前填云环境 ID、前台电话
│   ├── utils/                   # const / store / auth / request / util
│   └── pages/
│       ├── index/               # 首页·向导（T05）
│       ├── ling/                # 玩·长河令（T06）
│       ├── mine/                # 我的（T15）
│       ├── member/detail/       # 会员卡购买（T13）★核心
│       ├── member/card/         # 我的会员卡·核销状态（T14）★核心
│       ├── ticket/              # 购票聚合页（T16）
│       ├── order/               # 点单占位（V2）
│       └── staff/               # 员工模式：entry 绑定 / verify 核销台（T10/T14）★核心
├── cloudfunctions/              # 15 个云函数（见下表）
├── docs/                        # 数据模型 / 部署 / 设计系统
├── scripts/db-init.md           # 集合与索引清单
└── specs/                       # T01–T19 规格（交付其他工具续开发）
```

---

## 本轮交付范围

| 状态 | 内容 |
|---|---|
| ✅ Claude 已实现 | 工程骨架、设计系统、登录/手机号、4Tab 页面、**会员卡下单→支付→幂等发卡→核销→退款全链路**、员工绑定/核销台、数据库初始化 |
| 📄 转 spec（`specs/`） | 溪降预约（T07/T08/T09/T11/T12，**下一阶段**）、订阅消息、后台内容管理、购票配置后台、V2 点单/电子令 |

---

## 云函数清单

| 云函数 | 职责 | 关联任务 |
|---|---|---|
| `login` | 静默登录 + 注册 users | T04 |
| `bindPhone` | 手机号 code 换取绑定 | T04 |
| `createMemberOrder` | 会员卡下单 + 云支付统一下单（限购） | T13 ★ |
| `payCallback` | 支付回调 **幂等发卡**（事务） | T13 ★ |
| `verifyBenefit` | 权益核销（令/酒/券）防重复 + 留痕 | T14 ★ |
| `getMemberCard` | 查本人会员卡与权益状态 | T14/T15 |
| `getMemberForVerify` | 员工端按会员码拉权益 | T14 |
| `refundMember` | 7 天无理由退款 | T13 |
| `checkStaff` / `bindStaff` | 员工角色校验 / 绑定申请 | T10 |
| `getLingBalance` | 长河令余额 | T06/T15 |
| `getHomeData` / `getLingContent` / `getTicketConfig` | 首页 / 长河令 / 购票内容 | T05/T06/T16 |
| `initDb` | 初始化集合 + 种子 | T02 |

---

## 部署步骤

1. **注册认证**（T01）：企业主体、「旅游-景区服务」类目资质、微信支付商户号。
2. **开通云开发**：微信开发者工具 → 云开发 → 新建环境，复制 **环境 ID**。
3. **填配置**：把环境 ID 写入 `miniprogram/env.js` 的 `cloudEnv`；`frontDeskPhone` 填前台电话。
4. **构建 npm（TDesign，可选）**：在 `miniprogram/` 下 `npm i`，开发者工具「工具 → 构建 npm」。当前页面用原生组件，不装也能跑。
5. **上传云函数**：`cloudfunctions/` 下每个函数右键「上传并部署（云端安装依赖）」。
6. **初始化数据库**：云端测试 `initDb`，入参 `{ "seed": true }`；再按 `scripts/db-init.md` 建索引。
7. **配置支付**：云开发关联微信支付商户号；给 `createMemberOrder`、`refundMember` 配置**环境变量 `SUB_MCH_ID`**（子商户号）。
8. **订阅消息**（后续）：申请模板并接入（预约/接单/停运）。

---

## ⚠️ 部署前必须替换的占位

- `miniprogram/env.js` → `cloudEnv`、`frontDeskPhone`
- 云函数环境变量 → `SUB_MCH_ID`
- `pages/ticket` 渠道链接、`pages/index` 地图图片 → 后台 `notices` 配置或直接填

---

## 待拍板事项（来自 PRD）

1. 85 折券适用范围与叠加规则（当前实现：核销时一次性发 5 张 `discount_85` 券入卡包）
2. 溪降场次表与各场容量（下一阶段）
3. 开发与运维主体、微信支付商户主体
4. V1 上线目标日期

---

## 合规红线（长河令）

全站统一「参与令数 / 奖励令数」，禁用「押注/下注/翻倍/稳赚/以小博大/赌」；拍卖仅介绍不做线上竞拍；骰子玩法不上线；长河令不线上直售、不可兑现金。详见 `specs/_conventions.md`。
