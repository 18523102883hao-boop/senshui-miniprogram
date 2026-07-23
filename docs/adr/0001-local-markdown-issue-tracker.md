# ADR-0001: 采用本地 Markdown Issue Tracker

## 状态

已接受

## 上下文

森水长河小程序项目需要一个 issue tracking 系统来管理开发任务和规格说明。项目当前不是 git 仓库，没有远程 GitHub/GitLab 仓库。

## 决策

采用本地 Markdown 文件作为 issue tracker，存放在 `.scratch/` 目录中。

## 理由

1. **简单性**: 无需额外服务，纯文件系统操作
2. **版本控制友好**: 可以与代码一起提交到 git（如果后续初始化）
3. **离线可用**: 不依赖网络连接
4. **易于备份**: 纯文本文件，易于备份和迁移
5. **符合项目规模**: 适合中小型项目的开发流程

## 后果

### 正面
- 零配置，立即可用
- 完全控制数据格式
- 易于与 AI agents 集成

### 负面
- 缺乏协作功能（评论、指派等）
- 需要手动管理 issue 状态
- 不支持复杂的查询和过滤

## 替代方案

- **GitHub Issues**: 需要 git 仓库和 GitHub 账号，配置复杂
- **GitLab Issues**: 需要 git 仓库和 GitLab 账号，配置复杂
- **Jira/Linear**: 功能过于复杂，不适合当前项目规模

## 相关文档

- `docs/agents/issue-tracker.md` - 详细使用说明
- `.scratch/` - issue 存储目录
