# 森水长河 Vibe UI 交付包 v1.0

本交付包包含：

- 110 个业务语义图标 × 森林绿/米白两种透明 PNG；
- 6 个底部导航专用图标（3 个标签 × 选中/未选中）；
- 6 个固定状态图标；
- 图标清单、CSV、JSON 路径映射；
- `STYLE.md` 视觉交互规范；
- `CLAUDE_CODE_VIBE_PROMPT.md` 开发提示词；
- `CORE_CODE_SNIPPETS.md` 核心代码；
- 可直接复制的参考组件；
- UI 目标设计图与图标总览图。

## 推荐放入仓库的位置

将 `assets/icons` 整体复制到小程序代码目录，例如：

```text
miniprogram/assets/icons/
```

然后把 `STYLE.md`、`ICON_MANIFEST.md`、`icon-map.json` 放到仓库根目录，让 Claude Code 每次开发都读取。

## 重要说明

当前环境无法直接读取你提供的 GitHub 仓库内容，因此交付包使用通用微信原生小程序路径。Claude Code 应先审计实际仓库目录，再映射文件位置，不要直接覆盖业务代码。
