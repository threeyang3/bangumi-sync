# Issue 25 preview detail validation

2026-10-15，在进度展示改进 `1e4abaa` 后处理 [Issue #25](https://github.com/threeyang3/bangumi-sync/issues/25)。当前用户行为见 README，会话边界见 maintainer/ARCHITECTURE.md。

## Behavior

- 预览详情通过 worker 按 1–5 并发加载，默认 3；手动命令使用已有同步并发设置。完成顺序不改变预览顺序，进度只计实际结束的处理，失败通知仍只显示一次。
- SubjectDetailSession 仅属于本次预览和随后导入。相同 ID 的在途请求合并，成功的完整详情供 getFullSubjectInfo 复用，其余角色、人物、关联请求继续按既有流程获取。
- 超时仍为 15 秒。底层 requestUrl 无取消能力，超时不释放真实在途请求的名额；排队项到期后不再发出，迟到响应不缓存。失败和简版回退不进入成功缓存，导入选中的失败项会重试完整详情。
- 完成、取消、预览关闭及卸载清理缓存和等待计时器。账号凭据变化使会话失效；manager 或已应用同步配置变化后不能使用旧预览执行。被新操作替换的旧预览不得清理新操作的会话。
- 不调整事务、身份、路径规则与 journal schema。不添加长期缓存，不承诺所有 API 的总 HTTP 并发上限；按需请求和总 HTTP 调度属于后续 Issue #27。先选择后加载的流程重排暂未实施。

## Automated validation

Node.js 22.23.3：npm ci、lint、42 个测试文件/334 项测试、production build、docs:check、git diff --check 通过。

新增测试覆盖：在途和成功复用、完整信息仍加载辅助端点、失败/身份不匹配重试、超时占用真实名额、到期排队项不启动、迟到结果不缓存、dispose/账号变化/取消、并发上限和预览顺序、预览关闭只通知一次。真实 manager + full-info 方法的集成测试验证一次成功详情与一次失败重试均写入完整摘要，事务收尾没有遗留 journal。

## Production Obsidian Sandbox

独立 Vault/profile，Obsidian 1.14.4，合成收藏和模拟 API，不使用真实账号。部署三项 production assets，本地和部署 main.js SHA-256 均为 `1E9C84459BD3A575309E33EA0133876DA7D9BA7239FEE334140E2BC17CE785F0`。

通过实际手动命令、属性 modal、选择 modal 和生产 executeSync 路径：

| 验证项 | 结果 |
| --- | --- |
| 预览及完整 Markdown 写入 | 1303 项，全部校验 ID 与完整摘要 |
| 详情请求数 / 最大同时在途 | 1303 / 5 |
| 导入重复请求成功 subject | 0 |
| characters / persons / relations | 各 1303 次，仍按原有行为获取 |
| 预览加载至属性表单 | 3.408 s，合成 12 ms 请求延迟 |
| 失败预览条目选中后重试 | 1 项，成功生成完整内容 |
| 未选中条目 | 不生成文件，不加载执行辅助详情 |
| Escape 关闭 / 加载中取消 | 缓存清理，无导入、无迟到表单 |
| 账号变更 / 新预览替换旧预览 | 旧缓存失效，新会话未被旧回调清理 |
| console error / runtime exception | 0 / 0 |

终态 idle，无遗留 recovery journal。3.408 s 仅证明本地合成场景的并发和复用，不代表真实 Bangumi 网络吞吐或限流表现。本轮没有回复 issue、推送、合并或发布。
