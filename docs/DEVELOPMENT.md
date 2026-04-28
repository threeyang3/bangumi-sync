# 开发指南

## 环境要求

- Node.js 16+
- npm 或 pnpm

## 开发命令

```bash
npm install      # 安装依赖
npm run dev      # 开发模式（监听文件变化）
npm run build    # 生产构建
```

## 项目架构

### 分层结构

```
common/          ← 基础设施层（API、解析、文件）
src/             ← 业务逻辑层（同步、设置、UI）
main.ts          ← 入口层（插件注册）
```

### 核心模块

| 模块 | 职责 |
|------|------|
| `src/sync/` | 同步逻辑（SyncManager、IncrementalSync） |
| `src/panel/` | 控制面板（ControlPanel、BatchEditor） |
| `src/template/` | 内容模板处理 |
| `src/settings/` | 设置数据与 UI |
| `src/ui/` | 同步弹窗 |
| `src/userData/` | 用户数据保护 |
| `src/i18n/` | 国际化 |

### 数据流

```
main.ts 入口
    → SyncManager 协调同步
        → BangumiClient 获取数据
        → FileManager 写入文件
        → ContentTemplate 生成内容
```

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

同时更新 `manifest.json` 和 `package.json`：

```json
{
  "version": "4.7.4"
}
```

### 2. 构建

```bash
npm run build
```

### 3. 创建发布包

```bash
# 创建版本目录
mkdir -p release/v4.7.4

# 复制文件
cp main.js manifest.json styles.css release/
cp main.js manifest.json styles.css release/v4.7.4/

# 创建 zip（可选）
cd archives && powershell -Command "Compress-Archive -Path ../release/main.js,../release/manifest.json,../release/styles.css -DestinationPath bangumi-sync-v4.7.4.zip -Force"
```

### 4. 提交并推送

```bash
git add -A
git commit -m "release: v4.7.4 功能描述"
git push
```

### 5. 创建 GitHub Release

**重要**：Release tag 必须与 manifest.json 版本号完全一致，不带 `v` 前缀。

```bash
gh release create 4.7.4 ./release/main.js ./release/manifest.json ./release/styles.css \
  --title "v4.7.4" \
  --notes "更新内容说明"
```

### Release 资产要求

- 必须包含单独的文件：`main.js`、`manifest.json`、`styles.css`
- 不能只上传 zip 文件
- Tag 必须是纯版本号（如 `4.7.4`），不能带 `v` 前缀

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
