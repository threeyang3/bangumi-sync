# Bangumi Sync 6.11.2

## Fixed

- Recovery journal 的配置事实递归脱敏，Access Token 和其他 secret-bearing 字段不会落盘、进入快照或错误信息。
- current journal 损坏或不支持时独立校验并回退有效 previous；无效 current/previous 会分别保留备份，temp 单独诊断。
- journal cleanup 现在是终态事务的一部分。cleanup 失败保持写门禁，terminal marker 重启后只进行 cleanup 重试，不会回滚已提交数据。
- binary create/modify 写入后 reject 或写后校验失败会传播为 uncertain mutation，由上层 active journal 自动恢复；网络失败仍单独计为普通下载失败。

## Compatibility

- 兼容现有 schema-1 journal、Markdown、frontmatter、Subject ID 和设置格式。
- 无需迁移或批量重命名 Vault 文件。
- 最低 Obsidian 版本保持 1.8.7。

## Scope

- 本版本只处理 recovery journal、配置恢复和 binary mutation 的确定性安全缺陷。
- 未修改 Issue #1，未发布 GitHub Release。
