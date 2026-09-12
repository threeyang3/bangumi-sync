# Bangumi Sync

把 Bangumi 收藏、观看进度和个人数据同步到 Obsidian，并保留可自定义的 Markdown 与 frontmatter。

![GitHub release](https://img.shields.io/github/v/release/threeyang3/bangumi-sync)
![GitHub downloads](https://img.shields.io/github/downloads/threeyang3/bangumi-sync/total)

[安装](#安装) · [快速开始](#快速开始) · [模板指南](docs/user/TEMPLATE_GUIDE.md) · [版本与更新](#版本与更新) · [问题反馈](https://github.com/threeyang3/bangumi-sync/issues)

## 为什么使用 Bangumi Sync

- 将动画、游戏、书籍、音乐和三次元收藏保存为本地 Markdown。
- 同步评分、短评、标签、收藏状态和单集进度。
- 使用模板控制路径、frontmatter、正文和本地自定义属性。
- 支持增量同步、强制同步、状态同步、搜索添加和批量编辑。
- 导入、导出个人数据，保留本地记录和自定义字段。
- 通过事务回滚和 Recovery Center 保护同步期间的本地文件。

## 效果预览

同步后的条目以 Markdown 和 frontmatter 保存在 Vault 中；默认模板可配合 Dataview 展示封面、条目信息与观看进度。

![本地条目完整示意](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/本地条目完整示意.png)

## 安装

### GitHub Release

1. 打开 [GitHub Releases](https://github.com/threeyang3/bangumi-sync/releases)。
2. 下载同一版本的 `main.js`、`manifest.json` 和 `styles.css`。
3. 将三个文件放入 `你的Vault/.obsidian/plugins/bangumi-sync/`。
4. 在 Obsidian 的“社区插件”设置中启用 Bangumi Sync。

也可以使用 BRAT 安装仓库 `threeyang3/bangumi-sync`。

### 从源码构建

```bash
git clone https://github.com/threeyang3/bangumi-sync.git
cd bangumi-sync
npm ci
npm run build
```

构建产物位于 `release/`。开发环境和贡献流程见[开发指南](docs/maintainer/DEVELOPMENT.md)。

## 快速开始

### 1. 准备 Dataview

默认模板使用 Dataview 内联查询。请先安装并启用 Obsidian Dataview；否则表格可能显示原始查询文本。

### 2. 获取 Access Token

打开 [Bangumi Access Token 页面](https://next.bgm.tv/demo/access-token)，生成并复制 Token。不要把 Token 写入模板、截图、Issue 或日志。

### 3. 配置插件

在 Obsidian 设置中打开 Bangumi Sync：

1. 粘贴 Access Token。
2. 设置条目扫描目录和路径模板，例如 `ACGN/{{type}}/{{name_cn_with_type}}.md`。
3. 为需要的条目类型选择模板。
4. 按需配置封面下载和用户数据保护。

![路径设置](https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/路径设置.png)

### 4. 同步第一批条目

1. 点击左侧 Ribbon 的数据库图标，或运行“同步 Bangumi 收藏”。
2. 选择条目类型、收藏状态和数量。
3. 在预览中勾选条目；模板定义了本地属性时可在此填写。
4. 点击“只导入选中的”。

## 常用功能

| 功能 | 用途 |
| --- | --- |
| 同步 Bangumi 收藏 | 预览并选择要导入的收藏 |
| 快速同步 | 使用默认条件增量同步 |
| 控制面板 | 筛选收藏、打开文件、同步和批量编辑 |
| 搜索条目 | 搜索、收藏并创建本地条目 |
| 检查并同步状态 | 对比本地与云端评分、短评、标签、状态和进度 |
| 批量下载封面 | 下载封面并更新 Markdown 引用 |
| 导入 / 导出用户数据 | 备份和恢复本地字段及正文内容 |
| 创建或追加条目笔记 | 将相关条目的笔记汇聚到共享文件 |

普通同步会按 Bangumi Subject ID 识别条目。只要文件仍在扫描目录中并保留有效 `id`，你可以手工重命名文件，插件不会仅凭标题重新创建副本。

## 模板与自定义属性

模板决定文件路径、frontmatter 和正文。常用变量包括：

| 变量 | 含义 |
| --- | --- |
| `{{id}}` | Bangumi Subject ID |
| `{{type}}` / `{{category}}` | 条目类型与细分类别 |
| `{{name}}` / `{{name_cn}}` | 原名与中文名 |
| `{{name_cn_with_type}}` | 带类型消歧的中文名 |
| `{{my_rate}}` / `{{my_status}}` | 个人评分与收藏状态 |
| `{{my_comment}}` / `{{my_tags}}` | 短评与个人标签 |
| `{{cover}}` / `{{related}}` | 封面与相关条目 |

普通 frontmatter 字段可作为本地自定义属性：

```yaml
剧情评分:
资源属性: []
已购: false
```

完整变量表、条件语法、默认值、字段类型和模板来源以[模板指南](docs/user/TEMPLATE_GUIDE.md)为准。

## 数据安全

Bangumi Sync 使用持久恢复日志保护本地文件事务。异常中断或回滚不完整时，插件会暂停新的写入，并通过 Recovery Center 引导恢复。

遇到恢复提示时：

- 先停止新的同步和批量编辑。
- 不要直接删除未知的 `.bangumi-sync-recovery*` 或 `.bangumi-sync-*.tmp.md` 文件。
- 按 Recovery Center 显示的按钮操作，必要时先备份 Vault。

操作步骤见[恢复指南](docs/user/RECOVERY_GUIDE.md)。内部状态和安全不变量见[恢复模型](docs/maintainer/RECOVERY_MODEL.md)。

## 常见问题

### 为什么扫描不到条目？

确认 Markdown frontmatter 中存在有效的 `id`，且文件位于配置的扫描目录内。路径与身份规则见[身份与路径模型](docs/maintainer/PATH_AND_ID_MODEL.md)。

### 强制同步会覆盖本地数据吗？

插件会按设置保留本地自定义属性以及正文中的记录和感想。执行大范围强制同步前仍建议导出用户数据。

### 同名作品如何保存？

无冲突时使用简洁名称；发生规范化路径冲突时依次使用年份和 Bangumi ID 消歧。后续加入第三个同名条目时，插件会按已保存的碰撞组信息统一重规划 managed 路径；手工重命名的文件不会被移动。Subject ID 始终是身份，文件名不是身份。

### 修改路径模板会自动移动旧文件吗？

不会。先运行本地诊断，再使用路径迁移预览显式确认。升级与迁移步骤见[迁移指南](docs/user/MIGRATION_GUIDE.md)。

### 图片下载失败怎么办？

检查图片路径模板、目录权限和网络。若 Recovery Center 同时出现，先完成恢复，不要反复重试写入操作。

## 文档导航

- [文档索引](docs/README.md)：按普通用户、高级用户、维护者和历史资料导航。
- [模板指南](docs/user/TEMPLATE_GUIDE.md)：模板系统的完整用户参考。
- [迁移指南](docs/user/MIGRATION_GUIDE.md)：升级、改模板、改路径和 legacy recovery 处理。
- [恢复指南](docs/user/RECOVERY_GUIDE.md)：Recovery Center 操作手册。
- [架构](docs/maintainer/ARCHITECTURE.md)：模块职责和数据流。
- [开发指南](docs/maintainer/DEVELOPMENT.md)：环境、测试、PR 和发布流程。

## 版本与更新

- [GitHub Releases](https://github.com/threeyang3/bangumi-sync/releases)：下载稳定版并查看每个版本的完整发布说明。
- [版本历史](docs/VERSION_HISTORY.md)：浏览各版本重点和历史索引。

版本信息与项目介绍分开维护；已发布内容以 GitHub Releases 为准。

## 开发与贡献

Canonical package manager 是 npm。提交前至少运行：

```bash
npm ci
npm run lint
npm run test
npm run build
git diff --check
```

请从独立 feature、fix 或 docs 分支提交 Pull Request，不要直接把未审查修改发布为稳定版。

## 相关链接

- [Bangumi API](https://bangumi.github.io/api/)
- [获取 Access Token](https://next.bgm.tv/demo/access-token)
- [GitHub 仓库](https://github.com/threeyang3/bangumi-sync)

## 支持开发

<img src="https://raw.githubusercontent.com/threeyang3/bangumi-sync/main/demo_pic/赞助二维码.jpg" width="200" alt="赞助二维码">

## 许可证

MIT License
