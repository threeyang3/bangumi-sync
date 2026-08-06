# 恢复指南

Bangumi Sync 6.11.2 在首次 Vault 修改前写入根目录 `.bangumi-sync-recovery.json`。journal 保存批次前内容、Subject ID、路径状态、created/rename 事实、封面资源和恢复尝试，不保存 Access Token、authorization、Bearer 值、API key 或其他 secret-bearing 字段。配置恢复只持久化脱敏的非敏感设置事实和 `accessTokenChanged`；恢复时 token 取自可确认的当前磁盘或运行期安全来源，无法确认则保持门禁。

启动时 current、previous 和 temp 分别解析校验。有效 current 优先；current 损坏、schema 不支持或结构非法时会备份它并加载有效 previous，previous 不会在候选选择前被删除。temp 会单独备份，不阻止有效 current/previous；只有 temp 的中断状态仍会安全阻断。

提交和回滚会先写入 `committed-cleanup-pending` 或 `rolled-back-cleanup-pending` terminal marker，再删除 previous、temp、current 并复核。任何 write/rename/remove 或 cleanup 失败都会进入 `journal-finalization-failed`，保持 recovery-required 和写门禁；Recovery Center 提供重试 finalization。重启读取 terminal marker 时只继续删除 journal，不回滚已经明确提交或已回滚的文件。

图片请求失败可以计为普通下载失败；binary create/modify 已写入后 reject、写后读取复核失败或 journal 事实无法确认时，会进入 uncertain mutation recovery。系统会保留 active journal，自动删除新建资源或按记录恢复旧 binary，并复核长度和 SHA-256；rollback 不完整时继续保持 recovery-required。

同一批次出现 uncertain binary mutation 时会停止新的条目，回滚本批次所有 Markdown transaction 和 binary 事实，不提供部分 Commit。关联链接不属于主事务，只有主事务正式 Commit 且 journal cleanup 成功后才作为 post-commit best-effort 副作用执行；失败只记录 warning，重载不会重复执行。

## 启动校验

启动时会验证 journal 根字段、普通对象、数组成员、有限时间、正整数 Subject ID、合法枚举、路径、SHA-256、原内容长度、binary base64、result snapshot、attempt action/status/diagnostics 和配置恢复事实。

- JSON 无法解析：备份为 `.bangumi-sync-recovery.corrupt-<timestamp>.json`。
- schema-1 JSON 可解析但结构错误：备份为 `.bangumi-sync-recovery.corrupt-structure-<timestamp>.json`。
- schema 不支持：备份为 `.bangumi-sync-recovery.unsupported-<timestamp>.json`。
- 只有中断的 temp journal：备份为 `.bangumi-sync-recovery.corrupt-temp-<timestamp>.json`。

这些情况不会中断插件加载；Recovery Center 仍可打开，所有 Vault 写入口继续受阻。

## 动作矩阵

| Recovery reason | Retry rollback | Rescan | Manual confirm |
|---|---|---|---|
| `rollback-failed` | 允许 | 允许 | 允许，诊断为零后完成 |
| `rescan-failed` | 允许 | 允许 | 允许，诊断为零后完成 |
| `state-restore-failed` | 允许 | 允许 | 允许，诊断为零后完成 |
| `journal-recovered` | 仅有 rename/content/created/resource/binary 事实时允许 | 允许 | 允许，诊断为零后完成 |
| `orphan-temporary` | 禁止 | 允许诊断 | 手工处理真实路径、Rescan 后允许 |
| `journal-corrupt` | 禁止 | 允许全局诊断 | 仅在备份 Vault、明确接受原事务不可验证风险且诊断为零后允许 |
| `configuration-rollback-failed` | 禁止 | 允许诊断 | 仅在磁盘、正式 settings 与 manager config 重新对齐后允许 |
| `journal-finalization-failed` | 按 journal 阶段重试 finalization | 允许 | 禁止，保持写门禁 |

Recovery Center 只显示策略允许的按钮；直接调用服务 API 也执行同一策略，不能绕过 UI。

## 常规回滚与重启恢复

持久恢复固定按以下顺序执行：

1. 按 Subject ID 核对并恢复 original/temporary/final rename 路径；
2. 删除本批次创建的 Markdown；
3. 在 original、temporary、final 候选中解析正确身份并恢复原内容；
4. 删除本批次新建且未被引用的资源；
5. 写回本批次前已有 binary，并重新读取验证长度和 SHA-256；
6. 恢复并持久化 `subjectPathStates`；
7. 重新扫描固定的批次 scan root；
8. 执行完整诊断；
9. 仅在无诊断时清 journal。

路径比较使用与 Vault 一致的大小写等价规则，但恢复后仍回到 journal 记录的规范路径。路径属于其他 Subject ID、重复 ID、内容 hash 不符、binary hash 不符或任何回滚步骤失败都会保留 gate 与 journal。

## Orphan temporary

启动扫描会保存每个 `.bangumi-sync-*.tmp.md` 的真实路径。插件不会根据孤立文件猜测事务方向，也不会自动删除或 rename。

1. 备份并检查 Recovery Center 列出的路径；
2. 判断应删除、恢复为原文件还是保留为正式文件，并手工处理；
3. 执行 Rescan；
4. 诊断清零后执行 Manual Confirm。

普通 Retry 不可用，空 rollback 不能解除门禁。

## Corrupt journal

原事务事实可能已丢失，因此不能宣称完成自动回滚。先备份 Vault，检查 `.corrupt-*` 文件、所有 orphan temp、重复 ID、阻塞身份冲突和最近创建/改名文件。Rescan 只更新诊断，不清 gate。Manual Confirm 会再次要求明确接受“原内容无法验证”的风险，并只在全局诊断为零时完成。

## Configuration rollback failure

journal 保存 previous、candidate、当前正式、磁盘 settings 与 manager config。Manual Confirm 会：

1. 再次调用 `loadData()` 读取真实磁盘状态；
2. 明确选择 previous settings 作为一致终态；
3. 保存并重新读取以验证磁盘；
4. 更新正式内存 settings；
5. 构建并应用 manager config；
6. 刷新依赖服务；
7. 完整诊断后解除 gate。

任何一步失败都会保留 recovery-required。Retry 不可用。

## 封面 binary 恢复

- 新建封面只记录在 `createdResourcePaths`，回滚时仅删除本批次新建且未被 Markdown 引用的资源。
- 已有封面只在 `imageUpdateExisting=true` 时更新；修改前把原 binary、长度和 SHA-256 写入 `updatedResourceExpectations`。
- 已有 binary 超过 16 MiB 时拒绝更新，不执行事务外覆盖。
- 更新后的 Markdown 写入失败或插件重载后，回滚写回原 binary 并复核 hash；失败则保持 gate。
- `imageUpdateExisting=false` 时已有封面计为 skipped，不发网络请求、不修改 binary、不创建 journal。

## 安全边界

- 诊断与恢复扫描只读取本地 Vault，不请求 Bangumi API。
- 不要修改残留文件 ID 来绕过检查；created path、rename 路径、内容和 binary 会独立验证。
- CRLF 与 LF 是不同内容。
- Recovery Center、SyncModal 与控制面板订阅同一 manager 状态；提交/回滚结束会广播 idle，恢复未完成则广播 recovery-required。
