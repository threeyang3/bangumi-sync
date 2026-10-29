# Architecture

全面同步使用 `ComprehensiveSyncService` 编排共享账号／本地比较、分区计划和最终结果。它复用 `StatusSyncService` 的字段差异和写回，以及 `SyncManager` 的身份安全导入与事务机制；`ComprehensiveSyncModal` 负责分页预览、新增勾选、复用字段审阅和结果展示。预览与确认执行分别持有短期 write lease，执行的两个阶段显式共享许可。现有状态同步弹窗的 review 模式仅保存决策，最终写入由协调层统一触发。

协调层私有保存云端语义快照，字段审阅只需返回决策。执行先有界复核全部所选条目的收藏、比较范围内章节／平台数据与本地内容，再启动两个写入引擎；任一复核失败均在首次 mutation 前中止。新增笔记详情在确认后重新读取，表单详情会话不复用于全面同步写入。控制面板使用具名 actions 对象分别传递全面同步与恢复入口；自建弹窗统一使用 `bangumi-modal` 标记。

存在所选新增条目时，协调层在云端复核后调用 Manager 的本地身份预检，复用扫描注册表检查已存在／重复／冲突身份。预检不规划最终路径；已有状态写入结束后，导入引擎仍重新扫描并规划碰撞组。该额外扫描不用于没有新增选择的执行。

本文描述当前系统结构、依赖方向和主数据流。业务判断见[逻辑参考](LOGIC_REFERENCE.md)，身份与路径见[身份与路径模型](PATH_AND_ID_MODEL.md)，恢复内部状态见[恢复模型](RECOVERY_MODEL.md)。

## System overview

Bangumi Sync 是一个 Obsidian 插件，在 Bangumi API 与本地 Vault 之间同步收藏、用户数据、平台元数据、封面和相关条目。系统把 Bangumi Subject ID 视为身份，把 Markdown 路径视为可变化的存储位置。

```text
Obsidian commands / settings / modals
                ↓
        application services
                ↓
sync planning ─ document services ─ API client
                ↓
path transaction + recovery journal
                ↓
          Obsidian Vault
```

## Project layers

### Plugin composition

`main.ts` 创建插件生命周期、命令、Ribbon、设置页和共享服务。它负责组装，不拥有模板、身份、状态同步或 recovery 的第二套规则。

### UI and orchestration

`src/panel/`、`src/ui/`、设置页和各类 modal 负责收集用户选择、展示进度与错误、调用 service。UI 不直接决定 recovery actions，也不自行解析 Subject ID。

`SyncProgress.phase` 为可选展示信息；存在时 current/total 仅指当前阶段完成的处理次数。Manager 在实际异步处理结束后推进计数，未知总量的阶段使用 total=0。`syncProgressPresentation.ts` 统一 modal 与状态栏的阶段文案和计数边界，仅在 UI 层节流 DOM 刷新，不丢弃 manager 进度事件。进度不进入 recovery journal；`SyncResult.duration` 保持本次执行调用的计时范围，不累计预览前加载或用户确认等待。

### Application services

- `src/sync/syncManager.ts`：主同步、事务、恢复和全局 manager 状态。
- `src/sync/statusSyncService.ts`：状态差异、后台补全和写回编排。
- `src/document/subjectDocumentService.ts`：统一 Markdown/frontmatter/section 写入边界。
- `src/userData/`：导入导出与本地数据保护。
- `src/note/`、`src/episode/`：共享笔记、集数状态与吐槽能力。

### Pure domain logic

模板注册、自定义属性分类、路径规范化、状态同步 diff、短评解析、导入合并等应尽量保持为纯函数，以便 Vitest 覆盖并避免 UI 分支漂移。

`common/template/templateSystem.ts` 是内容／路径分类树、V2 配置迁移和继承解析的唯一入口。旧字段保留为迁移备份；`main.ts` 只负责提供文件读取器并将编译结果接入稳定 Manager。运行时沿用不可变的内容和路径 map，但 key 为规范节点 ID（内容 key 带命名空间），不再用原始作品 category 决定继承。

`TemplateSettingsView` 提供作品内容、输出路径、共享笔记和模板管理四个界面，共用同一节点定义。`templateFiles.ts` 管理只创建新目录的导出、manifest 快照校验和有效节点预检。文件恢复复用创建式导出，在唯一新目录写入快照并重新绑定引用；规则导入使用当前 Vault 引用，预检失败阻止应用。它使用统一 write gate，不会修改或删除既有条目文档。部分导出失败保留可见文件，不自动清理。真实条目写入继续通过 `SubjectDocumentService` 和原事务／journal。

引用文件事件由插件注册并随卸载清理；修改立即使预览 context 失效，在无活动事务时串行编译并更新 Manager。读取失败保留为节点错误，设置界面仍可修正引用。模板示例预览调用生产正文渲染和路径命名函数，不执行下载、条目写入或路径迁移。

`src/sync/recoveryFactIndex.ts` 负责 journal 事实的内存合并索引和 pending created-path 匹配，复用统一路径规范化；由 manager 管理索引生命周期，不执行 Vault I/O 或决定 recovery actions。

### Infrastructure

- `common/logging.ts`：按当前已应用设置控制惰性详细日志；插件注册设置读取器并在卸载时解除。默认保留显式挑选统计字段的批次摘要和警告/错误，详细日志不得输出请求正文、Token 或恢复日志原文。

- `src/api/`：Bangumi API 和重试边界。
- `src/api/requestScheduler.ts`：同一已加载插件的所有 BangumiClient 共用实际 API HTTP 请求名额；重试退避在名额之外等待，已在途请求结束前不释放名额。设置应用/恢复配置 1–5 基础上限；同步入口与预览会话持有临时预算，实际取所有上限的最小值，并在操作结束或会话关闭时释放，恢复到当前基础设置。不纳入封面等独立 binary/CDN 下载。
- `common/file/`：Vault 文件与图片基础操作。
- `common/template/`：模板解析和渲染。
- Obsidian `Vault`、`requestUrl`、plugin data persistence：运行时适配层。

`src/api/subjectDetailSession.ts` 为一次手动预览与导入共享完整 subject 响应，合并同 ID 的在途请求，只缓存成功响应。预览 worker 和会话均限制详情并发；超时后底层 `requestUrl` 未结束仍占用会话名额，迟到结果不进入缓存。简版回退仅供表单展示，执行阶段仍重试完整详情；其余关联 API 按执行流程加载。取消、完成、卸载清理会话；凭据 revision、manager 与已应用配置检查阻止旧预览跨配置执行。此会话不是全局缓存；HTTP 总预算由共享 requestScheduler 管理，不用会话的详情计数代替。

`src/template/subjectDataRequirements.ts` 复用实际模板选择和 infobox 解析，集中推导辅助资料与章节显示需求。Manager 先取得完整 subject（可复用预览），再按需求调用角色/人物/关联 API，渲染前按需加载章节；完整 subject 保持满足现有全部路径变量。具体判断见[逻辑参考第 22 节](LOGIC_REFERENCE.md#22-同步时如何决定资料需求与请求并发)。

## Module responsibilities

| Module | Responsibility | Must not own |
| --- | --- | --- |
| `main.ts` | 生命周期和依赖组装 | 业务判断、文件身份解析 |
| `SyncManager` | 同步批次、事务、manager/recovery state | UI-specific policy |
| `SubjectDocumentService` | 身份安全的文档读写 | 路径碰撞分配 |
| `LocalSubjectRegistry` / incremental sync | ID 到路径索引和路径状态 | 模板渲染 |
| Path resolver/planner | 路径生成、规范化、碰撞组 | 文档内容写入 |
| Recovery journal/policy | 持久事实、候选、动作策略 | 用户展示文案 |
| Status sync logic/service | 用户/平台 diff 和执行 | DOM rendering |
| Template registry/properties | 模板来源、变量、自定义字段分类 | Vault transaction |

## Dependency directions

- UI 依赖 application services，services 不反向依赖 modal 实现。
- 文件写入口依赖共享 document service 和 write gate。
- Recovery Center 依赖 recovery policy；不得复制 reason/action switch。
- 状态同步、导入导出和强制同步共享 frontmatter/section 读取逻辑。
- 身份和路径工具可以被 services 使用，但不能依赖 UI。
- `common/` 应保持基础设施性质，避免反向依赖高层 manager。

## Plugin startup lifecycle

1. `onload()` 读取并规范化设置。
2. 创建稳定的共享 manager 与依赖服务。
3. 扫描 recovery journal candidates、legacy staging 和 orphan temp。
4. 若存在恢复上下文，manager 进入 `recovery-required` 并保持写门禁。
5. 注册命令、Ribbon、设置页和状态订阅。
6. 正常状态下按需扫描本地条目，不在启动时擅自移动用户文件。

设置更新通过 candidate、串行 persistence、configuration lease、manager apply 和依赖刷新完成；失败时对齐磁盘、内存、manager config 与 UI。

## Main sync flow

```text
load remote collections
        ↓
scan local identities and path states
        ↓
calculate incremental diff
        ↓
prepare templates, custom properties and full content
        ↓
persist recovery facts
        ↓
execute path / Markdown / binary transaction
        ↓
commit + journal cleanup
        ↓
post-commit related links and presentation
```

内容准备完成前不移动文件。任何目标写入都在实际 mutation 点复核 Subject ID。部分成功且尚未确定终态时保留事务，由用户 Commit 或 rollback；uncertain binary mutation 会停止批次并整体回滚。

## Local document model

Markdown 包含：

- 以 `id` 为核心的身份 frontmatter；
- Bangumi 平台与用户字段；
- 模板定义的本地自定义字段；
- 由共享 document service 管理的短评、记录、感想和集数区域。

强制同步、状态同步、导入导出和批量编辑不得各自实现不同的字段/section 解析。

## Path and identity system

Subject ID 是唯一身份，路径是状态。Registry 维护当前路径，planner 只在必要时执行碰撞消歧。用户重命名默认受到保护；插件只移动已确认 managed 或安全 inferred-managed 的路径。

详细规范化、非法字符、年份/ID 消歧和恢复期 expectation 见[身份与路径模型](PATH_AND_ID_MODEL.md)。

## Recovery boundary

Recovery journal 必须先于首次 Vault mutation 持久化，独立路径迁移也不例外。主事务包括路径、Markdown、binary 和 path states。所有写服务经过统一 gate；同一 manager 的 Vault 操作从准备到 post-commit 写入保持互斥，只读诊断和 Recovery Center 在 gate 下仍可使用。

Journal candidates、terminal markers、configuration recovery、secret safety 和 restart mapping 见[恢复模型](RECOVERY_MODEL.md)。

## User data flow

模板 frontmatter 被分为 identifier、Bangumi-managed 和 custom fields。导出、导入、强制同步继承与手工/搜索同步使用同一分类规则。正文记录与感想通过共享 section helpers 读取，短评以标准 callout 为本地真实来源。

## Status sync flow

控制面板先加载基础收藏和本地快照，再后台补全 episode/platform 数据及语义快照。Pure logic 生成差异，modal 收集保留本地、保留云端或合并选择。普通入口由 `StatusSyncService` 冻结确认数据、取得 write lease、有界复核选中条目的云端快照和本地内容，全部通过后调用 executor；全面同步由协调层先完成预检，再携同一 lease 调用 service，避免重复请求。执行器仍在每次写回核对身份和内容。

长期不变量见[状态同步不变量](STATUS_SYNC_INVARIANTS.md)。

## Extension points

新增能力时优先扩展现有边界：

- 新模板字段：template properties / registry；
- 新文档 section：document service；
- 新写入口：write gate + identity-safe mutation；
- 新 recovery reason：policy + model + UI + restart tests；
- 新状态字段：pure status logic + service + invariant tests；
- 新路径策略：单一 planner，不新增标题匹配或第二套 normalization。
