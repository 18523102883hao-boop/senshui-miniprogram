# 森水长河 Vibe UI 核心代码参考

> 以下代码是微信原生小程序参考实现。Claude Code 应先识别仓库使用 JS 还是 TS，再适配，不要机械覆盖。

## 1. 统一触觉反馈 `utils/haptics.js`

```js
const HAPTIC = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
};

function haptic(type = HAPTIC.light) {
  try {
    wx.vibrateShort({ type });
  } catch (error) {
    try { wx.vibrateShort(); } catch (_) {}
  }
}

module.exports = { HAPTIC, haptic };
```

调用原则：在业务动作确认成功后调用，不要在每次 `touchstart` 调用。

## 2. 无按钮化按压组件

### `components/vibe-press/index.wxml`

```xml
<view
  class="vibe-press custom-class"
  hover-class="vibe-press--active"
  hover-start-time="0"
  hover-stay-time="90"
  bindtap="onTap"
  bindlongpress="onLongPress"
>
  <slot />
</view>
```

### `components/vibe-press/index.wxss`

```css
.vibe-press {
  transform: scale(1);
  transition: transform 120ms cubic-bezier(.2,.8,.2,1), opacity 120ms ease;
  transform-origin: center;
}
.vibe-press--active {
  transform: scale(.96);
  opacity: .92;
}
```

### `components/vibe-press/index.js`

```js
Component({
  externalClasses: ['custom-class'],
  methods: {
    onTap(event) { this.triggerEvent('tap', event.detail); },
    onLongPress(event) { this.triggerEvent('longpress', event.detail); },
  },
});
```

## 3. 长河令弥散光资产卡

### WXML

```xml
<view class="asset-card" hover-class="asset-card--pressed">
  <view class="asset-glow asset-glow--gold"></view>
  <view class="asset-glow asset-glow--coral"></view>

  <view class="asset-head">
    <text class="asset-label">可用余额</text>
    <text class="asset-badge">侠客资产</text>
  </view>

  <view class="asset-balance">
    <text class="asset-number">{{balance}}</text>
    <text class="asset-unit">令</text>
  </view>

  <view class="asset-metrics">
    <view class="asset-metric">
      <text class="metric-label">今日已赚</text>
      <text class="metric-value metric-value--success">+{{todayEarned}}</text>
    </view>
    <view class="asset-metric">
      <text class="metric-label">即将过期</text>
      <text class="metric-value metric-value--danger">-{{expiring}}</text>
    </view>
  </view>
</view>
```

### WXSS

```css
.asset-card {
  position: relative;
  overflow: hidden;
  padding: 48rpx;
  border-radius: 64rpx;
  background: #1C1C1E;
  color: #F7F3EA;
  transition: transform 120ms ease, opacity 120ms ease;
}
.asset-card--pressed { transform: scale(.96); opacity: .94; }
.asset-glow { position: absolute; border-radius: 50%; pointer-events: none; }
.asset-glow--gold {
  width: 520rpx; height: 520rpx; right: -180rpx; top: -220rpx;
  background: radial-gradient(circle, rgba(213,164,58,.22) 0%, rgba(213,164,58,0) 68%);
}
.asset-glow--coral {
  width: 420rpx; height: 420rpx; left: -180rpx; bottom: -220rpx;
  background: radial-gradient(circle, rgba(240,112,85,.14) 0%, rgba(240,112,85,0) 70%);
}
.asset-head,.asset-balance,.asset-metrics { position: relative; z-index: 1; }
.asset-head { display:flex; justify-content:space-between; align-items:center; }
.asset-label { color: rgba(247,243,234,.58); font-size:24rpx; }
.asset-badge { color:#D5A43A; background:rgba(255,255,255,.08); padding:10rpx 18rpx; border-radius:999rpx; font-size:22rpx; }
.asset-balance { display:flex; align-items:flex-end; margin-top:32rpx; }
.asset-number { font-size: 88rpx; line-height: .95; font-weight: 900; letter-spacing:-4rpx; font-variant-numeric: tabular-nums; }
.asset-unit { margin-left:12rpx; color:#D5A43A; font-size:32rpx; font-weight:700; }
.asset-metrics { display:flex; gap:20rpx; margin-top:48rpx; }
.asset-metric { flex:1; padding:24rpx; border-radius:28rpx; background:rgba(0,0,0,.34); }
.metric-label { display:block; color:rgba(247,243,234,.48); font-size:22rpx; }
.metric-value { display:block; margin-top:10rpx; font-size:34rpx; font-weight:800; }
.metric-value--success { color:#53D884; }
.metric-value--danger { color:#F07055; }
```

## 4. 页面进入动效

```css
.page-enter {
  animation: pageEnter 340ms cubic-bezier(.16,1,.3,1) both;
}
@keyframes pageEnter {
  0% { opacity:0; transform:translateY(16rpx) scale(.985); }
  100% { opacity:1; transform:translateY(0) scale(1); }
}
```

仅在页面首次展示或 Tab 切换时触发；滚动列表不要重复触发。

## 5. 自定义 TabBar 主题同步

页面 `onShow`：

```js
function syncTabBar(page, selected, theme) {
  const tabBar = page.getTabBar && page.getTabBar();
  if (tabBar) tabBar.setData({ selected, theme });
}

Page({
  onShow() {
    syncTabBar(this, 1, 'dark'); // 长河令页
  },
});
```

TabBar 样式：

```css
.tabbar {
  position: fixed;
  left: 24rpx; right: 24rpx; bottom: calc(18rpx + env(safe-area-inset-bottom));
  display:flex; justify-content:space-around;
  padding:18rpx 24rpx;
  border-radius:36rpx;
  transition: background 280ms ease, border-color 280ms ease;
  backdrop-filter: blur(28rpx);
}
.tabbar--light { background:rgba(246,244,240,.88); border:1rpx solid rgba(255,255,255,.72); }
.tabbar--dark { background:rgba(18,18,18,.88); border:1rpx solid rgba(255,255,255,.06); }
.tabbar-item__icon { width:52rpx; height:52rpx; transform:scale(.92); transition:transform 260ms ease; }
.tabbar-item--active .tabbar-item__icon { transform:scale(1); }
.tabbar-item__label { opacity:0; transform:translateY(6rpx); transition:all 240ms ease; }
.tabbar-item--active .tabbar-item__label { opacity:1; transform:translateY(0); }
```

对不支持模糊的设备，背景色本身必须足够不透明，不能依赖 blur 才可读。

## 6. 长按领令

```js
const { haptic, HAPTIC } = require('../../utils/haptics');

Page({
  data: { claimProgress: 0, claiming: false },
  onClaimTouchStart() {
    this.setData({ claiming: true, claimProgress: 0 });
    let progress = 0;
    this.claimTimer = setInterval(() => {
      progress += 10;
      this.setData({ claimProgress: progress });
      if (progress >= 100) {
        clearInterval(this.claimTimer);
        this.completeClaim();
      }
    }, 50);
  },
  onClaimTouchEnd() {
    clearInterval(this.claimTimer);
    if (this.data.claimProgress < 100) this.setData({ claiming: false, claimProgress: 0 });
  },
  completeClaim() {
    // 先调用后端，成功后再反馈
    haptic(HAPTIC.medium);
    this.setData({ claiming: false, claimProgress: 100 });
  },
  onUnload() { clearInterval(this.claimTimer); },
});
```

正式项目必须防重复提交，并以服务端结果为准。
