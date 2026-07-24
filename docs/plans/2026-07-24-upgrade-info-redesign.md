# 游客端补差升级页改造 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将游客端补差升级页改造成“选择当前票种 → 选择升级项 → 底部确认支付 → 页面结果态”的单页流程。

**Architecture:** 保留现有页面和云函数边界，在 `upgrade-info.js` 内增加轻量页面状态，WXML 只渲染当前方向的项目，WXSS 使用页面级样式实现自然极简视觉。使用 Node 内置测试运行器加载 Page 配置并验证交互和业务参数，不引入运行时依赖。

**Tech Stack:** 微信小程序原生 WXML/WXSS/JavaScript、CloudBase 调用封装、Node.js `node:test`

---

### Task 1: 建立页面行为契约

**Files:**

- Create: `tests/upgrade-info-page.test.js`
- Inspect: `miniprogram/pages/upgrade-info/upgrade-info.js`

**Step 1: Write the failing test**

新增测试，覆盖：

- 默认只显示“已购营地票”的四个升级项。
- 切换到溪降票后只显示三个升级项并清除旧选择。
- 点击项目打开正确的确认面板。
- 接待员工输入区可展开。
- 支付提交继续使用原 `itemId` 和 `staffRef`。
- 支付成功状态使用云端返回数据。

**Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/upgrade-info-page.test.js
```

Expected: FAIL，因为 `activeGroupIndex`、`visibleItems`、方向切换和结果状态尚未实现。

### Task 2: 实现最小页面状态

**Files:**

- Modify: `miniprogram/pages/upgrade-info/upgrade-info.js`
- Test: `tests/upgrade-info-page.test.js`

**Step 1: Write minimal implementation**

- 初始化默认方向和可见项目。
- 新增 `onDirectionTap` 与 `toggleStaff`。
- `onItemTap` 从 `visibleItems` 中选择项目。
- 支付成功后写入 `success`，金额以云端返回的分值格式化。
- 保留原支付防重入、取消静默和错误提示。

**Step 2: Run tests**

Run:

```bash
node --test tests/upgrade-info-page.test.js
```

Expected: PASS。

### Task 3: 重构页面信息架构

**Files:**

- Modify: `miniprogram/pages/upgrade-info/upgrade-info.wxml`
- Test: `tests/upgrade-info-page.test.js`

**Step 1: Add failing markup contract tests**

验证：

- 存在两个方向选择项。
- 项目列表绑定 `visibleItems`。
- 不出现“立即补差”。
- 存在折叠的员工归属区域和支付成功结果态。

**Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/upgrade-info-page.test.js
```

Expected: FAIL，因为旧 WXML 仍渲染两个完整分组。

**Step 3: Implement WXML**

- 新增任务型页头和方向选择。
- 只渲染当前方向项目。
- 将升级权益压缩成单个说明区域。
- 重写确认面板和成功状态。

**Step 4: Run tests**

Run:

```bash
node --test tests/upgrade-info-page.test.js
```

Expected: PASS。

### Task 4: 完成页面视觉

**Files:**

- Modify: `miniprogram/pages/upgrade-info/upgrade-info.wxss`
- Test: `tests/upgrade-info-page.test.js`

**Step 1: Add failing style contract tests**

验证：

- 方向选择和项目行最小高度不小于 88rpx。
- 底部面板包含安全区和模糊回退。
- 页面未添加循环动画。
- 支付按钮仍使用现有全局强操作样式。

**Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/upgrade-info-page.test.js
```

Expected: FAIL，因为新结构尚无对应样式。

**Step 3: Implement WXSS**

按已批准设计完成暖白、森林绿、细边框、单重点卡片和底部面板样式。

**Step 4: Run tests**

Run:

```bash
node --test tests/upgrade-info-page.test.js
```

Expected: PASS。

### Task 5: 完整验证与页面级自测

**Files:**

- Verify: `miniprogram/pages/upgrade-info/upgrade-info.js`
- Verify: `miniprogram/pages/upgrade-info/upgrade-info.wxml`
- Verify: `miniprogram/pages/upgrade-info/upgrade-info.wxss`
- Verify: `tests/upgrade-info-page.test.js`

**Step 1: Run automated tests**

```bash
node --test tests/upgrade-info-page.test.js
```

Expected: all tests pass。

**Step 2: Run syntax and configuration checks**

```bash
node --check miniprogram/pages/upgrade-info/upgrade-info.js
node -e "JSON.parse(require('fs').readFileSync('miniprogram/pages/upgrade-info/upgrade-info.json','utf8'))"
```

Expected: exit 0。

**Step 3: Verify scope**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: 仅本页、页面测试和计划文档有变化，无空白错误。

**Step 4: Report self-test checklist**

输出业务映射、交互状态、支付异常、触控尺寸、视觉对比度、设备安全区和改动范围的逐项结果，并在用户确认前停止，不继续下一个页面。
