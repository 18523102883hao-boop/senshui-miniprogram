# 电子发票 PDF 交付与经营数据中心 Implementation Plan

> **For Claude Code:** 按任务顺序执行；使用测试驱动开发。每次只修改一个页面，每页完成后更新自测清单，再进入下一页。

**Goal:** 在不重构现有业务架构的前提下，将开票完成流程升级为 PDF 上传、预览、确认和小程序内领取，并把现有管理员业务账重组为财务对账与核销数据两条清晰链路，正确区分核销票数和实际人数。

**Architecture:** 复用现有 `invoiceService`、`adminOperationsLedger`、订单、票券和核销事实数据。发票文件存入 CloudBase 私有存储，以 `invoice_requests.invoiceFile` 保存文件快照；经营数据继续由管理员云函数聚合，但新增人数快照、财务/核销视图、周期账单和订单下钻。所有权限、文件完成条件、金额和人数口径都由服务端校验。

**Tech Stack:** 微信原生小程序 JavaScript/WXML/WXSS、CloudBase 云函数/云数据库/云存储、Node.js `node:test`

---

### Task 1：更新领域契约与旧规则防回归

**Files:**

- Modify: `tests/feature-expansion/invoice-staff.test.js`
- Modify: `tests/uiux/invoice-pages.test.js`
- Modify: `tests/feature-expansion/admin-operations-ledger.test.js`
- Modify: `tests/feature-expansion/ticket-order.test.js`
- Modify: `tests/feature-expansion/ticket-fulfillment.test.js`
- Modify: `docs/数据模型.md`

**Step 1: Write failing tests**

- 新开票申请完成时不再要求 `invoiceNo/invoiceUrl/emailSent`。
- `issued` 必须有有效 `invoiceFile`，并校验申请修订版本。
- 非 PDF、超过 10MB、错误文件头和错目录文件均失败。
- 商品、订单、票券和核销记录保存 `admissionCount`。
- 双人票汇总为 `verifiedTicketCount=1`、`admittedPeopleCount=2`。
- 未知历史票不进入已确认人数，进入 `unknownAdmissionTicketCount`。
- 财务收入不包含票面金额。

**Step 2: Run tests and confirm failure**

```bash
node --test \
  tests/feature-expansion/invoice-staff.test.js \
  tests/uiux/invoice-pages.test.js \
  tests/feature-expansion/admin-operations-ledger.test.js \
  tests/feature-expansion/ticket-order.test.js \
  tests/feature-expansion/ticket-fulfillment.test.js
```

Expected: FAIL，失败点集中在旧开票完成条件和缺失的人数快照。

**Step 3: Document fields**

在 `docs/数据模型.md` 增加：

- `ticket_products.admissionCount`
- `orders.admissionCountPerTicket`
- `tickets.admissionCount`
- `verifications.admissionCount`
- `invoice_requests.invoiceFile`

旧开票三字段标记为 deprecated/legacy。

---

### Task 2：实现 PDF 文件领域逻辑和服务端校验

**Files:**

- Modify: `cloudfunctions/invoiceService/invoice-core.js`
- Modify: `cloudfunctions/invoiceService/index.js`
- Modify: `cloudfunctions/invoiceService/package.json`
- Modify: `cloudfunctions/initDb/index.js`
- Modify: `tests/feature-expansion/invoice-staff.test.js`
- Modify: `tests/feature-expansion/invoice-request.test.js`

**Step 1: Add pure-logic tests**

覆盖：

- 文件名、扩展名、大小、Content-Type 和版本归一化；
- 存储路径必须属于当前申请；
- `reviewing` 才能绑定或替换；
- `issued` 必须携带当前修订版有效文件；
- 管理员权限、状态机和重复确认幂等；
- 用户详情只返回自己的文件摘要；
- 旧 `invoiceUrl` 详情继续兼容。

**Step 2: Implement core contract**

新增纯函数：

- `normalizeInvoiceFile`
- `validateInvoiceFileMeta`
- `buildInvoiceFilePatch`
- `canAccessInvoiceFile`

修改 `buildStaffUpdate`，使 `issued` 依赖 `invoiceFile`，不再依赖旧三字段。

**Step 3: Implement cloud actions**

- `attachInvoiceFile`
  - 管理员鉴权；
  - 校验 `requestId/revision/status`；
  - 检查文件目录；
  - 云端下载文件并校验大小与 `%PDF-`；
  - 保存文件快照和操作历史；
  - 成功绑定新文件后清理被替换文件。
- `getInvoiceFileAccess`
  - 校验申请人或管理员；
  - 生成短期访问地址；
  - 写入查看/下载审计。
- `updateStaff(status=issued)`
  - 重新读取申请和订单；
  - 要求当前版本有效文件；
  - 幂等完成。

**Step 4: Verify**

```bash
node --test tests/feature-expansion/invoice-staff.test.js tests/feature-expansion/invoice-request.test.js
node --check cloudfunctions/invoiceService/invoice-core.js
node --check cloudfunctions/invoiceService/index.js
```

Expected: PASS。

---

### Task 3：改造管理员开票详情页

**Files:**

- Modify: `miniprogram/pages/staff/invoice-detail/invoice-detail.js`
- Modify: `miniprogram/pages/staff/invoice-detail/invoice-detail.wxml`
- Modify: `miniprogram/pages/staff/invoice-detail/invoice-detail.wxss`
- Modify: `tests/feature-expansion/invoice-staff.test.js`
- Create or Modify: `docs/testing/invoice-request-self-check.md`

**Step 1: Write failing page tests**

- reviewing 状态显示 PDF 上传区，不显示号码、URL 和邮件勾选。
- 调用 `wx.chooseMessageFile` 时限定 1 个 PDF。
- 客户端拒绝超过 10MB 和错误文件头。
- 上传期间禁用重复操作并展示进度。
- 上传成功显示文件名、大小、上传时间、预览和重新上传。
- 未绑定文件不能确认完成。
- 上传成功但未确认仍保持 reviewing。

**Step 2: Implement upload flow**

1. `wx.chooseMessageFile({ count: 1, type: 'file', extension: ['pdf'] })`
2. 使用文件系统读取前五字节；
3. `wx.cloud.uploadFile` 上传至 `invoice-files/<requestId>/...pdf`；
4. 调用 `attachInvoiceFile`；
5. 失败时保留 reviewing 并允许重试；
6. 预览使用受权临时地址、`wx.downloadFile` 和 `wx.openDocument`；
7. 二次确认后调用 `updateStaff(status=issued, revision)`。

**Step 3: Page self-check**

```bash
node --test tests/feature-expansion/invoice-staff.test.js
node --check miniprogram/pages/staff/invoice-detail/invoice-detail.js
```

在 `docs/testing/invoice-request-self-check.md` 记录管理员开票详情页自测后再进入 Task 4。

---

### Task 4：改造用户发票详情页

**Files:**

- Modify: `miniprogram/pages/invoice/detail/detail.js`
- Modify: `miniprogram/pages/invoice/detail/detail.wxml`
- Modify: `miniprogram/pages/invoice/detail/detail.wxss`
- Modify: `tests/uiux/invoice-pages.test.js`
- Modify: `docs/testing/invoice-request-self-check.md`

**Step 1: Write failing page tests**

- issued 状态显示文件名和开具时间，不显示邮件已发送承诺。
- “查看电子发票”调用授权文件访问并打开 PDF。
- “下载电子发票”提供明确成功/失败反馈。
- 无文件、过期地址、下载失败均可重试。
- 旧 `invoiceUrl` 申请仍有兼容入口。

**Step 2: Implement**

- 调用 `getInvoiceFileAccess`；
- 下载临时文件；
- 使用 `wx.openDocument({ fileType: 'pdf', showMenu: true })`；
- 文件操作增加忙碌锁；
- 保留退款冲突和进度状态。

**Step 3: Page self-check**

```bash
node --test tests/uiux/invoice-pages.test.js
node --check miniprogram/pages/invoice/detail/detail.js
```

更新自测文档后再进入下一页。

---

### Task 5：建立门票实际人数快照

**Files:**

- Modify: `cloudfunctions/seedTicketProducts/seed-tickets.js`
- Modify: `cloudfunctions/createTicketOrder/order-core.js`
- Modify: `cloudfunctions/createTicketOrder/index.js`
- Modify: `cloudfunctions/payCallback/ticket-issue.js`
- Modify: `cloudfunctions/verifyTicket/verify-core.js`
- Modify: `cloudfunctions/verifyTicket/index.js`
- Modify: `cloudfunctions/initDb/index.js`
- Modify: `tests/feature-expansion/ticket-order.test.js`
- Modify: `tests/feature-expansion/ticket-fulfillment.test.js`

**Step 1: Add failing tests**

- `creek_double.admissionCount=2`；
- 其他当前票种为 1；
- 订单保存 `admissionCountPerTicket`；
- 每张出票记录保存 `admissionCount`；
- 核销预览和核销审计保存人数；
- 老客户端下单时人数只能从云端商品决定。

**Step 2: Implement snapshots**

- 商品种子增加 `admissionCount`；
- 下单只信任云端商品值；
- 订单、票券和核销记录逐级快照；
- 不接受客户端传入人数覆盖云端配置。

**Step 3: Verify**

```bash
node --test tests/feature-expansion/ticket-order.test.js tests/feature-expansion/ticket-fulfillment.test.js
node --check cloudfunctions/payCallback/ticket-issue.js
node --check cloudfunctions/verifyTicket/verify-core.js
node --check cloudfunctions/verifyTicket/index.js
```

Expected: PASS。

---

### Task 6：扩展经营数据聚合契约

**Files:**

- Modify: `cloudfunctions/adminOperationsLedger/report-core.js`
- Modify: `cloudfunctions/adminOperationsLedger/index.js`
- Modify: `tests/feature-expansion/admin-operations-ledger.test.js`

**Step 1: Add failing aggregation tests**

- 财务今日/月/自定义周期；
- 每日和每月对账列表；
- 核销票数、已确认实际人数、待核对票数、关联订单数、票面金额；
- 双人票 1 张 2 人；
- 已知 SKU 历史回退；
- 未知历史 SKU 不伪造人数；
- 按票种、员工和日期分组；
- 已核销后退款、缺人数、缺价格、缺订单和重复支付异常；
- 订单详情按白名单返回且脱敏。

**Step 2: Extend events and summary**

门票核销事件增加：

- `ticketCount`
- `admissionCount`
- `admissionCountUnknown`
- `orderTradeNo`
- `refundStatus`

汇总增加：

- `verifiedTicketCount`
- `admittedPeopleCount`
- `unknownAdmissionTicketCount`
- `relatedOrderCount`
- 票种构成中的票数、人数和占比。

**Step 3: Extend actions**

保留现有 `summary/details`，新增或扩展：

- 周期账单数据；
- 财务统计/资金明细；
- 核销统计/核销明细；
- `orderDetail` 管理员订单详情；
- 异常摘要。

**Step 4: Verify**

```bash
node --test tests/feature-expansion/admin-operations-ledger.test.js
node --check cloudfunctions/adminOperationsLedger/report-core.js
node --check cloudfunctions/adminOperationsLedger/index.js
```

Expected: PASS。

---

### Task 7：将现有运营页改为经营数据首页

**Files:**

- Modify: `miniprogram/pages/staff/operations/operations.js`
- Modify: `miniprogram/pages/staff/operations/operations.wxml`
- Modify: `miniprogram/pages/staff/operations/operations.wxss`
- Modify: `tests/uiux/staff-operations-summary.test.js`
- Modify: `docs/testing/staff-operations-self-check.md`

**Step 1: Write failing page tests**

- 仅管理员可见；
- 默认今天；
- 展示实收、退款、支付订单和实际入园人数；
- 财务对账与核销数据为两个主入口；
- 会员核销和长河令兑换入口保留；
- 无权限、加载、空态、错误、更新时间齐全。

**Step 2: Implement one page**

只改经营数据首页，不同时实现子页面。

**Step 3: Page self-check**

```bash
node --test tests/uiux/staff-operations-summary.test.js
node --check miniprogram/pages/staff/operations/operations.js
```

记录页面自测后进入 Task 8。

---

### Task 8：实现财务对账首页

**Files:**

- Create: `miniprogram/pages/staff/finance/finance.js`
- Create: `miniprogram/pages/staff/finance/finance.json`
- Create: `miniprogram/pages/staff/finance/finance.wxml`
- Create: `miniprogram/pages/staff/finance/finance.wxss`
- Create: `tests/uiux/staff-finance.test.js`
- Modify: `miniprogram/app.json`
- Modify: `docs/testing/staff-operations-self-check.md`

**Acceptance:**

- 今日实收、退款、净收入、支付订单和风险；
- 明确标注“小程序业务账，不等同微信商户结算账”；
- “查看全部账单”进入账单对账；
- 异常入口只在有异常时突出；
- 页面状态完整。

**Verify:**

```bash
node --test tests/uiux/staff-finance.test.js
node --check miniprogram/pages/staff/finance/finance.js
```

完成自测清单后进入 Task 9。

---

### Task 9：实现账单对账页

**Files:**

- Create: `miniprogram/pages/staff/reconciliation/reconciliation.js`
- Create: `miniprogram/pages/staff/reconciliation/reconciliation.json`
- Create: `miniprogram/pages/staff/reconciliation/reconciliation.wxml`
- Create: `miniprogram/pages/staff/reconciliation/reconciliation.wxss`
- Create: `tests/uiux/staff-reconciliation.test.js`
- Modify: `miniprogram/app.json`
- Modify: `docs/testing/staff-operations-self-check.md`

**Acceptance:**

- 日汇总、月汇总、自定义汇总；
- 历史周期列表按时间倒序；
- 支持日期筛选、隐藏空账单和重新加载；
- 每个周期显示净收入、数据更新时间和风险；
- 点击进入账单详情。

**Verify:**

```bash
node --test tests/uiux/staff-reconciliation.test.js
node --check miniprogram/pages/staff/reconciliation/reconciliation.js
```

---

### Task 10：实现账单详情页

**Files:**

- Create: `miniprogram/pages/staff/bill-detail/bill-detail.js`
- Create: `miniprogram/pages/staff/bill-detail/bill-detail.json`
- Create: `miniprogram/pages/staff/bill-detail/bill-detail.wxml`
- Create: `miniprogram/pages/staff/bill-detail/bill-detail.wxss`
- Create: `tests/uiux/staff-bill-detail.test.js`
- Modify: `miniprogram/app.json`
- Modify: `docs/testing/staff-operations-self-check.md`

**Acceptance:**

- “账单统计 / 账单明细”两个标签；
- 统计展示支付、退款、净收入、业务构成和异常；
- 明细支持支付/退款、订单类型、员工和关键词筛选；
- 明细分页和脱敏 CSV；
- 点击明细进入订单详情。

**Verify:**

```bash
node --test tests/uiux/staff-bill-detail.test.js
node --check miniprogram/pages/staff/bill-detail/bill-detail.js
```

---

### Task 11：实现核销数据页

**Files:**

- Create: `miniprogram/pages/staff/verification-data/verification-data.js`
- Create: `miniprogram/pages/staff/verification-data/verification-data.json`
- Create: `miniprogram/pages/staff/verification-data/verification-data.wxml`
- Create: `miniprogram/pages/staff/verification-data/verification-data.wxss`
- Create: `tests/uiux/staff-verification-data.test.js`
- Modify: `miniprogram/app.json`
- Modify: `docs/testing/staff-operations-self-check.md`

**Acceptance:**

- 默认今天，可选择日期、月度或自定义范围；
- 同时显示核销票数、实际人数、待核对票数、订单数和票面金额；
- “验证统计 / 验证明细”两个标签；
- 按票种展示票数、人数、票面金额和占比；
- 按员工、票种、订单号筛选；
- 双人票页面明确显示“1 张 / 2 人”；
- 明细可进入订单详情。

**Verify:**

```bash
node --test tests/uiux/staff-verification-data.test.js
node --check miniprogram/pages/staff/verification-data/verification-data.js
```

---

### Task 12：实现管理员订单详情页

**Files:**

- Create: `miniprogram/pages/staff/order-detail/order-detail.js`
- Create: `miniprogram/pages/staff/order-detail/order-detail.json`
- Create: `miniprogram/pages/staff/order-detail/order-detail.wxml`
- Create: `miniprogram/pages/staff/order-detail/order-detail.wxss`
- Create: `tests/uiux/staff-order-detail.test.js`
- Modify: `miniprogram/app.json`
- Modify: `docs/testing/staff-operations-self-check.md`

**Acceptance:**

- 仅管理员；
- 展示订单、商品、金额、数量、人数、支付、退款、票券、核销、开票和操作历史；
- 手机号脱敏；
- 对缺失历史字段稳定显示“未记录”；
- 不在详情页修改支付、核销或退款事实。

**Verify:**

```bash
node --test tests/uiux/staff-order-detail.test.js
node --check miniprogram/pages/staff/order-detail/order-detail.js
```

---

### Task 13：保留并接入既有运营明细

**Files:**

- Modify: `miniprogram/pages/staff/operation-details/operation-details.js`
- Modify: `miniprogram/pages/staff/operation-details/operation-details.wxml`
- Modify: `miniprogram/pages/staff/operation-details/operation-details.wxss`
- Modify: `tests/uiux/staff-operation-details.test.js`

**Acceptance:**

- 会员核销与长河令兑换仍可查询、筛选和导出；
- 资金明细和门票核销可导航到新的专属页面；
- 不删除原功能或历史链接；
- 旧入口访问时有明确跳转或兼容展示。

**Verify:**

```bash
node --test tests/uiux/staff-operation-details.test.js
node --check miniprogram/pages/staff/operation-details/operation-details.js
```

---

### Task 14：异常中心、部署和完整回归

**Files:**

- Modify: `cloudfunctions/adminOperationsLedger/index.js`
- Modify: `scripts/deploy-functions.sh`
- Modify: `scripts/db-init.md`
- Modify: `docs/testing/staff-operations-self-check.md`
- Modify: `docs/testing/invoice-request-self-check.md`
- Create or Modify: relevant error and permission tests

**Step 1: Verify deployment prerequisites**

- `invoiceService` 与 `adminOperationsLedger` 在部署清单；
- CloudBase 存储权限不公开电子发票；
- 数据库索引覆盖 `paidAt/refundedAt/usedAt/status/orderId`；
- 管理员权限与文件所有权真机验证。

**Step 2: Run focused tests**

```bash
node --test \
  tests/feature-expansion/invoice-request.test.js \
  tests/feature-expansion/invoice-staff.test.js \
  tests/feature-expansion/admin-operations-ledger.test.js \
  tests/feature-expansion/ticket-order.test.js \
  tests/feature-expansion/ticket-fulfillment.test.js \
  tests/uiux/invoice-pages.test.js \
  tests/uiux/staff-operations-summary.test.js \
  tests/uiux/staff-operation-details.test.js \
  tests/uiux/staff-finance.test.js \
  tests/uiux/staff-reconciliation.test.js \
  tests/uiux/staff-bill-detail.test.js \
  tests/uiux/staff-verification-data.test.js \
  tests/uiux/staff-order-detail.test.js
```

**Step 3: Run full regression**

```bash
node --test tests/*.test.js tests/feature-expansion/*.test.js tests/uiux/*.test.js
git diff --check
```

**Step 4: Real-device checklist**

- iOS/Android 选择 PDF、上传、预览、重新上传、确认；
- 用户查看和下载自己的 PDF；
- 他人文件访问被拒绝；
- 单人票和双人票各完成一次核销；
- 今日、历史日期、月度、自定义统计一致；
- 财务明细与订单支付/退款事实抽样核对；
- 普通员工访问经营页面和云函数均被拒绝；
- 云函数不存在、超时和网络失败显示业务化错误。

Expected: 所有测试通过，页面自测文档完整，云函数和数据库索引部署成功。
