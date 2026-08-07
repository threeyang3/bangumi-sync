# Bangumi Sync 6.11.2

## Fixed

- Recovery journal 的配置事实递归脱敏；legacy journal 的 blocking issue、result error/warning、attempt error 和 diagnostic message 中的已知 Token 也会在迁移时清除。
- current journal 损坏或不支持时独立校验并回退有效 previous；无效 current/previous 会分别保留备份，temp 单独诊断。
- journal cleanup 现在是终态事务的一部分。terminal marker 写入失败只允许 Retry rollback；marker 已写入后的 cleanup 失败只允许 Retry cleanup，重启后不会改变已明确的 Commit 或 rollback 方向。
- binary create/modify 写入后 reject 或写后校验失败会传播为 uncertain mutation，由上层 active journal 自动恢复；网络失败仍单独计为普通下载失败。
- uncertain binary mutation 会停止后续条目并整批回滚，禁止部分批次 Commit。
- 已知 6.11.1 configuration journal 使用独立 migration staging 去除明文 Token，不再覆盖唯一 legacy temp source；迁移失败保留原文件或完整安全 staging，不生成 secret backup。
- `accessTokenChanged=true` 只接受 hash 匹配的 previous Token；无法确认时继续保持写门禁。
- 关联链接改为主事务提交并清理 journal 后的 post-commit best-effort 操作；失败只产生 warning。
- temp-only legacy journal 迁移重试成功后会提升为 current，并进入可继续操作的 configuration recovery。
- 包含 configuration recovery facts 的非 terminal journal 在插件重启后仍恢复为 `configuration-rollback-failed`，不会降级为普通 journal recovery。
- legacy source 丢失但 sanitized migration staging 仍有效时，可在同一运行期直接 Retry migration，无需重启插件。
- terminal marker 写入失败进入 `journal-finalization-failed`；terminal marker 已写入后的 cleanup 失败进入 `journal-cleanup-failed`。
- 批量封面只有完成 binary、Markdown 和 journal finalization 才计为 downloaded/skipped；`{ downloaded: 0, skipped: 0, failed: 1 }` 显示失败统计，存在 recovery 时明确提示打开 Recovery Center，不再显示“没有可下载项目”。
- legacy current/previous/temp configuration journal 在任何 backup 前先安全脱敏；migration failure 保留原 source，Recovery Center 只允许 Retry migration。
- post-commit relations 只有在 path states、terminal marker、transaction commit、incremental finish 和 journal cleanup 全部成功后才执行；回滚批次不返回 relations。
- 空字符串 previous Token 也会计算有效 SHA-256；rolled-back、rollback-failed 和 finalization failure 不再把同步 progress 报为 completed。

## Compatibility

- 兼容现有 schema-1 journal、Markdown、frontmatter、Subject ID 和设置格式；仅对已知 6.11.1 configuration journal 形状执行安全迁移，不宣称任意 schema-1 格式兼容。
- 无需迁移或批量重命名 Vault 文件。
- 最低 Obsidian 版本保持 1.8.7。

## Scope

- 本版本只处理 recovery journal、配置恢复和 binary mutation 的确定性安全缺陷。
- 未修改 Issue #1，未发布 GitHub Release。
