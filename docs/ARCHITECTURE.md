# 项目架构与模块说明

本文档描述 Bangumi Sync 当前代码结构、主要模块职责、核心运行链路，以及模块之间如何协作。

如果你要看更细的判断条件，请继续读 [LOGIC_REFERENCE.md](./LOGIC_REFERENCE.md)。

## 1. 总体分层

项目大致分为三层：

```text
main.ts
  └─ 插件入口层：命令注册、设置加载、UI 入口拼装

src/
  └─ 业务层：同步、控制面板、模板、自定义属性、导入导出、单集功能

common/
  └─ 基础设施层：API 类型、默认模板、路径模板、文件与图片处理、基础解析器
```

这不是严格的 DDD 或 Clean Architecture，而是一个以 Obsidian 插件实际落地为目标的分层：

- `main.ts` 只负责把各功能接到 Obsidian 生命周期和命令系统上。
- `src/` 负责业务编排和用户交互。
- `common/` 提供相对稳定的通用能力，尽量不关心 UI。

## 2. 目录职责

### 2.1 入口与资源

- `main.ts`
  - 插件主类 `BangumiPlugin`
  - 加载设置、初始化 `SyncManager`
  - 注册命令、Ribbon、设置页
  - 连接“同步收藏”“控制面板”“搜索条目”“导入导出”等入口
  - 状态栏同步进度指示器（后台运行时显示）
- `manifest.json`
  - Obsidian 插件清单
- `styles.css`
  - 所有 modal、面板、单集框、表单的公共样式

### 2.2 `common/`

- `common/api/`
  - Bangumi API 端点常量与类型定义
- `common/parser/`
  - infobox、角色、章节等解析逻辑
- `common/template/`
  - 默认模板、路径模板、类型标签
- `common/file/`
  - 文件写入、图片下载
- `common/utils/`
  - frontmatter、安全字符串化、延迟等通用工具

### 2.3 `src/`

- `src/api/client.ts`
  - Bangumi HTTP 请求层
  - Token 校验、收藏查询、条目详情、章节与收藏写回
- `src/sync/`
  - 同步主流程与增量检测
- `src/template/`
  - 模板变量渲染、自定义属性分类
- `src/ui/`
  - 同步参数、同步预览、搜索并添加、本地自定义属性等弹窗
- `src/panel/`
  - 控制面板、状态同步、批量编辑、冲突解决
- `src/userData/`
  - 强制同步继承、导入、导出
- `src/episode/`
  - 单集状态、单集评论、右键菜单
- `src/note/`
  - 共享条目笔记
- `src/settings/`
  - 插件设置结构与设置页
- `src/i18n/`
  - 中英文文案
- `src/utils/`
  - UI 相关轻量工具函数
  - 当前包含移动端断点检测，移动端判断只使用 `max-width: 767px`
  - 移动端 UI 核心逻辑：控制面板使用 Grid 底栏实现状态与分页同列对齐；搜索弹窗引入 `bangumi-search-selectors-container` 实现输入与选择器的分行布局对齐。
  - 桌面端 UI 核心逻辑：弹窗采用 Flex 纵向布局配合 `overflow: hidden` 消除双滚动条；通过 `color-mix` 统一内部容器与外围背景的色调，消除分层感。

## 3. 启动生命周期

插件加载时，`main.ts` 的主流程是：

1. `loadSettings()`
2. `initSyncManager()`
3. `initEpisodeFeatures()`
4. 注册命令、Ribbon、设置面板
5. 如果开启自动同步，则 `setupAutoSync()`

其中比较重要的初始化点：

- `SyncManager` 是大多数业务链路的核心协调器。
- 单集功能初始化失败不会阻断整个插件加载。
- 模板在 `initSyncManager()` 中解析并注入，后续同步链路都使用这份配置。

## 4. 核心对象关系

运行时最核心的几个对象如下：

```text
BangumiPlugin
  ├─ settings
  ├─ syncManager
  ├─ controlPanel
  ├─ subjectNoteManager
  ├─ episodeStatusManager
  └─ episodeContextMenu

SyncManager
  ├─ client
  ├─ fileManager
  ├─ imageHandler
  ├─ incrementalSync
  ├─ userDataExtractor
  └─ userDataMerger
```

职责边界如下：

- `BangumiPlugin` 决定“从哪里进入功能”。
- `SyncManager` 决定“同步时怎么编排”。
- `IncrementalSync` 决定“本地已有啥、该跳过啥、状态字段怎么提取”。
- `contentTemplate.ts` 决定“最终 Markdown 长什么样”。
- `templateProperties.ts` 决定“哪些 frontmatter 字段是辨识属性、自动字段、自定义属性”。

## 5. 模块详解

### 5.1 `src/api/client.ts`

这是所有 Bangumi API 通信的唯一入口。

主要职责：

- 统一封装 `requestUrl`
- 附带认证头
- 规范错误日志
- 缓存已验证的用户名
- 对少量接口做额外语义处理
- 对 429 和 5xx 错误自动重试（指数退避 1s→2s→4s，最多 3 次）
- `getAllUserCollections()` 分页间隔动态化（前 5 页 50ms，之后 100ms），支持取消信号

需要特别注意的点：

- 收藏状态查询不能再用 `/v0/users/-/collections/{id}` 读取。
- 当前逻辑会先验证 token 或复用缓存用户名，再查询 `/v0/users/{username}/collections/{id}`。
- `404` 在收藏状态查询里被当作”未收藏”，不是异常。

### 5.2 `src/sync/syncManager.ts`

这是同步主编排器，负责把“远程数据获取、本地扫描、模板生成、用户数据保护、文件落盘、相关链接更新”串起来。

它不负责：

- 复杂 frontmatter 解析细节
- 单集状态 DOM 读写
- 设置页 UI

它主要负责：

- 普通同步 `sync()`
- 手动同步准备 `prepareSync()`
- 预览确认后执行 `executeSync()`
- 同步数据准备 `prepareSyncData()`（`sync()` 和 `prepareSync()` 的共享逻辑）
- 控制面板覆盖同步
- 搜索并添加后的单条同步 `syncSingleSubject()`
- 协作式取消/暂停支持（通过 `SyncCancellationSignal`）
- 批次回滚 `rollbackBatch()`（删除本次新建的文件）
- 并发处理 `processConcurrently()`（三个同步方法共享）
- 双向链接批量更新（按目标文件分组，每个文件只读写一次）
- 错误详情收集（`SyncResult.errorDetails`）

### 5.3 `src/sync/incrementalSync.ts`

这是“本地事实层”。

它维护三类状态：

- 历史已同步条目 `localSubjects`
- 当前批次刚同步成功的条目 `batchSyncedItems`
- id→path 反转索引 `metadataIdIndex`（扫描后从 metadataCache 构建）

主要职责：

- 扫描目录并识别本地已同步条目（优先使用 metadataCache，减少文件读取）
- 构建 id→path 反转索引，供 `resolvePathByMetadataCache()` O(1) 查找
- 计算远程收藏与本地文件的差异
- 解析和回写短评、标签、相关链接、评分、状态
- 为状态同步面板提供本地值抽取能力

### 5.4 `src/template/contentTemplate.ts`

这是模板渲染层。

主要职责：

- 从 `Subject + UserCollection + Characters + Episodes + 自定义属性值` 生成模板变量
- 渲染 `{{variable}}`、`{{#if variable}}...{{/if}}`、`{{variable|default}}`
- 按条目类型与细分类别选择最终模板
- 在渲染完成后按属性名回写显式自定义属性值

### 5.5 `src/template/templateProperties.ts`

这是当前“自定义属性机制”的核心。

它负责：

- 从模板 frontmatter 提取全部属性
- 将属性分成：
  - `identifierProperties`
  - `autoProperties`
  - `customProperties`
- 推断字段输入类型：
  - `text`
  - `toggle`
  - `list`
- 为 `{{rating_story}}` 这类旧写法提取“输入变量名”

当前所有需要识别自定义属性的功能，都应该先经过这个模块，而不是自己维护字段名单。

### 5.6 `src/ui/`

这里放的是“单次流程型”弹窗：

- `syncOptionsModal.ts`
  - 选择同步参数
- `syncPreviewModal.ts`
  - 手动同步预览、勾选条目
- `localPropertyModal.ts`
  - 批量同步前填写本地自定义属性
- `searchModal.ts`
  - 搜索 Bangumi 条目
  - 移动端使用紧凑搜索/筛选行和带封面缩略图的结果卡片
- `addToCollectionModal.ts`
  - 搜索并添加时填写 Bangumi 属性和本地自定义属性
- `syncModal.ts`
  - 同步进度反馈、暂停/恢复、取消（带回滚）、后台运行支持

### 5.7 `src/panel/`

这里放的是“长期停留型”界面和批量操作：

- `controlPanel.ts`
  - 收藏列表浏览
  - 筛选、搜索、分页
  - 同步选中 / 强制同步 / 删除 / 批量编辑
  - 状态同步入口
  - 移动端卡片式列表、紧凑操作栏、单行分页和顶部下拉关闭手势
- `statusSyncModal.ts`
  - 本地与云端状态差异对比和处理
- `conflictResolver.ts`
  - 状态字段冲突比对
- `batchEditorModal.ts`
  - frontmatter 批量编辑

### 5.8 `src/userData/`

这是“强制同步保护 + 导入导出”的统一模块。

子模块关系：

- `types.ts`
  - 数据结构与保护设置
- `userDataExtractor.ts`
  - 从本地文件提取用户数据
- `userDataMerger.ts`
  - 把用户数据合并回新内容
- `userDataExporter.ts`
  - 批量导出
- `userDataImporter.ts`
  - 批量导入
- `userDataModal.ts`
  - 导入导出弹窗

### 5.9 `src/episode/`

单集功能不是同步主链路的一部分，但和状态同步高度耦合。

主要职责：

- 从正文 `.ep-box` 与 frontmatter `ep_statuses` 中读取状态
- 右键菜单修改单集状态
- 插入与管理单集吐槽

这里的实现必须和 [STATUS_SYNC_PITFALLS.md](./STATUS_SYNC_PITFALLS.md) 一起看。

### 5.10 `src/note/subjectNoteManager.ts`

这是共享条目笔记模块。

主要职责：

- 创建或追加共享笔记
- 在共享笔记 frontmatter 中维护 `笔记ID`
- 通过本地 `相关` 链接聚合候选条目
- 把当前条目的 `笔记` 内容写回共享笔记对应标题下

## 6. 主链路数据流

### 6.1 快速同步 / 自动同步

```text
main.ts -> SyncManager.sync()
  -> validateToken()
  -> getAllUserCollections()
  -> scanLocalFolder()
  -> computeDiff()
  -> processCollection()
  -> generateContentByType()
  -> createOrUpdateFile()
```

特点：

- 不弹自定义属性填写窗口
- 自定义属性只使用模板默认值或空值
- 非强制模式下只处理本地不存在的条目

### 6.2 手动同步收藏

```text
main.ts -> SyncManager.prepareSync()
  -> LocalPropertyModal
  -> SyncPreviewModal
  -> SyncManager.executeSync()
```

特点：

- 先准备预览列表
- 再按模板弹出本地自定义属性窗口
- 再进入勾选预览
- 最后写入文件

### 6.3 控制面板同步选中 / 强制同步

```text
ControlPanel
  -> collectLocalPropertyValues()
  -> SyncManager.processCollection(overwrite: true)
```

特点：

- 自定义属性弹窗与“同步收藏”共用同一套逻辑
- 强制同步时会先生成新内容，再合并回受保护的用户数据

### 6.4 搜索并添加条目

```text
SearchModal
  -> AddToCollectionModal
    -> 可选同步到云端
    -> 可选创建本地文件
      -> SyncManager.syncSingleSubject()
```

特点：

- 输入项分成 Bangumi 属性和本地自定义属性两部分
- 本地自定义属性仍来自模板 frontmatter 动态解析

## 7. 模板与文件生成链路

生成一个本地文件时，链路大致是：

1. 通过 `resolveTemplateForSubject()` 选模板
2. 通过 `extractTemplateVars()` 生成自动变量
3. 通过 `buildExtraTemplateVarsFromPropertyValues()` 把旧式 `{{rating_xxx}}` 输入变量补到模板变量集合
4. 通过 `renderContentTemplate()` 完成变量替换
5. 如果用户在弹窗里显式填写过值，再用 `applyNamedPropertyValuesToContent()` 按属性名覆盖 frontmatter
6. 最后交给 `FileManager` 落盘

这意味着：

- 模板变量替换和“按属性名补值”是两个阶段
- 新模板推荐把自定义属性写成普通 frontmatter 字段
- 旧模板里的 `属性: {{custom_var}}` 仍兼容，但本质上属于兼容层

## 8. 自定义属性机制

当前自定义属性机制的目标是：避免任何 UI、导入导出、同步分支单独维护字段名单。

统一链路是：

```text
模板 frontmatter
  -> templateProperties.ts 解析全部属性
  -> 分成 identifier / auto / custom
  -> UI 弹窗使用 customProperties
  -> SyncManager 使用 customProperties 构建模板附加变量
  -> 导入导出把非 Bangumi frontmatter 字段作为 customProperties
```

因此：

- `评分明细` 不再是特殊类型
- `资源属性` 不再是特殊类型
- 任何用户在模板里新增的 frontmatter 字段，只要不属于自动字段，都会进入同一套机制

## 9. 用户数据保护机制

当前系统只保护三部分：

- `identifier`
  - 用于识别条目，不参与覆盖写回
- `customProperties`
  - frontmatter 中所有本地自定义字段
- `bodySections`
  - 正文中的 `## 记录`
  - 正文中的 `## 感想`

典型使用场景：

- 强制同步时继承旧数据
- 导出为 JSON
- 从 JSON 导回本地

## 10. 状态同步机制

状态同步和“同步收藏到本地”是两条独立链路。

状态同步关注的是：

- 评分
- 短评
- 标签
- 收藏状态
- 单集状态

它依赖：

- `IncrementalSync` 提取本地 frontmatter / 正文值
- `controlPanel.ts` 读取云端收藏值
- `statusSyncModal.ts` 让用户决定保留本地还是云端

这条链路不会重建整篇笔记，而是对已有本地文件做定点修改。

## 11. 相关条目与双向链接

同步单条目时：

1. 先根据 Bangumi relations 生成“当前条目的相关链接列表”
2. 当前条目写入完成后，把自己反向补到已同步相关条目的 `相关` 字段中

增量同步专门维护了 `batchSyncedItems`，用于解决“同批次刚同步出来的文件，后续条目也能立刻引用到”这个问题。

## 12. 文档阅读顺序建议

如果你是：

- 新接手开发者：先看本文，再看 [LOGIC_REFERENCE.md](./LOGIC_REFERENCE.md)
- 模板维护者：看 [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md)
- 状态同步维护者：看 [STATUS_SYNC_PITFALLS.md](./STATUS_SYNC_PITFALLS.md)
- 发布维护者：看 [DEVELOPMENT.md](./DEVELOPMENT.md)
