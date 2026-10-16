# Issue 26 related link batch validation

2026-10-15，在预览复用改进 `aaec09b` 后处理 [Issue #26](https://github.com/threeyang3/bangumi-sync/issues/26)。当前规则见 maintainer/LOGIC_REFERENCE.md 第 19 节；本文只记录本轮验证。

## Change

- 移除按来源逐次写入及随后再写批次内目标的两轮 I/O。整批按规范化目标路径收集链接，用 Set 去重，每个目标至多一次预读和一次 atomic process。
- 同 ID 的本地路径解析（含未命中）只在本次后处理内缓存。不同 ID 指向相同目标路径时告警并跳过，避免混合身份。
- 预读内容用于 identity 校验及 no-op 判断；真正写入通过 document service 校验最新 identity，并在原子回调中重算合并，保留期间出现的正文、属性和链接编辑。
- updateRelated 的无新增判断复用 Set 插入结果，移除对已有数组的重复 includes 扫描；保留既有链接顺序、规范化和重复清理行为。
- 单个目标失败只告警一次，其余目标继续。保留批次才补链、回滚不补链；主事务、journal schema、统一 gate 与持久化顺序不变。预读后和原子回调内也检查取消/卸载。

## Automated validation

Node.js 22.23.3：npm ci、lint、43 个测试文件/350 项测试、production build、docs:check、git diff --check 通过。

新增覆盖整批汇聚、批次内双向链接、外部目标反向链接、重复边与未命中路径缓存、no-op 原字节不变、原子回调前编辑、两阶段 identity 变化、共享路径身份冲突、目标失败隔离、取消/卸载、既有链接顺序与重复清理。真实 manager 的集成测试覆盖成功批次锁定整个补链阶段，以及部分成功批次保留/回滚的实际写入和 journal 清理。

## Production Obsidian Sandbox

Obsidian 1.14.4，独立 Vault/profile，合成数据及模拟 API，无真实账户。对比基线为 `aaec09b` 的 release 构建；基线 main.js SHA-256 `1E9C84459BD3A575309E33EA0133876DA7D9BA7239FEE334140E2BC17CE785F0`。改进构建与部署 main.js SHA-256 均为 `371FBEE473F054FAE2D4BC2925DC02F1C6963B95D9A96B639A9ED8309212EEBC`。

两组互不重叠的同形合成图：1303 个新来源，每个来源两次引用同一个已存在目标，并引用下一个批次条目；正文约 2 KiB，使用包含 `{{related}}` 的有效自定义模板。执行真实 syncByCollections、主事务与 post-commit 补链。校验全部 1304 个文件的 ID、正文、链接去重、批次双向链接、外部目标链接及原有手工文本。重复后处理验证 no-op。

| 补链阶段指标 | 基线 | 改进 |
| --- | ---: | ---: |
| 显式 Vault.read 次数 | 7816 | 1304 |
| Vault.process 次数 | 3907 | 1304 |
| 共享目标显式预读次数 | 2606 | 1 |
| 共享目标 process 次数 | 1303 | 1 |
| 补链耗时 | 23.212 s | 5.143 s |
| 已完整补链后的重复处理耗时 | 4.923 s | 0.229 s |
| 重复处理 process 次数 | 0 | 0 |
| console error / runtime exception | 0 / 0 | 0 / 0 |

显式 read 计数不包含 Vault.process 内部读取；每个真正需要修改的目标仍通过 process 基于最新内容更新。这是同一本机、相同图形结构的单次顺序对比，路径和文件不同，不是统计基准，也不能据此承诺原 issue 的 48 秒会按固定倍数缩短。

另在生产构建中验证：

- 两个成功来源与一个准备失败条目形成待决策批次，确认前没有外部补链；保留后共享目标仅 process 一次，等待期间及原子回调前注入的编辑全部保留。
- 待决策批次回滚后未补链，新增来源删除，原目标字节不变。
- 目标 identity 在预读后变化，仅一条 warning，错误身份文件保持原样，独立目标仍得到全部链接；这是一次预期注入错误，额外 unexpected error 为 0。
- 首个目标完成后取消，不再处理后续目标；补链更新期间重新发起写入始终被 manager gate 拦截。

两组对比及安全场景终态均 idle、无遗留 recovery journal。隔离实例已关闭。本轮未回复 issue、推送、合并或发布。
