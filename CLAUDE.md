# Bangumi Sync - Obsidian 插件

同步 Bangumi（番组计划）收藏数据到 Obsidian 笔记。

**GitHub**: https://github.com/threeyang3/bangumi-sync

## 开发命令

```bash
npm ci           # 按 package-lock.json 安装依赖
npm run dev      # 开发模式（监听文件变化）
npm run lint     # 本地复现 Obsidian 社区扫描
npm run test     # 完整自动化测试
npm run build    # 生产构建
git diff --check
```

npm 是 CI、Release 和 canonical instructions 使用的 package manager。

## 项目结构

```
bangumi/
├── main.ts                 # 插件入口
├── manifest.json           # 插件清单
├── styles.css              # 插件样式
├── common/                 # 共享模块
│   ├── api/               # API 层（类型、端点、客户端）
│   ├── parser/            # 解析层（条目、角色、章节）
│   ├── template/          # 模板层（默认模板、路径处理）
│   ├── file/              # 文件层（文件管理、图片处理）
│   └── utils/             # 通用工具（frontmatter、计时、值处理）
├── src/                    # 核心代码
│   ├── api/               # API 客户端扩展
│   ├── sync/              # 同步逻辑
│   ├── template/          # 内容模板处理
│   │   └── templateProperties.ts # 模板 frontmatter 属性解析与分类
│   ├── panel/             # 控制面板
│   ├── settings/          # 设置
│   ├── ui/                # UI 弹窗
│   ├── userData/          # 用户数据保护
│   ├── episode/           # 单集功能（评论、状态、右键菜单）
│   ├── note/              # 条目笔记管理
│   ├── i18n/              # 国际化
│   └── utils/             # 移动端工具
└── docs/                   # 文档
    ├── README.md          # 文档索引与 canonical ownership
    ├── user/              # 用户操作：模板、迁移、恢复
    ├── maintainer/        # 架构、逻辑、路径、恢复、开发、规范
    ├── history/           # 版本证据、旧迁移、坑点、设计计划
    └── VERSION_HISTORY.md # 简洁版本索引
```

## 编码规范

### TypeScript

- 使用严格模式（`strict: true`）
- 私有成员使用 `private` 修饰符
- 异步操作使用 `async/await`
- 错误处理使用 try-catch 并记录日志

### Obsidian API

- 文件更新使用 `vault.process()` 而非 `vault.modify()`
- 使用 `requestUrl` 而非 `fetch`
- 定时器使用 `activeWindow.setTimeout`
- 创建元素使用 `activeDocument.createElement`
- 插件入口必须默认导出插件类，避免 `h is not a constructor`
- 代码使用的 API 必须与 `manifest.json` 的 `minAppVersion` 对齐
- 跨窗口 DOM 判断优先使用 `.instanceOf(...)`

### 代码风格

- 函数和类添加 JSDoc 注释
- 避免不必要的注释，只在 WHY 非显而易见时添加
- 不要添加 `as any` 类型断言
- 移除未使用的导入和变量

### 日志

- 使用 `console.debug()`、`console.warn()`、`console.error()`
- 不使用 `console.log()`
- 日志前缀：`[Bangumi Sync]`

## 提交前检查

- 提交前至少运行 `npm run lint`、`npm run test`、`npm run build` 和 `git diff --check`
- 本地 ESLint 配置用于尽量复现 Obsidian 社区扫描，不要随意删改 `eslint.config.mjs`
- 高风险修改还需要 targeted tests 和 production Obsidian Sandbox

## GitHub 操作约定

- 以后默认优先使用 `gh` 完成 GitHub 相关操作
- 包括但不限于：
  - 检查认证状态
  - 查看仓库 / release / tag 信息
  - 创建 release
  - 需要时通过 GitHub API 辅助排查远端问题
- `git` 仍用于本地版本控制操作，例如：
  - `git status`
  - `git add`
  - `git commit`
  - `git push`
- 如果 `git push` 与 GitHub 的 HTTPS / TLS 通道异常，而 `gh` 仍可访问 GitHub API，优先继续尝试 `gh` 路径或调整 git 后端，而不是直接放弃同步

## 测试分支发布注意事项

- `adv` 用于持续开发与测试；稳定版不能从 `adv` 直接绕过 `main` 发布。
- BRAT 测试版 tag 必须与 `manifest.json` 版本完全一致，并使用未被稳定版占用的版本号。
- 只有明确 prerelease 才使用 `--target adv --prerelease`。
- 删除旧 prerelease 时使用 `gh release delete {版本号} --yes --cleanup-tag` 同时清理 tag。
- Release notes 使用真正的多行 Markdown，不能把 `\n` 当作字面量写入。

### Release 分支指向（targetCommitish）

稳定版 target 应是冻结的 `main` release code commit。只有显式测试版从 `adv` 发布时才使用 `--target adv`。

```bash
# 仅限明确的 adv prerelease
gh release create {版本号} ./release/main.js ./release/manifest.json ./release/styles.css \
  --title "{版本号}" --notes-file release-notes-{版本号}.md \
  --target adv --prerelease

# 稳定版见 docs/maintainer/DEVELOPMENT.md，target 为冻结 commit
```

创建 Release 后必须核对 `targetCommitish`、Tag target 和下载 assets hash；发现错误时停止并报告，不移动已有 Tag。

## 移动端控制面板注意事项

- 移动端判断只按 `activeWindow.matchMedia('(max-width: 767px)')`，不要把触摸屏作为移动端条件，否则触摸屏 Windows 桌面会误走移动端布局
- 桌面端控制面板继续保留表格布局；移动端通过 CSS 媒体查询把表格行改成卡片
- 移动端条目卡片左列放选择框和已同步条目的“打开 / 笔记”按钮，右列放标题、元数据、短评、标签
- 移动端状态栏中 `已选` 计数和加载状态同排显示，分页为“上一页 / 页码 / 下一页”单行布局
- 移动端搜索弹窗使用单行搜索、单行筛选和带封面的紧凑结果卡片；添加/编辑按钮在元数据行右侧，不挤占标题行
- 滑动关闭只在 `.bangumi-panel-table` 滚动到顶部时启用，避免列表滚动时误关闭面板

## 同步注意事项

- 收藏更新统一使用 `POST /v0/users/-/collections/{subject_id}`
- 本地 -> 云端的评分 / 短评 / 标签 / 收藏状态应尽量合并成一次 `updateCollection`，不要按字段拆成多次请求
- 收藏状态查询不能再使用 `/v0/users/-/collections/{subject_id}`，必须先拿真实用户名再查询 `/v0/users/{username}/collections/{subject_id}`
- 清空云端标签时要显式发送 `tags: []`
- 短评比较前必须先做换行/空白规范化
- 标签解析与状态同步合并都必须走同一套净化逻辑
- 单集状态修改必须同时更新 `ep_statuses` 与正文 `.ep-box`
- 单集状态从云端覆盖本地前必须先清空旧本地状态
- `.ep-box` 解析不要依赖固定属性顺序
- Bangumi OpenAPI 的 `updated_at` 不能当作可靠的用户收藏修改水位；官方说明它不会稳定覆盖评分、短评、标签、章节状态等修改
- “检查并同步状态”当前采用本地预热缓存 + 本轮内存缓存提速，而不是依赖不可靠的云端时间戳跳过对比

## 自定义属性注意事项

- 本地自定义属性必须统一走 `src/template/templateProperties.ts`
- 逻辑顺序必须是“先取模板 frontmatter 全部属性，再过滤掉 Bangumi / 同步流程可自动填充的字段”
- 评分明细不再是单独的数据通道；除兼容旧模板外，应与其他自定义属性同等处理
- 列表型自定义属性使用 `[]` 作为模板默认值，并在 UI 中按英文逗号拆分为数组
- 快速同步 / 自动同步不弹自定义属性窗口，只能使用模板默认值或空值
- 导出 / 导入 / 强制同步继承都要按同一套用户数据分层思考：辨识属性、用户属性、自定义属性、正文内容
- 本地 `短评` 的真实来源是正文 `> [!abstract]+ **短评**` callout；状态同步、导入对比、导出提取都必须读取同一处

当前不变量见 [docs/maintainer/STATUS_SYNC_INVARIANTS.md](docs/maintainer/STATUS_SYNC_INVARIANTS.md)，历史根因见 [docs/history/pitfalls/status-sync-2026-04.md](docs/history/pitfalls/status-sync-2026-04.md)。

## 共享笔记注意事项

- 条目文件默认不要自动写入 `笔记` 属性，只能按需创建/追加共享笔记
- 共享笔记 frontmatter 使用 `笔记ID`，并保持为 YAML 多行列表
- 共享笔记检索应扫描本地笔记的 `笔记ID` 是否包含当前条目 ID，不要只按路径模板范围猜测
- 汇聚共享笔记 ID 时优先走本地 `相关` 属性链接图，不要依赖逐条网络探测收藏状态

## 模板变量

完整模板来源、变量、语法、默认值和自定义属性只在 [docs/user/TEMPLATE_GUIDE.md](docs/user/TEMPLATE_GUIDE.md) 维护。改变字段分类时同时检查 `src/template/templateProperties.ts` 和 [docs/maintainer/LOGIC_REFERENCE.md](docs/maintainer/LOGIC_REFERENCE.md)。

## 发布流程

详见 [docs/maintainer/DEVELOPMENT.md](docs/maintainer/DEVELOPMENT.md)。稳定版流程固定为 PR → `main` → main CI → Tag → GitHub Release → assets verification → `main` merge 到 `adv` → adv CI。

- GitHub Release notes 默认使用中文
- Release notes 按 `新功能`、`改进`、`修复` 三部分组织
- 某一部分没有内容时不要保留空标题
- Release notes 必须使用真正的多行 Markdown 列表，不要把 `\n` 当作字面量写入单段文本
- GitHub 相关步骤默认先尝试 `gh`

Release tag 必须与 manifest version 一致且不带 `v`。稳定版 target 使用已验证的 release code commit，不使用 `--target adv`。

## 相关文档

- [文档索引](docs/README.md)
- [模板指南](docs/user/TEMPLATE_GUIDE.md)
- [版本历史](docs/VERSION_HISTORY.md)
- [开发指南](docs/maintainer/DEVELOPMENT.md)
- [架构](docs/maintainer/ARCHITECTURE.md)
- [恢复模型](docs/maintainer/RECOVERY_MODEL.md)

## 文档维护规则

- 用户可见行为 → README 或 `docs/user/`
- 模板 → Template Guide
- 模块边界 → Architecture
- 判断规则 → Logic Reference
- 身份 / 路径 → Path and ID Model
- Recovery 内部模型 → Recovery Model；用户动作变化时同步 Recovery Guide
- 开发 / Release → Development
- 特定版本验证和历史调试 → `docs/history/`，不要追加到 evergreen docs
