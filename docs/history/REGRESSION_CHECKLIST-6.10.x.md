# 6.10.x 历史回归范围

此页归档 6.10.x 的事务与恢复人工回归主题，不再作为当前发布门槛。

- 6.10.0：Bangumi ID 唯一身份、同名碰撞、路径迁移与基础文件事务。
- 6.10.1：路径分隔符规范化、prepare/render/commit 管线与写入失败回滚。
- 6.10.2：部分成功的显式保留/回滚、碰撞组隔离、路径状态事务。
- 6.10.3：原子决策、终态统计、回滚失败上下文和恢复写门禁。
- 6.10.4：Recovery Center、人工恢复诊断、动作互斥和多窗口状态。
- 6.10.5：稳定 manager、配置 lease、固定 scan root、内容指纹与 concrete created path。
- 6.11.0 已加入持久 journal 与跨重启恢复；“跨重启恢复仍属于 Issue #5”从 6.11.1 当前清单中删除。

历史检查重点包括 absent/present 身份矩阵、重复 ID、temporary file、CRLF/LF、scan root 外路径、相关链接延迟提交、结果统计及所有 Vault 写入口门禁。当前实现与发布验收以 [../REGRESSION_CHECKLIST.md](../REGRESSION_CHECKLIST.md) 为准。
