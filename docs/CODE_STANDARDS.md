# Obsidian 插件代码规范

本文档只保留和当前仓库最相关的审核约束、常见失败点，以及提交前自查清单。

如果你要了解模块分工和逻辑判断，不看这份，去看：

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [LOGIC_REFERENCE.md](./LOGIC_REFERENCE.md)
- [DEVELOPMENT.md](./DEVELOPMENT.md)

## 1. 当前仓库的最小合规目标

提交前至少满足：

1. `npm run lint` 通过
2. `npm run build` 通过
3. 不引入明显违反 Obsidian 插件审核习惯的 API 用法
4. 不让 README / docs 与实际代码行为脱节

当前这套仓库里，`lint + build` 基本就是“本地合规闸门”。

## 2. 必须遵守的规则

### 2.1 类型安全

- 不要使用 `any`
- 不要用不必要的 `as` 类型断言
- 文件对象必须通过 `instanceof TFile` 等类型守卫确认
- 错误处理优先用 `unknown` / `instanceof Error`

典型问题：

- `as TFile`
- `as SubjectType`
- 未使用但保留的类型导入

### 2.2 Promise 处理

- 在不等待结果的上下文里，显式使用 `void`
- 事件回调里需要 `await` 时，用 `void (async () => { ... })()`
- 不要留下未处理 Promise

### 2.3 Obsidian API 使用

- 网络请求使用 `requestUrl`
- 文件更新优先使用 `vault.process()`
- 定时器使用 `activeWindow.setTimeout` / `clearInterval`
- 动态创建 DOM 优先使用 `activeDocument.createElement`
- 标题和表单优先使用 `Setting` API 组织
- 不要使用浏览器原生 `confirm()` / `alert()`

### 2.4 UI 与文案

- 面向用户的文案必须走 i18n
- modal 样式不要依赖脆弱的默认层级，必要时对 `.modal:has(...)` 做高优先级约束
- 不要把功能规则写死在 UI 里，尤其是自定义属性字段

### 2.5 日志

- 只用 `console.debug`、`console.warn`、`console.error`
- 不用 `console.log`
- 日志前缀保持 `[Bangumi Sync]`

## 3. 这个仓库里最容易踩的规范点

### 3.1 自定义属性不能分叉实现

不要为这些场景分别维护字段判断：

- 同步收藏
- 控制面板同步
- 搜索并添加
- 强制同步继承
- 导入导出

自定义属性入口必须优先看：

- `src/template/templateProperties.ts`

如果你在别处又写了一份“哪些字段需要填写”的判断，大概率就是在制造未来 bug。

### 3.2 模板字段分类改动不能只改一处

如果你改了“什么算自动字段 / 自定义字段”的规则，至少同步检查：

- `src/template/templateProperties.ts`
- `src/userData/types.ts` 的 `BANGUMI_FIELDS`
- `docs/TEMPLATE_GUIDE.md`
- `docs/LOGIC_REFERENCE.md`

### 3.3 状态同步不要绕开现有净化逻辑

标签、短评、单集状态都有现成规则：

- 标签统一走 `IncrementalSync.normalizeTags()`
- 短评统一走 `normalizeComment()`
- 单集状态不要只改 frontmatter，不要只改 DOM

状态同步和单集功能的细节边界见：

- [STATUS_SYNC_PITFALLS.md](./STATUS_SYNC_PITFALLS.md)

### 3.4 文档也是约束的一部分

这个仓库的文档已经按“模块 / 逻辑 / 模板 / 开发 / 审核”重新分工。

所以：

- 模块职责变化要更新 `ARCHITECTURE.md`
- 判断逻辑变化要更新 `LOGIC_REFERENCE.md`
- 模板机制变化要更新 `TEMPLATE_GUIDE.md`
- 发布流程变化要更新 `DEVELOPMENT.md`

## 4. 提交前检查清单

提交前至少手动确认：

- 改动没有引入新的未使用导入和变量
- 没有新增 `console.log`
- 没有新增 `confirm()` / `alert()`
- 没有新增不必要的 `as`
- 如果改了同步流程，相关入口是否都保持一致
- 如果改了模板字段分类，导入导出和强制同步是否一起检查
- 如果改了 UI 文案，中英文翻译是否同步
- README / docs 是否仍然描述当前真实行为

然后执行：

```bash
npm run lint
npm run build
```

## 5. 常见失败信号

### `npm run lint` 失败

通常是：

- 未使用导入
- 未使用变量
- 不必要的断言
- Promise 未正确处理

### `npm run build` 失败

通常是：

- TypeScript 空值收窄问题
- 某处改动打破了接口类型一致性
- 模板变量或导入导出类型没有同步调整

### 功能能跑但审核风险高

常见表现：

- 直接使用浏览器 API 替代 Obsidian API
- UI 文案硬编码
- 逻辑分散在多个窗口里重复实现
- 文档没有同步更新，实际行为和说明冲突

## 6. 和其他文档的边界

- 这份文档不解释模块职责：看 [ARCHITECTURE.md](./ARCHITECTURE.md)
- 这份文档不解释业务判断：看 [LOGIC_REFERENCE.md](./LOGIC_REFERENCE.md)
- 这份文档不解释模板能力：看 [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md)
- 这份文档不解释发布步骤：看 [DEVELOPMENT.md](./DEVELOPMENT.md)
