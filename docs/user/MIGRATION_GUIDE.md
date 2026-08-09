# Migration Guide

本文说明从旧版本升级到当前稳定行为时，用户需要做什么。特定旧版本的逐次变更记录见[历史迁移文档](../history/migrations/6.10.x.md)。

## 升级前

1. 备份 Vault，尤其是条目目录和 `.obsidian/plugins/bangumi-sync/`。
2. 确认没有正在运行的同步、批量编辑或路径迁移。
3. 若已出现 Recovery Center，先完成恢复，不要用新版本覆盖未知的 recovery/temp 文件。
4. 从同一个 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`。

## 从 6.11.x 升级

- 不需要迁移现有 Markdown。
- 不需要重写 frontmatter 或 Subject ID。
- 不需要批量重命名文件。
- 路径状态和 recovery journal 会由插件按当前规则读取。
- 已知的 6.11.1 configuration journal 会先在内存中脱敏、验证，再通过安全 staging 迁移；不要手工编辑或删除它。

升级并重载插件后，先运行“检查本地 Bangumi 条目”。没有阻断诊断时再开始同步。

## 从 6.10.x 或更旧版本升级

旧文件仍以 frontmatter `id` 作为主要身份来源；旧 `BangumiID`、Bangumi URL 等仅作为兼容读取来源。建议：

1. 确保每个条目只有一个有效且互不重复的 Bangumi ID。
2. 运行本地诊断，处理缺少 ID、身份冲突和规范化路径冲突。
3. 保留用户手工改名的文件，不要为了匹配新模板批量移动。
4. 需要按当前模板整理路径时，使用显式的路径迁移预览。

旧版本逐步迁移的实现背景、故障注入和限制保存在 [`history/migrations/6.10.x.md`](../history/migrations/6.10.x.md)。

## Markdown 与 frontmatter

当前稳定行为不会要求统一重写已有 Markdown。请长期保持：

- `id` 唯一标识 Bangumi Subject。
- 不要把文件名或标题当作身份。
- 不要同时写入互相冲突的 `id`、`BangumiID` 或 Bangumi URL。
- 自定义属性可以继续保留；完整模板规则见[模板指南](TEMPLATE_GUIDE.md)。

## 修改路径模板

保存新的路径模板不会自动移动已有文件。推荐流程：

1. 运行“检查本地 Bangumi 条目”。
2. 查看用户改名、未知路径状态和碰撞诊断。
3. 使用“预览并应用当前路径模板”。
4. 只确认你理解的移动；不要绕过阻断项。
5. 完成后重新扫描并检查重复 ID。

路径规范化、同名消歧和用户改名保护以[身份与路径模型](../maintainer/PATH_AND_ID_MODEL.md)为准。

## 本地文件重命名

你可以手工重命名已同步文件，只要：

- 文件仍位于扫描目录内；
- frontmatter 保留正确的 Subject ID；
- 新路径没有与其他条目的规范化路径冲突。

普通同步会通过 ID 更新实际文件，不会仅因为路径不同就新建副本。

## 遇到 Recovery Center

升级后若出现 Recovery Center：

1. 停止所有写入操作。
2. 不要删除 `.bangumi-sync-recovery*` 或 `.bangumi-sync-*.tmp.md`。
3. 按[恢复指南](RECOVERY_GUIDE.md)选择 Retry rollback、Retry cleanup、Retry migration、Rescan 或 Manual Confirm。
4. 若 journal 损坏或存在 orphan temporary，先备份 Vault。

## Legacy recovery journal

Legacy migration 使用独立的 `.bangumi-sync-recovery.migration.tmp.json` staging。只有完整写入、重读、结构校验和 secret 扫描都成功时才会替换 source。

- Retry migration 是 legacy migration failure 的唯一自动动作。
- source 丢失但安全 staging 仍有效时，可以在同一运行期重试。
- 迁移成功后仍可能进入 configuration recovery；写门禁会保持到配置一致性确认完成。
- 不要把 legacy journal、staging 或其备份上传到公开 Issue。

内部候选选择、secret redaction 和状态转换见[恢复模型](../maintainer/RECOVERY_MODEL.md)。
