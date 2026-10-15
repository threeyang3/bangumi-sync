# Issue 28 sync progress validation

2026-10-15，在日志改进 `72c8a41` 后处理 [Issue #28](https://github.com/threeyang3/bangumi-sync/issues/28)。当前用户说明见 README；阶段展示边界见 maintainer/ARCHITECTURE.md。

## Behavior

- SyncProgress.phase 为可选字段，不改变既有 status 类型；阶段内 current/total 是已处理次数，包含失败。渲染、写入在实际处理结束后计数，未知总量的规划、日志收尾、补链、回滚和等待决策阶段不显示百分比。
- Modal、状态栏和控制面板复用展示规则；DOM 更新最多每 100 ms 一次，但阶段切换、最后计数和终态立即刷新。Manager 事件不节流。
- 预览前详情加载提供完成计数，失败回退也计入已处理；本轮未改变该加载器的串行请求策略。
- 等待用户决定的批次不报告 completed；取消、失败和待决策结果不显示正常完成的满进度条。保留/回滚处理中仍可显示收尾、补链或回滚阶段。
- SyncResult.duration 保持正式执行调用的计时范围；完成页明确排除预览前加载、确认等待和后续决策处理。保留/回滚处理时间由 UI 单独计时，初次执行耗时保持不变。
- 控制面板的 onPhaseProgress 回调只属于该次调用，返回后解除，shutdown 时清除；不替换长期进度回调。Progress 不持久化，不改变恢复日志 schema、写门禁或事务方向。

## Automated validation

Node.js 22.23.3：npm ci、lint、40 个测试文件/325 项测试、production build、docs:check 和 git diff --check 通过。

新增覆盖：乱序完成计数；preview executeSync 和 automatic sync 未提供外部回调时仍推进计数；写入/补链等待期间不报告完成；正式执行耗时包含两段等待；部分成功等待决策和下一批次计数隔离；空批次；预览请求未完成不推进计数及失败回退；未知/非法计数；UI 刷新节流；控制面板回调在返回及 shutdown 后解除。既有 journal failure、rollback/restart、identity/path/binary 回归均通过。

## Production Obsidian Sandbox

独立 Vault/profile、Obsidian 1.14.4、合成数据与模拟 API，无真实账户。部署三项 production assets，main.js SHA-256 为 `55618B5DCB9F158F52FAF2141FCAAA60327B3937020EF39BE5CDE32BC3FA8C83`，与本地 release 构建一致。使用本地 CDP 检查真实插件及 DOM。

真实命令入口/SyncModal 的 UI 故障注入测试，将同步入口转发到真实 syncByCollections 流程以避免网络访问：

- 阻塞 Markdown 创建时显示“处理文件写入 0/1 (0%)”，未发 completed。
- 阻塞关联链接处理时显示“补全关联链接”，aria-valuenow 移除、fill 为 0%、无正常完成 class；暂停/恢复后仍显示正确阶段。
- 部分成功显示等待决策，不发 completed；点击保留后能显示补链阶段。初始正式执行耗时保持不变，决策处理耗时单独显示。
- 渲染中请求取消显示“正在取消”，最终显示“已取消同步”，无满进度条且未创建被取消条目的笔记。
- 既有相关笔记正文保留，终态 idle，无 journal。console error / runtime exception 均为 0。

最终构建直接执行 executeSync 的 1303 条记录、并发 5、每条 2048 字符正文，启用关联链接并显示真实 SyncModal/状态栏：

| 指标 | 实测 |
| --- | ---: |
| created / failed / 逐条身份与正文校验 | 1303 / 0 / 1303 |
| details / rendering / writing 最终计数 | 各为 1303，单调不降 |
| Manager 进度事件 | 5220 |
| Modal 进度渲染 | 170 |
| 正式执行耗时 | 27.718 s |
| console error / runtime exception | 0 / 0 |

耗时仅记录本次运行，不用于推导网络、文件 I/O 或补链算法的提速倍数。完成页截图已检查，统计和耗时范围说明无溢出。终态 idle，无遗留 journal。

另通过真实控制面板选中同步 11 项：补链阻塞期间底栏显示“补全关联链接”，没有保留“11/11”假完成进度；11 个文件正文校验通过，idle、无 journal，error/exception 均为 0。隔离实例已关闭。本轮没有回复 issue、推送、合并或发布。
