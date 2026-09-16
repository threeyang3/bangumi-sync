# Architecture

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

### Application services

- `src/sync/syncManager.ts`：主同步、事务、恢复和全局 manager 状态。
- `src/sync/statusSyncService.ts`：状态差异、后台补全和写回编排。
- `src/document/subjectDocumentService.ts`：统一 Markdown/frontmatter/section 写入边界。
- `src/userData/`：导入导出与本地数据保护。
- `src/note/`、`src/episode/`：共享笔记、集数状态与吐槽能力。

### Pure domain logic

模板注册、自定义属性分类、路径规范化、状态同步 diff、短评解析、导入合并等应尽量保持为纯函数，以便 Vitest 覆盖并避免 UI 分支漂移。

### Infrastructure

- `src/api/`：Bangumi API 和重试边界。
- `common/file/`：Vault 文件与图片基础操作。
- `common/template/`：模板解析和渲染。
- Obsidian `Vault`、`requestUrl`、plugin data persistence：运行时适配层。

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

控制面板先加载基础收藏和本地快照，再后台补全 episode/platform 数据。Pure logic 生成差异，modal 收集保留本地、保留云端或合并选择，service 在身份校验和 gate 通过后执行写回。

长期不变量见[状态同步不变量](STATUS_SYNC_INVARIANTS.md)。

## Extension points

新增能力时优先扩展现有边界：

- 新模板字段：template properties / registry；
- 新文档 section：document service；
- 新写入口：write gate + identity-safe mutation；
- 新 recovery reason：policy + model + UI + restart tests；
- 新状态字段：pure status logic + service + invariant tests；
- 新路径策略：单一 planner，不新增标题匹配或第二套 normalization。
