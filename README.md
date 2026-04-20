# Bangumi Sync

一个用于 Obsidian 的插件，可以将你在 Bangumi（番组计划）上的收藏同步到 Obsidian 笔记中。

## 主要功能

- **增量同步**：自动检测已同步的条目，避免重复导入
- **多类型支持**：支持动画、游戏、书籍、音乐、三次元等多种条目类型
- **自定义模板**：为每种条目类型配置不同的笔记模板，支持条件渲染和默认值
- **封面下载**：可选下载条目封面图片到本地，支持选择图片质量
- **自动同步**：支持定时自动同步
- **同步预览**：导入前预览条目列表，选择要导入的条目
- **评分明细**：同步时填写各维度的评分（音乐、剧情、人设等）
- **控制面板**：查看所有收藏条目，标记同步状态，筛选搜索
- **同步选中**：在面板中选择条目直接同步，保留用户数据
- **强制同步**：覆盖已存在的本地文件
- **删除本地文件**：从面板中删除已同步的条目
- **批量编辑**：对已同步条目批量修改 frontmatter 属性
- **撤销支持**：批量编辑支持撤销操作（最多10步）
- **短评双向同步**：对比本地与云端短评差异，选择保留哪个版本
- **Bangumi 链接**：自动添加条目在 Bangumi 网站的链接
- **集数追踪**：显示动画集数、小说卷数、漫画话数，同步观看状态
- **快捷键支持**：默认快捷键，控制面板键盘导航
- **冲突处理**：检测本地与云端数据冲突，提供解决选项

## 最新更新 (v4.1.0)

### 新功能
- **模板增强**：支持条件渲染 `{{#if}}` 和默认值 `{{var|default}}`
- **快捷键**：默认快捷键支持（Ctrl+Shift+B/S/Q）
- **键盘导航**：控制面板支持方向键、PageUp/PageDown、Enter、Escape
- **冲突处理**：检测本地与云端数据冲突，提供解决选项
- **图片管理**：支持选择图片质量（小/中/大），可选更新已存在图片
- **模板设计指南**：新增 `docs/TEMPLATE_GUIDE.md` 文档

### 项目重构
- 简化项目结构，删除旧版本代码
- 统一构建命令，简化维护

## 安装

### 从 GitHub Release 安装（推荐）

1. 访问 [Releases](https://github.com/threeyang3/bangumi-sync/releases) 页面
2. 下载最新版本的 `main.js`、`manifest.json` 和 `styles.css`
3. 创建插件目录并复制文件

### 手动构建

```bash
# 克隆仓库
git clone https://github.com/threeyang3/bangumi-sync.git
cd bangumi-sync

# 安装依赖
npm install

# 构建
npm run build
```

### 安装到 Obsidian

将以下文件复制到插件目录：

```
你的Vault/.obsidian/plugins/bangumi-sync/
├── main.js          # release/main.js
├── manifest.json    # release/manifest.json
└── styles.css       # release/styles.css
```

## 配置

### 获取 Access Token

1. 访问 [Bangumi Access Token 生成页面](https://next.bgm.tv/demo/access-token)
2. 点击生成 Token
3. 在 Obsidian 设置中找到 "Bangumi Sync"，粘贴 Token

### 基本设置

| 设置项 | 说明 |
|--------|------|
| Access Token | Bangumi API 访问令牌 |
| 文件路径模板 | 笔记保存路径，支持变量 |
| 图片路径模板 | 封面图片保存路径 |
| 图片质量 | 下载图片的质量（小/中/大） |
| 更新已存在图片 | 同步时是否更新已存在的封面图片 |
| 下载封面图片 | 是否下载条目封面到本地 |
| 扫描文件夹路径 | 用于检测已同步条目的文件夹 |

## 使用方法

### 快捷键

| 功能 | 快捷键 |
|------|--------|
| 打开控制面板 | `Ctrl+Shift+B` |
| 同步收藏 | `Ctrl+Shift+S` |
| 快速同步 | `Ctrl+Shift+Q` |

### 控制面板

1. 点击左侧 Ribbon 图标或使用命令 "打开收藏管理面板"
2. 面板功能：
   - 查看所有收藏条目
   - 按类型、状态、同步状态筛选
   - 搜索条目名称
   - **同步选中**：同步选中的未同步条目
   - **强制同步**：覆盖已存在的本地文件
   - **删除选中**：删除选中的本地文件
   - **批量编辑**：修改已同步条目的 frontmatter
3. 键盘导航：
   - **↑/↓**: 上下移动选中行
   - **PageUp/PageDown**: 翻页
   - **Enter/Space**: 打开选中的已同步文件
   - **Escape**: 关闭面板

### 手动同步

1. 使用命令 "同步 Bangumi 收藏"
2. 在弹窗中选择：
   - **条目类型**：动画、游戏、书籍、音乐、三次元
   - **收藏状态**：想看、在看、看过、搁置、抛弃
   - **同步数量**：每次同步的最大条目数
   - **强制同步**：是否忽略已存在的条目
3. 点击"开始同步"后，会显示预览弹窗：
   - 勾选要导入的条目
   - 填写评分明细（可选）
   - 选择导入方式：全部导入 / 只导入选中的 / 只导入未选中的

### 自动同步

1. 在设置中启用"自动同步"
2. 设置同步间隔（分钟）
3. 插件会自动在后台同步，无需手动操作

> 自动同步模式下不会显示预览弹窗，评分明细字段留空。

## 模板变量

### 路径变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{type}}` | 条目类型 | anime |
| `{{category}}` | 细分类别 | TV |
| `{{name}}` | 原名 | 進撃の巨人 |
| `{{name_cn}}` | 中文名 | 进击的巨人 |
| `{{year}}` | 年份 | 2013 |
| `{{author}}` | 作者 | 諫山創 |
| `{{id}}` | 条目 ID | 10060 |

### 图片路径变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{id}}` | 条目 ID | 10060 |
| `{{name_cn}}` | 中文名 | 进击的巨人 |
| `{{name}}` | 原名 | 進撃の巨人 |
| `{{typeLabel}}` | 类型标签 | Anime |

**示例**：`ACGN/assets/{{name_cn}}_{{typeLabel}}.jpg` → `ACGN/assets/进击的巨人_Anime.jpg`

### 内容变量

#### 基础信息
- `{{id}}` - 条目 ID
- `{{name}}` - 原名
- `{{name_cn}}` - 中文名
- `{{alias}}` - 别名
- `{{summary}}` - 简介
- `{{rating}}` - Bangumi 评分
- `{{rank}}` - 排名
- `{{tags}}` - 用户标签
- `{{cover}}` - 封面链接

#### 类型与日期
- `{{type}}` - 条目类型编号
- `{{typeLabel}}` - 类型标签（Anime/Game/Novel 等）
- `{{category}}` - 细分类别
- `{{date}}` - 发行日期
- `{{year}}` - 年份
- `{{month}}` - 月份

#### 收藏信息
- `{{my_rate}}` - 我的评分
- `{{my_comment}}` - 我的短评
- `{{my_status}}` - 收藏状态
- `{{my_tags}}` - 我的标签

#### 条目特定字段
- `{{episode}}` - 集数/话数
- `{{director}}` - 导演
- `{{author}}` - 作者
- `{{develop}}` - 开发商
- `{{publish}}` - 出版社/发行商
- 等等...

#### 角色信息
- `{{character1}}` ~ `{{character9}}` - 角色名称
- `{{characterCV1}}` ~ `{{characterCV9}}` - 角色声优
- `{{characterPhoto1}}` ~ `{{characterPhoto9}}` - 角色图片

#### 评分明细
- `{{rating_music}}` - 音乐评分
- `{{rating_character}}` - 人设评分
- `{{rating_story}}` - 剧情评分
- `{{rating_art}}` - 美术评分
- `{{rating_illustration}}` - 插画评分
- `{{rating_writing}}` - 文笔评分
- `{{rating_drawing}}` - 画工评分
- `{{rating_fun}}` - 趣味评分

不同类型条目的评分明细：

| 类型 | 评分字段 |
|------|----------|
| 动画 | 音乐、人设、剧情、美术 |
| 小说 | 剧情、插画、文笔、人设 |
| 漫画 | 剧情、画工、人设 |
| 游戏 | 剧情、趣味、音乐、美术 |

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

## 开发

### 环境要求

- Node.js
- npm

### 构建命令

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

### 项目结构

```
bangumi/
├── src/                   # 源代码
│   ├── api/               # API 客户端
│   ├── sync/              # 同步管理器
│   ├── template/          # 模板处理
│   ├── file/              # 文件操作
│   ├── panel/             # 控制面板
│   ├── settings/          # 设置
│   └── ui/                # UI 组件
├── common/                # 共享模块
│   ├── api/               # API 类型和端点
│   ├── parser/            # 数据解析器
│   ├── template/          # 模板处理
│   └── file/              # 文件操作
├── docs/                  # 文档
├── release/               # 发布文件
├── archives/              # 历史版本
├── main.ts                # 插件入口
├── manifest.json          # 插件清单
└── styles.css             # 插件样式
```

## 常见问题

### Q: 为什么扫描不到已同步的条目？

确保你的模板中包含 `id: {{id}}` 字段。插件通过 frontmatter 中的 `id` 字段来识别已同步的条目。

### Q: 如何自定义模板？

在设置面板中，可以为每种条目类型选择：
- **默认模板**：使用内置模板
- **从文件选择**：选择库中的 `.md` 文件作为模板
- **自定义内容**：在弹窗中直接编辑模板

### Q: 图片下载失败怎么办？

检查图片路径模板是否正确，确保目标目录存在。如果使用网络图片链接，确保网络连接正常。

## 相关链接

- [Bangumi API 文档](https://bangumi.github.io/api/)
- [获取 Access Token](https://next.bgm.tv/demo/access-token)
- [Obsidian 插件开发文档](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## 许可证

MIT License
