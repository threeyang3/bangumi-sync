# Issue 22 recovery performance validation

历史验证记录，对应 [Issue #22](https://github.com/threeyang3/bangumi-sync/issues/22)。当前实现契约见[恢复模型](../../maintainer/RECOVERY_MODEL.md)。

## Scope

基于 adv `c913ae2`，保持 journal schema、完整持久化时机、失败阻断和终态方向。优化 pending created-path 匹配及 active journal created/content/rename 事实合并。未改变路径规范化规则、write queue、日志轮转或恢复动作策略。

匹配保留首项语义；合并保留最后值覆盖与首次插入顺序。WeakMap 按 journal 对象隔离索引，缓存不进入序列化。事实数组和条目保持旧快照不变。

## Automated checks

Node.js 22.23.3：`npm ci`、`npm run lint`、`npm run test`、`npm run build`、`npm run docs:check`、`git diff --check` 均通过。37 个测试文件、300 项测试。

新增覆盖：Unicode 等价路径、全角分隔符边界、重复请求、首项匹配、未匹配 fallback、loaded duplicates、覆盖顺序、累计事实缓存、旧快照、连续批次隔离、pre-mutation journal failure。既有 journal 故障注入、restart、policy 与 binary recovery 回归均通过。

1303 项匹配规范化调用数为 2606；累计 created facts 合并同一批 1303 条路径时，规范化调用数为 1303。此断言不依赖机器速度。

## Production Obsidian Sandbox

使用独立 vault 和 user-data profile，运行 Obsidian 1.13.7 runtime。部署三项 production assets，main.js SHA-256 为 `A4DABE2B25CB705657960467F5B87AA866CEB2B2D73452D3132E38DAAEDB9D0E`，部署文件与 release 构建 hash 相同。

本机 installer 未提供可用 CLI 输出，使用隔离实例的本地 CDP 执行并检查 production 插件。只使用合成正文和模拟 API，真实 Obsidian Vault、磁盘 journal 写入及插件重载；不访问真实账户。

1303 条条目、并发 5：created 1303、failed 0，实际 Markdown 数 1303，完整流程约 24.768 秒；production `journalFromPending` 约 2.4 ms，累计事实合并约 8.6 ms。终态 `idle`，journal 已清理，运行时 error/unhandled rejection 为 0。

同一 Obsidian renderer、相同合成路径的计算对照，结果一致：

| 1303 项场景 | 原算法 | 索引算法 |
| --- | ---: | ---: |
| pending created-path 匹配 | 4281 ms | 7.2 ms |
| 每次新增一项的事实合并 | 2229 ms | 4.9 ms |

故障与重载验证：

- 一项成功、一项准备失败，持久 journal 为 awaiting-decision，created facts 只包含该批次的一项，未混入前批次 1303 项。
- 禁用并重新启用插件后写门禁生效；Retry recovery 完整回滚该项，保留前批次文件，journal 清零。
- 注入 pre-mutation 临时 journal 写入失败，目标 Markdown 未创建；流程报告 failed，最终 idle，journal 清零。
- CDP Runtime 缓存的 error-level console 和 exception 均为 0；最终 Markdown 数仍为 1303。

这些数据验证计算复杂度和恢复行为，不等同于复现用户的完整网络流程或原始 Performance trace。完整 journal 序列化和文件 I/O 仍保留；累计事实遍历、数组快照复制仍有成本，不声称完整同步已变为线性复杂度。
