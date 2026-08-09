# Development Guide

本文是开发环境、测试、Pull Request 和发布流程的 canonical source。编码细则见[代码规范](CODE_STANDARDS.md)，特定版本验证证据位于 [`../history/releases/`](../history/releases/)。

## Environment

- Node.js 22（以 `package.json` engines 为准）。
- npm 是 canonical package manager；CI、Release 和本文命令统一使用 npm。
- 开发者可以在个人环境使用其他工具，但不得提交与 `package-lock.json` 冲突的锁文件。
- Obsidian Sandbox 用于真实插件运行时和 UI/recovery 故障注入。

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run test
npm run test:watch
npm run build
git diff --check
```

`npm run build` 执行 TypeScript 检查和 production bundle，并把 `main.js`、`manifest.json`、`styles.css` 同步到 `release/`。

## Development workflow

1. 从最新 `adv` 创建 feature、fix 或 docs 分支。
2. 先定位 canonical 文档和现有 pure logic/test 边界。
3. 实现最小范围修改，不绕过 identity check、write gate 或 recovery journal。
4. 运行 targeted tests，再运行完整本地提交闸门。
5. 提交 Pull Request；功能/修复发布时以 `main` 为稳定版集成目标。

不要直接在 `main` 上进行日常开发，不要用 force push 同步 `main` 与 `adv`。

## Test strategy

### Automated tests

Vitest 优先覆盖高风险判断：

- identity/path normalization、collision 和 transaction；
- recovery journal、policy、restart、configuration 和 binary；
- short comment、frontmatter、section 和 document write safety；
- status sync、episode null semantics 和 import merge；
- template registry、custom property classification；
- control panel presentation 和 write gate。

修改 pure logic 时补 targeted tests；修改事务或 recovery 时必须覆盖失败注入和重载行为。

### CI

GitHub Actions 在 Ubuntu 与 Windows 执行：

```text
npm ci → npm run lint → npm run test → npm run build
```

两个平台都通过才可进入稳定版发布。

### Obsidian Sandbox

以下修改需要 production Sandbox：

- UI、命令、设置生命周期和 popout/mobile 行为；
- Vault mutation、路径迁移、binary；
- recovery、插件 reload 和 journal migration；
- 仅自动化测试无法覆盖的 Obsidian API 行为。

部署 `release/main.js`、`release/manifest.json`、`release/styles.css`，重载插件后检查 `obsidian dev:errors` 与 error-level console。使用[回归清单](REGRESSION_CHECKLIST.md)记录场景；具体版本证据归档到 history。

## Documentation workflow

修改前从[文档索引](../README.md)确认 ownership：

- 用户行为：README 或 `docs/user/`；
- 模块边界：Architecture；
- 判断规则：Logic Reference；
- identity/path：Path and ID Model；
- recovery：Recovery Model，用户动作变化时同步 Recovery Guide；
- 历史调试或发布证据：`docs/history/`。

Evergreen 文档描述“当前系统是什么”，不要追加“某版本做了什么”。

## Stable release workflow

正式稳定版采用 main-first 流程：

```text
feature / fix branch
        ↓ Pull Request
      main
        ↓ main CI (Ubuntu + Windows)
freeze release code commit
        ↓
tag → GitHub Release → download and verify assets
        ↓
normal merge main → adv → adv CI
```

### 1. Freeze and validate

- 确认 PR head 未漂移、review threads 和 checks 已完成。
- 在 PR head 运行完整本地闸门和必要 Sandbox。
- 合并到 `main` 后再次确认 main CI 与 production build。
- 版本在 `package.json`、`manifest.json`、`release/manifest.json`、`versions.json` 中一致。

### 2. Tag

Tag 使用纯版本号，不带 `v`：

```bash
git tag -a {版本号} {RELEASE_COMMIT} -m "Bangumi Sync {版本号}"
git push origin {版本号}
```

不得移动或覆盖已发布 Tag。

### 3. GitHub Release

```bash
gh release create {版本号} \
  release/main.js \
  release/manifest.json \
  release/styles.css \
  --title "{版本号}" \
  --notes-file release-notes-{版本号}.md \
  --target {RELEASE_COMMIT}
```

稳定版不使用 `--prerelease`。Release 必须包含三个独立 assets；自动生成 source archives 可以保留。

### 4. Verify assets

下载 Release assets 到临时目录，比较三个文件与冻结 production build 的 SHA-256/内容。检查 Release 非 draft、非 prerelease，target 和 Tag 都指向 release code commit。

### 5. Sync main to adv

先检查 `origin/main..origin/adv`。若 `adv` 只有历史 merge commit且内容可安全合并，沿用正常 merge：

```bash
git switch adv
git pull --ff-only origin adv
git merge --no-ff origin/main -m "chore: sync main to adv after {版本号}"
git push origin adv
```

若 `adv` 有真正独立开发提交或冲突，先审查 divergence；禁止 force push 和未经确认的 rebase。同步后运行本地闸门并等待 adv 双平台 CI。

## Prerelease and explicit adv testing

只有明确的测试版流程才可从测试/`adv` target 创建 prerelease。此时必须：

- 使用未被稳定版占用的纯版本号；
- Tag 与 manifest version 一致；
- 显式 `--prerelease` 和正确 `--target`；
- 不把 prerelease 流程描述为稳定版发布主线。

## High-risk change rules

- 新写入口：接入 `SubjectDocumentService` 身份复核和统一 write gate。
- Recovery 修改：先写可验证事实，更新 Recovery Model、policy tests、restart tests 和 Sandbox。
- Path 修改：只扩展统一 normalization/planner，更新 Path Model。
- Template/custom property 修改：更新 Template Guide 与 Logic Reference。
- Status sync 修改：更新 Status Sync Invariants 和 targeted tests。

## Debugging

1. 在 Obsidian 开启开发者工具。
2. 只使用 `console.debug`、`console.warn`、`console.error`，日志带 `[Bangumi Sync]` 前缀。
3. 使用 Obsidian CLI 重载插件、读取 errors/console 和检查 DOM。
4. 插件数据位于 `.obsidian/plugins/bangumi-sync/`；不要公开 Token 或 recovery journal。

## Pull request checklist

- 变更范围与 PR 描述一致。
- 自动化、targeted tests、build 和 diff check 通过。
- 高风险修改有 Sandbox 证据。
- Production assets 与源码一致。
- Canonical docs 已同步，历史排错过程没有写进 evergreen docs。
- 没有无关依赖升级、版本发布或 Tag 修改。
