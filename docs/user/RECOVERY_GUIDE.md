# Recovery Guide

Recovery Center 表示上一次文件或设置事务没有达到可验证终态。为防止新写入覆盖恢复证据，Bangumi Sync 会暂时阻止同步、状态写回、批量编辑、导入导出和其他 Vault 修改。

## 第一件事应该做什么

1. 停止重复点击同步或批量操作。
2. 阅读 Recovery Center 顶部的 reason、涉及路径和最新诊断。
3. 对 corrupt journal、orphan temporary 或无法判断的文件状态，先备份 Vault。
4. 只使用当前窗口显示的动作；窗口隐藏的动作不适用于该状态。

## 不要做什么

- 不要直接删除 `.bangumi-sync-recovery.json`、previous/temp/staging 或 `.bangumi-sync-*.tmp.md`。
- 不要修改残留文件的 `id` 来绕过检查。
- 不要同时从另一个窗口执行同步、迁移或批量编辑。
- 不要把 recovery journal 公开上传；旧 journal 可能包含敏感历史数据。
- 不要把关闭 Recovery Center 当作恢复完成。关闭窗口不会清除写门禁。

## Recovery Center 按钮

### Retry rollback

重新执行自动回滚：恢复路径与旧内容、删除本批次创建的文件、恢复 binary 和路径状态，再扫描验证。适用于 rollback、rescan 或 state restore 未完成的情况。

### Retry cleanup

事务已经明确 Commit 或 rollback，只剩 journal 文件未删除时使用。它只继续清理，不会改变已经确定的事务方向。

### Retry migration

重新迁移旧 recovery journal。只处理 legacy migration，不执行普通回滚或人工确认。

### Rescan

重新读取 Vault 并刷新诊断，不会自动删除文件或解除风险。适合手工修复后验证，也用于 configuration recovery 重新检查当前状态。

### Manual Confirm

仅在你已经理解并修复文件状态后使用。插件会验证预期存在/不存在、Subject ID、路径、内容、binary 和路径状态；有阻断诊断时不会清除 gate。Corrupt journal 还要求明确接受原事务事实无法完整验证的风险。

## 动作矩阵

| Recovery reason | Rollback | Cleanup | Migration | Rescan | Manual Confirm |
| --- | ---: | ---: | ---: | ---: | ---: |
| `rollback-failed` / `rescan-failed` / `state-restore-failed` | ✓ |  |  | ✓ | ✓ |
| `journal-recovered` | 有回滚事实时 ✓ |  |  | ✓ | ✓ |
| `journal-finalization-failed` | ✓ |  |  | ✓ |  |
| `journal-cleanup-failed` |  | ✓ |  | ✓ |  |
| `legacy-journal-migration-failed` |  |  | ✓ |  |  |
| `configuration-rollback-failed` |  |  |  | ✓ | ✓ |
| `orphan-temporary` |  |  |  | ✓ | ✓ |
| `journal-corrupt` |  |  |  | ✓ | 接受风险后 ✓ |

UI 和服务层使用同一策略，不能通过隐藏命令绕过。

## 常见情况

### Rollback failed

先查看失败 operation 和 path，然后 Retry rollback。若同一步重复失败，检查文件是否被其他插件、同步工具或操作系统占用；备份后再手工处理并 Rescan。

### Cleanup failed

文件事务方向已经确定。使用 Retry cleanup，不要选择 rollback，也不要手工恢复已提交内容。

### Legacy journal migration failed

使用 Retry migration。不要 rename、覆盖或删除唯一 legacy source。即使 source 已丢失，插件也可能仍能使用完整且已脱敏的 staging 恢复。

### Orphan temporary

插件不会猜测孤立 `.bangumi-sync-*.tmp.md` 应删除还是恢复：

1. 检查 Recovery Center 列出的真实路径。
2. 与正式文件和备份对照，决定删除、恢复或保留。
3. 手工处理后 Rescan。
4. 诊断清零后 Manual Confirm。

### Corrupt journal

原始事务事实可能缺失。先备份 Vault，检查 `.corrupt-*`、orphan temp、重复 ID 和本次事务涉及的创建或改名文件。Rescan 只刷新诊断；Manual Confirm 不会假装执行了自动回滚。

### Configuration rollback failure

Manual Confirm 会重新读取磁盘设置、对齐 previous settings、正式内存设置、manager config 和依赖服务。任何一步失败都会继续保持 gate。不要手工复制 Access Token 到 journal。

### Binary recovery

封面 create/modify 写入后无法确认终态时会按事务事实删除新资源或恢复旧 binary，并验证长度和 SHA-256。若 binary rollback 失败，不要继续下载封面；先完成 Recovery Center 操作。

## 是否需要备份 Vault

以下情况强烈建议备份：

- `journal-corrupt`；
- `orphan-temporary`；
- 多次 Retry 仍失败；
- 需要手工移动、删除或恢复文件；
- 无法判断哪个文件是正确版本。

普通 Retry cleanup 通常不需要额外备份，因为事务方向已经持久化，但备份仍不会有害。

## 获取诊断信息

记录以下信息即可，不要公开 journal 内容或 Token：

- Obsidian 和插件版本；
- Recovery reason、可见按钮和 diagnostics；
- 涉及的相对路径；
- `obsidian dev:errors` 和 error-level console；
- 是否在插件重载、系统崩溃、文件同步软件运行后出现。

## Advanced details

Journal candidates、terminal markers、binary facts、configuration recovery、secret redaction、重启行为和状态不变量统一记录在[恢复模型](../maintainer/RECOVERY_MODEL.md)。
