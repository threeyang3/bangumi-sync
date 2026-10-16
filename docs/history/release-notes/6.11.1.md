# Bangumi Sync 6.11.1

## Bug fixes

- 完整校验 recovery journal。可解析但字段缺失、成员类型错误或恢复快照非法的 schema-1 journal 会备份为 `.corrupt-structure-<timestamp>.json`，插件继续加载并保持写门禁。
- 按 recovery reason 限制 Retry、Rescan 和 Manual Confirm；corrupt、orphan temporary、configuration rollback failure 不再能被空回滚错误解除。
- 每个恢复成功路径在清 journal 前重新扫描并执行完整诊断。
- 重启恢复改为先恢复 original/temporary/final 路径，再恢复内容与 binary；rename + content 更新只需一次 Retry。
- 图片质量与“更新已有图片”设置现在实际应用到稳定 `SyncManager`。关闭更新时已有封面计为 skipped，且不会下载、修改或创建 journal。
- 已有封面更新前保存原始 binary、长度与 SHA-256；Markdown 后续失败或插件重载后可恢复原 binary，并在写回后复核 hash。
- manager 的 commit、rollback 和 recovery 终态统一广播；控制面板会从 committing/rolling-back 返回 idle 或 recovery-required。
- 设置页保存改为字段 patch，并基于最新正式 settings 合并；运行期筛选、同步统计和 subject path state 不再被旧设置页快照覆盖。

## Data safety

- corrupt journal 的人工解除要求明确接受无法验证原内容的风险，并在清除前完成全局本地诊断。
- orphan temporary 必须按真实路径手工处理，再 Rescan 和 Confirm。
- configuration rollback failure 必须重新读取磁盘设置、选择一致终态、持久化并重新应用 manager 后才能解除。
- 已有 binary 大于 16 MiB 时拒绝不可逆覆盖。

## Compatibility

- 无需迁移现有 Markdown、frontmatter、Subject ID 或设置。
- 最低 Obsidian 版本保持 1.8.7。
