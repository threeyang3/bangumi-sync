# Identity and Path Model

本文是 Bangumi Subject 身份、路径规划和用户改名保护的 canonical reference。

## Identity invariant

Bangumi Subject ID 是本地条目的唯一身份；Markdown 路径只是当前存储位置，文件名只是展示名称：

```text
一个 Bangumi ID → 一个主条目文件
一个规范化路径 → 一个 Bangumi ID
```

标准字段是 frontmatter `id`。旧 `BangumiID`、Bangumi URL 和 `{id}_cover` 只作为兼容读取来源。多个来源不一致时必须报告阻断错误，不能猜测身份或写入。

同步、强制同步、状态同步、控制面板、搜索添加和用户数据导入共享同一身份读取边界。实际 `vault.process()` 回调内必须再次验证目标 ID。

## Registry model

本地 registry 建立 ID 到文件的唯一映射，并报告：

- 缺少或非法 ID；
- 同一个 ID 的多个文件；
- 同一路径碰撞键对应多个 ID；
- 身份来源冲突；
- 用户改名、未知路径状态和模板碰撞。

固定 scan root 用于发现主条目；事务中的 concrete path、rename、content 和 binary facts 按 Vault 全局路径验证。

## Path state

插件在自身 `data.json` 保存 `currentPath`、`lastManagedPath` 和 `namingState`，不把内部状态写入用户 Markdown。

`subjectPathStates` 与 Markdown、rename、binary 同属一个逻辑事务。设置持久化或事务失败时必须恢复批次前快照、重新扫描并验证持久化结果。

## Path normalization

展示路径保留 Unicode NFC。碰撞键按以下顺序计算：

1. 只用存储路径中的 ASCII `/` 确定段边界；
2. 每段执行 Unicode NFKC；
3. 清理尾随点/空格并做大小写不敏感比较；
4. 将 NFKC 新产生的 `/` 或 `\` 映射为全角文件名字符，不能改变原段边界；
5. 使用长度前缀编码，避免连接歧义。

因此 `乱马1／2.md` 是一个文件，而 `乱马1/2.md` 是两级路径。

非法 ASCII 字符 `< > : " / \ | ? *` 转为对应全角字符，同时处理控制字符、Windows 保留名、空名称、尾随点/空格、过长分段和完整路径长度。

## Collision resolution

默认策略是“无冲突使用简洁名称，有实际规范化冲突才消歧”：

- 无冲突：`乱马.md`
- 年份唯一：`乱马（1989）.md`、`乱马（2024）.md`
- 同年：`作品（2024）[bgm-123].md`
- 缺少年份：`作品[bgm-123].md`

插件为 managed 条目持久化 `basePreferredPath` 和规范化 `collisionGroupKey`。新成员加入已有碰撞组，或年份唯一性发生变化时，planner 会加载完整组并在同一个事务中重新分配所有 managed 路径。用户重命名的成员始终受保护。

`simple-until-collision` 优先使用唯一年份，同年或缺少年份时追加 Bangumi ID。`always-year`、`always-id` 和 `custom-template` 的模板结果若仍发生碰撞，只追加一次 `[bgm-ID]`，不会重复年份或重复策略后缀。

旧路径状态缺少上述元数据时，首次相关同步会按本地 managed 条目精确回填；回填失败的条目保持原路径，不进行不完整的碰撞组移动。

## User rename protection

只要有效 ID 仍存在且文件位于扫描目录内，用户可以任意重命名。普通同步和强制同步通过 ID 更新实际文件，不按模板另建副本。

没有历史路径状态的文件默认是未知、受保护状态。只有它占用了本次碰撞组的当前模板首选路径时，才能临时推断为 `inferred-managed`；成功提交后转为 `managed`。无关自定义路径不能自动移动。

## Managed vs user-renamed

- `managed`：插件可以按当前碰撞组策略调整。
- `inferred-managed`：本次规划中有充分证据，提交后才升级为 managed。
- user-renamed / protected：通过 ID 更新内容，但不按模板移动。
- unknown：先诊断和用户确认，不自动修复。

路径模板只决定新条目的首选路径，不是现有文件的强制布局。

## Transactional path state

所有本地同步入口共用：

1. 扫描 identity registry；
2. 计算碰撞上下文和完整计划；
3. 生成全部内容；
4. 持久化 recovery facts；
5. 执行 temporary/final rename；
6. 写入内容和 binary；
7. 提交包含首选路径和碰撞组键的 `subjectPathStates`；
8. 清理 journal。

内容准备完成前不 rename。任一写入失败会恢复路径和内容。仅为对称碰撞而移动的上下文条目也必须返回 `previousPath`、`actualPath`、`pathAction: renamed` 和 `writeAction: skipped`。

## Recovery expectations

批次开始时为受影响身份保存 expected absent/present、expected path 和 expected Subject ID：

- absent → absent：正常；present 为 `unexpected-subject-file`。
- present → absent：`missing-subject-file`。
- identity 相同但路径不同：`subject-path-mismatch`。
- expected path 属于其他 ID：`subject-identity-mismatch`，优先于缺失判断。

新建文件还记录 concrete created path，因此篡改残留文件 ID 不能绕过 expected-absent 验证。Windows/macOS 风格大小写等价路径视为同一目标，但恢复后仍使用 journal 记录的规范路径。

恢复路径、内容 hash、binary 和 path states 的完整顺序见[恢复模型](RECOVERY_MODEL.md)。

## Diagnostics

“检查本地 Bangumi 条目”按以下级别报告：

- `safe-auto-fix`：有充分证据且不破坏用户命名；
- `needs-user-decision`：需要用户判断路径或身份；
- `blocking-error`：缺失/冲突/重复身份或不可安全写入。

诊断可导出 Markdown。处理后必须重新扫描；不要用批量修改 ID 的方式消除错误。
