# 6.11.2 当前发布回归清单

本文件记录 6.11.2 的发布门槛。6.10.x 历史项目见 [history/REGRESSION_CHECKLIST-6.10.x.md](./history/REGRESSION_CHECKLIST-6.10.x.md)。

## 代码与自动测试

- [x] terminal marker 写入失败使用 `journal-finalization-failed`，只允许 Retry rollback 和 Rescan。
- [x] Commit/rollback marker 已写入但 cleanup 失败使用 `journal-cleanup-failed`，只允许 Retry cleanup 和 Rescan。
- [x] 启动读取 `committed-cleanup-pending` 或 `rolled-back-cleanup-pending` 时不再开放 rollback。
- [x] legacy temp 迁移使用独立 `.bangumi-sync-recovery.migration.tmp.json` staging，不覆盖唯一 source。
- [x] staging write、partial write、重读、结构校验、source remove、promotion 和 promotion 后校验故障均保留完整候选。
- [x] source 恢复失败时保留有效安全 staging，下次启动可以继续加载。
- [x] temp-only legacy migration 首次失败、Retry 成功后提升为 current 并进入 configuration recovery。
- [x] current、previous、temp legacy journal 在 backup 前脱敏。
- [x] `blockingIssue`、error details、warnings、attempt error 和 diagnostics message 中的已知 secret 被递归清理。
- [x] 批量封面 `{0,0,1}` 选择 failed notice，不选择 no-items 或 complete。
- [x] recovery active 时批量封面 notice 明确提示 Recovery Center。
- [x] `{0,0,0}` 仍显示 no-items，成功结果仍显示 complete。
- [x] Recovery Guide 动作矩阵与 `getRecoveryActionPolicy()` 一致。
- [x] 最终 `npm ci`、lint、TypeScript、完整测试（36 files / 265 tests）、build 和 `git diff --check` 全部通过。
- [ ] PR #15 最新 head 的 Ubuntu CI 通过。
- [ ] PR #15 最新 head 的 Windows CI 通过。

## 最终 Sandbox

- [ ] 使用最终 production `main.js`、`manifest.json`、`styles.css`。
- [ ] Commit cleanup failure 只显示 Retry cleanup；直接 rollback 被拒绝，cleanup 成功后 manager idle。
- [ ] legacy temp staging partial-write failure 不破坏最后完整候选，也不产生新的 canary 副本。
- [ ] temp-only migration 首次失败、reload、Retry 后进入 `configuration-rollback-failed`。
- [ ] whole-journal canary 迁移后全 Vault 搜索为 0。
- [ ] 批量封面 `{0,0,1}` 显示失败数量；recovery active 时提示 Recovery Center。
- [ ] 记录 Obsidian 版本、代码 commit、production SHA-256、按钮、journal/file/manager 状态、notice、console error 和 canary 搜索结果。

## 合并后检查

- [ ] PR #15 已完成最终审查并合并到 `main`。
- [ ] `main` CI 通过。
- [ ] 合并 commit 与最终审查版本一致。

## 发布后检查

- [ ] Tag `6.11.2` 指向最终 `main` commit。
- [ ] Release target 为正确发布分支。
- [ ] Release 包含同一次构建的 `main.js`、`manifest.json`、`styles.css`。
- [ ] Release assets SHA-256 与已验证 production build 一致。
- [ ] `main` 已同步到 `adv`。

本轮稳定化提交阶段不得勾选合并后或发布后项目；PR #15 保持未合并，6.11.2 保持未发布。
