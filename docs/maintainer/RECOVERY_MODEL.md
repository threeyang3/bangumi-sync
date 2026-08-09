# Recovery Model

本文是 recovery 内部实现的 canonical technical reference。用户操作以[恢复指南](../user/RECOVERY_GUIDE.md)为准；特定版本验证证据位于 [`history/releases/`](../history/releases/)。

## Design goals

- 每次 Vault 修改前持久化足以回滚和验证的事实。
- 插件重载后恢复同一事务方向和写门禁。
- 无法证明安全终态时保持 `recovery-required`，不以“尽力而为”清理证据。
- Journal 和诊断不持久化 Access Token、authorization、Bearer 或其他已知 secret。
- Commit、rollback、cleanup 和 migration 的方向不可被 UI 竞态改变。

## Persistent journal model

主 journal 位于 Vault 根目录 `.bangumi-sync-recovery.json`。它可以记录：

- 批次和 scan root；
- 原始 Markdown 字节长度与 SHA-256；
- Subject ID 和恢复期存在/路径期望；
- created、updated 和 rename 的 concrete paths；
- binary create/update facts；
- `subjectPathStates` 快照；
- result snapshot、attempts、diagnostics；
- 脱敏 configuration recovery facts。

内容 hash 基于原始 UTF-8 字节，CRLF 与 LF 不等价。Concrete facts 按 Vault 全局路径验证，不受固定 scan root 限制。

## Journal candidates

候选包括：

- `current`：当前 `.bangumi-sync-recovery.json`；
- `previous`：轮转前候选；
- `temp`：普通临时写入候选；
- `migration staging`：`.bangumi-sync-recovery.migration.tmp.json`；
- legacy current/previous/temp：已知旧 configuration journal。

有效 current 优先。Current 损坏、结构非法或 schema 不支持时分别备份，再独立校验 previous。普通损坏 temp 单独备份；完整、已脱敏、结构有效的 legacy temp 或 staging 可以提升为 current。

Candidate selection 前不得删除唯一可恢复候选。

## Transaction states

正常批次在第一次 Vault mutation 前持久化 journal，之后经历：

```text
active → committed-cleanup-pending → cleanup → idle
active → rollback → rolled-back-cleanup-pending → cleanup → idle
active → rollback-failed / other recovery reason → recovery-required
```

只有 committed、完整 rolled-back 或经完整人工验证的终态可以清除 journal。

## Terminal markers

- `committed-cleanup-pending`：主事务已经 Commit，只允许继续 cleanup。
- `rolled-back-cleanup-pending`：回滚已经完成，只允许继续 cleanup。
- Marker 尚未持久化时的 write/rename failure：`journal-finalization-failed`，只允许 Retry rollback。
- Marker 已持久化后的 remove/cleanup failure：`journal-cleanup-failed`，只允许 Retry cleanup。

重启读取 terminal marker 时不得重新开放 rollback 或改变方向。Terminal cleanup marker 优先于普通 configuration recovery 映射。

## Recovery reasons and actions

动作策略由 `getRecoveryActionPolicy()` 统一决定，Recovery Center 和服务 API 必须共用它。当前 reason 包括：

- `rollback-failed`、`rescan-failed`、`state-restore-failed`；
- `journal-recovered`、`journal-finalization-failed`、`journal-cleanup-failed`；
- `legacy-journal-migration-failed`；
- `configuration-rollback-failed`；
- `orphan-temporary`、`journal-corrupt`。

完整用户动作矩阵见[恢复指南](../user/RECOVERY_GUIDE.md)。新增 reason 时必须同步策略测试、Recovery Center 展示、重启映射和两份 recovery 文档。

## Rollback ordering

持久恢复顺序固定为：

1. 按 Subject ID 恢复 original/temporary/final rename；
2. 删除本批次创建的 Markdown；
3. 从候选路径解析正确身份并恢复原内容；
4. 删除本批次新建且未被引用的资源；
5. 恢复旧 binary 并复核长度和 SHA-256；
6. 恢复并持久化 `subjectPathStates`；
7. 重新扫描固定 scan root；
8. 执行完整诊断；
9. 写入 terminal marker 并 cleanup。

路径属于其他 Subject、重复 ID、hash 不符或任何步骤失败都会保留 journal 和 gate。

## Binary recovery facts

- 新建资源记录在 `createdResourcePaths`，回滚只删除本批次创建且未被 Markdown 引用的资源。
- 更新已有 binary 前记录原 base64、长度和 SHA-256。
- 超过 16 MiB 的已有 binary 拒绝事务内覆盖。
- Create/modify 已写入后 reject、写后读取验证失败或事实无法确认属于 uncertain mutation。
- Uncertain mutation 会停止后续条目并整批回滚，不提供部分 Commit。

网络请求在任何 Vault mutation 前失败仍是普通下载失败。

## Configuration recovery

Configuration facts 只保存 previous/candidate/current/disk/manager 的非敏感事实、`accessTokenChanged` 和 Token hash。空字符串 Token 也有标准 SHA-256。

包含 configuration facts 的非 terminal journal 重启后映射为 `configuration-rollback-failed`。Manual Confirm 重新读取磁盘、保存并复读 previous settings、更新正式内存、应用 manager config、刷新依赖并运行诊断。无法证明 previous Token 时继续保持 gate。

## Secret safety

Legacy current、previous、temp 在任何 rename 或 backup 前先在内存中递归脱敏。Secret scan 覆盖整个 journal，包括：

- configuration facts；
- blocking issue；
- result errors/warnings；
- attempt error；
- diagnostic message。

Migration staging 必须完整写入、重读、结构校验和 secret scan 后才能替换 source。失败时保留原 source 或一个完整安全 staging，不创建新的 secret-bearing backup。

## Restart behavior

插件启动会独立解析 current、previous、temp、legacy 和 staging，验证 schema、对象结构、数组成员、时间、Subject ID、枚举、路径、hash、原内容、binary、result、attempt 和 configuration facts。

发现有效 journal、损坏 journal、orphan temp 或 migration failure 时，manager 进入 `recovery-required`，所有写入口继续受阻；插件本身仍可加载，Recovery Center 和只读诊断保持可用。

## Atomicity guarantees

- 路径 rename、Markdown、binary 和 `subjectPathStates` 属于同一主事务。
- 内容准备完成前不移动旧文件。
- 关联链接仅在主事务 Commit 且 journal cleanup 后 best-effort 执行；失败只记录 warning。
- Retry、Manual Confirm 和 Rescan 共用互斥动作。
- 终态 progress 必须反映真实磁盘状态；rolled-back、rollback-failed 和 finalization failure 不报告 completed。

## Failure model and invariants

- 无事实时不猜测事务方向。
- Empty rollback 不能解除 orphan 或 corrupt gate。
- 修改残留文件 ID 不能绕过 concrete created-path expectation。
- Manual Confirm 使用批次前 expectation 验证 expected absent/present、path 和 identity。
- Gate 覆盖收藏/单条同步、路径迁移、封面、关联链接、状态同步、批量编辑与撤销、用户数据导入导出、集数状态、吐槽和共享笔记。
- 诊断、Rescan 和 Confirm 只读取本地数据，不请求 Bangumi API。

## Relevant code

- `src/sync/recoveryJournal.ts`：schema、candidate、persistence、migration 和 redaction。
- `src/sync/recoveryPolicy.ts`：reason 到 action 的唯一策略。
- `src/sync/syncManager.ts`：事务编排、恢复、configuration reconciliation 和 gate。
- `src/sync/syncTransaction.ts`：Markdown/path transaction facts。
- `src/sync/writeOperationGate.ts`：统一写门禁。
- `src/ui/recoveryCenterModal.ts`：用户界面，不拥有独立策略。
- `common/file/imageHandler.ts`：binary mutation 分类。
- `tests/sync/recoveryJournal.test.ts`、`configurationRecovery.test.ts`、`restartRecovery.test.ts`、`syncManagerPathTransaction.test.ts`：核心回归覆盖。
