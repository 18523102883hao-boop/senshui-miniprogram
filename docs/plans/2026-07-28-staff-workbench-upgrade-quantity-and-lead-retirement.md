# Staff Workbench, Upgrade Quantity, and Lead Retirement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a role-adaptive dark employee workbench, support quantity 1–10 for all self-upgrade purchases, and completely retire the lead-follow-up feature without deleting historical cloud data.

**Architecture:** Keep the WeChat Mini Program pages native and route employee tasks through a single role configuration in the employee entry page. Keep upgrade pricing authoritative in `createSelfUpgrade`, with the client responsible only for quantity interaction. Retire leads by deleting every executable surface and adding a static contract test that prevents stale routes or cloud functions from returning.

**Tech Stack:** WeChat native Mini Program (WXML/WXSS/CommonJS), CloudBase cloud functions and document database, Node.js built-in test runner.

---

### Task 1: Establish retirement and workbench contracts

**Files:**
- Create: `tests/uiux/staff-entry-workbench.test.js`
- Create: `tests/feature-expansion/lead-retirement.test.js`
- Modify: `tests/uiux/contact-first.test.js`
- Modify: `tests/feature-expansion/ticket-catalog.test.js`

**Step 1: Write the failing employee workbench tests**

Create a page harness that stubs `checkStaff`, `adminOperationsLedger`, and `invoiceService`, then assert:

```js
test('网络错误显示重试态而不是员工登记', async (t) => {
  const { page } = mountPage(t, {
    checkStaff: () => Promise.reject(new Error('网络异常'))
  })
  await page.check()
  assert.equal(page.data.viewState, 'error')
  assert.equal(page.data.role, null)
})

test('四种角色获得稳定且无越权的任务顺序', () => {
  assert.deepEqual(taskKeysForRole('front'), ['charge', 'ticketVerify', 'lingExchange', 'memberVerify'])
  assert.deepEqual(taskKeysForRole('creek'), ['ticketVerify', 'memberVerify'])
  assert.deepEqual(taskKeysForRole('bar'), ['memberVerify'])
  assert.deepEqual(taskKeysForRole('admin'), [
    'ticketVerify', 'charge', 'memberVerify', 'lingExchange',
    'operations', 'invoices', 'maps'
  ])
})
```

Also assert the WXML/WXSS use dark tokens, have a primary task card and 88rpx minimum touch targets, and contain no `goLeads` or `线索跟进`.

**Step 2: Write the failing lead-retirement contract**

Assert that these paths do not exist:

```js
const retired = [
  'miniprogram/pages/service/lead',
  'miniprogram/pages/service/mine',
  'miniprogram/pages/staff/leads',
  'cloudfunctions/createServiceLead',
  'cloudfunctions/getMyServiceLeads',
  'cloudfunctions/listAssignedLeads',
  'cloudfunctions/updateServiceLead'
]
for (const relative of retired) {
  assert.equal(fs.existsSync(path.join(projectRoot, relative)), false, relative)
}
```

Read `miniprogram/app.json`, `miniprogram/pages/mine/mine.js`, `miniprogram/pages/staff/entry/entry.js`, `cloudfunctions/initDb/index.js`, `miniprogram/utils/domain.js`, and `miniprogram/utils/const.js`; assert they contain no active lead route, function name, `service_leads`, `goLeads`, or lead status contract.

**Step 3: Change contact-flow expectations**

Update the ticket detail and contact-first tests to require:

```js
assert.equal(calls.navigate[0], '/pages/concierge/concierge')
assert.doesNotMatch(source, /pages\/service\/lead/)
```

**Step 4: Run tests to verify they fail**

Run:

```bash
node --test tests/uiux/staff-entry-workbench.test.js tests/feature-expansion/lead-retirement.test.js tests/uiux/contact-first.test.js tests/feature-expansion/ticket-catalog.test.js
```

Expected: FAIL because the workbench state model does not exist and lead files/routes still exist.

**Step 5: Commit only the new test contracts**

```bash
git add tests/uiux/staff-entry-workbench.test.js tests/feature-expansion/lead-retirement.test.js tests/uiux/contact-first.test.js tests/feature-expansion/ticket-catalog.test.js
git commit -m "test: define staff workbench and lead retirement"
```

### Task 2: Add a lightweight administrator dashboard summary

**Files:**
- Modify: `cloudfunctions/invoiceService/index.js`
- Modify: `tests/feature-expansion/invoice-staff.test.js`

**Step 1: Write the failing cloud-function test**

Add a test for an administrator-only `staffSummary` action:

```js
test('管理员工作台可读取待处理开票数量', async () => {
  const result = await service.main({ action: 'staffSummary' }, context)
  assert.equal(result.code, 0)
  assert.deepEqual(result.data, { pendingCount: 3 })
})
```

Assert a front-desk employee receives `403`.

**Step 2: Run the focused test**

Run:

```bash
node --test tests/feature-expansion/invoice-staff.test.js
```

Expected: FAIL because `staffSummary` is unsupported.

**Step 3: Implement the minimal summary**

Add:

```js
async function staffSummary(openid) {
  const staff = await requireAdmin(openid)
  if (!staff) return response(403, '无开票管理权限')
  const result = await db.collection('invoice_requests')
    .where({ status: _.in(['submitted', 'reviewing']) })
    .count()
  return response(0, 'ok', { pendingCount: Number(result.total) || 0 })
}
```

Route `action === 'staffSummary'` before returning unsupported-action errors. Do not return invoice details or sensitive title fields.

**Step 4: Run the test to verify it passes**

Run:

```bash
node --test tests/feature-expansion/invoice-staff.test.js
node --check cloudfunctions/invoiceService/index.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add cloudfunctions/invoiceService/index.js tests/feature-expansion/invoice-staff.test.js
git commit -m "feat: add staff dashboard invoice summary"
```

### Task 3: Rebuild the employee entry page as a role workbench

**Files:**
- Modify: `miniprogram/pages/staff/entry/entry.js`
- Modify: `miniprogram/pages/staff/entry/entry.wxml`
- Modify: `miniprogram/pages/staff/entry/entry.wxss`
- Modify: `miniprogram/pages/staff/entry/entry.json`
- Test: `tests/uiux/staff-entry-workbench.test.js`
- Test: `tests/uiux/staff-operations-summary.test.js`
- Test: `tests/feature-expansion/invoice-staff.test.js`

**Step 1: Add a single task registry**

Define stable data:

```js
const STAFF_TASKS = {
  ticketVerify: {
    key: 'ticketVerify',
    title: '门票核销',
    desc: '扫入园码 · 先预览再确认',
    icon: '/assets/icons/forest/home-ticket.png',
    route: '/pages/staff/ticket-verify/ticket-verify'
  },
  charge: {
    key: 'charge',
    title: '补差价收款',
    desc: '出示收款码 · 客户扫码支付',
    icon: '/assets/icons/forest/mine-wallet.png',
    route: '/pages/staff/charge/charge'
  }
  // memberVerify, lingExchange, operations, invoices, maps
}

const ROLE_LAYOUTS = {
  front: { primary: 'charge', frequent: ['ticketVerify', 'lingExchange', 'memberVerify'], manage: [] },
  creek: { primary: 'ticketVerify', frequent: ['memberVerify'], manage: [] },
  bar: { primary: 'memberVerify', frequent: [], manage: [] },
  admin: {
    primary: 'ticketVerify',
    frequent: ['charge', 'memberVerify', 'lingExchange'],
    manage: ['operations', 'invoices', 'maps']
  }
}
```

Export pure helpers under `module.exports` for tests.

**Step 2: Implement the explicit state machine**

Use:

```js
data: {
  viewState: 'loading',
  role: null,
  primaryTask: null,
  frequentTasks: [],
  manageTasks: [],
  dashboard: null,
  dashboardLoading: false,
  dashboardError: false
}
```

Increment a request sequence before every `check()`. Ignore stale resolve/reject handlers. On success with no role set `unbound`; on valid role set `bound`; on rejection set `error`.

**Step 3: Load administrator summaries independently**

After an approved admin identity is set, call in parallel:

```js
request.call('adminOperationsLedger', { action: 'summary', from, to })
request.call('invoiceService', { action: 'staffSummary' })
```

Decorate net income to yuan, copy admitted people, verified tickets, anomaly count, and pending invoice count. If either summary fails, preserve the available metrics and expose an independent retry state. Do not clear role tasks.

**Step 4: Replace per-action methods with one route handler**

Use `data-route` and:

```js
onTaskTap(e) {
  const route = e.currentTarget.dataset.route
  if (!route) return
  haptic('light')
  wx.navigateTo({ url: route })
}
```

Keep `goOperations` and `goInvoices` thin aliases only if existing cross-page tests require them; otherwise update those tests to the registry contract.

**Step 5: Build the dark WXML hierarchy**

Render in this order:

- loading skeleton,
- retryable error card,
- unbound activation card and existing form,
- compact identity header,
- primary task,
- frequent two-column grid,
- admin summary Bento grid,
- management tool list.

Use `wx:if` per state and render task arrays from the registry. Never render empty sections.

**Step 6: Apply the Long River dark theme**

Set the page background and navigation colors in `entry.json` and `entry.wxss`. Use:

```css
page { background: var(--sr-dark-bg); }
.staff-workbench { min-height: 100vh; color: var(--sr-dark-text); }
.task-card { min-height: 88rpx; background: var(--sr-dark-card); }
.task-card--primary { background: linear-gradient(135deg, var(--sr-seal), #D76A50); }
.metric__value { color: var(--sr-gold); }
```

Use only existing local icon files and provide `aria-role` / `aria-label` on interactive cards.

**Step 7: Run page and regression tests**

Run:

```bash
node --test tests/uiux/staff-entry-workbench.test.js tests/uiux/staff-operations-summary.test.js tests/feature-expansion/invoice-staff.test.js
node --check miniprogram/pages/staff/entry/entry.js
```

Expected: PASS.

**Step 8: Complete the page self-check**

Record results in `docs/testing/staff-entry-workbench-self-check.md`:

- four page states,
- every role layout,
- 88rpx touch targets,
- no horizontal scroll,
- dashboard partial failure,
- route correctness,
- no lead entry.

**Step 9: Commit**

```bash
git add miniprogram/pages/staff/entry tests/uiux/staff-entry-workbench.test.js tests/uiux/staff-operations-summary.test.js tests/feature-expansion/invoice-staff.test.js docs/testing/staff-entry-workbench-self-check.md
git commit -m "feat: redesign role based staff workbench"
```

### Task 4: Retire all lead application surfaces

**Files:**
- Delete: `miniprogram/pages/service/lead/`
- Delete: `miniprogram/pages/service/mine/`
- Delete: `miniprogram/pages/staff/leads/`
- Delete: `cloudfunctions/createServiceLead/`
- Delete: `cloudfunctions/getMyServiceLeads/`
- Delete: `cloudfunctions/listAssignedLeads/`
- Delete: `cloudfunctions/updateServiceLead/`
- Delete: `tests/feature-expansion/service-leads.test.js`
- Delete: `tests/feature-expansion/staff-leads.test.js`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/mine/mine.js`
- Modify: `miniprogram/pages/ticket/detail/detail.js`
- Modify: `miniprogram/utils/const.js`
- Modify: `miniprogram/utils/domain.js`
- Modify: `cloudfunctions/initDb/index.js`
- Modify: `tests/feature-expansion/contracts.test.js`
- Test: `tests/feature-expansion/lead-retirement.test.js`

**Step 1: Remove navigation registrations and menu entries**

Delete:

```json
"pages/service/lead/lead",
"pages/staff/leads/leads",
"pages/service/mine/mine"
```

Remove the `lead` item and route from `miniprogram/pages/mine/mine.js`.

**Step 2: Route ticket consultation directly to the concierge**

Replace the contact branch with:

```js
return wx.navigateTo({
  url: '/pages/concierge/concierge',
  fail: () => wx.showToast({ title: '请联系前台咨询', icon: 'none' })
})
```

**Step 3: Remove active domain and collection references**

Delete the service-lead status export from `miniprogram/utils/domain.js`, the `SERVICE_LEADS` collection constant, and `service_leads` from `initDb` collection creation.

Do not issue any database collection delete.

**Step 4: Delete retired pages, functions, and dedicated tests**

Use `apply_patch` delete hunks for every tracked file under the seven retired directories and the two dedicated test files. Remove now-unused copies of `lead-core.js` and `lead-flow.js`.

**Step 5: Update cross-feature contracts**

Remove only the lead-status test from `tests/feature-expansion/contracts.test.js`; keep ticket, order, feedback, reservation, and invoice contracts.

**Step 6: Run the retirement and navigation tests**

Run:

```bash
node --test tests/feature-expansion/lead-retirement.test.js tests/uiux/contact-first.test.js tests/feature-expansion/ticket-catalog.test.js tests/feature-expansion/contracts.test.js
```

Expected: PASS.

**Step 7: Commit**

```bash
git add miniprogram/app.json miniprogram/pages/mine/mine.js miniprogram/pages/ticket/detail/detail.js miniprogram/utils/const.js miniprogram/utils/domain.js cloudfunctions/initDb/index.js tests
git add -u miniprogram/pages/service miniprogram/pages/staff/leads cloudfunctions
git commit -m "refactor: retire service lead workflows"
```

### Task 5: Make quantity 1–10 available for every upgrade item

**Files:**
- Modify: `tests/upgrade-info-page.test.js`
- Modify: `miniprogram/pages/upgrade-info/upgrade-info.js`
- Modify: `miniprogram/pages/upgrade-info/upgrade-info.wxml`
- Modify: `miniprogram/pages/upgrade-info/upgrade-info.wxss`

**Step 1: Replace the old two-person-only UI tests**

Require:

```js
test('七个升级项目默认数量均为 1 且支持 1 到 10 份', (t) => {
  const { page } = mountPage(t)
  for (const groupIndex of [0, 1]) {
    page.onDirectionTap({ currentTarget: { dataset: { index: groupIndex } } })
    for (let index = 0; index < page.data.visibleItems.length; index += 1) {
      page.onItemTap({ currentTarget: { dataset: { ii: index } } })
      assert.equal(page.data.quantity, 1)
      for (let i = 1; i < 10; i += 1) page.onPlus()
      assert.equal(page.data.quantity, 10)
      page.onPlus()
      assert.equal(page.data.quantity, 10)
    }
  }
})
```

Assert the request carries the selected quantity for a non-double item and the result state includes quantity.

**Step 2: Run the focused test and verify failure**

Run:

```bash
node --test tests/upgrade-info-page.test.js
```

Expected: FAIL because only `creek_double_to_camp` is selectable and capped at 2.

**Step 3: Implement common quantity state**

Add:

```js
const MIN_QUANTITY = 1
const MAX_QUANTITY = 10
```

Every `onItemTap` sets quantity to 1. Remove `canChooseQuantity`. `onMinus` and `onPlus` use the shared bounds and always recompute `totalAmountText`.

Include `quantity` in the success state:

```js
success: {
  itemLabel: d.itemLabel || buy.name,
  quantity: Number(d.quantity) || selectedQuantity,
  amountYuan: util.fen2yuan(d.amount)
}
```

Capture `selectedQuantity` before the async request so resetting data does not lose the displayed value.

**Step 4: Update the confirmation sheet**

Always render the stepper. Rename labels from「升级人数」to「购买数量」and show:

```xml
<text class="quantity-panel__desc">单次可购买 1–10 份</text>
<text class="sheet__price-note">{{buy.add}} / 份 × {{quantity}} 份</text>
```

Add the original-ticket requirement:

```xml
<text class="sheet__notice">升级订单需与原票同时核验，不能单独作为入园凭证。</text>
```

Use boundary `aria-disabled` values at 1 and 10.

**Step 5: Run the page tests**

Run:

```bash
node --test tests/upgrade-info-page.test.js
node --check miniprogram/pages/upgrade-info/upgrade-info.js
```

Expected: PASS.

**Step 6: Complete the page self-check**

Create `docs/testing/upgrade-quantity-self-check.md` with checks for all seven items, boundaries, total display, cancel/retry preservation, employee tail input, and success quantity.

**Step 7: Commit**

```bash
git add miniprogram/pages/upgrade-info tests/upgrade-info-page.test.js docs/testing/upgrade-quantity-self-check.md
git commit -m "feat: support upgrade purchase quantities"
```

### Task 6: Enforce quantity and official pricing in the cloud

**Files:**
- Modify: `tests/feature-expansion/upgrade-order.test.js`
- Modify: `cloudfunctions/createSelfUpgrade/order-core.js`
- Modify: `cloudfunctions/createSelfUpgrade/index.js`
- Modify: `cloudfunctions/seedUpgradeItems/index.js`

**Step 1: Replace the old server quantity tests**

For every seeded item, assert quantity 1 and 10 succeed. Assert `0`, `11`, `1.5`, and `'abc'` fail. Keep the old-client missing quantity test.

```js
assert.equal(core.resolveUpgradeOrder({ item, quantity: 10 }).totalFee, item.price * 10)
assert.match(core.resolveUpgradeOrder({ item, quantity: 11 }).msg, /1.*10|数量/)
```

Assert `clientAmount` is ignored.

**Step 2: Run the focused test and verify failure**

Run:

```bash
node --test tests/feature-expansion/upgrade-order.test.js
```

Expected: FAIL because non-double items are capped at 1 and the double item at 2.

**Step 3: Implement server-side bounds**

Replace item-ID-specific limits with:

```js
const DEFAULT_MAX_QUANTITY = 10
const configuredMax = Number(item.maxQuantity)
const maxQuantity = Number.isInteger(configuredMax) && configuredMax > 0
  ? Math.min(configuredMax, DEFAULT_MAX_QUANTITY)
  : DEFAULT_MAX_QUANTITY
```

Return a readable message such as `购买数量须为 1–10 的整数`. Append `（N 份）` to every order item label.

**Step 4: Persist and return quantity**

Ensure `cloudfunctions/createSelfUpgrade/index.js` stores `quantity`, `unitPrice`, and `totalFee`, and returns `quantity` with payment data. Do not trust event amount fields.

**Step 5: Add max quantity to seed configuration**

Add `maxQuantity: 10` to all seven items and update the double-item note so it no longer says only 1 or 2 people.

**Step 6: Run cloud tests and syntax checks**

Run:

```bash
node --test tests/feature-expansion/upgrade-order.test.js tests/upgrade-info-page.test.js
node --check cloudfunctions/createSelfUpgrade/order-core.js
node --check cloudfunctions/createSelfUpgrade/index.js
node --check cloudfunctions/seedUpgradeItems/index.js
```

Expected: PASS.

**Step 7: Commit**

```bash
git add cloudfunctions/createSelfUpgrade cloudfunctions/seedUpgradeItems tests/feature-expansion/upgrade-order.test.js
git commit -m "feat: validate upgrade quantities on server"
```

### Task 7: Remove active lead documentation and deployment references

**Files:**
- Modify: `docs/数据模型.md`
- Modify: `docs/业务参数.md`
- Modify: `docs/uiux/01-current-audit.md`
- Modify: `docs/testing/staff-operations-self-check.md`
- Modify: `scripts/db-init.md`
- Modify: `scripts/tcb-api.mjs`
- Modify: `scripts/deploy-functions.sh`
- Modify: `CONTEXT.md`

**Step 1: Remove active documentation**

Delete active `service_leads` schema, indexes, permissions, employee-flow references, and current page counts. Do not rewrite the historical 2026-07-24 implementation plan.

Add a short current-context note:

```markdown
### 人工咨询
- 特色服务和咨询型商品直接联系管家，不再创建或跟进服务线索。
- 历史 `service_leads` 数据仅保留归档，不属于当前运行模型。
```

**Step 2: Update database/deployment helpers**

Remove `service_leads` from initialization collection arrays and CLI collection lists. Ensure deployment defaults include `createSelfUpgrade`, `invoiceService`, and `seedUpgradeItems`, but not any retired lead function.

**Step 3: Run repository-wide stale-reference checks**

Run:

```bash
rg -n "createServiceLead|getMyServiceLeads|listAssignedLeads|updateServiceLead|pages/service/lead|pages/service/mine|pages/staff/leads|goLeads|service_leads" miniprogram cloudfunctions scripts tests docs CONTEXT.md
```

Expected: only historical implementation plans and the new retirement design/plan mention retired names.

**Step 4: Run documentation-related tests**

Run:

```bash
node --test tests/feature-expansion/lead-retirement.test.js tests/uiux/staff-entry-workbench.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add CONTEXT.md docs scripts tests/feature-expansion/lead-retirement.test.js
git commit -m "docs: retire lead feature references"
```

### Task 8: Verify locally and reconcile CloudBase deployment

**Files:**
- Modify if needed: `scripts/deploy-functions.sh`
- Create: `docs/testing/2026-07-28-staff-upgrade-lead-release-check.md`

**Step 1: Run all focused tests**

Run:

```bash
node --test tests/uiux/staff-entry-workbench.test.js tests/feature-expansion/lead-retirement.test.js tests/upgrade-info-page.test.js tests/feature-expansion/upgrade-order.test.js tests/feature-expansion/invoice-staff.test.js tests/uiux/contact-first.test.js tests/feature-expansion/ticket-catalog.test.js
```

Expected: PASS.

**Step 2: Run relevant syntax checks**

Run:

```bash
node --check miniprogram/pages/staff/entry/entry.js
node --check miniprogram/pages/upgrade-info/upgrade-info.js
node --check miniprogram/pages/ticket/detail/detail.js
node --check cloudfunctions/invoiceService/index.js
node --check cloudfunctions/createSelfUpgrade/index.js
node --check cloudfunctions/createSelfUpgrade/order-core.js
node --check cloudfunctions/seedUpgradeItems/index.js
```

Expected: no output and exit code 0.

**Step 3: Run the complete test suite**

Run:

```bash
node --test $(rg --files tests -g '*.test.js' | sort)
```

Expected: all tests pass with zero failures.

**Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; no retired executable lead files remain.

**Step 5: List remote cloud functions before mutation**

Run:

```bash
scripts/deploy-functions.sh --list
```

Verify exact environment and exact retired names before deletion. Never delete `service_leads` or any other cloud database collection.

**Step 6: Deploy changed live functions**

Run:

```bash
scripts/deploy-functions.sh invoiceService createSelfUpgrade seedUpgradeItems
```

Expected: all three deploy successfully. Run `seedUpgradeItems` once from the developer tool only when the live `ticket_config.upgradeList` needs `maxQuantity: 10`.

**Step 7: Delete only the four retired remote functions**

Use the WeChat Developer Tool CLI delete command only after confirming its supported syntax from `cli cloud functions --help`. Exact targets:

```text
createServiceLead
getMyServiceLeads
listAssignedLeads
updateServiceLead
```

If the CLI cannot delete safely, stop and document the four manual console deletions; do not guess a destructive command.

**Step 8: Record release self-check**

In `docs/testing/2026-07-28-staff-upgrade-lead-release-check.md`, record:

- test counts,
- syntax check results,
- employee role smoke tests,
- all-seven-item quantity smoke test,
- deployed function results,
- remote retired function results,
- explicit confirmation that `service_leads` historical data was not deleted.

**Step 9: Final commit**

```bash
git add docs/testing/2026-07-28-staff-upgrade-lead-release-check.md scripts/deploy-functions.sh
git commit -m "chore: verify staff workbench release"
```
