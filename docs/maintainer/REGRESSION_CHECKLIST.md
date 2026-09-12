# Regression Checklist

这是可复用验证模板，不记录具体版本、commit、CI run 或 production hash。特定发布证据应复制到 [`../history/releases/`](../history/releases/) 并填写实际结果。

## Automated

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] 相关 targeted tests

## Core flows

- [ ] 普通收藏同步
- [ ] 强制同步与本地数据保护
- [ ] 搜索并添加
- [ ] 状态同步
- [ ] 用户数据导入 / 导出
- [ ] 路径诊断、预览和迁移
- [ ] 封面下载与 Markdown 引用更新

## High-risk transaction flows

- [ ] 取消或失败后的 rollback
- [ ] 部分成功后的 Commit / rollback 决策
- [ ] rollback failure 保持 gate
- [ ] 插件重载后恢复同一 journal
- [ ] terminal marker 后只允许 cleanup
- [ ] configuration recovery
- [ ] binary create/update uncertain mutation
- [ ] orphan temporary / corrupt journal
- [ ] legacy journal migration 和 safe staging
- [ ] secret canary 搜索为 0

## Sandbox

- [ ] 使用 production `main.js`、`manifest.json`、`styles.css`
- [ ] Reload plugin 成功
- [ ] 正常同步和高风险 targeted scenarios 通过
- [ ] `obsidian dev:errors` 为 0
- [ ] error-level console 为 0
- [ ] 最终 manager state 与 journal 文件数符合预期

## Release

- [ ] Release PR 合并到 `main`
- [ ] `main` Ubuntu CI 与 Windows CI 通过
- [ ] Tag 不带 `v`，且指向冻结的 release code commit
- [ ] GitHub Release 非 draft、非 prerelease（稳定版）
- [ ] Release 包含 `main.js`、`manifest.json`、`styles.css`
- [ ] 下载 assets 与 production build hash 一致
- [ ] `main` 正常 merge 到 `adv`，没有 force push
- [ ] `adv` Ubuntu CI 与 Windows CI 通过

## Documentation

- [ ] Release notes 与最终实现一致
- [ ] Migration / Recovery / Template 等受影响 canonical docs 已更新
- [ ] 特定版本验证证据归档到 `history/releases/`
- [ ] GitHub Release 是最终对外版本事实
