# Agent Instructions - Bangumi Sync

## Browser and CI usage

- 网页预览、交互与截图使用 ChatGPT 内置浏览器（`cua_repl`），默认后台运行；禁止启动或控制外部 Chrome／Chromium 可执行程序。硬编码 Chrome 的测试步骤应跳过并说明限制，不修改用户安装的软件。
- 先本地验证，再批量提交相关修改；推送或手动触发 CI 前检查工作流触发条件，避免空提交、重复派发和使用 CI 调试中间版本。
- 文档修改优先检查链接、图片及实际呈现；保留现有必需的安全、合并和发布检查。失败先调查，有依据时仅重试必要的失败任务，不绕过配额或提高预算。

## Branch and release safety

- 日常开发从 `adv` 创建独立 feature、fix 或 docs 分支。
- 稳定版发布采用 main-first：PR → `main` → main CI → Tag → GitHub Release → assets verification → `main` 正常 merge 到 `adv` → adv CI。
- Tag 使用纯版本号，不带 `v`，且不得移动已发布 Tag。
- Release 必须上传 `release/main.js`、`release/manifest.json`、`release/styles.css` 并验证下载 hash。
- 只有明确 prerelease / BRAT 测试才从 `adv` target 发布；此时必须显式 `--target adv --prerelease`。
- 禁止用 force push 同步 `main` 与 `adv`。

完整流程见 [`docs/maintainer/DEVELOPMENT.md`](docs/maintainer/DEVELOPMENT.md)。

## Local gate

```bash
npm ci
npm run lint
npm run test
npm run build
npm run docs:check
git diff --check
```

高风险事务、recovery、路径、binary、设置或 UI 修改还需要 targeted tests 和 production Obsidian Sandbox。

## Documentation ownership

修改代码或流程时更新唯一 canonical source：

- 用户可见功能 → `README.md` 或 `docs/user/`
- 模板能力 → `docs/user/TEMPLATE_GUIDE.md`
- 当前升级行为 → `docs/user/MIGRATION_GUIDE.md`
- 用户恢复动作 → `docs/user/RECOVERY_GUIDE.md`
- 模块边界 → `docs/maintainer/ARCHITECTURE.md`
- 判断规则 → `docs/maintainer/LOGIC_REFERENCE.md`
- 身份 / 路径 → `docs/maintainer/PATH_AND_ID_MODEL.md`
- recovery 内部模型 → `docs/maintainer/RECOVERY_MODEL.md`
- 状态同步不变量 → `docs/maintainer/STATUS_SYNC_INVARIANTS.md`
- 代码规则 → `docs/maintainer/CODE_STANDARDS.md`
- 开发 / release → `docs/maintainer/DEVELOPMENT.md`
- 版本验证、调试过程和旧设计 → `docs/history/`

不要把具体版本 SHA、Sandbox 证据或旧 bug 过程追加到 evergreen 文档。历史文档不得当作当前实现契约。

## Runtime safety

- Subject ID 是身份，路径和标题不是身份。
- 新 Vault 写入口必须经过 identity-safe document service 与统一 write gate。
- Recovery journal 必须先于首次 mutation；不能静默清理未验证 journal。
- 不记录或公开 Token、authorization、完整 recovery journal 或用户私密正文。

项目文档导航见 [`docs/README.md`](docs/README.md)。
