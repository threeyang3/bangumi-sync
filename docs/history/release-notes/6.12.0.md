# Bangumi Sync 6.12.0

## Changed

- 同名条目的路径规划现在持久化模板首选路径和规范化碰撞组键。
- 后续加入第三个同名条目，或年份不再唯一时，会在同一事务中重新规划完整的 managed 碰撞组。
- `simple-until-collision` 继续优先使用唯一年份；同年或缺少年份时使用 Bangumi ID 稳定消歧。
- `always-year`、`always-id` 和 `custom-template` 发生二次冲突时只追加一次 Bangumi ID，不再重复年份或策略后缀。
- 旧 managed 路径状态会在首次相关同步时补全碰撞元数据；上下文无法完整加载时保持原组不动。
- README 与文档体系重新整理，项目介绍、用户指南、维护者文档和版本历史分开维护。

## Safety

- 用户手工重命名的文件继续受保护，不参与自动路径移动。
- 完整碰撞组的 rename、Markdown 写入和路径状态仍属于同一个 recovery journal 事务。
- 恢复校验和配置快照会比较新增的碰撞元数据；journal 会验证其字段类型。

## Compatibility

- 无需修改 Markdown、frontmatter 或 Subject ID。
- 无需手工编辑 `subjectPathStates` 或批量重命名文件。
- 最低 Obsidian 版本保持 1.8.7。

## Scope

- 本版本集中完成 Issue #5 的路径稳定性硬性需求和文档结构调整。
- 大型库体验、依赖边界整理和扩大 UI E2E 不作为本版本发布条件。
