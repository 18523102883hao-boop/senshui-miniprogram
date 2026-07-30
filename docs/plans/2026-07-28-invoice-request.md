# 已完成订单申请开票 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为已完成订单增加电子普通发票申请，并在员工模式内补齐审核、线下开票登记、邮件送达和退款冲突处理。

**Architecture:** 使用独立 `invoice_requests` 集合保存事实数据，在订单上冗余最小状态摘要；一个开票服务云函数集中处理用户提交/查询和管理员列表/更新，所有金额与权限由服务端决定。退款云函数在调用微信退款前检查开票终态，并在退款受理后关闭未开票申请。

**Tech Stack:** 微信原生小程序 JavaScript/WXML/WXSS、CloudBase 云函数与云数据库、Node.js `node:test`

---

### Task 1: 建立开票领域行为契约

**Files:**

- Create: `tests/feature-expansion/invoice-request.test.js`
- Modify: `tests/uiux/order-center.test.js`

**Step 1: Write the failing tests**

- 正常 `paid` 三类订单可开票，`paid_dup` 和退款状态不可开票。
- 订单展示模型返回开票按钮状态，但不泄漏敏感资料。
- 个人、单位抬头校验和字段清理正确。
- 状态机只允许已确认的迁移。
- 可开票金额只来自服务端订单/剩余票券。

**Step 2: Run tests to verify they fail**

```bash
node --test tests/feature-expansion/invoice-request.test.js tests/uiux/order-center.test.js
```

Expected: FAIL，当前没有开票领域模块、资格字段和页面入口。

### Task 2: 实现开票云端服务

**Files:**

- Create: `cloudfunctions/invoiceService/invoice-core.js`
- Create: `cloudfunctions/invoiceService/index.js`
- Create: `cloudfunctions/invoiceService/package.json`
- Modify: `cloudfunctions/initDb/index.js`
- Modify: `docs/数据模型.md`
- Test: `tests/feature-expansion/invoice-request.test.js`

**Step 1: Implement the minimal server contract**

- `submit`：校验归属、订单资格、剩余金额和表单，创建或修订申请。
- `getMine`：按订单号返回申请人自己的安全详情。
- `listStaff`：仅管理员按状态分页查询。
- `getStaffDetail`：仅管理员读取完整资料。
- `updateStaff`：执行审核、开票、驳回状态迁移并写历史。
- 写入订单开票摘要，失败时以申请记录为准。
- 初始化脚本登记 `invoice_requests`。

**Step 2: Run server tests**

```bash
node --test tests/feature-expansion/invoice-request.test.js
node --check cloudfunctions/invoiceService/index.js
node --check cloudfunctions/invoiceService/invoice-core.js
```

Expected: PASS。

### Task 3: 在订单中心增加开票入口

**Files:**

- Modify: `cloudfunctions/getMyOrders/order-core.js`
- Modify: `cloudfunctions/getMyOrders/index.js`
- Modify: `miniprogram/pages/order/order.js`
- Modify: `miniprogram/pages/order/order.wxml`
- Modify: `miniprogram/pages/order/order.wxss`
- Test: `tests/uiux/order-center.test.js`

**Step 1: Implement order presentation**

- 输出 `canInvoice`、`invoiceStatus`、`invoiceActionText`。
- 未申请进入申请页，已有申请进入进度页。
- 保留支付与退款动作，不在客户端决定最终资格。

**Step 2: Run page tests**

```bash
node --test tests/uiux/order-center.test.js
```

Expected: PASS。

### Task 4: 实现用户申请和进度页面

**Files:**

- Create: `miniprogram/pages/invoice/apply/apply.js`
- Create: `miniprogram/pages/invoice/apply/apply.json`
- Create: `miniprogram/pages/invoice/apply/apply.wxml`
- Create: `miniprogram/pages/invoice/apply/apply.wxss`
- Create: `miniprogram/pages/invoice/detail/detail.js`
- Create: `miniprogram/pages/invoice/detail/detail.json`
- Create: `miniprogram/pages/invoice/detail/detail.wxml`
- Create: `miniprogram/pages/invoice/detail/detail.wxss`
- Modify: `miniprogram/app.json`
- Create: `tests/uiux/invoice-pages.test.js`

**Step 1: Write failing page tests**

- 表单按个人/单位切换必填项和折叠项。
- 提交前确认，提交中锁定，成功进入进度页。
- 进度页正确映射三段进度、驳回与已开票结果。
- 页面注册、空态、失败重试和底部安全区存在。

**Step 2: Implement and verify**

```bash
node --test tests/uiux/invoice-pages.test.js tests/uiux/order-center.test.js
```

Expected: PASS。

### Task 5: 实现管理员开票管理

**Files:**

- Modify: `miniprogram/pages/staff/entry/entry.js`
- Modify: `miniprogram/pages/staff/entry/entry.wxml`
- Create: `miniprogram/pages/staff/invoices/invoices.js`
- Create: `miniprogram/pages/staff/invoices/invoices.json`
- Create: `miniprogram/pages/staff/invoices/invoices.wxml`
- Create: `miniprogram/pages/staff/invoices/invoices.wxss`
- Create: `miniprogram/pages/staff/invoice-detail/invoice-detail.js`
- Create: `miniprogram/pages/staff/invoice-detail/invoice-detail.json`
- Create: `miniprogram/pages/staff/invoice-detail/invoice-detail.wxml`
- Create: `miniprogram/pages/staff/invoice-detail/invoice-detail.wxss`
- Modify: `miniprogram/app.json`
- Create: `tests/feature-expansion/invoice-staff.test.js`

**Step 1: Write failing staff tests**

- 入口只对管理员显示。
- 列表支持状态筛选和失败重试。
- 详情按状态显示审核、开票和驳回动作。
- 开票必须填写号码、有效文件地址并确认邮件已发送。
- 服务端拒绝普通员工和非法状态迁移。

**Step 2: Implement and verify**

```bash
node --test tests/feature-expansion/invoice-staff.test.js tests/feature-expansion/invoice-request.test.js
```

Expected: PASS。

### Task 6: 协同退款并更新隐私说明

**Files:**

- Modify: `cloudfunctions/refundMember/index.js`
- Modify: `cloudfunctions/requestTicketRefund/index.js`
- Modify: `cloudfunctions/requestTicketRefund/refund-core.js`
- Modify: `miniprogram/pages/legal/privacy/privacy.js`
- Modify: `docs/数据模型.md`
- Modify: relevant privacy and refund tests

**Step 1: Write failing integration contracts**

- `issued` 阻止会员卡和门票自助退款。
- `submitted/reviewing` 在退款受理后改为 `cancelled_refund`。
- 门票部分退款后的开票金额不包含已退款票券。
- 隐私说明覆盖开票资料。

**Step 2: Implement and verify**

```bash
node --test tests/feature-expansion/invoice-request.test.js tests/feature-expansion/ticket-fulfillment.test.js
```

Expected: PASS。

### Task 7: 页面自测与完整回归

**Files:**

- Create: `docs/testing/invoice-request-self-check.md`
- Verify all modified files

**Step 1: Record per-page self-checklists**

- 我的订单
- 申请开票
- 开票进度
- 员工开票列表
- 员工开票详情

**Step 2: Run full regression and static checks**

```bash
node --test tests/*.test.js tests/feature-expansion/*.test.js tests/uiux/*.test.js
node --check cloudfunctions/invoiceService/index.js
node --check miniprogram/pages/invoice/apply/apply.js
node --check miniprogram/pages/invoice/detail/detail.js
node --check miniprogram/pages/staff/invoices/invoices.js
node --check miniprogram/pages/staff/invoice-detail/invoice-detail.js
git diff --check
```

Expected: all commands exit 0。
