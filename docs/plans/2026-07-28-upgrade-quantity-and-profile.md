# 补差升级数量与个人页紧凑化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为双人溪降票升级增加 1/2 人购买数量与云端安全计价，并完成相关文案、默认方向和个人页顶部密度调整。

**Architecture:** 前端只负责数量交互和总额预览；`createSelfUpgrade` 通过可单测的纯逻辑模块校验项目、数量并计算总额，订单与微信支付统一使用服务端结果。首页、票种种子和个人页只做范围明确的文案或样式调整。

**Tech Stack:** 微信小程序原生 JavaScript/WXML/WXSS、CloudBase 云函数、Node.js `node:test`

---

### Task 1: 建立补差数量行为契约

**Files:**

- Modify: `tests/upgrade-info-page.test.js`
- Create: `tests/feature-expansion/upgrade-order.test.js`

**Step 1: Write the failing tests**

- 默认方向为溪降票。
- 双人升级默认数量 2，可在 1/2 之间切换并更新总价。
- 支付请求携带数量。
- 云端纯逻辑只允许双人升级数量 1/2，其他项目固定 1，并只使用配置单价计算金额。

**Step 2: Run tests to verify they fail**

```bash
node --test tests/upgrade-info-page.test.js tests/feature-expansion/upgrade-order.test.js
```

Expected: FAIL，当前页面默认营地票且没有数量状态，云端也没有数量计价模块。

### Task 2: 实现云端数量校验与总额

**Files:**

- Create: `cloudfunctions/createSelfUpgrade/order-core.js`
- Modify: `cloudfunctions/createSelfUpgrade/index.js`
- Test: `tests/feature-expansion/upgrade-order.test.js`

**Step 1: Implement minimal server logic**

- 解析并校验数量。
- 从配置单价计算 `totalFee`。
- 建单保存 `quantity`、`unitPrice` 和总额。
- 统一下单和返回结果使用总额。

**Step 2: Run server tests**

```bash
node --test tests/feature-expansion/upgrade-order.test.js
```

Expected: PASS。

### Task 3: 实现补差页数量交互

**Files:**

- Modify: `miniprogram/pages/upgrade-info/upgrade-info.js`
- Modify: `miniprogram/pages/upgrade-info/upgrade-info.wxml`
- Modify: `miniprogram/pages/upgrade-info/upgrade-info.wxss`
- Test: `tests/upgrade-info-page.test.js`

**Step 1: Implement minimal page behavior**

- 将溪降票分组移至首位并作为默认值。
- 双人项目打开时默认 2 人，增减按钮限制为 1/2。
- 显示每人金额、升级人数和本次总额。
- 支付时提交 `quantity`。

**Step 2: Run page tests**

```bash
node --test tests/upgrade-info-page.test.js
```

Expected: PASS。

### Task 4: 更新安全说明与首页文案

**Files:**

- Modify: `cloudfunctions/seedTicketProducts/seed-tickets.js`
- Modify: `miniprogram/env.js`
- Modify: `miniprogram/pages/guide/guide.js`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `cloudfunctions/getHomePortal/portal-core.js`
- Modify: `cloudfunctions/seedPortalContent/seed-data.js`
- Modify: `miniprogram/components/ui/sr-park-header/index.js`
- Modify: relevant tests under `tests/feature-expansion/` and `tests/uiux/`

**Step 1: Add or update failing wording tests**

验证儿童范围为 120–150 厘米（均含），首页默认与云端种子均使用“峡谷溪降”。

**Step 2: Implement wording updates and run tests**

```bash
node --test tests/feature-expansion/ticket-catalog.test.js tests/feature-expansion/content-pages.test.js tests/uiux/home-layout.test.js
```

Expected: PASS。

### Task 5: 收紧“我的”页顶部身份卡

**Files:**

- Modify: `miniprogram/pages/mine/mine.wxss`
- Modify: `tests/uiux/home-layout.test.js`

**Step 1: Add the failing density contract**

验证头像不大于 `88rpx`、卡片横向内边距不大于 `24rpx`、头像与信息区间距不大于 `16rpx`。

**Step 2: Implement compact spacing and run tests**

```bash
node --test tests/uiux/home-layout.test.js
```

Expected: PASS。

### Task 6: 完整回归

**Files:**

- Verify all modified files

**Step 1: Run targeted and full tests**

```bash
node --test tests/*.test.js tests/feature-expansion/*.test.js tests/uiux/*.test.js
```

**Step 2: Run syntax and diff checks**

```bash
node --check miniprogram/pages/upgrade-info/upgrade-info.js
node --check cloudfunctions/createSelfUpgrade/index.js
node --check cloudfunctions/createSelfUpgrade/order-core.js
git diff --check
git status --short
```

Expected: all commands exit 0。
