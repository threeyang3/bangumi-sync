# 回归清单

## 6.10.5 manager / recovery

- [ ] pending decision 时保存 Access Token，确认 manager identity 不变且原窗口仍能回滚原事务。
- [ ] recovery-required 时修改扫描目录、路径模板和命名策略，确认设置不持久化且恢复上下文不变。
- [ ] 注入 restore-content 失败：内容未恢复时出现 `content-mismatch`，恢复原始 CRLF/LF 内容后才能确认成功。
- [ ] 新建文件删除失败后修改其 ID，确认 concrete created path 仍触发 `unexpected-created-path`（含 Windows 大小写路径）。
- [ ] 故障发生于 ACGN 后尝试改变配置，确认所有恢复扫描仍固定使用批次开始的 ACGN。
- [ ] 同时打开 SyncModal 和多个 Recovery Center；恢复成功后所有旧操作禁用，当前失败为 0，历史失败仍在尝试记录中。
- [ ] 确认插件重载不宣称恢复运行期上下文；跨重启恢复仍属于 Issue #5。

这份清单只记录当前仍需要保留的人工回归项，作为 `lint / build / test` 之外的最后一道护栏。

## 什么时候必须跑

- 修改 `src/panel/`、`src/sync/`、`src/comment/`、`src/userData/` 后
- 调整模板默认字段、短评正文结构、状态同步流程后
- 发布前

## 自动化前置检查

先跑：

```bash
npm run lint
npm run build
npm run test
```

## Sandbox 人工回归

仓库默认在 `E:\ObsidianVaults\Sandbox` 做插件回归。

至少检查下面几项：

1. 打开控制面板
   - 云端收藏列表正常加载
   - 已同步条目能正确显示本地同步状态
2. 执行“同步状态”
   - 弹窗能快速打开
   - 用户数据差异先出现
   - 单集状态 / 平台数据随后后台补全
3. 验证短评写回
   - 多段短评全部保留在 `> [!abstract]+ **短评**` callout 内
   - 不会只渲染第一段，后续段落不会掉到 callout 外
4. 验证平台数据同步
   - “同步用户数据”与“同步平台数据”入口独立可用
   - 平台同步不再依赖本地 `连载状态` 字段做跳过
5. 验证导入用户数据
   - 本地短评读取与导入对比保持一致
   - `smart` 合并对标签列表和正文段落行为正确
6. 验证 ID 与路径
   - 手动重命名文件后普通、强制和状态同步仍更新原文件
   - 重复 ID、身份字段冲突和缺少 ID 会出现在诊断中
   - `ACGN` 扫描不包含 `ACGN_backup`、`ACGN-old`、`ACGN2`
7. 验证同名条目
   - 乱马 1989 / 2024 得到两个不同 ID 的年份文件
   - 同年或缺少年份时追加 Bangumi ID
   - 并发数 1 与大于 1 的路径分配一致
   - `乱马1／2.md` 与 `乱马1/2.md` 的文件/目录边界不混淆
   - 无历史状态但位于当前首选路径的旧文件可参与碰撞；自定义旧路径保持不动
8. 验证迁移与回滚
   - 普通同步不会因模板变化移动旧文件
   - 迁移预览保护 user-renamed / unknown 路径，除非显式包含
   - 取消后新建文件进入回收站，更新内容和重命名恢复
   - 内容生成失败时旧文件尚未移动；重命名后写入失败时自动恢复旧路径
   - 成功批次无可用旧事务；部分成功可回滚；重复回滚不重复删除
   - 自动回滚失败时结果明确显示 `rollback-failed`
9. 验证共享笔记
   - 相关条目可继续共享笔记
   - 同名但无关条目不会因路径相同自动合并

## 说明

- 这份清单不替代自动化测试；它补的是 Obsidian UI 与真实 Vault 交互层。
- 如果未来补上更强的集成测试，再缩减这份清单。

## 6.10.2 事务终结

- [ ] 部分成功显示保留与回滚按钮，并阻止新批次。
- [ ] 关闭未决结果时显示“保留 / 回滚 / 返回”。
- [ ] 保留操作先保存路径状态再提交事务。
- [ ] 路径状态保存失败时恢复文件、内容、路径、旧状态并清空批缓存。
- [ ] 第二个 staging 与 final rename 失败时恢复所有原路径。
- [ ] 恢复失败报告临时路径/原路径并显示 `rollback-failed`。
- [ ] 一个无关条目失败不撤销成功碰撞组和其他正常条目。
- [ ] 上下文重命名计入 renamed；关联后处理失败显示警告。

## 6.10.3 原子决策与恢复

- [ ] 快速双击同一决策只执行一次，保留与回滚竞争时只有先到者生效。
- [ ] 决策进行中两个按钮同时禁用，关闭提示不会重复打开且不会提前关闭主窗口。
- [ ] 手动回滚后 created/updated/renamed 归零，rolled back 数量与 attempted action 可追溯。
- [ ] 空事务失败保持 failed，不误显示 rolled-back。
- [ ] 关联链接只在明确保留后写回，回滚不会执行延迟后处理。
- [ ] 文件恢复、路径状态恢复和重扫失败均保留恢复上下文及 operation/path/message。
- [ ] 恢复期间普通、预览、搜索、控制面板、自动同步和路径迁移入口均被阻断。
- [ ] 重试恢复只处理未完成记录；人工确认会阻止临时文件、重复 ID、阻塞诊断和路径状态不一致。

## 6.10.4 恢复闭环

- [ ] absent/absent 通过；absent/present 报 unexpected；present/absent 报 missing。
- [ ] 同 ID 不同路径报 path mismatch；期望路径属于其他 ID 报 identity mismatch。
- [ ] 人工确认重新保存原 `subjectPathStates`，配置状态和 `IncrementalSync` 状态都相等，并在二次扫描后才清门禁。
- [ ] Retry、Manual Confirm 与 Rescan 共享一个 Promise；并发点击只执行首个动作。
- [ ] result snapshot 在 awaiting 和自动恢复失败前已存在；最终统计表示磁盘终态。
- [ ] attempts 历史与 latest 分开，最新诊断不包含已经解决的历史失败。
- [ ] Recovery Center 可通过命令面板打开、关闭、重新打开；上下文不会因关闭窗口丢失。
- [ ] 动作期间按钮禁用；成功、阻塞或 handler 异常后整页重绘并重新启用，无 unhandled rejection。
- [ ] rollback-failed 的 SyncModal 提供 Recovery Center 入口，关闭结果后仍能恢复。
- [ ] 收藏/单条同步、迁移、封面、关联、状态、批量编辑、导入导出、集数、吐槽、共享笔记在 UI 与服务层均受门禁保护。
- [ ] 本地诊断和恢复扫描仍可用；恢复动作不发起网络请求。
- [ ] 明确记录 6.10.4 无重启自动恢复/磁盘事务日志，Issue #5 保持 open。
