# 长河令额度、首页保险与业务数据优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为长河令实体转电子增加按客户和北京时间自然日累计的角色额度，补齐生日权益证件核验、首页保险入口、我的页信息布局，以及三类长河令业务汇总与明细下钻。

**Architecture:** 额度由云函数在数据库事务中维护独立的 `ling_daily_quotas` 日累计记录，前端只负责展示和提前提示；生日核验由前端二次确认与云端布尔确认双重约束。首页保险作为必备入口注入旧版云配置，并通过统一外链页打开。经营数据继续复用 `adminOperationsLedger` 的统一事件模型，把 `member_grant` 纳入长河令业务事件并返回三类结构化汇总。

**Tech Stack:** 微信小程序 WXML/WXSS/JavaScript、腾讯云 CloudBase 云函数与文档数据库、Node.js `node:test`。

---

## Task 1：每日额度纯逻辑与事务约束

**Files:**
- Create: `cloudfunctions/exchangeLing/quota-core.js`
- Create: `cloudfunctions/resolveUserForLing/quota-core.js`
- Modify: `cloudfunctions/exchangeLing/index.js`
- Modify: `cloudfunctions/resolveUserForLing/index.js`
- Test: `tests/feature-expansion/ling-daily-quota.test.js`

1. 先写失败测试，覆盖普通员工 5000、管理员 10000、角色切换后的累计额度、电子兑实体不计额度、北京时间日期边界、确定性额度记录 ID。
2. 运行 `node --test tests/feature-expansion/ling-daily-quota.test.js`，确认测试因额度模块缺失而失败。
3. 实现额度纯逻辑；两个云函数各自携带同一份模块，因为 CloudBase 会独立打包每个云函数。
4. 在 `exchangeLing` 的原有账户事务中读取并写入确定性的每日额度文档，实体转电子超额时拒绝，成功时返回 `dailyLimit/dailyUsed/dailyRemaining`。
5. 在 `resolveUserForLing` 返回当前员工角色对应的额度、已用量和剩余量。
6. 重跑额度测试，确认通过。

## Task 2：额度集合、员工兑换页与部署说明

**Files:**
- Modify: `cloudfunctions/initDb/index.js`
- Modify: `miniprogram/pages/staff/ling-exchange/ling-exchange.js`
- Modify: `miniprogram/pages/staff/ling-exchange/ling-exchange.wxml`
- Modify: `miniprogram/pages/staff/ling-exchange/ling-exchange.wxss`
- Modify: `docs/数据模型.md`
- Modify: `scripts/db-init.md`
- Modify: `scripts/deploy-functions.sh`
- Test: `tests/uiux/staff-ling-exchange.test.js`

1. 写失败测试，要求扫码后展示角色额度、今日已用、今日剩余，并在实体转电子时用云端剩余额度做前置校验。
2. 把 `ling_daily_quotas` 加入初始化与部署说明，权限为客户端不可读写。
3. 在员工兑换页展示额度卡片；兑换成功后使用云端响应立即更新。
4. 运行页面测试与额度测试。

## Task 3：生日 85 折身份证核验

**Files:**
- Modify: `miniprogram/pages/staff/verify/verify.js`
- Modify: `miniprogram/pages/staff/verify/verify.wxml`
- Modify: `miniprogram/pages/staff/verify/verify.wxss`
- Modify: `cloudfunctions/verifyBenefit/index.js`
- Test: `tests/feature-expansion/member-birthday-id-check.test.js`
- Test: `tests/uiux/staff-member-verify.test.js`

1. 写失败测试，要求生日权益行持续显示身份证说明、点击后出现二次确认、云端生日核销必须收到 `identityChecked: true`。
2. 前端只传递“已核对”布尔值，不采集身份证号码、图片或扫描件。
3. 云端在生日权益核销前强制校验该布尔值，并在核销记录中保存 `identityChecked: true`。
4. 运行相关功能与 UI 测试。

## Task 4：首页四入口与溪降保险外链

**Files:**
- Modify: `miniprogram/env.js`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/utils/external-link.js`
- Modify: `miniprogram/pages/webview/webview.js`
- Modify: `miniprogram/pages/webview/webview.wxml`
- Modify: `cloudfunctions/getHomePortal/portal-core.js`
- Modify: `cloudfunctions/seedPortalContent/seed-data.js`
- Modify: `docs/业务参数.md`
- Test: `tests/uiux/home-actions.test.js`
- Test: `tests/uiux/home-layout.test.js`
- Test: `tests/feature-expansion/portal-cloud.test.js`

1. 先更新测试为购票、预约、补差价、保险四入口和 2×2 布局，确认旧实现失败。
2. 增加保险 URL 配置与通用 web-view 外链类型。
3. 在首页本地默认、云端默认及旧配置兼容注入中加入 `insurance_entry`。
4. 外链打开失败时保留复制链接兜底，并在文档标记正式版业务域名要求。
5. 运行首页与外链测试。

## Task 5：我的页头像与信息紧邻

**Files:**
- Modify: `miniprogram/pages/mine/mine.wxss`
- Test: `tests/uiux/mine-profile-layout.test.js`

1. 写布局约束测试，要求头像按钮固定宽度、容器左对齐、信息区不再占满剩余空间。
2. 使用统一 `gap` 让头像与昵称/登录信息紧邻，保留窄屏收缩能力。
3. 运行我的页布局及现有登录相关测试。

## Task 6：三类业务汇总后端

**Files:**
- Modify: `cloudfunctions/adminOperationsLedger/report-core.js`
- Modify: `cloudfunctions/adminOperationsLedger/index.js`
- Modify: `cloudfunctions/verifyBenefit/index.js`
- Test: `tests/feature-expansion/admin-operations-ledger.test.js`

1. 更新失败测试，把 `member_grant` 纳入长河令业务事件，断言三类汇总各自的笔数和令数。
2. 在会员卡发放流水补充 `staffOpenid`，保留历史记录缺失该字段时的兼容展示。
3. 报表接口返回 `businessBreakdown`，明细接口返回日期范围内三类汇总和可筛选的全部类型。
4. 运行经营数据后端测试。

## Task 7：经营数据入口与业务明细下钻

**Files:**
- Modify: `miniprogram/pages/staff/operations/operations.wxml`
- Modify: `miniprogram/pages/staff/operations/operations.js`
- Modify: `miniprogram/pages/staff/operation-details/operation-details.js`
- Modify: `miniprogram/pages/staff/operation-details/operation-details.wxml`
- Modify: `miniprogram/pages/staff/operation-details/operation-details.wxss`
- Test: `tests/uiux/staff-operations-summary.test.js`
- Test: `tests/uiux/staff-operation-details.test.js`

1. 写失败测试，将入口名称改为“业务数据”，要求三张汇总卡可点击并设置对应业务类型筛选。
2. 经营数据保留“会员核销”独立入口，避免生日权益记录与会员卡发放混淆。
3. 业务明细页显示实体兑电子、电子兑实体、会员卡兑换三类令数与笔数；点击后刷新明细。
4. 运行员工经营数据 UI 测试。

## Task 8：全量验证与交付

**Files:**
- Modify if needed: `docs/testing/` 下相关自测清单

1. 运行本轮定向测试。
2. 运行 `node --test tests/**/*.test.js` 做全量回归。
3. 对修改过的 JavaScript 做语法检查，并检查云函数部署清单。
4. 输出页面自测清单：额度跨角色与跨日、生日核验、首页外链、我的页窄屏、三类业务下钻。
5. 明确需要手动部署的云函数、数据库集合和微信业务域名配置；不在当前共享脏工作区自动提交。
