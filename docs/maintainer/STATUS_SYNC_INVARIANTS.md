# Status Sync Invariants

本文记录状态同步当前必须保持的业务不变量。历史 bug 根因、UI 排查和开发过程见[状态同步历史坑点](../history/pitfalls/status-sync-2026-04.md)。

## Data ownership

- 评分、短评、标签、收藏状态和用户单集状态属于用户数据。
- 平台集数、话数、卷数等元数据属于平台数据。
- 用户数据与平台数据分别比较和写回，不能用一个分支覆盖另一个分支的 null semantics。

## Short comment source

- 本地短评以正文 `> [!abstract]+ **短评**` callout 为真实来源。
- Frontmatter 或缓存不能无条件覆盖正文短评。
- 比较前统一换行、空白和空值语义；写回由共享文档服务完成。

## Tag normalization

- Bangumi 用户标签和本地标签必须在比较前规范化。
- 列表顺序不构成差异；重复项不能导致伪冲突。
- 智能合并不得丢失仅存在于任一侧的有效标签。

## Episode status

- 用户单集状态以云端 episode collection 状态和本地正文/结构化状态共同计算。
- `ep_statuses` 与正文集数框必须保持一致；不能只更新其中一个表示。
- 平台 episode 对象缺失、collection 为 null 和 API 请求失败是不同状态。
- API failure 不能解释为“云端为空”并覆盖本地数据。
- 局部章节操作使用 patch 语义，未选中的集数、抛弃状态和 SP 状态必须保留。全量替换只接受完整快照。
- 章节接口必须读取全部分页；空中间页、重复 ID、无效状态或变化的 total 必须报错，不能提交半份快照。
- “以本地为准”比较完整云端章节与本地状态，上传差异，包括清除状态的 0；任一章节上传失败均计为条目失败。
- 批量章节更新按 ID 建立映射并线性扫描正文，不能逐集扫描整篇笔记。

## Fractional episode numbers

- SP、OP、ED 等小数编号必须保留，例如 `29.1`。
- 解析、排序、DOM attribute、API 映射和写回不得通过整数转换截断。

## Cloud null semantics

- 明确的云端空评分可以作为用户选择的“清除”参与 diff。
- API `data: null`、episode null 或请求失败必须保留错误边界，不能直接等同于业务空值。
- 后台补全失败应呈现局部错误，不阻塞已加载的基础差异。

## UI and execution boundary

- Control Panel 和 Status Sync Modal 只负责编排、选择与展示。
- Diff 构建、后台补全和写回由共享 status sync service / pure logic 负责。
- 执行前核对 Subject ID 和预览时的完整本地内容；每次原子写回再次核对身份及预期内容。路径移动、身份替换或新编辑需要刷新预览。
- 只提交用户选中的字段；评分 0 和空短评是明确清除，不能过滤，也不能顺带重发旧收藏状态。
- 写操作持有跨 await 的互斥许可，嵌套操作必须显式传递许可，finally 释放。恢复与事务门禁仍然适用。
- 云端成功后本地失败必须明确告知云端已保存；网络和 Vault 不构成跨系统原子事务，失败不意味着云端已经回滚。

## Required tests

改变状态同步时至少覆盖：

- 短评抽取与空值；
- 标签去重、排序和合并；
- 收藏状态和评分的 null semantics；
- episode collection、`ep_statuses` 和正文一致性；
- 小数 episode 编号；
- API failure 不覆盖本地；
- recovery gate 阻断写入。
