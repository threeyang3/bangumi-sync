# 6.11.2 当前发布回归清单

## 6.11.2 安全与恢复验收

- [x] 配置恢复 journal 递归脱敏，token canary 不出现在 journal、日志或错误信息。
- [x] corrupt/unsupported/malformed current 分别备份，并在 previous 有效时安全回退。
- [x] invalid current 与 previous 都无效时分别备份并保持 recovery-required。
- [x] temp 中断文件单独备份；只有 temp 时安全阻断。
- [x] commit、rollback、manual recovery cleanup 失败保持写门禁，不广播 idle。
- [x] committed/rolled-back cleanup-pending journal 重启后只重试 cleanup。
- [x] previous、temp、current 删除失败均保留足够终态事实。
- [x] binary modify/create 写入后 reject 传播为 uncertain mutation，并自动 rollback。
- [x] binary rollback 后验证 byte length 与 SHA-256；失败继续 recovery-required。
- [x] 普通同步、单条同步和批量封面共用 active journal 事实。

本文件只记录 6.11.1 的发布门槛。6.10.x 历史项目见 [history/REGRESSION_CHECKLIST-6.10.x.md](./history/REGRESSION_CHECKLIST-6.10.x.md)。

## 自动化前置检查

```bash
npm ci
npm run lint
npm run test
npm run build
git diff --check
```

## Journal 与启动

- [ ] 无 journal 时正常启动。
- [ ] `{ "schemaVersion": 1 }` 不抛出，原文件备份为 `.corrupt-structure-*`，Recovery Center 可打开且写门禁有效。
- [ ] schema-1 数组成员类型错误得到相同的安全阻断。
- [ ] corrupt JSON 备份为 `.corrupt-*`；unsupported schema 备份为 `.unsupported-*`。
- [ ] orphan temp 保存并显示真实路径，插件不自动删除。

## Recovery action policy

- [ ] rollback/rescan/state failure 显示 Retry、Rescan、Manual Confirm。
- [ ] journal-recovered 只有存在实际回滚事实时显示 Retry。
- [ ] orphan、corrupt、configuration rollback failure 不显示 Retry；直接调用服务也被拒绝且 gate 不消失。
- [ ] corrupt Manual Confirm 明确要求备份与不可验证风险接受。
- [ ] 所有恢复成功前重新扫描并执行完整诊断；仍有重复 ID、临时文件、内容/binary hash 不符时保留 journal。

## Restart recovery

- [ ] final path 或 hidden temporary path 存在时，rename + content reload 一次 Retry 完成。
- [ ] original/final 被其他 Subject ID 占用时保持 gate。
- [ ] created Markdown、原内容、path states 和 binary 按固定顺序恢复。
- [ ] Windows 大小写等价路径恢复到 journal 记录的规范路径。
- [ ] binary restore 失败或复核 hash 不符时保留 journal。

## Images

- [ ] small/medium/large 选择实际传给下载器。
- [ ] `imageUpdateExisting=false`：已有 binary 不下载、不修改、不建 journal，结果为 skipped。
- [ ] `imageUpdateExisting=true`：修改前 journal 已包含原 binary、长度和 SHA-256。
- [ ] modifyBinary 后 Markdown 失败会自动恢复原 binary；重载后也可恢复。
- [ ] 新建封面只进入 created-resource 删除路径；已有封面绝不进入该路径。
- [ ] 超过 16 MiB 的已有 binary 拒绝覆盖。

## Manager 与控制面板

- [ ] commit 序列为 `idle → running → awaiting-decision → committing → idle`。
- [ ] rollback 序列为 `idle → running → awaiting-decision → rolling-back → idle`。
- [ ] rollback failure 终态为 `recovery-required`。
- [ ] 多订阅者收到终态，已关闭订阅者不再接收，终态不重复或倒序。
- [ ] 控制面板在 busy 状态禁用写动作，终态 idle 后重新启用；Refresh 始终可用于诊断。

## Settings

- [ ] 设置页打开后控制面板把 `panelFilters=A` 改为 B，再修改 Token，最终 filters 仍为 B。
- [ ] `lastSyncTime`、`lastSyncCount`、`subjectPathStates` 的外部更新不被旧设置页覆盖。
- [ ] `dataProtection`、`pathTemplateByType` 与模板配置使用明确的顶层对象替换 patch。
- [ ] 两个控件快速连续保存按队列落盘，不丢字段。
- [ ] 保存期间外部 path-state 持久化仍保留。
- [ ] 保存失败后 UI 从当前正式 settings 重绘，不回到页面初次打开值。
- [ ] configuration rollback failure 重新读取磁盘、持久化选择终态并应用 manager 后才解除。

## Obsidian Sandbox

- [ ] 使用最终 production `main.js`、`manifest.json`、`styles.css`。
- [ ] 完成上述启动、Recovery Center、commit、rename reload、cover 和 settings 故障注入。
- [ ] 保存步骤、截图、console error、最终文件 hash、journal 与写门禁状态。
- [ ] Sandbox 验证后 production build hash 与 Release assets 一致。

## 发布

- [ ] PR 的 Ubuntu 与 Windows CI 全部通过。
- [ ] 合并后 main CI 通过。
- [ ] Tag `6.11.1` 指向最终 main commit。
- [ ] Release 包含同一次构建的 `main.js`、`manifest.json`、`styles.css`。
- [ ] main 已同步到 adv。
