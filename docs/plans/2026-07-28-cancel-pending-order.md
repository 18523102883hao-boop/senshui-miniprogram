# Cancel Pending Order Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow a customer to cancel their own pending order from “我的订单” without deleting the order or affecting paid/refunded orders.

**Architecture:** Add a dedicated `cancelPendingOrder` CloudBase function. It resolves identity only from `cloud.getWXContext().OPENID`, reloads the order inside a transaction, and changes only an owned `pending` member-card, ticket, or self-upgrade order to `cancelled`, retaining cancellation audit fields. The order page exposes a secondary confirmation action and reloads the active tab after success or a concurrent status change.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JavaScript, CloudBase document database and transactions, Node.js built-in test runner.

---

### Task 1: Define cancellation domain rules

**Files:**
- Create: `cloudfunctions/cancelPendingOrder/cancel-core.js`
- Create: `tests/feature-expansion/cancel-order.test.js`

**Step 1: Write failing tests**

- Pending `member_card`, `ticket_order`, and `ticket_upgrade` orders are cancellable.
- Paid, refunded, expired, or already cancelled orders are rejected with `409`.
- Unknown order types are rejected.
- Cancellation patch contains `status: cancelled`, `cancelReason: user_cancelled`, `cancelledAt`, and `updatedAt`.

**Step 2: Verify RED**

Run: `node --test tests/feature-expansion/cancel-order.test.js`

Expected: FAIL because `cancel-core.js` does not exist.

**Step 3: Implement minimal pure rules**

Export `resolve(order)` and `buildPatch(now)` without database or client dependencies.

**Step 4: Verify GREEN**

Run the same command and expect all domain tests to pass.

### Task 2: Implement secure, race-safe cloud cancellation

**Files:**
- Create: `cloudfunctions/cancelPendingOrder/index.js`
- Create: `cloudfunctions/cancelPendingOrder/package.json`
- Modify: `tests/feature-expansion/cancel-order.test.js`

**Step 1: Write failing source-contract tests**

Require OPENID authentication, ownership filtering, transaction re-read, no document deletion, and a status-only transition through `cancel-core`.

**Step 2: Verify RED**

Run: `node --test tests/feature-expansion/cancel-order.test.js`

Expected: FAIL because the cloud function is missing.

**Step 3: Implement minimal cloud function**

Validate `outTradeNo`, query only the current user’s order, re-read it in a transaction, apply the pure decision, and return `409` when payment or another state transition won the race.

**Step 4: Verify GREEN**

Run the same command and expect all cloud contract tests to pass.

### Task 3: Add the secondary order-page action

**Files:**
- Modify: `cloudfunctions/getMyOrders/order-core.js`
- Modify: `miniprogram/pages/order/order.js`
- Modify: `miniprogram/pages/order/order.wxml`
- Modify: `miniprogram/pages/order/order.wxss`
- Modify: `tests/uiux/order-center.test.js`

**Step 1: Write failing page tests**

- A pending supported order exposes both “取消订单” and “继续支付”.
- Dismissing the modal performs no mutation.
- Confirming calls `cancelPendingOrder` exactly once and reloads the active tab.
- A `409` concurrent change reloads the list; other failures keep the current list and show a retryable message.

**Step 2: Verify RED**

Run: `node --test tests/uiux/order-center.test.js tests/feature-expansion/cancel-order.test.js`

Expected: FAIL because `canCancel` and `onCancelOrder` do not exist.

**Step 3: Implement minimal UI**

Use a secondary ghost action, native confirmation modal, a per-order busy state, haptic feedback, and the existing request/error conventions.

**Step 4: Verify GREEN**

Run the same command and expect all order cancellation tests to pass.

### Task 4: Register, deploy, and verify

**Files:**
- Modify: `cloudbaserc.json`
- Modify: `scripts/deploy-functions.sh`
- Modify: `docs/testing/staff-operations-self-check.md`
- Modify: `tests/feature-expansion/cancel-order.test.js`

**Step 1: Write failing deployment tests**

Assert `cancelPendingOrder` is present in both CloudBase configuration and the default deployment batch.

**Step 2: Verify RED, then add configuration**

Run the focused test, update both deployment manifests, and rerun until green.

**Step 3: Run verification**

Run:

```bash
node --test tests/**/*.test.js tests/*.test.js
git diff --check
node --check cloudfunctions/cancelPendingOrder/index.js
bash -n scripts/deploy-functions.sh
jq empty cloudbaserc.json
```

Expected: all tests pass and all structural checks exit `0`.

**Step 4: Deploy and verify online**

Deploy `cancelPendingOrder` to `cloud1-d4gzkwy3w150d2fd2`, list online functions, and confirm status `Deployment completed`.

**Step 5: Record manual checks**

Append pending-tab disappearance, all-tab retained cancellation record, modal cancel path, payment/cancellation race, and real-device checks to the self-test document.

> This plan is executed in the existing `codex/admin-operations-ledger` worktree because it contains the approved, uncommitted phase changes that this feature must integrate with. No automatic commit is made, preventing unrelated user changes from being bundled.
