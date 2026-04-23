# Bangumi Sync

一个用于 Obsidian 的插件，可以将你在 Bangumi（番组计划）上的收藏同步到 Obsidian 笔记中。

![GitHub release](https://img.shields.io/github/v/release/threeyang3/bangumi-sync)
![GitHub downloads](https://img.shields.io/github/downloads/threeyang3/bangumi-sync/total)

## 目录

- [核心功能](#核心功能)
- [使用前准备](#使用前准备)
- [快速开始](#快速开始)
- [安装](#安装)
- [配置](#配置)
- [使用方法](#使用方法)
- [模板变量](#模板变量)
- [常见问题](#常见问题)
- [支持开发](#支持开发)

## 核心功能

### 🔄 同步 Bangumi 用户个人数据

同步你在 Bangumi 上的所有个人数据到本地笔记：

- **收藏信息**：评分、短评、标签、收藏状态
- **观看进度**：动画集数、小说卷数、漫画话数
- **评分明细**：音乐、剧情、人设、美术等多维度评分
- **多类型支持**：动画、游戏、小说、漫画、画集、音乐、三次元

### 📝 自定义模板

为每种条目类型配置不同的笔记模板：

- **灵活变量**：支持 `{{name}}`、`{{rating}}`、`{{my_rate}}` 等数十种变量
- **条件渲染**：`{{#if my_rate}}评分: {{my_rate}}{{/if}}`
- **默认值**：`{{director|未知}}`
- **模板来源**：标准模板 / 作者自用模板 / 从文件选择 / 自定义内容

![模板设置](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/模板设置.png)

📖 详细模板设计文档：[docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)

### 🖼️ 正文表格展示

生成的笔记包含美观的信息表格，配合 Dataview 插件实现动态显示：

![本地条目完整示意](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/本地条目完整示意.png)

- **封面图片**：可选下载到本地，支持多种质量
- **角色信息**：最多 9 个角色及其声优、头像
- **集数追踪**：紧凑数字框显示，悬浮显示标题和日期

### ↔️ 双向同步

本地修改可以同步回 Bangumi 云端：

- **短评双向同步**：对比本地与云端差异，选择保留哪个版本
- **标签双向同步**：支持合并本地与云端标签
- **冲突检测**：自动检测数据冲突，提供解决选项

## 辅助功能

### 同步管理

- **增量同步**：自动检测已同步条目，避免重复导入
- **同步预览**：导入前预览条目列表，勾选要导入的条目
- **自动同步**：支持定时自动同步
- **智能数量限制**：未同步数量不足时自动同步全部

### 控制面板

- **收藏管理**：查看所有收藏条目，按类型/状态筛选
- **同步状态标记**：显示每个条目是否已同步
- **批量操作**：同步选中、强制同步、删除本地文件
- **批量编辑**：修改已同步条目的 frontmatter 属性，支持撤销

### 其他

- **键盘导航**：控制面板支持方向键、PageUp/PageDown、Enter、Escape
- **数据缓存**：控制面板数据缓存 10 分钟
- **默认属性值**：批量同步时自动填充预设值

## 使用前准备

### 1. 安装 Dataview 插件（必需）

本插件的模板使用了 Dataview 的内联查询语法 `\`= this.属性\``，需要先安装 Dataview 插件。

**安装方法**：
1. 在 Obsidian 设置中进入"社区插件"
2. 搜索 "Dataview" 并安装
3. 启用 Dataview 插件

**作用**：
- 模板表格中的 `\`= this.评分\`` 会显示当前笔记的"评分"属性
- `\`= this.观看状态\`` 会显示"观看状态"属性

> ⚠️ 如果不安装 Dataview，表格中会显示原始的 `\`= this.属性\`` 文本，而非属性值。

### 2. 获取 Bangumi Access Token

1. 访问 [Bangumi Access Token 生成页面](https://next.bgm.tv/demo/access-token)
2. 点击生成 Token
3. 复制生成的 Token，稍后在插件设置中粘贴

## 快速开始

### 第一步：安装插件

选择以下任一方式安装：

**方式一：从 GitHub Release 安装（推荐）**

1. 访问 [Releases](https://github.com/threeyang3/bangumi-sync/releases) 页面
2. 下载最新版本的 `main.js`、`manifest.json` 和 `styles.css`
3. 复制到 `你的Vault/.obsidian/plugins/bangumi-sync/` 目录

**方式二：手动构建**

```bash
git clone https://github.com/threeyang3/bangumi-sync.git
cd bangumi-sync
npm install
npm run build
```

### 第二步：配置插件

1. 在 Obsidian 设置中找到 "Bangumi Sync"
2. 粘贴之前获取的 Access Token
3. 设置文件保存路径（如 `ACGN/{{type}}/{{name_cn}}.md`）

### 第三步：同步收藏

1. 点击左侧 Ribbon 的数据库图标，或使用命令面板执行"同步 Bangumi 收藏"
2. 选择要同步的条目类型和收藏状态
3. 在预览弹窗中勾选条目，可选择填写评分明细
4. 点击"只导入选中的"开始同步

## 安装

### 从社区插件市场安装

> ⏳ **待审核**：插件已提交至 Obsidian 社区插件市场，目前正在审核中。审核通过后可直接搜索安装。

审核通过后的安装方法：
1. 在 Obsidian 设置中进入"社区插件"
2. 搜索 "Bangumi Sync" 并安装

### 从 GitHub Release 安装

1. 访问 [Releases](https://github.com/threeyang3/bangumi-sync/releases) 页面
2. 下载最新版本的 `main.js`、`manifest.json` 和 `styles.css`
3. 复制到 `你的Vault/.obsidian/plugins/bangumi-sync/` 目录

### 手动构建

```bash
git clone https://github.com/threeyang3/bangumi-sync.git
cd bangumi-sync
npm install
npm run build
```

## 配置

![路径设置](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/路径设置.png)

| 设置项 | 说明 |
|--------|------|
| Access Token | Bangumi API 访问令牌 |
| 文件路径模板 | 笔记保存路径，支持变量 |
| 图片路径模板 | 封面图片保存路径 |
| 图片质量 | 下载图片的质量（小/中/大） |
| 下载封面图片 | 是否下载条目封面到本地 |
| 封面链接类型 | 封面属性使用网络链接或本地链接 |

## 使用方法

### 手动同步

![同步选项设置](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/同步选项设置.png)

1. 使用命令 "同步 Bangumi 收藏"
2. 选择条目类型、收藏状态、同步数量
3. 预览弹窗中勾选条目、填写评分明细
4. 选择导入方式：全部导入 / 只导入选中的

### 控制面板

1. 点击左侧 Ribbon 图标（数据库图标）
2. 查看所有收藏条目，按类型/状态筛选
3. 同步选中的未同步条目，或批量编辑已同步条目

**键盘导航**：
- `↑/↓` - 上下移动选中行
- `PageUp/PageDown` - 翻页
- `Enter/Space` - 打开选中的已同步文件
- `Escape` - 关闭面板

## 模板示例

### 漫画类型模板

![漫画类型模板](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/漫画类型模板.png)

### 轻小说类型模板

![轻小说类型模板](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/轻小说类型模板.png)

## 模板变量

### 路径变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{type}}` | 条目类型 | anime |
| `{{name_cn}}` | 中文名 | 进击的巨人 |
| `{{year}}` | 年份 | 2013 |
| `{{id}}` | 条目 ID | 10060 |

### 内容变量

#### 用户个人数据
- `{{my_rate}}` - 我的评分
- `{{my_comment}}` - 我的短评
- `{{my_status}}` - 收藏状态
- `{{my_tags}}` - 我的标签

#### 条目信息
- `{{name}}` / `{{name_cn}}` - 原名 / 中文名
- `{{rating}}` / `{{rank}}` - Bangumi 评分 / 排名
- `{{summary}}` - 简介
- `{{tags}}` - 用户标签

#### 评分明细
| 类型 | 评分字段 |
|------|----------|
| 动画 | 音乐、人设、剧情、美术 |
| 小说 | 剧情、插画、文笔、人设 |
| 漫画 | 剧情、画工、人设 |
| 游戏 | 剧情、趣味、音乐、美术 |

### 模板高级语法

```markdown
{{#if my_rate}}评分: {{my_rate}}{{/if}}
rating: {{rating|未评分}}
```

详细模板变量说明请参考 `docs/TEMPLATE_GUIDE.md`。

## 常见问题

### Q: 为什么扫描不到已同步的条目？

确保模板中包含 `id: {{id}}` 字段。插件通过 frontmatter 中的 `id` 字段识别已同步条目。

### Q: 如何自定义模板？

在设置面板中为每种条目类型选择：默认模板 / 从文件选择 / 自定义内容。

### Q: 图片下载失败怎么办？

检查图片路径模板是否正确，确保目标目录存在。

## 最新更新 (v4.5.3)

### 相关条目双向链接优化
- 同批次同步时实时更新已同步状态，相关条目可正确关联
- 双向链接：同步条目时自动更新相关条目的链接属性
- 相关链接用双引号包围，确保 YAML 格式正确
- 自动去重：避免重复添加相同链接

### 问题修复
- 修复 UI 文本大小写问题，符合 Obsidian 插件规范

## 历史版本

### v4.5.2

### 相关条目自动关联
- 同步时自动获取相关条目（前传、续集、衍生、改编等）
- 已同步的相关条目自动添加双向链接
- 新增设置项：自动关联相关条目（默认启用）
- 新增模板变量：`{{related}}`

### 问题修复
- 修复 UI 文本大小写问题，符合 Obsidian 插件规范
- 移除未使用的导入

### v4.5.0

### 多语言支持
- 插件 UI 现支持中英文双语
- 自动跟随 Obsidian 语言设置：中文环境显示中文，其他语言显示英文
- 设置面板、控制面板、同步弹窗等所有界面均已国际化

### 其他改进
- 完善翻译文本，覆盖所有 UI 元素
- 模板类型名称支持中文显示（动画模板、小说模板等）

## 相关链接

- [Bangumi API 文档](https://bangumi.github.io/api/)
- [获取 Access Token](https://next.bgm.tv/demo/access-token)

## 支持开发

如果这个插件对你有帮助，欢迎赞助支持开发者：

<img src="https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/赞助二维码.jpg" width="200" alt="赞助二维码">

## 许可证

MIT License
