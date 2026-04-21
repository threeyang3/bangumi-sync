# Bangumi Sync - Obsidian 插件

## 项目概述

这是一个 Obsidian 插件，用于从 Bangumi（番组计划）平台同步用户收藏数据到 Obsidian 笔记中。支持增量同步、自定义模板、自动同步等功能。

**GitHub 仓库**: https://github.com/threeyang3/bangumi-sync

**作者**: threeyang

## 版本说明

当前版本集成了以下功能：

- **集数追踪**：自动获取并显示动画集数、小说卷数、漫画话数
- **紧凑显示**：集数以数字框形式显示，节省空间
- **悬浮提示**：鼠标悬浮显示集数标题、放送日期、时长
- **观看状态**：已看集数高亮显示，与 Bangumi 同步
- **控制面板**：查询并展示用户所有收藏条目
- **同步状态标记**：对照本地目录，标记条目是否已同步
- **标签显示**：列表中显示用户标签（最多3个）
- **短评显示**：列表中显示云端短评（最多20字）
- **同步选中**：在面板中选中未同步条目后可直接同步，保留用户数据
- **强制同步**：覆盖已存在的本地文件
- **删除本地文件**：从面板中删除已同步的条目（移动到回收站）
- **批量编辑**：选择多个条目统一新增/修改/删除 frontmatter 属性
- **撤销支持**：批量编辑支持撤销操作（最多10步）
- **打开本地文件**：在控制面板中直接打开已同步的本地文件
- **短评双向同步**：对比本地与云端短评差异，选择保留哪个版本
- **模板增强**：支持条件渲染 `{{#if}}` 和默认值 `{{var|default}}`
- **快捷键**：默认快捷键支持，控制面板键盘导航
- **冲突处理**：检测本地与云端数据冲突，提供解决选项
- **图片管理**：支持选择图片质量、更新已存在图片
- **扫描本地文件夹**：检测已同步条目（不依赖缓存）
- **用户标签**：使用用户自己的标签，如果没有则留空
- **智能数量限制**：如果未同步数量不够，同步所有未同步的条目
- **手动同步预览**：导入前可预览条目列表，勾选要导入的条目
- **评分明细输入**：手动同步时可在弹窗中填写评分明细

## 技术栈

- **语言**: TypeScript
- **构建工具**: esbuild
- **目标平台**: Obsidian (桌面端和移动端)
- **API**: Bangumi API v0 (https://api.bgm.tv)

## 项目结构

```
bangumi/
├── CLAUDE.md                  # 项目说明文档
├── package.json               # NPM 配置
├── tsconfig.json              # TypeScript 配置
├── esbuild.config.mjs         # 构建配置
├── main.ts                    # 插件入口
├── main.js                    # 编译输出
├── manifest.json              # 插件清单
├── styles.css                 # 插件样式
│
├── src/                       # 源代码
│   ├── api/                   # API 层
│   │   └── client.ts          # API 客户端
│   ├── sync/                  # 同步层
│   │   ├── syncManager.ts     # 同步管理器
│   │   ├── incrementalSync.ts # 增量同步
│   │   └── syncStatus.ts      # 同步状态
│   ├── template/              # 模板层
│   │   └── contentTemplate.ts # 内容模板（支持条件渲染、默认值）
│   ├── file/                  # 文件层
│   │   └── fileManager.ts     # 文件管理器
│   ├── panel/                 # 控制面板层
│   │   ├── controlPanel.ts    # 控制面板主类（支持键盘导航）
│   │   ├── batchEditorModal.ts # 批量编辑器
│   │   ├── commentSyncModal.ts # 短评同步弹窗
│   │   ├── tagSyncModal.ts    # 标签同步弹窗
│   │   └── conflictResolver.ts # 冲突解决器
│   ├── settings/              # 设置层
│   │   ├── settings.ts        # 设置数据结构
│   │   └── settingsTab.ts     # 设置面板 UI
│   └── ui/                    # UI 层
│       ├── syncModal.ts       # 同步进度弹窗
│       ├── syncOptionsModal.ts # 同步选项弹窗
│       └── syncPreviewModal.ts # 同步预览弹窗
│
├── docs/                      # 文档目录
│   └── TEMPLATE_GUIDE.md      # 模板设计指南
│
├── release/                   # 发布目录
│   ├── main.js                # 最新版本插件文件
│   ├── manifest.json          # 最新版本清单
│   ├── styles.css             # 最新版本样式
│   └── v4.1.0/                # 历史版本存档
│       ├── main.js
│       ├── manifest.json
│       └── styles.css
│
├── archives/                  # 历史版本压缩包
│   ├── bangumi-sync-v1.zip
│   ├── bangumi-sync-v2.zip
│   ├── bangumi-sync-v3.x.zip
│   ├── bangumi-sync-v4.0.0.zip
│   └── bangumi-sync-v4.1.0.zip
│
└── common/                    # 共享模块
    ├── api/                   # 共享 API 模块
    │   ├── types.ts           # 类型定义
    │   ├── endpoints.ts       # API 端点常量
    │   └── client.ts          # 基础 API 客户端
    ├── parser/                # 共享解析模块
    │   ├── infoboxParser.ts   # 条目信息解析
    │   ├── characterParser.ts # 角色信息解析
    │   └── episodeParser.ts   # 章节信息解析
    ├── template/              # 共享模板模块
    │   ├── defaultTemplates.ts # 默认模板定义
    │   └── pathTemplate.ts    # 路径模板处理
    └── file/                  # 共享文件模块
        ├── fileManager.ts     # 文件管理器
        └── imageHandler.ts    # 图片处理器
```

## 用户使用流程

### 1. 配置 Access Token

首次使用需要在设置中配置 Bangumi Access Token：
1. 访问 https://next.bgm.tv/demo/access-token 生成 Token
2. 在 Obsidian 设置中找到 "Bangumi Sync"
3. 粘贴 Access Token

### 2. 执行同步

点击 Ribbon 图标或使用命令 "同步 Bangumi 收藏"，会弹出**同步选项弹窗**：

#### 条目类型选择
- 动画
- 游戏
- 书籍
- 音乐
- 三次元
- 提供"全选"/"全不选"快捷按钮

#### 收藏状态选择
- 想看
- 在看
- 看过
- 搁置
- 抛弃
- 提供"全选"/"全不选"快捷按钮

#### 同步数量限制
- 输入框设置每次同步的最大条目数（0 表示不限制）

#### 强制同步选项
- 开关控制是否忽略已存在的条目重新同步

### 3. 同步预览

手动同步时会显示**预览确认弹窗**：

- 列出所有待同步的条目
- 每个条目可勾选/取消勾选
- 可填写评分明细（音乐、人设、剧情、美术等）
- 提供快捷按钮：全选、全不选、反选
- 三种导入方式：
  - **全部导入**：导入所有条目（忽略勾选状态）
  - **只导入选中的**：只导入勾选的条目
  - **只导入未选中的**：只导入未勾选的条目

### 4. 自动同步

自动同步模式下：
- 不显示预览弹窗
- 直接导入所有待同步条目
- 评分明细字段留空

### 5. 命令列表

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| 同步 Bangumi 收藏 | `Ctrl+Shift+S` | 打开同步选项弹窗 |
| 快速同步（使用默认设置） | `Ctrl+Shift+Q` | 自动同步模式 |
| 打开控制面板 | `Ctrl+Shift+B` | 打开收藏管理控制面板 |

### 6. 控制面板

控制面板功能：

#### 功能概述
- 展示用户所有收藏条目（不加载封面图片，加载速度快）
- 标记每个条目的同步状态（已同步/未同步）
- 支持筛选：按类型、收藏状态、同步状态
- 支持关键词搜索
- 支持分页浏览（每页50条）

#### 同步选中
- 选择未同步的条目，点击"同步选中"按钮
- 同步时保留用户数据：评分、收藏状态、短评、标签等
- 同步完成后自动刷新面板状态

#### 批量操作
- 选择多个已同步条目
- 批量新增 frontmatter 属性
- 批量修改 frontmatter 属性
- 批量删除 frontmatter 属性
- 支持撤销操作（最多10步）

#### 打开文件
- 在控制面板中直接打开已同步的本地文件

### 7. 模板设置

在设置面板中，可以为每种条目类型配置模板：

#### 模板来源选项
- **默认模板**: 使用插件内置的默认模板
- **从文件选择**: 从 Obsidian 库中选择 `.md` 文件作为模板
- **自定义内容**: 在弹窗中直接编辑模板内容

#### 支持的模板类型
- 动画模板
- 小说模板
- 漫画模板
- 游戏模板
- 画集模板
- 音乐模板
- 三次元模板

### 8. 路径设置

在设置面板中可以自定义文件保存路径：

- **文件路径模板**: 支持 `{{type}}`, `{{category}}`, `{{name}}`, `{{name_cn}}`, `{{year}}`, `{{author}}`, `{{id}}` 变量
- 实时预览路径效果
- **图片路径模板**: 支持 `{{id}}`, `{{name_cn}}`, `{{name}}`, `{{typeLabel}}` 变量
  - 示例：`ACGN/assets/{{name_cn}}_{{typeLabel}}.jpg` → `ACGN/assets/进击的巨人_Anime.jpg`

## 核心模块说明

### 共享 API 层 (`common/api/`)

- **types.ts**: 基于 Bangumi OpenAPI 规范的类型定义
  - `SubjectType` - 条目类型枚举
  - `CollectionType` - 收藏类型枚举
  - `Subject` - 条目数据结构
  - `UserCollection` - 用户收藏数据结构
  - `Episode` - 章节数据结构
  - `UserEpisodeCollection` - 用户章节收藏状态
- **endpoints.ts**: API 端点常量
- **client.ts**: 基础 API 客户端

### 共享解析层 (`common/parser/`)

- **infoboxParser.ts**: 从 Bangumi API 返回的 infobox 中解析各类型条目的特定字段
  - `parseInfoByType()` - 根据条目类型解析 infobox
  - `parseDate()` - 解析日期
  - `cleanSummary()` - 清理简介文本
  - `cleanMultilineText()` - 清理多行文本（用于短评等字段）
- **characterParser.ts**: 解析角色信息（最多9个角色）
- **episodeParser.ts**: 解析章节信息
  - `parseEpisodes()` - 生成集数显示内容
  - `generateEpisodeBox()` - 生成单个集数框 HTML
  - `createUserStatusMap()` - 创建用户章节状态映射

### 共享模板层 (`common/template/`)

- **defaultTemplates.ts**: 各类型默认模板（动画/小说/漫画/游戏/画集/音乐/三次元）
- **pathTemplate.ts**: 路径模板处理，支持 `{{type}}`, `{{category}}`, `{{name_cn}}` 等变量

### 共享文件层 (`common/file/`)

- **fileManager.ts**: 文件创建/更新管理
- **imageHandler.ts**: 封面图片下载处理，支持自定义文件名

### 同步层 (`src/sync/`)

- **syncManager.ts**: 核心同步逻辑
  - `sync()` - 自动同步，直接导入
  - `prepareSync()` - 准备同步，获取预览数据
  - `executeSync()` - 执行同步，支持用户编辑的数据
  - `syncByCollections()` - 按收藏列表同步，保留用户数据
- **incrementalSync.ts**: 增量同步，通过扫描本地文件夹检测已同步条目
  - `scanLocalFolder()` - 扫描本地文件夹，提取已同步条目 ID
  - `computeDiff()` - 计算需要同步的条目，支持智能数量限制

### 模板层 (`src/template/`)

- **contentTemplate.ts**: 内容模板处理
  - 支持条件渲染 `{{#if}}`
  - 支持默认值 `{{var|default}}`
  - 使用用户自己的标签，支持评分明细

### 控制面板层 (`src/panel/`)

- **controlPanel.ts**: 控制面板主类
  - 展示所有收藏条目（无封面，加载快）
  - 筛选、搜索、分页
  - 同步状态标记
  - 同步选中（保留用户数据）
  - 键盘导航支持
- **batchEditorModal.ts**: 批量编辑器
  - `BatchEditorModal` - 批量编辑弹窗 UI
  - `FrontmatterEditor` - Frontmatter 编辑器
    - `batchModify()` - 批量修改多个文件
    - `undo()` - 撤销上一次操作
    - `canUndo()` - 检查是否可撤销
- **conflictResolver.ts**: 冲突解决器
  - 检测本地与云端数据冲突
  - 提供解决选项

### UI 层 (`src/ui/`)

- **syncOptionsModal.ts**: 同步选项弹窗
- **syncModal.ts**: 同步进度弹窗
- **syncPreviewModal.ts**: 同步预览确认弹窗
  - 条目列表展示与勾选
  - 评分明细输入
  - 全选/全不选/反选

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

## 代码风格

- 使用 TypeScript 严格模式
- 函数和类添加 JSDoc 注释
- 私有成员使用 `private` 修饰符
- 异步操作使用 `async/await`
- 错误处理使用 try-catch 并记录日志

## 模板变量

### 路径模板变量
- `{{type}}` - 条目类型，根据 category 自动区分 (anime/game/novel/comic/album/music/real)
- `{{category}}` - 细分类别 (TV/OVA/小说/漫画等)
- `{{name}}` - 原名
- `{{name_cn}}` - 中文名
- `{{year}}` - 年份
- `{{author}}` - 作者
- `{{id}}` - 条目 ID

> **注意**: `{{type}}` 会根据条目的 `category` 自动判断：
> - 轻小说 → `novel`
> - 漫画 → `comic`
> - 画集 → `album`
> - 动画 → `anime`
> - 游戏 → `game`
> - 音乐 → `music`
> - 三次元 → `real`

### 图片路径模板变量
- `{{id}}` - 条目 ID
- `{{name_cn}}` - 中文名
- `{{name}}` - 原名
- `{{typeLabel}}` - 类型标签 (Anime/Game/Novel/Comic/Music/Real)

### 内容模板变量
- 基础: `{{id}}`, `{{name}}`, `{{name_cn}}`, `{{alias}}`, `{{summary}}`, `{{rating}}`, `{{rank}}`, `{{tags}}`, `{{cover}}`
- 类型: `{{type}}`, `{{typeLabel}}`, `{{category}}`
- 日期: `{{date}}`, `{{year}}`, `{{month}}`
- 收藏: `{{my_rate}}`, `{{my_comment}}`, `{{my_status}}`, `{{my_tags}}`
- 条目特定: `{{episode}}`, `{{director}}`, `{{author}}`, `{{develop}}` 等
- 角色: `{{character1-9}}`, `{{characterCV1-9}}`, `{{characterPhoto1-9}}`
- 评分明细: `{{rating_music}}`, `{{rating_character}}`, `{{rating_story}}`, `{{rating_art}}`, `{{rating_illustration}}`, `{{rating_writing}}`, `{{rating_drawing}}`, `{{rating_fun}}`
- 章节: `{{episodes}}`, `{{volumes}}`

### 模板高级语法

#### 条件渲染
```markdown
{{#if my_rate}}my_rate: {{my_rate}}{{/if}}
```
当变量有值时显示内容。

#### 默认值
```markdown
rating: {{rating|未评分}}
director: {{director|未知}}
```
当变量为空时显示默认值。

详细模板变量说明请参考 `docs/TEMPLATE_GUIDE.md`。

### 评分明细字段说明

不同类型条目的评分明细字段：

| 条目类型 | 评分明细字段 |
|---------|-------------|
| 动画 | 音乐、人设、剧情、美术 |
| 小说 | 剧情、插画、文笔、人设 |
| 漫画 | 剧情、画工、人设 |
| 游戏 | 剧情、趣味、音乐、美术 |
| 画集 | （无） |
| 音乐 | （无） |
| 三次元 | （无） |

## Bangumi API 参考

- API 文档: https://bangumi.github.io/api/
- 获取 Access Token: https://next.bgm.tv/demo/access-token
- API 基础 URL: https://api.bgm.tv

### 主要端点

- `GET /v0/users/{username}/collections` - 获取用户收藏
- `GET /v0/subjects/{subject_id}` - 获取条目详情
- `GET /v0/subjects/{subject_id}/characters` - 获取条目角色
- `POST /v0/search/subjects` - 搜索条目
- `GET /v0/episodes?subject_id={id}` - 获取条目章节
- `GET /v0/users/-/collections/{subject_id}/episodes` - 获取用户章节状态
- `PUT /v0/users/-/collections/-/episodes/{episode_id}` - 更新章节状态

## 调试技巧

1. 在 Obsidian 中启用开发者模式
2. 打开开发者控制台 (Ctrl+Shift+I)
3. 查看控制台日志（带 `[Bangumi Sync]` 前缀）
4. 插件数据存储在 `.obsidian/plugins/bangumi-sync/` 目录

## 注意事项

- Bangumi API 需要 User-Agent 头
- Access Token 用于访问私有收藏
- 使用 `/v0/me` 端点获取当前用户名，然后用实际用户名访问收藏列表
- 图片下载使用 Obsidian 的 `requestUrl` API
- 文件操作使用 Obsidian 的 Vault API
- 模板文件选择支持库中任意 `.md` 文件
- **多行文本处理**: 短评 (`my_comment`) 等多行文本字段会自动将换行符替换为空格，以符合 YAML frontmatter 格式要求
- **条目 ID 存储**: 模板中包含 `id: {{id}}` 字段，用于扫描本地文件夹时识别已同步条目

## 历史版本特性

以下特性在当前版本中均已支持：

### 扫描本地文件夹检测已同步条目

不再依赖缓存记录已同步的条目 ID，而是通过扫描本地文件夹来检测：

- 扫描指定文件夹中的所有 Markdown 文件
- 从文件内容中提取条目 ID（通过 frontmatter 中的 `id` 字段）
- 自动跳过已存在的条目

### 使用用户自己的标签

`{{tags}}` 变量使用用户在 Bangumi 上自己标注的标签：
- 如果用户没有标注标签，则留空
- 不再使用公共标签

### 智能数量限制

改进的数量限制逻辑：
- 用户设置同步数量限制（如 50）
- 系统计算未同步的条目数量
- 如果未同步数量少于限制，同步所有未同步的条目
- 如果未同步数量多于限制，只同步指定数量的条目

### 手动同步预览

手动同步时显示预览弹窗：
- 列出所有待同步条目
- 支持勾选/取消勾选
- 支持填写评分明细
- 三种导入方式：全部导入、只导入选中的、只导入未选中的

### 自动同步无预览

自动同步模式：
- 不显示预览弹窗
- 直接导入所有待同步条目
- 评分明细字段留空

## 控制面板功能

### 功能概述

- **查看所有收藏**: 展示用户在 Bangumi 上的所有收藏条目（不加载封面，加载速度快）
- **标签显示**: 列表中显示用户标签（最多3个）
- **短评显示**: 列表中显示云端短评（最多20字，悬停显示完整内容）
- **同步状态标记**: 显示每个条目是否已同步到本地
- **筛选功能**: 按类型、收藏状态、同步状态筛选
- **搜索功能**: 按名称搜索条目
- **分页浏览**: 大量数据时分页显示（每页50条）

### 同步选中

在控制面板中选择条目进行同步：

- **同步选中**: 同步选中的未同步条目，保留用户数据（评分、状态、短评、标签等）
- **强制同步**: 覆盖已存在的本地文件
- 同步完成后自动刷新面板状态

### 删除本地文件

在控制面板中删除已同步的本地文件：

- 选中已同步条目后点击"删除选中"
- 文件移动到系统回收站
- 有确认提示防止误删

### 批量编辑

支持对已同步条目进行批量编辑：

- **新增属性**: 为选中的条目添加新的 frontmatter 属性
- **修改属性**: 修改选中条目的现有属性值
- **删除属性**: 删除选中条目的指定属性
- **撤销操作**: 支持撤销最近的批量编辑操作（最多10步）

### 打开本地文件

在控制面板中，已同步的条目会显示"打开"按钮，点击可直接打开对应的本地文件。

### 短评双向同步

- **对比差异**: 点击"同步短评"按钮，对比已同步条目的本地与云端短评
- **选择版本**: 对于有差异的条目，选择保留本地版本或云端版本
- **同步到云端**: 选择保留本地时，更新 Bangumi 云端短评
- **同步到本地**: 选择保留云端时，更新本地文件中的短评

## 扩展参考

参考目录 `参考/` 包含用户之前的脚本和模板（仅本地开发参考，不上传到 GitHub）：
- `ACGbangumi.js` - 动画/漫画/游戏搜索脚本
- `bangumi_novel.js` - 小说搜索脚本
- `bangumi_album.js` - 画集搜索脚本
- `ACGN/T-*.md` - 各类型模板文件

## 发布说明

### 发布流程

1. 更新 `package.json` 和 `manifest.json` 中的版本号
2. 构建插件：`npm run build`
3. 在 `release/` 下创建版本号命名的子目录（如 `release/v4.1.0/`）
4. 复制 `main.js`、`manifest.json`、`styles.css` 到该目录
5. 打包为 zip 文件放入 `archives/`
6. 使用 GitHub CLI 创建 Release 并上传 zip 文件

### 已发布版本

- **v1.0.0**: V1 基础版本，基于缓存的增量同步
- **v2.0.0**: V2 改进版本，扫描本地文件夹检测已同步条目，支持预览弹窗
- **v3.0.0**: V3 控制面板版本，新增收藏管理、批量编辑、撤销支持
- **v3.1.0**: 新增标签列显示、强制同步、删除本地文件功能
- **v3.2.0**: 短评优化，短评移至正文 callout，新增短评双向同步功能
- **v3.3.0**: 修复元数据获取问题，新增 Bangumi 链接属性，短评保留换行
- **v4.0.0**: V4 集数追踪版本
  - 新增集数显示、观看状态、悬浮提示
  - 修复漫画模板选择问题
  - 修复小说书系、册数、官网字段解析问题
  - 支持从版本信息中提取书系和册数
  - 支持链接数组格式的官网字段
- **v4.1.0**: 用户体验增强版本
  - 新增模板设计指南文档 (`docs/TEMPLATE_GUIDE.md`)
  - 模板支持条件渲染 `{{#if}}` 和默认值 `{{var|default}}`
  - 新增默认快捷键支持（Ctrl+Shift+B/S/Q）
  - 控制面板支持键盘导航（方向键、PageUp/PageDown、Enter、Escape）
  - 新增同步冲突检测与解决功能
  - 新增图片质量选择（小/中/大）
  - 新增更新已存在图片选项
  - 项目结构重构，删除旧版本代码，简化维护
  - 移除代码中的 V3/V4 版本标识，统一日志前缀
  - 漫画模板支持条件渲染作画字段
- **v4.2.0**: 标签优化版本
  - 标签格式改为 YAML 数组格式，兼容新版 Obsidian
  - 新增标签双向同步功能
  - 支持合并本地与云端标签
  - 新增 `tags_inline` 变量，兼容旧模板的内联格式

## 集数追踪功能

### 集数追踪

自动获取并显示条目的章节信息：

- **动画**：显示所有集数，以数字框形式展示
- **小说**：显示卷数信息
- **漫画**：显示话数信息

### 集数显示格式

集数以紧凑的数字框形式显示：

```html
<span class="ep-box" title="第1话：魔王的苏醒之日&#10;放送：2008-04-06&#10;时长：24m" data-ep="1" data-id="522">1</span>
```

- **数字框**：每个集数显示为一个可点击的数字框
- **悬浮提示**：鼠标悬浮显示集数标题、放送日期、时长
- **已看标记**：已看过的集数会高亮显示（背景色不同）

### 观看状态同步

- 同步条目时自动获取用户在 Bangumi 上的章节观看状态
- 已看集数在本地文件中会以不同样式显示
- 支持通过 API 更新章节状态到 Bangumi

### 快捷键支持

为常用操作添加了默认快捷键：

| 功能 | 快捷键 |
|------|--------|
| 打开控制面板 | `Ctrl+Shift+B` |
| 同步收藏 | `Ctrl+Shift+S` |
| 快速同步 | `Ctrl+Shift+Q` |

控制面板支持键盘导航：
- **↑/↓**: 上下移动选中行
- **PageUp/PageDown**: 翻页
- **Enter/Space**: 打开选中的已同步文件
- **Escape**: 关闭面板

### 同步冲突处理

当本地修改后云端也有更新时，会检测冲突并提供解决选项：

- **保留本地**: 使用本地版本的数据
- **保留云端**: 使用云端版本的数据
- **跳过**: 不处理此条目

冲突检测范围：评分、短评、标签、收藏状态。

### 图片管理

图片管理设置：

- **图片质量**: 选择下载的图片质量（小/中/大）
- **更新已存在图片**: 同步时是否更新已存在的封面图片

## 开发计划

### v4.3.0 待办事项

（待规划）

