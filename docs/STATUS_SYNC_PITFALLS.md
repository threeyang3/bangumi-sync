# 状态同步踩坑记录

本文件记录 2026-04 这轮状态同步与单集功能联调中确认过的具体坑点，供后续修改时快速回看。

## 1. 插件入口导出

- Obsidian 期望插件入口是默认导出构造函数。
- 若 `main.ts` 只做命名导出，加载时会报 `TypeError: h is not a constructor`。

## 2. 收藏更新接口

- Bangumi v0 收藏更新统一走 `POST /v0/users/-/collections/{subject_id}`。
- 不要再用旧的 `PATCH` 路径，也不要保留“PATCH 失败再 POST”的分支。
- 清空标签时必须显式发送 `tags: []`，否则云端不会删除旧标签。
- `type / rate / comment / tags` 同时要回写云端时，优先合并成一次 `updateCollection`，不要按字段拆成多次 POST，既慢也更容易出现部分成功的中间态。
- Bangumi OpenAPI 里的 `updated_at` 不能当作可靠的收藏修改时间；官方说明它不会稳定覆盖评分、短评、标签、章节状态等修改。

## 3. 评论/短评比较

- 本地短评和云端短评比较前必须统一做规范化：
  - 统一换行符
  - 去掉行尾空白
  - 折叠多余空行
- 不要把多段短评压成一行，否则状态同步会出现“看起来一样但被判定有差异”的假冲突。
- 本地短评的真实来源是正文 `> [!abstract]+ **短评**` callout，不要再把 frontmatter `短评` 当成唯一真值。
- 提取短评时遇到下一个 callout 头或 `##` 标题必须停止，否则很容易把后续 `简介`、`记录` 等正文块误吞进去。

## 4. 标签解析

- frontmatter 的 `tags` 不要再用脆弱正则整块截取。
- 必须按行解析 YAML 列表/内联值，并过滤明显像键值对的伪标签，例如 `评分: 9`。
- 状态同步比对和智能合并前后都要调用同一套标签净化逻辑。

## 5. 单集状态的真实来源

- 单集状态不能只信 frontmatter 里的 `ep_statuses`。
- 本地实际可见状态来自正文里的 `.ep-box` 渲染结果；右键菜单也会直接改这部分 DOM。
- 读取本地单集状态时应优先解析正文 `data-status` / `watched`，再用 `ep_statuses` 兜底补充。
- 更新本地单集状态时，必须同时更新：
  - frontmatter `ep_statuses`
  - 正文 `.ep-box` 的 `data-status`
  - 正文 `.ep-box` 的 `watched` class

## 6. 单集状态云端覆盖本地

- 从云端同步单集状态到本地前，要先清空旧的本地单集状态。
- 需要同时清空：
  - `ep_statuses`
  - `.ep-box` 的 `data-status`
  - `.ep-box` 的 `watched` class
- 否则会残留历史状态，表现为“云端覆盖后仍显示旧集数状态”。

## 7. 集数框 HTML 解析

- 不要假设 `.ep-box` 的 HTML 属性顺序固定。
- 解析和回写必须按整段 `<span ...>` 标签处理，再提取 `class` / `data-id` / `data-ep` / `data-status`。
- 固定顺序正则会导致“当前界面高亮了，但重新打开文件又回到旧状态”的伪持久化问题。

## 8. 状态同步面板

- 面板宽度要用高优先级选择器限制在状态同步 modal 自身，例如 `.modal:has(.bangumi-status-sync-modal)`。
- 单集状态已经并入主状态同步流程，不要再把它当成完全独立的附加操作。
- 状态同步应分成两段：用户数据全量对比；平台数据先排除本地明确已完结条目，再后台补全候选条目的云端差异。
- 打开控制面板后会预热本地已同步条目的用户数据快照；“检查并同步状态”要尽量复用这批预热结果，避免重复读取正文。

## 9. API 返回 null data 与 episode null

- `getUserEpisodeStatus` 等端点可能返回 200 但 `data` 为 null，必须用 `result?.data ?? []` 兜底。
- `getCloudEpisodeStatusMap` 中 `userEp.episode` 可能为 null（API 返回畸形数据），必须在访问 `userEp.episode.id` 前加 null 守卫。
- `syncStatusFromCloud` 的 filter 也需要同样的 `userEp.episode` 守卫。
- 状态同步对比循环中，单个条目的 `buildEpisodeStatusDiff` 失败不应中断整个循环，应 try-catch 后跳过。
- `syncStatusToCloud` 全部失败时必须抛出错误，不能静默成功。

## 10. 右键菜单与编辑器定位

- 右键“添加吐槽”插入 callout 后，返回的应是正文可编辑区域的精确光标位置，而不是 callout 块起始位置。
- 切到源码模式后除了 `setCursor`，还要同步设置空选区并 `focus()`，否则有时视图切过去了但光标没落到正文。
