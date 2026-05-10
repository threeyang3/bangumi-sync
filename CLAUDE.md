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
    ├── README.md          # 文档总览
    ├── ARCHITECTURE.md    # 项目架构与模块说明
    ├── DEVELOPMENT.md     # 开发指南
    ├── LOGIC_REFERENCE.md # 逻辑判断参考
    ├── TEMPLATE_GUIDE.md  # 模板设计指南
    ├── VERSION_HISTORY.md # 版本历史
    └── STATUS_SYNC_PITFALLS.md # 状态同步踩坑记录
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

- `adv` 分支用于新功能测试，不要直接合并到 `main` 影响正在等待 Obsidian 官方审查的版本
- BRAT 测试版 release 的 tag 必须与 `manifest.json` 里的 `version` 完全一致
- 如果为了测试创建了旧 prerelease，删除时使用 `gh release delete {版本号} --yes --cleanup-tag` 同时清理 tag，避免 BRAT 看到多个入口
- Release notes 要用真正的多行 Markdown，不能把 `\n` 当作字面量写进 `--notes`

### Release 分支指向（targetCommitish）

**关键**：从 `adv` 分支发布时，必须显式指定 `--target adv`，否则 GitHub 默认指向 `main`。

```bash
# 正确：从 adv 分支发布
gh release create {版本号} ./release/main.js ./release/manifest.json ./release/styles.css \
  --title "v{版本号}" --notes "更新内容" --target adv

# 错误：省略 --target 会导致 GitHub 指向 main 分支
# 即使文件是最新的，源码浏览会显示 main 分支的旧代码
```

**后果**：
- Release 页面的"Browse files"会显示错误分支的代码
- GitHub 按 targetCommitish 排序时，版本顺序会混乱
- 用户通过 BRAT 安装时可能获取到错误的源码

**修复已发布 release**：
```bash
gh release edit {版本号} --target adv
```

## 移动端控制面板注意事项

- 移动端判断只按 `activeWindow.matchMedia('(max-width: 767px)')`，不要把触摸屏作为移动端条件，否则触摸屏 Windows 桌面会误走移动端布局
- 桌面端控制面板继续保留表格布局；移动端通过 CSS 媒体查询把表格行改成卡片
- 移动端条目卡片左列放选择框和已同步条目的“打开 / 笔记”按钮，右列放标题、元数据、短评、标签
- 移动端状态栏中 `已选` 计数和加载状态同排显示，分页为“上一页 / 页码 / 下一页”单行布局
- 移动端搜索弹窗使用单行搜索、单行筛选和带封面的紧凑结果卡片；添加/编辑按钮在元数据行右侧，不挤占标题行
- 滑动关闭只在 `.bangumi-panel-table` 滚动到顶部时启用，避免列表滚动时误关闭面板

## 同步注意事项

- 收藏更新统一使用 `POST /v0/users/-/collections/{subject_id}`
- 收藏状态查询不能再使用 `/v0/users/-/collections/{subject_id}`，必须先拿真实用户名再查询 `/v0/users/{username}/collections/{subject_id}`
- 清空云端标签时要显式发送 `tags: []`
- 短评比较前必须先做换行/空白规范化
- 标签解析与状态同步合并都必须走同一套净化逻辑
- 单集状态修改必须同时更新 `ep_statuses` 与正文 `.ep-box`
- 单集状态从云端覆盖本地前必须先清空旧本地状态
- `.ep-box` 解析不要依赖固定属性顺序

## 自定义属性注意事项

- 本地自定义属性必须统一走 `src/template/templateProperties.ts`
- 逻辑顺序必须是“先取模板 frontmatter 全部属性，再过滤掉 Bangumi / 同步流程可自动填充的字段”
- 评分明细不再是单独的数据通道；除兼容旧模板外，应与其他自定义属性同等处理
- 列表型自定义属性使用 `[]` 作为模板默认值，并在 UI 中按英文逗号拆分为数组
- 快速同步 / 自动同步不弹自定义属性窗口，只能使用模板默认值或空值
- 导出 / 导入 / 强制同步继承必须统一保留三部分：辨识属性、自定义属性、记录/感想

详细坑点见 [docs/STATUS_SYNC_PITFALLS.md](docs/STATUS_SYNC_PITFALLS.md)

## 共享笔记注意事项

- 条目文件默认不要自动写入 `笔记` 属性，只能按需创建/追加共享笔记
- 共享笔记 frontmatter 使用 `笔记ID`，并保持为 YAML 多行列表
- 共享笔记检索应扫描本地笔记的 `笔记ID` 是否包含当前条目 ID，不要只按路径模板范围猜测
- 汇聚共享笔记 ID 时优先走本地 `相关` 属性链接图，不要依赖逐条网络探测收藏状态

## 模板变量

详见 [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)

### 常用路径变量

| 变量 | 说明 |
|------|------|
| `{{type}}` | 条目类型大类（小写，如 book/anime/music/game/real） |
| `{{typeId}}` | 条目类型编号（1/2/3/4/6） |
| `{{category}}` | 细分类别（如小说/漫画/画集/绘本/公式书/写真/TV/电影） |
| `{{platform}}` | Bangumi API 平台字段（如"公式书"、"TV"、"电影"） |
| `{{name_cn_with_type}}` | 中文名带类别后缀，如 `进击的巨人(漫画)` |
| `{{id}}` | 条目 ID |

### 常用内容变量

| 变量 | 说明 |
|------|------|
| `{{type}}` | 条目类型大类（小写，如 book/anime/music/game/real） |
| `{{typeLabel}}` | 条目类型细分标签（首字母大写，如 Novel/Comic/Album） |
| `{{typeId}}` | 条目类型编号 |
| `{{category}}` | 条目细分类别 |
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

- GitHub Release notes 默认使用中文
- Release notes 按 `新功能`、`改进`、`修复` 三部分组织
- 某一部分没有内容时不要保留空标题
- Release notes 必须使用真正的多行 Markdown 列表，不要把 `\n` 当作字面量写入单段文本
- GitHub 相关步骤默认先尝试 `gh`

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

# 5. 使用 gh 创建 GitHub Release（tag 不带 v 前缀）
gh release create {版本号} ./release/main.js ./release/manifest.json ./release/styles.css --title "v{版本号}" --notes "更新内容"
```

**重要**：Release tag 必须与 manifest.json 版本号一致，不带 `v` 前缀。

## 相关文档

- [模板设计指南](docs/TEMPLATE_GUIDE.md)
- [版本历史](docs/VERSION_HISTORY.md)
- [开发指南](docs/DEVELOPMENT.md)
- [状态同步踩坑记录](docs/STATUS_SYNC_PITFALLS.md)
