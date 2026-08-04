# Bangumi 条目身份与路径模型

## 恢复路径事实（6.11.0）

Subject ID 仍是条目身份，但 expected-absent 恢复不能只查询 ID。事务会记录每个新建文件的 concrete created path，人工确认按 `normalizePathCollisionKey()` 检查该路径是否仍被占用；因此修改残留文件的 frontmatter ID 不能绕过恢复。Windows/macOS 风格的大小写等价路径视为同一目标。

对批次前已存在且被覆盖的文件，事务从同一次读取中保存原文、长度与标准 SHA-256；CRLF 与 LF 视为不同内容。固定 scan root 只用于 registry 扫描，created/content/rename/resource 事实按 Vault 全局 concrete path 验证。original、temporary、final 与期望终态均写入持久 journal。

## 核心不变量

Bangumi Subject ID 是本地条目的唯一身份；Markdown 路径只是当前存储位置，文件名只是展示名称。正常状态始终满足：

```text
一个 Bangumi ID → 一个主条目文件
一个规范化路径 → 一个 Bangumi ID
```

同步、强制同步、状态同步、控制面板、搜索添加和用户数据导入都使用同一身份读取逻辑。标准字段是 frontmatter `id`；旧 `BangumiID` 可继续读取，Bangumi URL 与 `{id}_cover` 仅作为迁移兜底。多个来源不一致时文件会被标记为阻断错误，不会被写入。

## 用户重命名

插件在自身 `data.json` 中保存 `currentPath`、`lastManagedPath` 和 `namingState`，不会把内部状态写进用户 Markdown。只要有效 ID 仍存在且文件位于扫描目录内，用户可以任意重命名文件。普通同步和强制同步会通过 ID 更新实际路径，不会按模板重新创建一份。

升级前没有路径历史的文件默认按保守策略处理为未知/受保护状态。只有当它恰好占用了本次相关碰撞候选的当前模板首选路径时，才临时标记为 `inferred-managed`；成功提交路径状态后转为 `managed`。不相关的自定义路径不会触发 API 查询或自动移动。

## 路径生成与碰撞

路径模板只生成新条目的首选路径。展示路径保留 Unicode NFC。碰撞键先按存储路径中的 ASCII `/` 确定边界，再对每个段单独执行 Unicode NFKC、尾随点/空格清理和大小写不敏感比较，最后用长度前缀编码。NFKC 产生的 `/` 或 `\` 会重新映射为全角文件名字符，不得改变段边界。因此 `乱马1／2.md` 与 `乱马1/2.md` 分别表示一个文件和两级路径，不会碰撞。

非法 ASCII 字符使用对应全角字符：`< > : " / \ | ? *` 分别转为 `＜ ＞ ： ＂ ／ ＼ ｜ ？ ＊`。同时处理控制字符、Windows 保留名、尾随点/空格、空名称、过长分段和过长完整路径。

默认策略为“简洁命名，仅冲突时消歧”：

- 无冲突：`乱马.md`
- 年份唯一：`乱马（1989）.md`、`乱马（2024）.md`
- 同年：`作品（2024）[bgm-123].md`
- 缺少年份：`作品[bgm-123].md`

插件管理的简单路径会在新冲突出现时对称重命名。符合当前模板首选路径的相关旧文件可被安全推断为插件管理；用户重命名和不相关未知路径仍不会自动移动。

## 写入与回滚

写入目标存在时，插件先读取目标身份。只有目标 ID 与请求 ID 相同才允许覆盖或合并用户数据。不同 ID、缺少 ID 或身份字段冲突都会阻断写入。

所有本地同步入口共用同一流程：扫描身份注册表、按首选路径查找碰撞上下文、生成全部内容、执行重命名、写入文件、持久化路径状态。内容准备全部完成前不会重命名。重命名后的任一写入失败会自动回滚整个路径事务；只有全部提交成功才保存状态并销毁活动事务。

回滚结果分别报告 `deletedCreatedFiles`、`restoredContents`、`restoredPaths` 与 `failed`。回滚幂等；成功批次不可再次回滚，部分成功且尚未提交的批次可以手动回滚，恢复失败会显示 `rollback-failed`。

## 诊断

命令“检查本地 Bangumi 条目”报告：缺少/冲突/重复 ID、规范化路径冲突、用户重命名、未知路径状态和当前模板碰撞。报告按 `safe-auto-fix`、`needs-user-decision`、`blocking-error` 分级，并可导出 Markdown。

## 路径状态也是事务数据（6.10.2）

`subjectPathStates` 不是事后元数据，而是与笔记创建、内容替换和碰撞重命名同属一个逻辑事务。管理器在执行前保存类型化快照；设置保存失败时回滚磁盘修改、恢复内存快照、重新扫描 Vault，并再次尝试保存旧快照。

仅为对称碰撞命名而移动的上下文条目也会产生结果：包含 `previousPath`、`actualPath`、`pathAction: renamed` 和 `writeAction: skipped`。

## 恢复期原始事实（6.10.4）

恢复判断不从回滚后的当前文件反推“原本应该怎样”。批次创建时为每个受影响 ID 保存 `RecoverySubjectExpectation`：`expectedToExist`、`expectedPath` 与 `expectedSubjectId`。校验矩阵如下：

- 原本不存在且当前不存在：正常；当前存在则为 `unexpected-subject-file`。
- 原本存在且当前缺失：`missing-subject-file`。
- 原本存在、身份相同但路径不同：`subject-path-mismatch`。
- 期望路径当前属于其他 ID：`subject-identity-mismatch`，优先于缺失判断。

人工确认还会阻止临时事务文件、重复 ID 和 blocking local file。矩阵通过后重新持久化批次前 `subjectPathStates`，用规范化路径比较配置状态与 `IncrementalSync.exportPathStates()`，再次扫描并复核；只有全部相等才清除 pending/recovery。Retry、Manual Confirm、Rescan 共享互斥锁，历史 attempts 与 latest attempt 分离，最新失败不会混入旧失败列表。

恢复期统一写门禁覆盖收藏/单条同步、路径迁移应用、封面与关联写回、状态同步、批量编辑、用户数据导入导出、集数状态、吐槽和共享笔记。诊断与确认只使用本地数据，不调用网络。6.11.0 的 journal 在插件重载后重新建立 recovery-required，封面资源也作为事务事实记录、回滚和诊断。
