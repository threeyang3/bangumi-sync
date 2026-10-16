# Bangumi Sync 6.12.1

## Fixed

- 同一插件实例的 Vault 操作现在从远端准备、主事务到关联链接收尾保持互斥，避免重复触发同步、迁移或批量操作时发生交叉写入。
- 插件重载或卸载会取消正在等待的工作并关闭旧 manager，旧实例不能在新实例加载后继续修改 Vault。
- 显式路径迁移现在与普通同步一样，在首次 rename 前持久化 recovery journal；rename、路径状态保存或 rollback 失败时会保留恢复门禁。
- 非法或旧版持久化并发数会规范化到 `1–5`，底层并发执行也不会再因 `0` worker 误报成功。
- Recovery journal 使用实际插件版本，不再写入历史硬编码版本号。

## Maintenance

- 更新构建与测试工具链，完整依赖审计和生产依赖审计均为 0 vulnerabilities。
- Vitest 配置改为显式 ESM 配置，避免新版 Vite 的配置加载兼容警告。
- 补充事务重入、提交后处理、卸载取消、路径迁移日志与 rollback failure 回归测试。

## Compatibility

- 无需迁移现有 Markdown、frontmatter、路径状态或 recovery journal。
- 最低 Obsidian 版本保持 1.8.7。
- 本版本是 6.12.0 的单一补丁更新，不包含新的用户配置项或破坏性行为变更。
