# 管理员运营与对账 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为管理员增加小程序业务账、核销与长河令运营报表，支持日/月/自定义汇总、明细查询和脱敏 CSV 导出，并将营地营业时间统一调整为 09:30–21:00。

**Architecture:** 新增一个管理员专属报表云函数，读取现有订单、票券、会员、退款申请、核销和长河令流水，交给无云 SDK 依赖的纯逻辑模块统一转换和汇总。小程序采用“运营与对账”汇总页和“业务明细”查询页两层结构，保留原有补差价汇总，不修改支付、核销和兑换主流程。

**Tech Stack:** 微信原生小程序 JavaScript/WXML/WXSS、CloudBase 云函数与云数据库、Node.js `node:test`

---

### Task 1: 固化业务账领域契约

**Files:**

- Create: `tests/feature-expansion/admin-operations-ledger.test.js`
- Create: `cloudfunctions/adminOperationsLedger/report-core.js`

**Step 1: Write the failing tests**

- 校验日、月、自定义时间范围和 366 天上限。
- 支付、门票退款、会员退款按发生时间生成资金流水。
- `paid_dup` 计入实收同时计入异常。
- 核销票面金额与资金收入分离。
- 旧预约核销无价格时保持零并标记历史数据缺失。
- 长河令只汇总实体转电子和电子兑实体。
- 按业务类型、票种、员工和北京时间日期正确汇总。
- 关键词、员工和子类型筛选后再分页。
- 手机号及用户标识对外脱敏。

**Step 2: Run tests to verify they fail**

```bash
node --test tests/feature-expansion/admin-operations-ledger.test.js
```

Expected: FAIL，报表纯逻辑模块尚不存在。

**Step 3: Implement minimal pure logic**

- 标准化时间、金额、类型标签和搜索文本。
- 将各集合记录转换为统一事件。
- 生成汇总和详情分页结果。

**Step 4: Run tests**

```bash
node --test tests/feature-expansion/admin-operations-ledger.test.js
node --check cloudfunctions/adminOperationsLedger/report-core.js
```

Expected: PASS。

### Task 2: 实现管理员报表云函数

**Files:**

- Create: `cloudfunctions/adminOperationsLedger/index.js`
- Create: `cloudfunctions/adminOperationsLedger/package.json`
- Modify: `scripts/deploy-functions.sh`
- Modify: `scripts/db-init.md`
- Modify: `docs/数据模型.md`
- Test: `tests/feature-expansion/admin-operations-ledger.test.js`

**Step 1: Add failing source-contract tests**

- 云函数存在管理员二次鉴权。
- 所有时间范围走服务端校验。
- 汇总读取订单、退款、门票、会员核销和长河令。
- 详情只返回白名单字段，电话脱敏。
- 批量读取达到上限时返回截断标记。

**Step 2: Implement server actions**

- `summary`：返回汇总、构成、员工和逐日数据。
- `details`：返回指定类别筛选、分页和 CSV 所需字段。
- 历史会员退款按订单号补齐金额。
- 所有集合按 `[from,to)` 读取必要字段。

**Step 3: Verify**

```bash
node --test tests/feature-expansion/admin-operations-ledger.test.js
node --check cloudfunctions/adminOperationsLedger/index.js
```

Expected: PASS。

### Task 3: 实现“运营与对账”汇总页

**Files:**

- Create: `miniprogram/pages/staff/operations/operations.js`
- Create: `miniprogram/pages/staff/operations/operations.json`
- Create: `miniprogram/pages/staff/operations/operations.wxml`
- Create: `miniprogram/pages/staff/operations/operations.wxss`
- Create: `tests/uiux/staff-operations-summary.test.js`
- Modify: `miniprogram/app.json`

**Step 1: Write failing page tests**

- 页面注册且只消费云端汇总数据。
- 日/月/自定义范围能产生正确的开始、结束时间。
- 自定义日期不完整或倒置时不发请求。
- 净收为主指标，核销金额明确标记为票面金额。
- 异常提示仅在有待退款或重复支付时出现。
- 加载、空数据、失败重试、无权限和截断提示齐全。
- 日拆分可进入对应日期明细。

**Step 2: Implement summary page**

- 使用统一圆角、间距、字号、阴影和触控反馈。
- 默认今天；切换周期自动加载。
- 卡片顺序遵循“资金 → 风险 → 运营 → 构成 → 日拆分”。

**Step 3: Page self-check**

```bash
node --test tests/uiux/staff-operations-summary.test.js
node --check miniprogram/pages/staff/operations/operations.js
```

记录结果到 `docs/testing/staff-operations-self-check.md` 后再进入下一页面。

### Task 4: 实现“业务明细”查询页

**Files:**

- Create: `miniprogram/pages/staff/operation-details/operation-details.js`
- Create: `miniprogram/pages/staff/operation-details/operation-details.json`
- Create: `miniprogram/pages/staff/operation-details/operation-details.wxml`
- Create: `miniprogram/pages/staff/operation-details/operation-details.wxss`
- Create: `tests/uiux/staff-operation-details.test.js`
- Modify: `miniprogram/app.json`

**Step 1: Write failing page tests**

- 四类标签正确映射后端 `kind`。
- 继承汇总页时间范围并支持员工、子类型、关键词筛选。
- 搜索防抖、提交锁和继续加载正确。
- 明细清晰区分支付、退款、票面金额和长河令数量。
- 空结果可重置筛选，失败可重试。
- CSV 包含口径、范围和表头，不包含完整 openid 或手机号。

**Step 2: Implement detail page**

- 每页 30 条，滚动到底继续加载。
- 当前筛选变化时重置页码。
- CSV 使用剪贴板导出并明确提示粘贴到表格。

**Step 3: Page self-check**

```bash
node --test tests/uiux/staff-operation-details.test.js
node --check miniprogram/pages/staff/operation-details/operation-details.js
```

将结果追加到 `docs/testing/staff-operations-self-check.md`。

### Task 5: 接入员工入口并保留既有功能

**Files:**

- Modify: `miniprogram/pages/staff/entry/entry.js`
- Modify: `miniprogram/pages/staff/entry/entry.wxml`
- Modify: `tests/feature-expansion/admin-operations-ledger.test.js`

**Step 1: Write failing permission and navigation tests**

- 仅管理员显示“运营与对账”。
- 普通员工原有核销、兑换、收款功能不变。
- 原补差价汇总页面不删除。

**Step 2: Implement and verify**

```bash
node --test tests/feature-expansion/admin-operations-ledger.test.js
node --check miniprogram/pages/staff/entry/entry.js
```

Expected: PASS。

### Task 6: 统一营地营业时间

**Files:**

- Modify: `miniprogram/env.js`
- Modify: `miniprogram/utils/park-status.js`
- Modify: `docs/业务参数.md`
- Modify: `tests/uiux/home-layout.test.js`
- Modify: `tests/feature-expansion/guide-concierge.test.js`

**Step 1: Write failing time tests**

- `09:29` 营地未营业。
- `09:30` 营地营业。
- `19:01` 营地仍营业但已停止供餐。
- `21:00` 营地仍在营业，之后结束。
- 溪降 `10:00–16:30` 不受影响。

**Step 2: Update all sources and fallbacks**

- 配置、注释、文档、测试夹具统一为 `09:30–21:00`。
- 不改变 `19:00` 停止供餐。

**Step 3: Verify**

```bash
node --test tests/uiux/home-layout.test.js tests/feature-expansion/guide-concierge.test.js
```

Expected: PASS。

### Task 7: 完整回归与审计

**Files:**

- Modify: `docs/testing/staff-operations-self-check.md`
- Verify all changed files

**Step 1: Run focused tests and static checks**

```bash
node --test tests/feature-expansion/admin-operations-ledger.test.js tests/uiux/staff-operations-summary.test.js tests/uiux/staff-operation-details.test.js
node --check cloudfunctions/adminOperationsLedger/index.js
node --check cloudfunctions/adminOperationsLedger/report-core.js
node --check miniprogram/pages/staff/operations/operations.js
node --check miniprogram/pages/staff/operation-details/operation-details.js
```

**Step 2: Run full regression**

```bash
node --test tests/*.test.js tests/feature-expansion/*.test.js tests/uiux/*.test.js
git diff --check
```

**Step 3: Review**

- 权限绕过、金额单位、时区边界、分页截断和历史字段缺失。
- 确认未修改支付金额计算、核销原子更新或长河令事务。
- 输出部署函数、数据库索引和真机验证清单。

Expected: all commands exit 0。
