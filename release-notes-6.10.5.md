## Fixed

- 修复保存设置会替换 `SyncManager` 并丢失 pending transaction 与 recovery-required 写门禁。
- 修复旧同步窗口在设置保存后可能调用错误管理器，以及多个恢复窗口终态不同步。
- 修复恢复扫描使用可变扫描目录，改为固定使用批次开始时的 scan root。
- 修复人工恢复只检查路径和 ID、不验证被覆盖文件原始内容的问题。
- 修复批次新建文件修改 Subject ID 后可能绕过残留路径检查的问题。
- 修复人工恢复成功仍把历史 rollback failure 显示为当前失败的问题。

## Changed

- `SyncManager` 在插件运行期间保持稳定实例，设置通过原位 `updateConfig()` 更新。
- pending / recovery 期间冻结会改变事务语义的路径、模板、命名与路径状态配置；Access Token 等安全配置仍可更新。
- 恢复上下文保存固定 scan root、严格内容指纹和具体 created path；历史尝试与当前终态统计分离。

## Compatibility

- 不需要迁移现有 Markdown，兼容 6.10.0 至 6.10.4，不改变 Subject ID 与用户自定义路径保护规则。
- 恢复上下文仍为当前运行期内存状态；插件重启自动恢复与磁盘事务日志继续留到 6.11.0，并由 Issue #5 跟踪。
