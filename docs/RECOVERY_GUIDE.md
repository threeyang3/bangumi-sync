# 恢复指南

Bangumi Sync 6.11.0 在首次 Vault 修改前写入根目录 `.bangumi-sync-recovery.json`。它保存批次前内容、Subject ID、路径状态、具体创建路径、rename 阶段、封面资源与恢复尝试，不包含 Access Token。正常提交、完整回滚或人工验证通过后才删除。

## 启动时进入恢复状态

插件检测到以下任一情况时会阻止所有 Vault 写入口：

- 未完成或 rollback-failed journal；
- 无法解析或 schema 不支持的 journal；
- Vault 任意目录中的 `.bangumi-sync-*.tmp.md`。

损坏 journal 会先备份为 `.bangumi-sync-recovery.corrupt-<timestamp>.json`，不会静默删除。孤立 temporary file 也不会自动删除。

## 推荐处理顺序

1. 从命令面板打开“Bangumi Sync: 打开恢复中心”。
2. 先选择“重试回滚”。插件会按 journal 恢复原内容、原路径和路径状态，并删除本批次创建且未被 Markdown 引用的封面。
3. 如果仍失败，查看 operation、path、message 和诊断列表，备份相关文件后手工修复。
4. 手工修复完成后选择“重新扫描”；没有 temporary、重复 ID、内容/路径不匹配或资源残留时，再执行“确认人工恢复”。
5. 只有当前诊断为零且原路径状态重新持久化成功，门禁和 journal 才会清除。

不要仅修改残留文件的 frontmatter ID 来绕过检查。created path、rename original/temporary/final、封面资源和原始内容 SHA-256 都会独立验证。CRLF 与 LF 被视为不同内容。

## 损坏 journal

保留 `.corrupt-*.json` 供诊断。当前阻断 journal 带有损坏原因，不能靠普通同步覆盖。如果自动恢复没有足够事实，请先备份 Vault，核对临时文件、最近创建/改名文件和路径状态；完成明确人工处理后再移除阻断文件并重载插件。

## 安全边界

恢复诊断只读取本地 Vault，不请求 Bangumi API。Recovery Center、SyncModal 和控制面板订阅同一 manager 状态；恢复或配置更新期间旧窗口不能继续执行写操作。
