# 逻辑判断参考

本文档集中说明 Bangumi Sync 当前各机制里的“判断逻辑”与“分支规则”。如果你想知道某条数据为什么会被跳过、弹窗为什么会出现、某个字段为什么会被当作自定义属性，这里是主参考。

## 1. 模板选择逻辑

模板选择入口在 `resolveTemplateForSubject()`。

判断顺序是：

1. 先解析条目的细分类别 `category`
2. 如果是书籍类型中的小说，优先用 `novel`
3. 如果是书籍类型中的漫画，优先用 `comic`
4. 如果是画集 / 画本，优先用 `album`
5. 否则按 `subject.type` 选择：
   - `anime`
   - `game`
   - `music`
   - `real`
   - `book` 默认回落到 `novel`
6. 如果用户没有配置对应模板，再回退到内置默认模板

这意味着“书籍”不是一个最终模板类别，而是会继续细分。

## 2. 本地已同步条目如何识别

本地扫描入口在 `IncrementalSync.scanLocalFolder()`。

识别某个 Markdown 文件对应哪个条目的顺序是：

1. frontmatter `id`
2. frontmatter `ID`
3. frontmatter `BangumiID`
4. 封面路径中的 `{id}_cover.xxx`
5. `bgm.tv/subject/{id}` 链接

只要能提取到 id，这个文件就会被视为某个已同步条目。

这套逻辑是为了兼容旧模板和旧文件，而不是推荐继续扩展更多兜底来源。

## 3. 增量同步 diff 如何计算

`IncrementalSync.computeDiff()` 的逻辑非常直接：

- 先把远程收藏分成两组：
  - 本地已存在 `existing`
  - 本地不存在 `notExisting`

非强制同步：

- `toAdd = notExisting`
- `toSkip = existing`
- `limit` 只作用于 `notExisting`

强制同步：

- `toAdd = remoteCollections`
- `toSkip = []`
- `limit` 直接作用于全部远程收藏

所以“强制同步”不是“先找已有文件再覆盖”，而是“完全忽略本地是否存在，直接按远程列表重跑生成流程”。

## 4. 哪些入口会弹本地自定义属性窗口

当前规则是：

- 会弹窗：
  - `同步收藏` 命令，且使用手动预览流程时
  - 控制面板 `同步选中`
  - 控制面板 `强制同步`
  - 搜索并添加条目时的本地创建流程
- 不会弹窗：
  - 快速同步
  - 自动同步

不弹窗时的行为：

- 模板里有字面量默认值，就保留默认值
- 模板里是空字段，就保持空
- 模板里是 `[]`，就保持空数组

## 5. 自定义属性如何筛选

筛选入口在 `templateProperties.ts`。

它不是维护一张“自定义属性白名单”，而是：

1. 先拿模板 frontmatter 的全部 `key: value`
2. 再按属性名和模板变量分类

分类结果只有三类：

- `identifier`
- `auto`
- `custom`

### 5.1 `identifier` 判定

以下属性名直接视为辨识属性：

- `id`
- `ID`
- `中文名`
- `原名`
- `别名`
- `作品大类`
- `具体类型`

这些字段用于识别条目，不会进入本地自定义属性窗口。

### 5.2 `auto` 判定

以下属性名直接视为自动字段：

- `Bangumi评分`
- `Bangumi链接`
- `封面`

除此之外，如果某个属性值里只包含“自动模板变量”，也会被视为自动字段。

例如：

- `评分: {{my_rate}}`
- `作者: "{{author}}"`
- `平台: "{{platform}}"`

### 5.3 `custom` 判定

只要不属于前两类，就归入 `custom`。

例如：

- `存储:`
- `资源属性: []`
- `已购: false`
- `平台: "Steam"`
- `剧情评分:`
- `趣味评分:`
- `剧情评分: {{rating_story}}`

其中最后一种旧写法虽然包含模板变量，但变量不属于自动字段，因此仍然视为自定义属性。

## 6. 字段类型如何判定

字段类型只看模板 frontmatter 中原始值：

- `true` / `false` -> `toggle`
- `[]` -> `list`
- 其他 -> `text`

注意：

- `资源属性: []` 会在 UI 中变成逗号输入框，落盘时再写回 YAML 列表
- `"false"` 这种带引号字符串不会被当成布尔
- 旧模板里的 `{{rating_story}}` 仍然会落到 `text`

## 7. 模板默认值如何判定

默认值来源只看模板 frontmatter 的字面量：

- `平台: "Steam"` -> 默认值 `Steam`
- `已购: false` -> 默认值 `false`
- `资源属性: []` -> 默认值空数组
- `剧情评分:` -> 没有默认值

兼容逻辑：

- 如果值是单个模板变量并且带默认值，例如 `{{rating_story|8}}`
- 会把 `8` 识别为输入默认值

## 8. 为什么旧模板里的 `{{rating_xxx}}` 还能工作

当前兼容分两层：

1. `templateProperties.ts` 会把单变量值里的变量名提取为 `inputTemplateVariable`
2. `SyncManager` 会把用户填写的属性值按变量名转成 `extraTemplateVars`
3. `contentTemplate.ts` 在模板渲染阶段把这些变量补进去

随后如果用户在 UI 里明确填了值，还会再跑一遍 `applyNamedPropertyValuesToContent()`，按属性名直接覆盖 frontmatter。

所以旧写法能工作，但推荐新模板直接写普通字段，不再依赖额外变量桥接。

## 9. 搜索并添加时的字段分组逻辑

`AddToCollectionModal` 会把输入拆成两组：

- Bangumi 属性
  - 收藏状态
  - 评分
  - 标签
  - 短评
- 本地自定义属性
  - 来自模板 `customProperties`

这两组数据后续流向不同：

- Bangumi 属性会用于可选云端写回
- 本地自定义属性只参与本地文件生成

## 10. 控制面板 / 同步收藏为什么要先拉完整条目

原因是模板选择和自定义属性分类依赖真实 `Subject` 信息，尤其是：

- 条目类型
- 细分类别
- 实际命中的模板

因此弹自定义属性窗口前，会先尝试 `getSubject()`。

如果请求失败：

- 当前实现会回退到收藏列表里的简版 `subject`
- 继续完成属性弹窗
- 只提示一次警告，不让整批同步中断

## 11. 强制同步时如何继承旧数据

强制同步链路中，顺序是：

1. 重新获取远程条目与章节数据
2. 重新生成整篇内容
3. 若用户本次填写了显式自定义属性，先覆盖到新内容上
4. 如果目标文件已存在，则提取旧文件里的用户数据
5. 按数据保护设置把旧数据合并回新内容
6. 最后如果存在显式自定义属性，再覆盖一次

最后这次覆盖是为了避免“旧文件继承值把本次用户输入盖回去”。

## 12. 哪些数据会被保护 / 导出 / 导入

当前导出 / 导入 / 强制同步继承统一围绕四层数据：

- `identifier`
  - `id`
  - `name_cn`
  - `type`
  - `workType`
- `userProperties`
  - `评分`
  - `tags`
  - `收藏状态 / 观看状态 / 阅读状态 / 游玩状态`
  - `进度`
  - `短评`（导出结构里表现为属性，但本地真实来源是正文 callout）
- `customProperties`
  - frontmatter 中所有非 Bangumi 字段
- `bodySections`
  - `记录`
  - `感想`

不会被当成用户数据继承的内容包括：

- 章节展示块
- 角色展示
- Bangumi 可重新获取的 frontmatter 字段

## 13. 导出时如何区分用户字段与自定义字段

`UserDataExtractor.extractExportProperties()` 的规则是：

- 遍历 frontmatter 全部字段
- `IDENTIFIER_FIELDS` 直接跳过
- 如果命中 `USER_PROPERTY_FIELDS`，只有在“导出用户属性”开启时才写出
- 其余字段走排除法，只要 `isCustomPropertyField(key)` 为真，就归入 `customProperties`
- 值为 `undefined / '' / null` 的跳过
- 如果开启“导出用户属性”，正文短评 callout 会额外写回 `短评` 属性

注意：

- 自定义属性判断是排除法，因此未知的本地属性也能被带进备份
- 评分明细拆出来的 `剧情评分 / 人设评分 / 趣味评分` 等字段属于自定义属性，不属于 Bangumi 可重新拉取字段

## 14. 备份文件结构如何组织

当前备份默认导出为单个 `bangumi-user-data.json`，顶层结构是：

- `version`
- `exportTime`
- `totalCount`
- `categories`

其中 `categories` 是一个对象：

- key 为条目的 `category`
- value 为该分组下的 `items`

`category` 现在只负责备份文件内部分组，不参与导入匹配。  
导入真正用于定位本地条目的仍然是 `identifier.id`。

## 15. 导入时如何合并字段

`UserDataImporter` 支持三种策略：

- `prefer_local`
  - 本地已有字段时不覆盖
- `prefer_import`
  - 本地已有字段时直接用导入值覆盖
- `smart`
  - 列表字段合并去重
  - 文本字段直接拼接
  - 其余字段等价于用导入值覆盖

### 15.1 导入流程（v6.8.5）

导入流程现在分四步：

1. **属性管理**：扫描所有导入文件中的可管理属性（用户属性 + 自定义属性），弹出 `PropertyManageModal`，用户可选择忽略或设置别名
2. **对比导入**：`compareImportData()` 逐条目对比：
   - 本地为空 + 导入不为空 → 自动写入
   - 本地有值且与导入不同 → 收集到 `ImportItemDiff`
   - 被忽略的属性不参与对比和写入
   - 设置别名的属性用别名后的名称参与对比
3. **人工审查**：
   - 按条目模式：`ImportCompareModal`
   - 按属性模式：`PropertyImportReviewModal`
4. **应用决策**：`applyImportPlan()` 按用户决策批量写入

如果导入文件中的字段在本地文件里根本不存在：

- 不会自动直接写入
- 会进入 `missingFields`
- 由后续弹窗决定是 `add` 还是 `skip`

## 16. 列表字段的比较与合并规则

以下字段按“列表类字段”处理：

- `tags`
- `版本`
- `格式`
- `平台`
- `存储`
- `渠道`

比较前会统一：

- 按英文逗号、中文逗号、换行拆分
- trim
- 去重

因此 `["台版","日版"]`、`台版, 日版`、`台版，日版` 会被视为等价。

## 17. 标签的抽取与规范化规则

标签处理统一依赖 `IncrementalSync`：

- 读取时支持：
  - YAML 列表
  - 逗号分隔行内值
- 写回时统一写成 YAML 列表

规范化会做：

- trim
- 去重
- 过滤空值
- 过滤明显像键值对的损坏值，例如 `评分: 9`

状态同步里的标签比较和更新都必须走这套净化逻辑。

## 18. 短评的抽取与规范化规则

短评现在以正文 callout 为本地真值来源：

- **正文 callout**：本地比较、导出提取、导入写回、状态同步全部以这里为准
- **导入 / 导出属性 `短评`**：只是备份文件中的承载形式，不要求本地 frontmatter 真的存在 `短评`

正文格式如下：

```markdown
> [!abstract]+ **短评**
> ...
```

比较前会统一做：

- 换行标准化（`\r\n` → `\n`）
- 去尾部空白
- 折叠过多空行

提取时遇到下一个 callout 头或 `##` 标题会停止，避免把后续 `简介` 等正文块误吞进短评。

## 19. 相关链接如何去重

相关链接更新规则在 `IncrementalSync.updateRelated()`：

1. 先读出已有 `相关`
2. 规范化链接字符串
3. 按集合去重
4. 统一写回成 YAML 数组
5. 每个链接项加双引号

同一批次同步中的新文件之所以能被后续条目立刻引用，是因为 `batchSyncedItems` 也参与了本地路径解析。

## 20. 收藏状态查询逻辑

搜索结果里的“是否已收藏”判断，和同步主链路里的收藏拉取不是一回事。

当前查询规则：

1. 先通过 `/v0/me` 或缓存拿到真实用户名
2. 查询 `/v0/users/{username}/collections/{subject_id}`
3. `200` 代表已收藏
4. `404` 代表未收藏
5. 其他错误按异常处理

这里专门避免把 `404` 记成错误日志，是为了不让搜索结果列表刷满控制台噪音。

## 20. 单集状态的优先级

单集状态的真实来源优先级是：

1. 正文 `.ep-box` 渲染结果
2. frontmatter `ep_statuses`

写回时必须同时更新：

- `ep_statuses`
- `.ep-box` 的 `data-status`
- `.ep-box` 的 `watched` class

否则会出现“当前界面显示变了，但重新打开文件后又回去”的假持久化问题。

更详细的历史问题见 [STATUS_SYNC_PITFALLS.md](./STATUS_SYNC_PITFALLS.md)。
