# Bangumi Sync 文档索引

本文档定义阅读路径和文档职责。一个事实只在一份 canonical 文档中完整维护，其他文档只做摘要并链接过去。

## 普通用户

1. [项目首页与快速开始](../README.md)：安装、首次配置、常用功能和常见问题。
2. [模板指南](user/TEMPLATE_GUIDE.md)：模板来源、变量、语法、默认值、自定义属性和字段类型。
3. [迁移指南](user/MIGRATION_GUIDE.md)：升级、修改模板、路径迁移和 legacy recovery 处理。
4. [恢复指南](user/RECOVERY_GUIDE.md)：看到 Recovery Center 时应该做什么。

## 高级用户

- [身份与路径模型](maintainer/PATH_AND_ID_MODEL.md)：Subject ID、用户改名保护、路径规范化和碰撞策略。
- [业务逻辑参考](maintainer/LOGIC_REFERENCE.md)：模板选择、自定义属性、导入导出和同步判断规则。

## 维护者

推荐阅读顺序：

1. [架构](maintainer/ARCHITECTURE.md)：分层、模块职责、生命周期和主数据流。
2. [身份与路径模型](maintainer/PATH_AND_ID_MODEL.md)：身份与路径不变量。
3. [恢复模型](maintainer/RECOVERY_MODEL.md)：journal、事务状态、重启恢复和 secret safety。
4. [状态同步不变量](maintainer/STATUS_SYNC_INVARIANTS.md)：状态同步必须长期保持的业务约束。
5. [业务逻辑参考](maintainer/LOGIC_REFERENCE.md)：当前判断规则。
6. [开发指南](maintainer/DEVELOPMENT.md)：环境、测试、PR 和稳定版发布流程。
7. [代码规范](maintainer/CODE_STANDARDS.md)：TypeScript、Obsidian API、i18n、日志和安全规则。
8. [回归清单](maintainer/REGRESSION_CHECKLIST.md)：可复用的自动化、Sandbox 和发布验证模板。

## 历史资料

- [版本索引](VERSION_HISTORY.md)：版本重点和 GitHub Release 链接。
- [`history/releases/`](history/releases/)：特定版本的测试、CI、Sandbox 和发布证据。
- [`history/migrations/`](history/migrations/)：旧版本升级与迁移记录。
- [`history/pitfalls/`](history/pitfalls/)：历史 bug、根因和排查经验。
- [`history/design-plans/`](history/design-plans/)：已实施或被替代的设计计划。

> `docs/history/` 记录特定版本或开发阶段的事实，不是当前实现契约。当前行为请以 README、`docs/user/` 和 `docs/maintainer/` 中的文档为准。

## Canonical ownership

| 主题 | Canonical document |
| --- | --- |
| 产品介绍、安装、快速开始 | [`README.md`](../README.md) |
| 模板系统 | [`user/TEMPLATE_GUIDE.md`](user/TEMPLATE_GUIDE.md) |
| 当前升级行为 | [`user/MIGRATION_GUIDE.md`](user/MIGRATION_GUIDE.md) |
| 用户恢复操作 | [`user/RECOVERY_GUIDE.md`](user/RECOVERY_GUIDE.md) |
| 系统模块与数据流 | [`maintainer/ARCHITECTURE.md`](maintainer/ARCHITECTURE.md) |
| 身份与路径 | [`maintainer/PATH_AND_ID_MODEL.md`](maintainer/PATH_AND_ID_MODEL.md) |
| 当前业务判断 | [`maintainer/LOGIC_REFERENCE.md`](maintainer/LOGIC_REFERENCE.md) |
| Recovery 内部模型 | [`maintainer/RECOVERY_MODEL.md`](maintainer/RECOVERY_MODEL.md) |
| 状态同步不变量 | [`maintainer/STATUS_SYNC_INVARIANTS.md`](maintainer/STATUS_SYNC_INVARIANTS.md) |
| 编码规则 | [`maintainer/CODE_STANDARDS.md`](maintainer/CODE_STANDARDS.md) |
| 开发、测试、PR、Release | [`maintainer/DEVELOPMENT.md`](maintainer/DEVELOPMENT.md) |
| 可复用验证模板 | [`maintainer/REGRESSION_CHECKLIST.md`](maintainer/REGRESSION_CHECKLIST.md) |
| 已发布版本最终事实 | [GitHub Releases](https://github.com/threeyang3/bangumi-sync/releases) |
| Release notes 源文件 | 根目录 `release-notes-{version}.md` |
| 历史证据 | [`history/`](history/) |

## 维护规则

- 用户可见行为变化：更新 README 或对应 user guide。
- 模板能力变化：首先更新 Template Guide。
- 模块边界变化：更新 Architecture。
- 判断规则变化：更新 Logic Reference。
- 身份或路径变化：更新 Path and ID Model。
- Recovery 内部行为变化：首先更新 Recovery Model；用户动作变化时同时更新 Recovery Guide。
- 开发或发布流程变化：更新 Development。
- 特定版本的验证和排错过程：写入 history，不追加到 evergreen 文档。
