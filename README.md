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
- [技术文档](#技术文档)
- [模板变量](#模板变量)
- [常见问题](#常见问题)
- [支持开发](#支持开发)

## 核心功能

### 🔄 同步 Bangumi 用户个人数据

同步你在 Bangumi 上的所有个人数据到本地笔记：

- **收藏信息**：评分、短评、标签、收藏状态
- **观看进度**：动画集数、小说卷数、漫画话数
- **本地自定义属性**：评分明细、资源属性、版本、渠道、标语等，都可由模板动态定义
- **多类型支持**：动画、游戏、小说、漫画、画集、音乐、三次元

#### 同步模式

| 模式 | 说明 |
|------|------|
| 手动同步 | 预览条目列表，勾选要导入的条目；同步前会按模板弹出本地自定义属性填写窗口 |
| 自动同步 | 直接导入所有待同步条目，无需确认；自定义属性按模板默认值写入或保持为空 |
| 增量同步 | 自动检测已同步条目，避免重复导入 |
| 智能数量限制 | 未同步数量不足时自动同步全部 |

#### 同步选项

- **条目类型选择**：动画、游戏、书籍、音乐、三次元
- **收藏状态选择**：想看、在看、看过、搁置、抛弃
- **同步数量限制**：设置每次同步的最大条目数
- **强制同步**：覆盖已存在的本地文件

### 📝 自定义模板

为每种条目类型配置不同的笔记模板：

#### 模板来源

| 来源 | 说明 |
|------|------|
| 标准模板 | 只含 Bangumi 数据，适合普通用户 |
| 作者自用模板 | 含自定义变量，适合资源管理 |
| 从文件选择 | 从 Obsidian 库中选择 `.md` 文件作为模板 |
| 自定义内容 | 在弹窗中直接编辑模板内容 |

#### 模板语法

- **变量替换**：`{{name}}`、`{{rating}}`、`{{my_rate}}` 等
- **条件渲染**：`{{#if my_rate}}评分: {{my_rate}}{{/if}}`
- **默认值**：`{{director|未知}}`

#### 模板管理

- **复制当前模板**：将当前模板复制到自定义内容，便于修改
- **导出全部模板**：一键将当前所有模板保存到指定文件夹
- **动态本地属性**：插件会先读取模板 frontmatter 中的全部属性，再过滤掉可由 Bangumi 自动提供的字段，其余属性都会视为本地自定义属性

#### 本地自定义属性规则

- 支持在“同步收藏”和“搜索并添加”时动态填写
- 支持文本、布尔开关、列表三种类型
- 列表型属性可在模板中写成 `资源属性: []`
- 列表输入使用英文逗号分隔，例如 `BDRip, 1080p, 外挂字幕`
- 快速同步 / 自动同步不会弹窗，只会使用模板默认值或保留空值

![模板设置](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/模板设置.png)

📖 详细模板设计文档：[docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)

### 🖼️ 正文表格展示

生成的笔记包含美观的信息表格，配合 Dataview 插件实现动态显示：

![本地条目完整示意](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/本地条目完整示意.png)

#### 封面图片

- 可选下载到本地
- 支持多种质量（小/中/大）
- 封面链接类型：网络链接或本地链接

#### 角色信息

- 最多 9 个角色
- 包含角色名、声优、头像

#### 集数追踪

- 紧凑数字框显示
- 悬浮显示标题和日期
- 已看集数高亮显示
- 支持动画集数、小说卷数、漫画话数

### ↔️ 双向同步

本地修改可以同步回 Bangumi 云端：

#### 状态同步

统一同步评分、短评、标签、收藏状态、单集进度：

- 对比本地与云端差异
- 选择保留本地版本或云端版本
- 支持智能合并（标签）
- 批量处理多个条目
- 单集观看状态同步

#### 冲突检测

- 自动检测数据冲突
- 提供解决选项：保留本地 / 保留云端 / 跳过

### 💬 单集评论管理

在正文集数框上右键可快速操作：

- **添加吐槽**：为当前集数添加评论，自动插入 callout 块
- **标记观看**：快速标记当前集数为已看/未看
- **评论管理**：查看和编辑已有的单集评论

集数框支持悬浮显示标题和日期，已看集数高亮显示。

### 📚 共享条目笔记

条目笔记改为按需创建，不再在同步时默认写入 `笔记` 属性：

- 通过命令面板或控制面板按钮创建/追加条目笔记
- 一个共享笔记文件可容纳多个相关条目
- 共享笔记使用 `笔记ID` 多行列表属性记录条目 ID
- 当前条目的 `笔记` 属性会写回到共享笔记内对应一级标题
- 创建共享笔记时会沿本地 `相关` 属性链接图汇聚关联条目 ID

适合把同一作品的多季动画、漫画、小说等记录收拢到同一份笔记中，减少重复文件

### 🎯 控制面板

![路径设置](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/路径设置.png)

#### 收藏管理

- 查看所有收藏条目（不加载封面，加载速度快）
- 按类型筛选：动画、游戏、书籍、音乐、三次元
- 按收藏状态筛选：想看、在看、看过、搁置、抛弃
- 按同步状态筛选：已同步、未同步
- 关键词搜索
- 分页浏览（每页 50 条）

#### 信息显示

- 同步状态标记：显示每个条目是否已同步
- 用户标签：显示用户标签（最多 3 个）
- 短评预览：显示云端短评（最多 20 字，悬停显示完整内容）

#### 批量操作

| 操作 | 说明 |
|------|------|
| 同步选中 | 同步选中的未同步条目，保留用户数据 |
| 强制同步 | 覆盖已存在的本地文件 |
| 删除选中 | 删除选中的本地文件（移动到回收站） |
| 批量编辑 | 修改已同步条目的 frontmatter 属性 |

#### 批量编辑

- **新增属性**：为选中的条目添加新的 frontmatter 属性
- **修改属性**：修改选中条目的现有属性值
- **删除属性**：删除选中条目的指定属性
- **撤销操作**：支持撤销上一批量编辑操作（最多 10 步）

#### 其他功能

- 打开本地文件：直接打开已同步的本地文件
- 键盘导航：支持方向键、PageUp/PageDown、Enter、Escape
- 移动端优化：手机端使用卡片式列表，标题、元数据、短评、标签分行显示，分页与操作栏更紧凑，并支持顶部下拉关闭面板

### 🔍 搜索条目

通过命令或控制面板搜索 Bangumi 条目：

- 关键词搜索
- 类型筛选
- 排序选项
- 显示同步状态和收藏状态
- 添加新条目到收藏并同步到本地
- 编辑已收藏条目的评分、状态、标签等信息
- 创建本地文件前可填写模板定义的所有本地自定义属性

### 🛡️ 用户数据保护

强制同步时保留用户自定义数据：

#### 保护的数据

- 所有本地自定义 frontmatter 属性
- 正文中的记录和感想部分

#### 数据导入导出

- **导出用户数据**：将本地用户数据导出为 JSON 文件，按条目类型分别导出，保留辨识属性、自定义属性、记录/感想
- **导入用户数据**：从备份文件导入用户数据，支持缺失字段处理；数组型自定义属性会保持数组格式

### 🔗 相关条目关联

同步时自动获取相关条目并建立双向链接：

- 自动获取相关条目（前传、续集、衍生、改编等）
- 已同步的相关条目自动添加双向链接
- 同批次同步时实时关联

## 技术文档

如果你是使用者，只看 README 和模板文档通常就够了。  
如果你是维护者或准备二次开发，建议按下面顺序阅读：

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：项目分层、模块职责、主数据流
- [docs/LOGIC_REFERENCE.md](docs/LOGIC_REFERENCE.md)：各种判断逻辑、自定义属性筛选、同步分支、继承/导入导出规则
- [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)：模板能力、变量、默认值、自定义属性写法
- [docs/README.md](docs/README.md)：`docs/` 目录文档导航与推荐阅读顺序
- [docs/STATUS_SYNC_PITFALLS.md](docs/STATUS_SYNC_PITFALLS.md)：状态同步和单集功能的历史坑点
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)：开发环境、提交流程、发布流程
- [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md)：Obsidian 插件代码规范与审核要求

## 使用前准备

### 1. 安装 Dataview 插件（必需）

本插件的模板使用了 Dataview 的内联查询语法 `= this.属性`，需要先安装 Dataview 插件。

**安装方法**：
1. 在 Obsidian 设置中进入"社区插件"
2. 搜索 "Dataview" 并安装
3. 启用 Dataview 插件

**作用**：
- 模板表格中的 `= this.评分` 会显示当前笔记的"评分"属性
- `= this.观看状态` 会显示"观看状态"属性

> ⚠️ 如果不安装 Dataview，表格中会显示原始的 `= this.属性` 文本，而非属性值。

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
3. 设置文件保存路径（如 `ACGN/{{type}}/{{name_cn_with_type}}.md`）

### 第三步：同步收藏

1. 点击左侧 Ribbon 的数据库图标，或使用命令面板执行"同步 Bangumi 收藏"
2. 选择要同步的条目类型和收藏状态
3. 在同步前填写模板定义的本地自定义属性，在预览弹窗中勾选条目
4. 点击"只导入选中的"开始同步

## 安装

### 从社区插件市场安装

如果插件已经进入社区插件市场，可直接：

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

配置时最关键的是四类设置：

- `Access Token`：Bangumi API 访问令牌
- `文件路径模板`：本地条目文件写入位置
- `图片路径模板` 与 `封面链接类型`：控制封面落盘和引用方式
- 各类型模板来源：决定每类条目的 frontmatter、正文结构和本地自定义属性

其他设置主要分为：

- 同步参数：默认条目类型、默认收藏状态、同步数量限制、自动同步
- 图片参数：是否下载封面、图片质量、是否更新已有图片
- 数据保护参数：强制同步时是否保留本地自定义属性、记录、感想

更细的维护说明请看：

- [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)
- [docs/LOGIC_REFERENCE.md](docs/LOGIC_REFERENCE.md)

## 使用方法

### 手动同步

![同步选项设置](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/同步选项设置.png)

1. 使用命令 "同步 Bangumi 收藏"
2. 选择条目类型、收藏状态、同步数量
3. 同步前填写模板定义的本地自定义属性，预览弹窗中勾选条目
4. 选择导入方式：全部导入 / 只导入选中的 / 只导入未选中的

### 控制面板

1. 点击左侧 Ribbon 图标（数据库图标）
2. 查看所有收藏条目，按类型/状态筛选
3. 同步选中的未同步条目，或批量编辑已同步条目

**键盘导航**：
- `↑/↓` - 上下移动选中行
- `PageUp/PageDown` - 翻页
- `Enter/Space` - 打开选中的已同步文件
- `Escape` - 关闭面板

### 命令

插件提供以下命令，可在命令面板中调用，也可在 Obsidian 设置中自定义快捷键：

| 命令 | 说明 |
|------|------|
| 同步 Bangumi 收藏 | 打开同步选项弹窗 |
| 快速同步（使用默认设置） | 使用默认设置直接同步 |
| 打开控制面板 | 打开收藏管理控制面板 |
| 检查并同步状态 | 打开控制面板并自动触发状态同步 |
| 创建或追加条目笔记 | 为当前已同步条目创建或追加共享笔记 |
| 导出用户数据 | 导出本地用户自定义数据 |
| 导入用户数据 | 从备份文件导入用户数据 |
| 搜索条目 | 搜索 Bangumi 条目 |

## 模板变量

README 里只保留最常用的一小部分。完整变量表和模板规则请看 [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)。

### 常用路径变量

| 变量 | 说明 |
|------|------|
| `{{type}}` | 条目类型 |
| `{{category}}` | 细分类别 |
| `{{name_cn_with_type}}` | 中文名带类型后缀 |
| `{{id}}` | 条目 ID |

### 常用内容变量

| 变量 | 说明 |
|------|------|
| `{{name}}` / `{{name_cn}}` | 原名 / 中文名 |
| `{{rating}}` / `{{rank}}` | Bangumi 评分 / 排名 |
| `{{my_rate}}` / `{{my_status}}` | 我的评分 / 收藏状态 |
| `{{my_comment}}` | 我的短评 |
| `{{tags}}` / `{{my_tags}}` | 标签 |
| `{{cover}}` | 封面链接 |
| `{{related}}` | 相关条目链接 |
| `{{episodes}}` / `{{volumes_display}}` | 章节或卷数展示 |

### 本地自定义属性推荐写法

推荐把需要用户补充的本地属性直接写成普通 frontmatter 字段，例如：

```markdown
剧情评分:
资源属性: []
已购: false
```

补充说明：

- `[]` 会被当成列表型属性，输入时使用英文逗号分隔
- `true` / `false` 会被当成布尔属性
- 旧模板中的 `{{rating_story}}`、`{{rating_music}}` 等写法仍兼容，但新模板更推荐普通属性写法
- 所有未被 Bangumi 自动填充的 frontmatter 字段，都会按统一逻辑参与同步、搜索添加、导入导出和强制同步继承

### 模板语法

- 变量替换：`{{name_cn}}`
- 条件渲染：`{{#if my_rate}}评分: {{my_rate}}{{/if}}`
- 默认值：`{{director|未知}}`

## 常见问题

### Q: 为什么扫描不到已同步的条目？

确保模板中包含 `id: {{id}}` 字段。插件通过 frontmatter 中的 `id` 字段识别已同步条目。

### Q: 如何自定义模板？

在设置面板中为每种条目类型选择：标准模板 / 作者自用模板 / 从文件选择 / 自定义内容。

### Q: 图片下载失败怎么办？

检查图片路径模板是否正确，确保目标目录存在。

### Q: 如何导出我的模板？

在模板设置区域底部，点击"导出全部模板"按钮，选择保存文件夹即可。

### Q: 强制同步会丢失我的数据吗？

不会。插件会自动保护你的本地自定义属性，以及正文中的记录、感想，可在设置中配置保护选项。

### Q: 快速同步 / 自动同步时自定义属性怎么处理？

不会弹出填写窗口。插件会直接使用模板里写好的默认值；如果模板字段本身为空，就保留为空。

## 最新更新 (v5.3.2)

- 移动端控制面板改为卡片式列表，减少横向滚动需求
- 移动端操作栏、状态栏和分页更紧凑，按钮边框更清晰
- 移动端选择框、已同步条目的打开/笔记按钮、关闭按钮位置均已优化
- 桌面端继续保留表格布局，移动端判断只按 `max-width: 767px` 断点生效

详细版本历史请看 [docs/VERSION_HISTORY.md](docs/VERSION_HISTORY.md) 或 [GitHub Releases](https://github.com/threeyang3/bangumi-sync/releases)。

## 相关链接

- [Bangumi API 文档](https://bangumi.github.io/api/)
- [获取 Access Token](https://next.bgm.tv/demo/access-token)
- [GitHub 仓库](https://github.com/threeyang3/bangumi-sync)

## 支持开发

如果这个插件对你有帮助，欢迎赞助支持开发者：

<img src="https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/赞助二维码.jpg" width="200" alt="赞助二维码">

## 许可证

MIT License
