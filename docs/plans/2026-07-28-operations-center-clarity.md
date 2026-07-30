# 经营数据中心口径与导出重构 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一管理员经营数据的指标与导航，提供可选择数据类型和字段的多工作表 Excel 导出，并修复反馈图片、补差价人数布局和发票 PDF 验证链路。

**Architecture:** 继续复用 `adminOperationsLedger` 的事实采集和纯逻辑汇总，在其上增加严格白名单的导出计划与 Excel 工作簿生成器。前端以“经营数据中心”组织收入识别、资金账本、入园核销、业务数据和数据导出，明确订单收入、实际净收入与资金流水净额的边界。

**Tech Stack:** 微信原生小程序 JavaScript/WXML/WXSS、CloudBase、Node.js `node:test`、ExcelJS

---

### Task 1: 固化指标词典与页面导航

**Files:**

- Modify: `tests/uiux/staff-operations-summary.test.js`
- Modify: `tests/uiux/staff-finance.test.js`
- Modify: `tests/uiux/staff-operation-details.test.js`
- Modify: `miniprogram/pages/staff/operations/operations.js`
- Modify: `miniprogram/pages/staff/operations/operations.wxml`
- Modify: `miniprogram/pages/staff/operations/operations.wxss`
- Modify: `miniprogram/pages/staff/finance/finance.wxml`
- Modify: `miniprogram/pages/staff/operation-details/operation-details.js`
- Modify: `miniprogram/pages/staff/operation-details/operation-details.wxml`

**Steps:**

1. 添加失败测试，明确订单收入为已支付未核销票款，实际净收入与已核销票面金额是同一指标。
2. 运行 `node --test tests/uiux/staff-operations-summary.test.js tests/uiux/staff-finance.test.js tests/uiux/staff-operation-details.test.js`，确认失败。
3. 将首页改为经营数据中心，先展示订单收入与实际净收入，再增加资金、核销、业务数据、导出四个清晰入口。
4. 核销收入统一命名为“实际净收入”，把核销去重订单改成“关联订单”；支付减退款统一命名为“资金流水净额”。
5. 将通用业务明细缩减为三类业务数据，删除兼容提示和重复专属入口。
6. 重跑测试与 `node --check`，确认通过。

### Task 2: 实现服务端导出计划与 Excel 工作簿

**Files:**

- Create: `cloudfunctions/adminOperationsLedger/export-core.js`
- Create: `cloudfunctions/adminOperationsLedger/export-workbook.js`
- Modify: `cloudfunctions/adminOperationsLedger/index.js`
- Modify: `cloudfunctions/adminOperationsLedger/package.json`
- Modify: `tests/feature-expansion/admin-operations-ledger.test.js`

**Steps:**

1. 添加失败测试：数据集白名单、字段白名单、默认字段、脱敏、工作表名称和截断拒绝。
2. 运行 `node --test tests/feature-expansion/admin-operations-ledger.test.js`，确认失败。
3. 实现纯逻辑导出计划：将多选数据集转换为表头与行，金额使用元文本，手机号仅尾号。
4. 使用 ExcelJS 生成包含“导出说明”和所选数据表的工作簿。
5. 在云函数增加 `action=export`，复用管理员鉴权与日期上限，生成并上传 `.xlsx`，返回 `fileId` 和 `fileName`。
6. 达到数据截断上限时返回 409，不生成文件。
7. 运行测试和 `node --check`。

### Task 3: 实现管理员数据导出页

**Files:**

- Create: `miniprogram/pages/staff/data-export/data-export.js`
- Create: `miniprogram/pages/staff/data-export/data-export.json`
- Create: `miniprogram/pages/staff/data-export/data-export.wxml`
- Create: `miniprogram/pages/staff/data-export/data-export.wxss`
- Create: `tests/uiux/staff-data-export.test.js`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/staff/operations/operations.js`

**Steps:**

1. 添加失败页面测试：日期模式、数据类型多选、字段展开、至少选择一项、下载和打开。
2. 运行测试确认失败。
3. 实现默认勾选收入与资金、核销和业务三类常用表；支持展开字段并保留必选列。
4. 调用 `action=export`，通过 `wx.cloud.downloadFile` 下载 `fileId`，再用 `wx.openDocument({fileType:'xlsx',showMenu:true})` 打开。
5. 对生成、下载、打开分别提供错误恢复，不丢失勾选状态。
6. 运行页面测试和静态检查。

### Task 4: 修复反馈图片选择

**Files:**

- Modify: `tests/uiux/feedback.test.js`
- Modify: `miniprogram/pages/feedback/create/create.js`

**Steps:**

1. 添加失败测试：四种反馈共用选择、`chooseMedia` 成功、旧客户端回退、隐私错误提示、取消静默。
2. 运行 `node --test tests/uiux/feedback.test.js`，确认失败。
3. 实现统一选择适配器与可执行错误提示。
4. 重跑测试和 `node --check`。

### Task 5: 修复人数步进器窄屏布局

**Files:**

- Modify: `tests/feature-expansion/staff-upgrade-charge.test.js`
- Modify: `miniprogram/pages/staff/charge/charge.wxml`
- Modify: `miniprogram/pages/staff/charge/charge.wxss`

**Steps:**

1. 添加失败结构测试：头部与控件分为两行、控件完整宽度、按钮不依赖 CSS Grid。
2. 运行测试确认失败。
3. 重排人数卡并增加 `min-width: 0`、`box-sizing`、固定触控尺寸和窄屏覆盖。
4. 重跑测试并完成 320px 等效视口检查。

### Task 6: 复核发票 PDF 链路

**Files:**

- Modify: `tests/feature-expansion/invoice-staff.test.js`
- Modify: `docs/testing/staff-operations-self-check.md`

**Steps:**

1. 补充用户取消与更新隐私声明后的成功路径断言。
2. 运行 PDF 聚焦测试。
3. 在开发者工具验证选择真实 PDF、上传、预览与替换。
4. 记录隐私声明若尚未同步时的实际错误。

### Task 7: 回归与部署清单

**Files:**

- Modify: `docs/testing/staff-operations-self-check.md`

**Steps:**

1. 运行全部聚焦测试与 JS 静态检查。
2. 运行 `node --test tests/*.test.js tests/feature-expansion/*.test.js tests/uiux/*.test.js`。
3. 运行 `git diff --check`。
4. 检查 CloudBase 云函数依赖安装与 `adminOperationsLedger` 部署清单。
5. 输出管理员数据导出、反馈图片、人数控件和 PDF 真机自测清单。
