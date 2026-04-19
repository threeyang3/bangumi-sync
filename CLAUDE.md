# Bangumi Sync - Obsidian 插件

## 项目概述

这是一个 Obsidian 插件，用于从 Bangumi（番组计划）平台同步用户收藏数据到 Obsidian 笔记中。支持增量同步、自定义模板、自动同步等功能。

**GitHub 仓库**: https://github.com/threeyang3/bangumi-sync

**作者**: threeyang

## 版本说明

### V1 版本（默认）
- 使用缓存记录已同步条目 ID
- 使用公共标签

### V2 版本
- **通过扫描本地文件夹检测已同步条目**（不依赖缓存）
- **使用用户自己的标签**，如果没有则留空
- **智能数量限制**：如果未同步数量不够，同步所有未同步的条目
- **手动同步预览**：导入前可预览条目列表，勾选要导入的条目
- **评分明细输入**：手动同步时可在弹窗中填写评分明细

### V3 版本（推荐）
- **控制面板**：查询并展示用户所有收藏条目
- **同步状态标记**：对照本地目录，标记条目是否已同步
- **标签显示**：列表中显示用户标签（最多3个）
- **短评显示**：列表中显示云端短评（最多20字）
- **同步选中**：在面板中选中未同步条目后可直接同步，保留用户数据（评分、状态、短评、标签等）
- **强制同步**：覆盖已存在的本地文件
- **删除本地文件**：从面板中删除已同步的条目（移动到回收站）
- **批量编辑**：选择多个条目统一新增/修改/删除 frontmatter 属性
- **撤销支持**：批量编辑支持撤销操作（最多10步）
- **打开本地文件**：在控制面板中直接打开已同步的本地文件
- **短评双向同步**：对比本地与云端短评差异，选择保留哪个版本
- **性能优化**：列表不加载封面图片，加快加载速度
- 继承 V2 所有特性

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
├── styles.css                 # 插件样式
│
├── v1/                        # V1 版本
│   ├── main.ts                # V1 插件入口
│   ├── main.js                # V1 编译输出
│   ├── manifest.json          # V1 插件清单
│   └── src/
│       ├── api/               # V1 API 层
│       │   └── client.ts      # V1 API 客户端
│       ├── sync/              # V1 同步层
│       │   ├── syncManager.ts # V1 同步管理器
│       │   ├── incrementalSync.ts # V1 增量同步（基于缓存）
│       │   └── syncStatus.ts  # V1 同步状态
│       ├── template/          # V1 模板层
│       │   └── contentTemplate.ts # V1 内容模板
│       ├── parser/            # V1 解析层
│       │   ├── infoboxParser.ts
│       │   └── characterParser.ts
│       ├── file/              # V1 文件层
│       │   └── fileManager.ts
│       ├── settings/          # V1 设置层
│       │   ├── settings.ts
│       │   └── settingsTab.ts
│       └── ui/                # V1 UI 层
│           ├── syncModal.ts
│           └── syncOptionsModal.ts
│
├── v2/                        # V2 版本
│   ├── main.ts                # V2 插件入口
│   ├── main.js                # V2 编译输出
│   ├── manifest.json          # V2 插件清单
│   └── src/
│       ├── api/               # V2 API 层
│       │   └── client.ts      # V2 API 客户端
│       ├── sync/              # V2 同步层
│       │   ├── syncManager.ts # V2 同步管理器
│       │   ├── incrementalSync.ts # V2 增量同步（扫描本地文件夹）
│       │   └── syncStatus.ts  # V2 同步状态
│       ├── template/          # V2 模板层
│       │   └── contentTemplate.ts # V2 内容模板（使用用户标签）
│       ├── file/              # V2 文件层
│       │   └── fileManager.ts
│       ├── settings/          # V2 设置层
│       │   ├── settings.ts
│       │   └── settingsTab.ts
│       └── ui/                # V2 UI 层
│           ├── syncModal.ts
│           ├── syncOptionsModal.ts
│           └── syncPreviewModal.ts  # V2 预览确认弹窗
│
├── v3/                        # V3 版本
│   ├── main.ts                # V3 插件入口
│   ├── main.js                # V3 编译输出
│   ├── manifest.json          # V3 插件清单
│   └── src/
│       ├── api/               # V3 API 层
│       │   └── client.ts      # V3 API 客户端
│       ├── sync/              # V3 同步层
│       │   ├── syncManager.ts # V3 同步管理器
│       │   ├── incrementalSync.ts # V3 增量同步
│       │   └── syncStatus.ts  # V3 同步状态
│       ├── template/          # V3 模板层
│       │   └── contentTemplate.ts # V3 内容模板
│       ├── file/              # V3 文件层
│       │   └── fileManager.ts
│       ├── panel/             # V3 控制面板层
│       │   ├── controlPanel.ts    # 控制面板主类
│       │   ├── batchEditorModal.ts # 批量编辑器
│       │   └── commentSyncModal.ts # 短评同步弹窗
│       ├── settings/          # V3 设置层
│       │   ├── settings.ts
│       │   └── settingsTab.ts
│       └── ui/                # V3 UI 层
│           ├── syncModal.ts
│           ├── syncOptionsModal.ts
│           └── syncPreviewModal.ts
│
└── common/                    # 共享模块
    ├── api/                   # 共享 API 模块
    │   ├── types.ts           # 类型定义
    │   ├── endpoints.ts       # API 端点常量
    │   └── client.ts          # 基础 API 客户端
    ├── parser/                # 共享解析模块
    │   ├── infoboxParser.ts   # 条目信息解析
    │   └── characterParser.ts # 角色信息解析
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

### 3. 同步预览（V2/V3 手动同步）

V2/V3 版本在手动同步时会显示**预览确认弹窗**：

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

#### V1/V2 命令

| 命令 | 说明 |
|------|------|
| 同步 Bangumi 收藏 | 打开同步选项弹窗，选择后显示预览确认 |
| 快速同步（使用默认设置） | 自动同步模式，不显示预览弹窗 |

#### V3 命令

| 命令 | 说明 |
|------|------|
| 同步 Bangumi 收藏 | 打开同步选项弹窗 |
| 快速同步（使用默认设置） | 自动同步模式 |
| 打开控制面板 | 打开收藏管理控制面板 |

### 6. 控制面板（V3）

V3 版本新增**控制面板**功能：

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
- **endpoints.ts**: API 端点常量
- **client.ts**: 基础 API 客户端

### 共享解析层 (`common/parser/`)

- **infoboxParser.ts**: 从 Bangumi API 返回的 infobox 中解析各类型条目的特定字段
  - `parseInfoByType()` - 根据条目类型解析 infobox
  - `parseDate()` - 解析日期
  - `cleanSummary()` - 清理简介文本
  - `cleanMultilineText()` - 清理多行文本（用于短评等字段）
- **characterParser.ts**: 解析角色信息（最多9个角色）

### 共享模板层 (`common/template/`)

- **defaultTemplates.ts**: 各类型默认模板（动画/小说/漫画/游戏/画集/音乐/三次元）
- **pathTemplate.ts**: 路径模板处理，支持 `{{type}}`, `{{category}}`, `{{name_cn}}` 等变量

### 共享文件层 (`common/file/`)

- **fileManager.ts**: 文件创建/更新管理
- **imageHandler.ts**: 封面图片下载处理，支持自定义文件名

### V1 同步层 (`v1/src/sync/`)

- **syncManager.ts**: V1 核心同步逻辑
- **incrementalSync.ts**: V1 增量同步（基于缓存记录已同步 ID）

### V2 同步层 (`v2/src/sync/`)

- **syncManager.ts**: V2 核心同步逻辑
  - `sync()` - 自动同步，直接导入
  - `prepareSync()` - 准备同步，获取预览数据
  - `executeSync()` - 执行同步，支持用户编辑的数据
- **incrementalSync.ts**: V2 增量同步，通过扫描本地文件夹检测已同步条目
  - `scanLocalFolder()` - 扫描本地文件夹，提取已同步条目 ID
  - `computeDiff()` - 计算需要同步的条目，支持智能数量限制

### V2 模板层 (`v2/src/template/`)

- **contentTemplate.ts**: V2 内容模板处理
  - `extractTemplateVarsV2()` - 提取模板变量，使用用户自己的标签，支持评分明细

### V2 UI 层 (`v2/src/ui/`)

- **syncOptionsModal.ts**: 同步选项弹窗
- **syncModal.ts**: 同步进度弹窗
- **syncPreviewModal.ts**: 同步预览确认弹窗
  - 条目列表展示与勾选
  - 评分明细输入
  - 全选/全不选/反选

### V3 同步层 (`v3/src/sync/`)

- **syncManager.ts**: V3 核心同步逻辑
  - `sync()` - 自动同步，直接导入
  - `prepareSync()` - 准备同步，获取预览数据
  - `executeSync()` - 执行同步，支持用户编辑的数据
  - `syncByCollections()` - 按收藏列表同步，保留用户数据（评分、状态、短评等）
- **incrementalSync.ts**: V3 增量同步，通过扫描本地文件夹检测已同步条目
  - `scanLocalFolder()` - 扫描本地文件夹，提取已同步条目 ID
  - `computeDiff()` - 计算需要同步的条目，支持智能数量限制

### V3 控制面板层 (`v3/src/panel/`)

- **controlPanel.ts**: 控制面板主类
  - 展示所有收藏条目（无封面，加载快）
  - 筛选、搜索、分页
  - 同步状态标记
  - 同步选中（保留用户数据）
  - 打开本地文件
- **batchEditorModal.ts**: 批量编辑器
  - `BatchEditorModal` - 批量编辑弹窗 UI
  - `FrontmatterEditor` - Frontmatter 编辑器
    - `batchModify()` - 批量修改多个文件
    - `undo()` - 撤销上一次操作
    - `canUndo()` - 检查是否可撤销

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）- V1
npm run dev

# 开发模式 - V2
npm run dev:v2

# 开发模式 - V3
npm run dev:v3

# 生产构建 - V1
npm run build

# 生产构建 - V2
npm run build:v2

# 生产构建 - V3
npm run build:v3

# 构建所有版本
npm run build:all
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

## 调试技巧

1. 在 Obsidian 中启用开发者模式
2. 打开开发者控制台 (Ctrl+Shift+I)
3. 查看控制台日志（带 `[Bangumi Sync]`、`[Bangumi Sync V2]` 或 `[Bangumi Sync V3]` 前缀）
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

## V2/V3 版本特性

### 1. 扫描本地文件夹检测已同步条目

V2/V3 不再依赖缓存记录已同步的条目 ID，而是通过扫描本地文件夹来检测：

- 扫描指定文件夹中的所有 Markdown 文件
- 从文件内容中提取条目 ID（通过 frontmatter 中的 `id` 字段）
- 自动跳过已存在的条目

### 2. 使用用户自己的标签

V2/V3 中 `{{tags}}` 变量使用用户在 Bangumi 上自己标注的标签：
- 如果用户没有标注标签，则留空
- 不再使用公共标签

### 3. 智能数量限制

V2/V3 改进了数量限制逻辑：
- 用户设置同步数量限制（如 50）
- 系统计算未同步的条目数量
- 如果未同步数量少于限制，同步所有未同步的条目
- 如果未同步数量多于限制，只同步指定数量的条目

### 4. 手动同步预览

V2/V3 手动同步时显示预览弹窗：
- 列出所有待同步条目
- 支持勾选/取消勾选
- 支持填写评分明细
- 三种导入方式：全部导入、只导入选中的、只导入未选中的

### 5. 自动同步无预览

V2/V3 自动同步模式：
- 不显示预览弹窗
- 直接导入所有待同步条目
- 评分明细字段留空

### V2/V3 设置

V2/V3 新增设置项：
- **扫描文件夹路径**: 用于检测已同步条目的文件夹路径（留空则使用文件路径模板的基础路径）

## V3 版本特有功能

### 控制面板

V3 新增控制面板，提供收藏管理功能：

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

V3 支持对已同步条目进行批量编辑：

- **新增属性**: 为选中的条目添加新的 frontmatter 属性
- **修改属性**: 修改选中条目的现有属性值
- **删除属性**: 删除选中条目的指定属性
- **撤销操作**: 支持撤销最近的批量编辑操作（最多10步）

### 打开本地文件

在控制面板中，已同步的条目会显示"打开"按钮，点击可直接打开对应的本地文件。

### 短评双向同步

V3 新增短评双向同步功能：

- **对比差异**: 点击"同步短评"按钮，对比已同步条目的本地与云端短评
- **选择版本**: 对于有差异的条目，选择保留本地版本或云端版本
- **同步到云端**: 选择保留本地时，更新 Bangumi 云端短评
- **同步到本地**: 选择保留云端时，更新本地文件中的短评

### 使用 V3 版本

**方式一：从 GitHub Release 下载（推荐）**
1. 访问 https://github.com/threeyang3/bangumi-sync/releases
2. 下载 V3 版本的 `main.js` 和 `manifest.json`
3. 放入 Obsidian 插件目录

**方式二：自行构建**
1. 克隆仓库：`git clone https://github.com/threeyang3/bangumi-sync.git`
2. 安装依赖：`npm install`
3. 构建 V3 版本：`npm run build:v3`
4. 将 `v3/main.js` 和 `v3/manifest.json` 复制到插件目录

**V3 插件目录结构**：
```
你的Vault/.obsidian/plugins/bangumi-sync-v3/
├── main.js          # 插件主文件
├── manifest.json    # 插件清单
└── styles.css       # 样式文件
```

## 扩展参考

参考目录 `参考/` 包含用户之前的脚本和模板（仅本地开发参考，不上传到 GitHub）：
- `ACGbangumi.js` - 动画/漫画/游戏搜索脚本
- `bangumi_novel.js` - 小说搜索脚本
- `bangumi_album.js` - 画集搜索脚本
- `ACGN/T-*.md` - 各类型模板文件

## 发布说明

### 发布流程

1. 构建插件：`npm run build:all`
2. 打包发布文件到 `release/` 目录
3. 使用 GitHub CLI 创建 Release 并上传 zip 文件

### 已发布版本

- **v1.0.0**: V1 基础版本，基于缓存的增量同步
- **v2.0.0**: V2 改进版本，扫描本地文件夹检测已同步条目，支持预览弹窗
- **v3.0.0**: V3 控制面板版本，新增收藏管理、批量编辑、撤销支持
- **v3.1.0**: 新增标签列显示、强制同步、删除本地文件功能
- **v3.2.0**: 短评优化，短评移至正文 callout，新增短评双向同步功能
