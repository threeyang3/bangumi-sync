# 审查数据保护修复验证

日期：2026-11-01。修复基于 adv 的 5b731ae（稳定版 6.15.2 同步点），工作分支 codex/fix-audit-data-protection。本文是历史验证证据，当前契约见 [Recovery Model](../../maintainer/RECOVERY_MODEL.md)、[Logic Reference](../../maintainer/LOGIC_REFERENCE.md)、[Status Sync Invariants](../../maintainer/STATUS_SYNC_INVARIANTS.md)。

## 修复范围

| 审查项 | 修复与回归边界 |
|---|---|
| 1 自定义属性重置 | 旧本地值覆盖模板默认值，显式表单值最后应用；保留 false、0、空数组和空值。真实 Manager 链路和合并器测试。 |
| 2 标签合并丢项 | 执行器保持确认集合，客户端不按标点过滤、不截断；无效或超限整次拒绝。真实执行器＋客户端序列化请求断言。 |
| 3 最终写点竞态 | 携带渲染快照／不存在事实，在 Vault.process 内复核身份、路径和原文；测试同 ID 编辑、换 ID、文件出现与消失。 |
| 4 回滚覆盖编辑 | 同会话核对写后内容，持久化写后 SHA-256 支持重载预检；冲突保留文件与 journal。旧日志缺少摘要时禁止自动破坏性恢复。 |
| 5 空字段破坏 YAML | 复用结构化 frontmatter 更新器；测试相邻字段、末尾分隔符、CRLF 和正文。 |
| 6 删除确认竞态 | 确认回调取得写许可，删除前重新核对身份与路径；门禁和换 ID 测试。 |
| 7 面板缺少决策入口 | 面板复用 SyncModal，提供保留、回滚与恢复中心入口；调用真实控制器验证回调，并在 Sandbox 点击回滚。 |
| 8 同会话封面回滚 | 在内存事务回滚后恢复二进制 journal facts，验证原始字节；自动化与真实 Vault 验证。 |
| 9 force 未传递 | 普通同步和预览执行均传递 force，并开启现有数据保护；两条入口测试。 |
| 10 定时器未更新 | 设置成功应用后重建定时器；开启、修改间隔和关闭均验证。 |
| 11 陈旧设置快照 | 队列执行时获取快照；面板筛选赋值和保存共同入队；延迟持久化交错测试。 |
| 12 搜索按路径判断 | 复用 IncrementalSync 身份扫描，单页共享扫描；测试同名不同 ID 与手动改名。 |

## Production Sandbox

隔离 Vault：E:/Develop/bangumi-audit-sandbox。部署 release 三个产物后重载插件，使用合成笔记和模拟客户端；没有真实账号写入。驱动位于 E:/Develop/bangumi-audit-profile/qa.js 与 binary-qa.js。

- 主驱动 14 项断言通过：定时器开启／重建／关闭、队列落盘、新旧属性与 YAML 边界、写入竞态、待决状态、回滚后编辑保留、重载冲突保持、验证后恢复、面板完成窗口、两个决策按钮、真实回滚按钮解除门禁。
- 二进制／删除驱动 5 项断言通过：待决批次、真实封面替换、同会话回滚完成、旧封面与正文恢复、删除确认保护新身份。
- 故障注入产生预期的身份冲突；初次面板测试未替换 UI 客户端时，合成凭据验证得到预期 401，后续面板使用合成缓存与客户端。
- 实体手机未验证。自动化和 Sandbox 不代替后续 PR 的跨平台 CI。

本次没有版本号、Tag 或发布变更。

## 自动化闸门

Node 22.23.4 下 npm ci、lint、65 个文件／599 项测试、TypeScript 与生产构建、72 份 Markdown 的链接检查通过。新增 25 项行为回归；原有测试中更新了写后摘要的事实结构断言。最终 diff 空白检查通过。

标签依据：[官方校验](https://github.com/bangumi/server/blob/8f5a4daeeca26d90afd461b2fbbd44f1676d2f33/internal/pkg/dam/dam.go)、[空数组删除语义](https://github.com/bangumi/server/blob/8f5a4daeeca26d90afd461b2fbbd44f1676d2f33/openapi/components/user_subject_collection_modify_payload.yaml)。

最终 production 包复验：Obsidian 1.14.4；上述 19 项断言再次通过。dev:errors 为 0，error-level console 只有主动注入的删除身份冲突。UI 通过 DOM 与真实按钮回调检查。main.js SHA-256：225f4bef31c29b73f749cccf0107372f3ed00430b99066b1161b3531dc7a4157，部署副本一致。
