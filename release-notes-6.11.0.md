# Bangumi Sync 6.11.0

## Stable release

这是运行期事务与恢复闭环的稳定收敛版本，不是功能扩展版本。升级不需要迁移现有 Markdown、frontmatter 或 Subject ID。

## Fixed

- 消除嵌套配置共享引用与设置保存 TOCTOU；candidate settings、配置 lease 和串行持久化保证磁盘与运行时一致。
- 修复 scan root 外具体路径漏检，完整记录并验证 rename original/temporary/final 与隐藏 temporary file。
- 内容指纹改为标准 SHA-256，严格按原始 UTF-8 字节比较，CRLF 与 LF 不等价。
- 新增原子持久 recovery journal；插件重载后恢复写门禁、事务事实和 Recovery Center 上下文。
- 损坏或不支持的 journal 保留诊断备份；孤立 temporary file 不再静默忽略或删除。
- 统一状态同步、批量编辑、导入、封面、关联链接、单集与共享笔记的 Subject ID 写入校验。
- 封面资源纳入事务：Markdown 失败时清理未引用的新封面，失败则保留恢复事实。
- 恢复统计区分自动恢复动作、人工验证与历史失败；多窗口同步 manager 终态。

## Recovery guarantees

- 活动事务在首次 Vault 修改前持久化，并在关键阶段写前更新。
- 插件或 Obsidian 重载后仍禁止新的危险写入。
- 用户可从 Recovery Center 重试回滚、重新扫描或在手工修复后确认。
- journal 只在明确 committed、完整 rolled-back 或人工验证成功后删除。

## Remaining non-blocking work

- 大型 Vault 的扫描性能优化。
- Recovery Center 的视觉与诊断导出体验优化。
- 更高级的批量碰撞规划与代码组织重构。
