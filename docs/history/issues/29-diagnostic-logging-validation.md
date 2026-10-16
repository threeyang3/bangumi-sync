# Issue 29 diagnostic logging validation

2026-10-15，基于 adv `bd77c72`，处理 [Issue #29](https://github.com/threeyang3/bangumi-sync/issues/29)。当前使用说明见 README，日志规则见 maintainer/CODE_STANDARDS.md。

默认关闭详细日志，所有逐项 debug 输出通过 common/logging.ts 的消息工厂；设置读取当前已应用值，保存失败不会提前启用。插件卸载解除读取器，旧实例解除读取器不影响新实例。普通同步输出只含明确挑选统计字段的批次摘要；保留 warning/error，移除请求 payload 的输出及异常消息中的 payload 附加。

Node.js 22.23.3：npm ci、lint、38 个测试文件/311 项测试、production build、docs:check、git diff --check 均通过。新增测试验证 1303 次关闭状态的调用不执行工厂、动态开关、实例清理、摘要字段白名单，以及开启/关闭诊断时成功和失败请求均不输出请求正文或 Token。ESLint 限制直接 console.debug，只允许统一日志模块调用。

独立 profile 与合成 Vault，Obsidian 1.14.4 production runtime，本地 CDP 验证；没有访问真实账户。部署三项 release assets，main.js SHA-256：`662222DE6AE2BBF45372C921AEE9D5E1139F9290A62C529C0CBCF40A43646AFA`，与本地 production 构建一致。

- 设置 UI 位于独立设置窗口；通过实际 toggle 验证开启/关闭，不替换 manager；原生 checkbox 容器可聚焦、有可访问名称。
- 注入设置保存失败，内存和日志行为保留原值；启用后重载可恢复，关闭后磁盘和内存一致。正常设置验证的 console error / runtime exception 均为 0。
- 1303 条合成 music 记录、并发 5、每条 2048 字符正文，开启关联链接，真实 journal 和 Markdown 写入。created 1303、failed 0、逐条身份及正文验证 1303；约 24.758 秒，仅记录本次运行，不据此推导原 trace 的提速比例。
- 详细日志关闭时 debug 调用 0、批次摘要 1。对同一 500 项关联列表，关闭时输出 0，启用后输出 1502 条，生成链接数组一致。
- 终态 idle，无遗留 journal；正常批次 console error / runtime exception 均为 0。测试实例已关闭。

该验证说明详细日志开关及惰性求值有效，不能将原 trace 全部 V8Console::Debug 事件或约 5.13 秒都归因于插件。其他请求、写入、补链性能改进另行验证。本轮没有回复 issue。
