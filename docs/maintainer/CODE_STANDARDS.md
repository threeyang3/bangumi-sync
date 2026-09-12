# Code Standards

本文是代码规则的 canonical source。环境、测试和发布命令见[开发指南](DEVELOPMENT.md)。

## TypeScript

- 保持 strict typing，错误使用 `unknown` 再缩窄。
- 禁止无说明的 `as any`；优先类型守卫、泛型和明确接口。
- 异步流程使用 `async/await`，所有 Promise 必须 await、return 或显式处理。
- Manager 配置、设置候选和恢复事实使用不可变快照，不共享可变嵌套引用。
- 业务判断优先抽成 pure functions 并补 Vitest。
- 删除未使用 import/变量，避免通过 lint disable 隐藏问题。

## Obsidian API

| 场景 | 使用 | 避免 |
| --- | --- | --- |
| 原子文本更新 | `vault.process()` | 基于陈旧快照的 `vault.modify()` |
| 网络请求 | `requestUrl()` | 直接 `fetch()` |
| 文件类型 | `instanceof TFile` | 仅检查扩展名 |
| 窗口/文档 | `activeWindow` / `activeDocument` | 全局 `window` / `document` |
| 定时器 | `registerInterval` 或 active window timer | 无清理的全局 timer |

所有 event、DOM listener、interval 和 mutation observer 必须在 unload 时释放。Popout window 与移动端不得假定主窗口 DOM。

## File and identity safety

- Subject ID 是身份，路径/标题不是身份。
- 实际 mutation 点复核目标文件 ID。
- 新 Vault 写入口必须经过统一 write gate。
- Path normalization、collision 和 registry 只有一套实现。
- 文件事务必须在第一次 mutation 前持久化 recovery facts。
- 不得在事务外覆盖已有 binary 或静默清除 recovery journal。

详细不变量见[身份与路径模型](PATH_AND_ID_MODEL.md)和[恢复模型](RECOVERY_MODEL.md)。

## Promise and concurrency safety

- 对用户可重复触发的 Commit、rollback、Retry、Rescan 使用共享 Promise 或互斥动作。
- 串行设置 persistence，不让旧 UI snapshot 覆盖新正式设置。
- Cancellation 必须等待正在执行的 mutation 达到可恢复边界。
- Post-commit best-effort 工作不得反向改变主事务终态。

## UI and accessibility

- 使用 Obsidian components 和 CSS classes，不写内联 style。
- UI 文本走 i18n；locale 使用 sentence case 并保持 key 同步。
- Modal 支持键盘导航、Escape、焦点恢复和移动端布局。
- 可点击非按钮元素需要语义角色、键盘处理和可见 focus。
- 错误信息说明用户下一步能做什么，不泄露 Token 或 journal 内容。

## Logging

允许：

```typescript
console.debug('[Bangumi Sync] ...');
console.warn('[Bangumi Sync] ...');
console.error('[Bangumi Sync] ...', error);
```

禁止 `console.log()`、无插件前缀日志、明文 Token、authorization header、完整 recovery journal 和用户私密正文。

## Documentation updates

- 用户可见功能：README 或对应 user guide。
- 模板变量/属性：Template Guide。
- 模块依赖：Architecture。
- 业务判断：Logic Reference。
- 身份/路径：Path and ID Model。
- Recovery：Recovery Model；用户动作变化时同步 Recovery Guide。
- 开发/发布流程：Development。
- 调试过程、版本 SHA、Sandbox：history。

## Local commit gate

所有修改至少运行：

```bash
npm run lint
npm run test
npm run build
git diff --check
```

高风险修改还需要 targeted tests 和 production Obsidian Sandbox。纯文档修改可省略 Sandbox，但必须检查相对链接、stale facts 和 `git diff --check`。

## Review failure signals

- 新增第二套 ID、path、template property 或 recovery policy 判断。
- UI 直接修改 Vault，绕过 service/gate。
- Promise 没有 await 或错误被空 catch 吞掉。
- 使用全局 DOM API 导致 popout 不兼容。
- 日志或诊断可能持久化 secret。
- Evergreen 文档出现具体版本验证记录或“当前最新版本是 X”。
