# 开发指南

本文档只保留“开发环境、提交流程、发布流程、代码约束”这类维护信息。

如果你要理解代码本身，请优先看：

- [文档总览](./README.md)
- [项目架构与模块说明](./ARCHITECTURE.md)
- [逻辑判断参考](./LOGIC_REFERENCE.md)
- [模板设计参考](./TEMPLATE_GUIDE.md)
- [状态同步踩坑记录](./STATUS_SYNC_PITFALLS.md)

## 环境要求

- Node.js 16+
- npm 或 pnpm

## 开发命令

```bash
npm install      # 安装依赖
npm run dev      # 开发模式（监听文件变化）
npm run build    # 生产构建
```

## 技术文档入口

### 架构与模块

- `docs/` 文档应该先怎么看：见 [README.md](./README.md)
- `main.ts` 如何协调各入口：见 [ARCHITECTURE.md](./ARCHITECTURE.md)
- 同步、自定义属性、导入导出、状态同步的判断规则：见 [LOGIC_REFERENCE.md](./LOGIC_REFERENCE.md)

### 专题文档

- 模板能力、模板变量、默认值：见 [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md)
- 状态同步和单集功能的已知边界：见 [STATUS_SYNC_PITFALLS.md](./STATUS_SYNC_PITFALLS.md)

## 编码规范

### TypeScript

- 使用严格模式（`strict: true`）
- 私有成员使用 `private` 修饰符
- 异步操作使用 `async/await`
- 错误处理使用 try-catch 并记录日志

### Obsidian API 规范

| 场景 | 正确方式 | 错误方式 |
|------|----------|----------|
| 文件更新 | `vault.process()` | `vault.modify()` |
| 网络请求 | `requestUrl()` | `fetch()` |
| 定时器 | `activeWindow.setTimeout` | `setTimeout` |
| 创建元素 | `activeDocument.createElement` | `document.createElement` |

### 代码风格

- 函数和类添加 JSDoc 注释
- 避免不必要的注释
- 不要添加 `as any` 类型断言
- 移除未使用的导入和变量

### 日志规范

```typescript
// 正确
console.debug('[Bangumi Sync] 操作成功');
console.warn('[Bangumi Sync] 警告信息');
console.error('[Bangumi Sync] 错误信息', error);

// 错误
console.log('信息');  // 不允许
```

## Obsidian 插件审核要求

### 禁止事项

- 默认快捷键
- `console.log()`（只允许 debug/warn/error）
- `as any` 类型断言
- `confirm()` 调用
- 内联样式

### 必须事项

- UI 文本使用英文或国际化
- 使用 `instanceof TFile` 检查文件类型
- 错误处理使用 `error: unknown` 类型

## 发布流程

### 1. 更新版本号

同时更新 `manifest.json`、`package.json`、`package-lock.json` 和 `versions.json`：

```json
{
  "version": "{版本号}"
}
```

### 2. 构建

```bash
npm run build
```

### 3. 创建发布包

```bash
# 创建版本目录
mkdir -p release/v{版本号}

# 复制文件
cp main.js manifest.json styles.css release/
cp main.js manifest.json styles.css release/v{版本号}/

# 创建 zip（可选）
cd archives && powershell -Command "Compress-Archive -Path ../release/main.js,../release/manifest.json,../release/styles.css -DestinationPath bangumi-sync-v{版本号}.zip -Force"
```

### 4. 提交并推送

```bash
git add -A
git commit -m "release: v{版本号}"
git push
```

### 5. 创建 GitHub Release

**重要**：Release tag 必须与 manifest.json 版本号完全一致，不带 `v` 前缀。

**关键**：从 `adv` 分支发布时，必须显式指定 `--target adv`，否则 GitHub 默认指向 `main` 分支。

```bash
# 从 adv 分支发布（当前主要发布方式）
gh release create {版本号} ./release/main.js ./release/manifest.json ./release/styles.css \
  --title "v{版本号}" \
  --notes-file release-notes-{版本号}.md \
  --target adv

# 从 main 分支发布（仅在合并到 main 后使用）
gh release create {版本号} ./release/main.js ./release/manifest.json ./release/styles.css \
  --title "v{版本号}" \
  --notes-file release-notes-{版本号}.md \
  --target main
```

### Release 资产要求

- 必须包含单独的文件：`main.js`、`manifest.json`、`styles.css`
- 不能只上传 zip 文件
- Tag 必须是纯版本号（如 `4.7.4`），不能带 `v` 前缀
- Tag 必须与 `manifest.json` 里的 `version` 完全一致，否则 BRAT 无法按 release tag 正常安装
- Release notes 需要传入真正的多行 Markdown，不要把 `\n` 当作字面量写入

### BRAT 测试版发布

如需在不合并 `main` 的情况下提供移动端或其他试验版给 BRAT 测试：

1. 在测试分支上把 `manifest.json`、`package.json`、`package-lock.json`、`versions.json` 更新到新的纯版本号，例如 `5.3.4`
2. 运行 `npm run lint` 和 `npm run build`
3. 提交并推送测试分支
4. 创建同名 tag 并推送：`git tag {版本号}`、`git push origin {版本号}`
5. 使用 `gh release create {版本号} ... --prerelease` 创建 prerelease
6. 若替换测试版本，删除旧 prerelease 时同时清理旧 tag：`gh release delete {旧版本号} --yes --cleanup-tag`

测试版 tag 也必须与 `manifest.json` 版本一致。不要复用正在等待 Obsidian 官方审查的版本号。

2026-05-10 当前最新稳定版为 `v6.5.4`（在 `adv` 分支发布）。

### 标准发布流程 (Preventing Sorting/Encoding Issues)
为确保 GitHub Releases 顺序正确且无乱码，必须遵循以下步骤：

1. **版本更新**：修改 `package.json` -> 运行 `node version-bump.mjs` -> 构建 `npm run build`。
2. **创建附注标签**：使用 `git tag -a vX.Y.Z -m "Release vX.Y.Z"`（必须带 `v` 前缀，必须是附注标签）。
3. **推送代码与标签**：`git push origin <branch>` 及 `git push origin --tags`。
4. **发布 Release**：使用 `gh release create vX.Y.Z --notes-file notes.md --latest`。

## 自定义属性开发约束

- 新增或修改本地自定义属性逻辑时，先改 `src/template/templateProperties.ts`
- 不要为评分明细、资源属性等字段单独维护第二套窗口或导入导出逻辑
- 列表型自定义属性统一使用 YAML 数组表示，UI 输入统一按英文逗号拆分
- 快速同步 / 自动同步路径不能弹窗，只能依赖模板默认值
- 导出 / 导入 / 强制同步继承必须保持一致：辨识属性、自定义属性、记录/感想
- 如果修改了字段分类规则，同时检查：
  - `src/template/templateProperties.ts`
  - `src/userData/types.ts` 中的 `BANGUMI_FIELDS`
  - `docs/TEMPLATE_GUIDE.md`
  - `docs/LOGIC_REFERENCE.md`

## 调试技巧

1. 在 Obsidian 中启用开发者模式
2. 打开开发者控制台 (Ctrl+Shift+I)
3. 查看控制台日志（带 `[Bangumi Sync]` 前缀）
4. 插件数据存储在 `.obsidian/plugins/bangumi-sync/` 目录

## 常见问题

### Q: 构建失败？

检查 TypeScript 版本和 tsconfig.json 配置。

### Q: Obsidian API 类型错误？

确保 `obsidian` 依赖已安装：`npm install obsidian`

### Q: 发布后插件不工作？

检查 manifest.json 中的版本号是否与 Release tag 一致。
