# Bangumi Sync 6.11.2

## Fixed

- Recovery journal 的配置事实递归脱敏，Access Token 和其他 secret-bearing 字段不会落盘、进入快照或错误信息。
- current journal 损坏或不支持时独立校验并回退有效 previous；无效 current/previous 会分别保留备份，temp 单独诊断。
- journal cleanup 现在是终态事务的一部分。cleanup 失败保持写门禁，terminal marker 重启后只进行 cleanup 重试，不会回滚已提交数据。
- binary create/modify 写入后 reject 或写后校验失败会传播为 uncertain mutation，由上层 active journal 自动恢复；网络失败仍单独计为普通下载失败。
- uncertain binary mutation 会停止后续条目并整批回滚，禁止部分批次 Commit。
- 已知 6.11.1 configuration journal 格式会在原子迁移中去除明文 Token；迁移失败保留原文件，不生成 secret backup。
- `accessTokenChanged=true` 只接受 hash 匹配的 previous Token；无法确认时继续保持写门禁。
- 关联链接改为主事务提交并清理 journal 后的 post-commit best-effort 操作；失败只产生 warning。
- terminal marker 的写入、rename 或 cleanup 失败统一进入 `journal-finalization-failed` recovery。
- 批量封面只有完成 binary、Markdown 和 journal finalization 才计为 downloaded/skipped；recovery 返回 failed 并报告 error。

## Compatibility

- 兼容现有 schema-1 journal、Markdown、frontmatter、Subject ID 和设置格式；仅对已知 6.11.1 configuration journal 形状执行安全迁移，不宣称任意 schema-1 格式兼容。
- 无需迁移或批量重命名 Vault 文件。
- 最低 Obsidian 版本保持 1.8.7。

## Scope

- 本版本只处理 recovery journal、配置恢复和 binary mutation 的确定性安全缺陷。
- 未修改 Issue #1，未发布 GitHub Release。
