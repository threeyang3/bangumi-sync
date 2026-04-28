# Bangumi Sync - Obsidian 插件

同步 Bangumi（番组计划）收藏数据到 Obsidian 笔记。

**GitHub**: https://github.com/threeyang3/bangumi-sync

## 开发命令

```bash
npm install      # 安装依赖
npm run dev      # 开发模式（监听文件变化）
npm run build    # 生产构建
npm run lint     # 本地复现 Obsidian 社区扫描
```

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
│   └── file/              # 文件层（文件管理、图片处理）
├── src/                    # 核心代码
│   ├── api/               # API 客户端扩展
│   ├── sync/              # 同步逻辑
│   ├── template/          # 内容模板处理
│   ├── panel/             # 控制面板
│   ├── settings/          # 设置
│   ├── ui/                # UI 弹窗
│   ├── userData/          # 用户数据保护
│   └── i18n/              # 国际化
└── docs/                   # 文档
    ├── TEMPLATE_GUIDE.md  # 模板设计指南
    ├── VERSION_HISTORY.md # 版本历史
    └── DEVELOPMENT.md     # 开发指南
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

- 提交前至少运行 `npm run lint` 和 `npm run build`
- 本地 ESLint 配置用于尽量复现 Obsidian 社区扫描，不要随意删改 `eslint.config.mjs`

## 同步注意事项

- 收藏更新统一使用 `POST /v0/users/-/collections/{subject_id}`
- 清空云端标签时要显式发送 `tags: []`
- 短评比较前必须先做换行/空白规范化
- 标签解析与状态同步合并都必须走同一套净化逻辑
- 单集状态修改必须同时更新 `ep_statuses` 与正文 `.ep-box`
- 单集状态从云端覆盖本地前必须先清空旧本地状态
- `.ep-box` 解析不要依赖固定属性顺序

详细坑点见 [docs/STATUS_SYNC_PITFALLS.md](docs/STATUS_SYNC_PITFALLS.md)

## 模板变量

详见 [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)

### 常用路径变量

| 变量 | 说明 |
|------|------|
| `{{type}}` | 条目类型（anime/game/novel/comic/album/music/real） |
| `{{name_cn_with_type}}` | 中文名带类型后缀，如 `进击的巨人(动画)` |
| `{{id}}` | 条目 ID |

### 常用内容变量

| 变量 | 说明 |
|------|------|
| `{{my_rate}}` | 我的评分 |
| `{{my_comment}}` | 我的短评 |
| `{{my_tags}}` | 我的标签 |
| `{{related}}` | 相关条目链接 |

### 模板语法

```markdown
{{#if my_rate}}评分: {{my_rate}}{{/if}}
rating: {{rating|未评分}}
```

## 发布流程

详见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

```bash
# 1. 更新版本号（manifest.json, package.json）
# 2. 构建
npm run build

# 3. 创建发布目录
mkdir -p release/v{版本号}
cp main.js manifest.json styles.css release/
cp main.js manifest.json styles.css release/v{版本号}/

# 4. 提交并推送
git add -A && git commit -m "release: v{版本号}"
git push

# 5. 创建 GitHub Release（tag 不带 v 前缀）
gh release create {版本号} ./release/main.js ./release/manifest.json ./release/styles.css --title "v{版本号}" --notes "更新内容"
```

**重要**：Release tag 必须与 manifest.json 版本号一致，不带 `v` 前缀。

## 相关文档

- [模板设计指南](docs/TEMPLATE_GUIDE.md)
- [版本历史](docs/VERSION_HISTORY.md)
- [开发指南](docs/DEVELOPMENT.md)
- [状态同步踩坑记录](docs/STATUS_SYNC_PITFALLS.md)
