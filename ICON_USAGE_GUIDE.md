# 森水长河图标页面应用地图

## 1. 一级导航

建议最终游客端采用四个一级 Tab：

| Tab | 默认图标 | 选中图标 | 深色导航默认 | 深色导航选中 |
|---|---|---|---|---|
| 向导 | `tab-guide-default.png` | `tab-guide-active.png` | `tab-guide-dark-default.png` | `tab-guide-dark-active.png` |
| 长河令 | `tab-token-default.png` | `tab-token-active.png` | `tab-token-dark-default.png` | `tab-token-dark-active.png` |
| 行程 | `tab-trip-default.png` | `tab-trip-active.png` | `tab-trip-dark-default.png` | `tab-trip-dark-active.png` |
| 我的 | `tab-mine-default.png` | `tab-mine-active.png` | `tab-mine-dark-default.png` | `tab-mine-dark-active.png` |

长河令页使用深色导航资源；其他页面使用浅色导航资源。

## 2. 首页／向导

首屏最多四个快捷入口：

- 园区地图：`home-map.png`
- 溪降预约：`home-reservation.png`
- 商品与服务：`home-store.png`
- 长河令：`activity-token.png`

环境状态：

- 天气：`home-weather.png`
- 水位：`home-water-level.png`
- 水质：`home-water-quality.png`
- 营业状态：`home-open-status.png`

当前用户任务：

- 购票：`home-ticket.png`
- 补差升级：`home-upgrade.png`
- 当前行程：`trip-status.png`
- 当前位置：`home-current-location.png`

## 3. 园区地图

地图 POI 使用 `map-*`；浮动控制仅使用：

- 搜索：`search.png`
- 定位/方向：`map-compass.png`
- 路线：`map-route.png`
- 图层：`map-layers.png`

POI 详情进入底部半屏卡片后再显示导航、分享、收藏与详情操作。

## 4. 长河令

深色页面使用 `assets/icons/ivory/`：

- 资产：`activity-token.png`
- 悬赏：`activity-task.png`
- 奖励：`activity-reward.png`
- 拍卖：`activity-auction.png`
- 排行：`activity-ranking.png`
- 勋章：`activity-medal.png`
- 完成：`activity-completed.png`
- 想体验：`activity-wishlist.png`

任务列表整行可点击，不在每行重复放“去完成”。

## 5. 行程中心

按同一行程聚合票务、预约、接驳、营位、配送和售后：

- 门票：`trip-ticket.png`
- 预约：`trip-reservation.png`
- 接驳：`trip-shuttle.png`
- 营位：`trip-campsite.png`
- 配送：`trip-delivery.png`
- 租赁：`trip-rental.png`
- 退款：`trip-refund.png`
- 历史：`trip-history.png`
- 票码：`trip-qrcode.png`
- 集合点：`trip-location.png`
- 联系：`trip-contact.png`
- 同行分享：`trip-share.png`

## 6. 商品与服务

- 购物车：`shop-cart.png`
- 特调：`shop-drink.png`
- 啤酒：`shop-beer.png`
- 租赁：`shop-rental.png`
- 营位配送：`shop-campsite-delivery.png`
- 支付：`shop-payment.png`
- 退款：`shop-refund.png`
- 归还和押金状态优先使用文字状态标签，不要仅靠图标表达。

## 7. 设置／体验主题

- 森野浅色：`setting-theme-light.png`
- 长河夜色：`setting-theme-dark.png`
- 振动反馈：`setting-haptic.png`
- 减少动态：`setting-motion.png`
- 字体大小：`setting-font-size.png`
- 隐私与授权：`setting-privacy.png`
- 用户服务协议：`setting-agreement.png`

## 8. 尺寸建议

| 使用位置 | 显示尺寸 |
|---|---:|
| 列表辅助图标 | 32–40rpx |
| 常规功能入口 | 40–48rpx |
| 快捷服务 | 48–56rpx |
| 地图 POI | 40–52rpx |
| 底部导航 | 48–56rpx |
| 空状态主图标 | 80–112rpx |

PNG 原始文件为 256×256，用 WXML 的 `width/height` 控制显示尺寸，不要修改原文件。
