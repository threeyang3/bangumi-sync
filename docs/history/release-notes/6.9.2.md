## 修复
- 修复状态同步范围选择弹窗在旧/残缺字段选择结构下渲染中断的问题，避免出现 `Cannot read properties of undefined (reading 'rate')`
- 为范围选择弹窗增加字段选择归一化与分区安全渲染，避免单个分区异常导致整张弹窗后半段消失
- 清理 `StatusSyncScopeModal` 文件头部重复导入，消除构建与运行时不稳定因素

## 测试
- 增加残缺字段选择结构的归一化测试，覆盖缺失 `user` / `platform` 分支的场景
