# Obsidian 插件代码规范

本文档整理自 Obsidian 官方插件审核反馈，用于指导插件开发，确保代码质量符合社区插件市场要求。

## 目录

1. [TypeScript 类型安全](#1-typescript-类型安全)
2. [Promise 处理规范](#2-promise-处理规范)
3. [Obsidian API 使用规范](#3-obsidian-api-使用规范)
4. [代码整洁规范](#4-代码整洁规范)
5. [常见问题与解决方案](#5-常见问题与解决方案)

---

## 1. TypeScript 类型安全

### 1.1 禁止使用 `any` 类型

**问题**：`any` 类型会绕过 TypeScript 的类型检查，可能导致运行时错误。

**错误示例**：
```typescript
// ❌ 错误：使用 any 类型
const file = this.app.vault.getAbstractFileByPath(path) as any;
await this.app.vault.modify(file, content);

// ❌ 错误：Record<string, any>
const data: Record<string, any> = {};
```

**正确做法**：
```typescript
// ✅ 正确：使用类型守卫
import { TFile } from 'obsidian';

const file = this.app.vault.getAbstractFileByPath(path);
if (file instanceof TFile) {
    await this.app.vault.modify(file, content);
}

// ✅ 正确：使用 unknown
const data: Record<string, unknown> = {};
```

### 1.2 使用类型守卫而非类型断言

**问题**：类型断言 (`as`) 会绕过编译器检查，可能导致运行时错误。

**错误示例**：
```typescript
// ❌ 错误：强制类型断言
const file = this.app.vault.getAbstractFileByPath(path) as TFile;
```

**正确做法**：
```typescript
// ✅ 正确：使用 instanceof 检查
const file = this.app.vault.getAbstractFileByPath(path);
if (file instanceof TFile) {
    // 此处 file 被自动推断为 TFile 类型
    await this.app.vault.modify(file, content);
}
```

### 1.3 使用枚举而非魔法数字

**问题**：直接使用数字字面量降低代码可读性和可维护性。

**错误示例**：
```typescript
// ❌ 错误：使用魔法数字
if (subject.type === 2) {
    // 处理动画
}
```

**正确做法**：
```typescript
// ✅ 正确：使用枚举
import { SubjectType } from './types';

if (subject.type === SubjectType.Anime) {
    // 处理动画
}
```

### 1.4 正确处理数组方法

**问题**：对对象数组使用 `join()` 会得到 `[object Object]` 字符串。

**错误示例**：
```typescript
// ❌ 错误：对象数组直接 join
const tags = items.map(item => ({ name: item.name }));
const result = tags.join(', '); // "[object Object], [object Object]"
```

**正确做法**：
```typescript
// ✅ 正确：先提取需要的属性
const tags = items.map(item => ({ name: item.name }));
const result = tags.map(t => t.name).join(', ');

// 或者检查对象结构
const values = items.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item.v === 'string') return item.v;
    return String(item);
}).join(', ');
```

---

## 2. Promise 处理规范

### 2.1 在 void 上下文中使用 `void` 操作符

**问题**：在不需要等待结果的上下文中调用 async 函数时，必须使用 `void` 操作符明确表示有意忽略 Promise。

**错误示例**：
```typescript
// ❌ 错误：未处理的 Promise
this.app.workspace.onLayoutReady(() => {
    this.loadData(); // 返回的 Promise 未处理
});

// ❌ 错误：在同步函数中直接 await
someButton.addEventListener('click', () => {
    this.sync(); // async 函数，Promise 未处理
});
```

**正确做法**：
```typescript
// ✅ 正确：使用 void 操作符
this.app.workspace.onLayoutReady(() => {
    void this.loadData();
});

// ✅ 正确：事件监听器中使用 void
someButton.addEventListener('click', () => {
    void this.sync();
});
```

### 2.2 异步回调使用 void IIFE 模式

**问题**：当回调需要使用 await 时，不能将回调函数标记为 async（可能影响某些 API 的行为），应使用立即执行函数。

**错误示例**：
```typescript
// ❌ 错误：async 回调可能影响事件处理
button.addEventListener('click', async () => {
    const result = await this.sync();
    this.showResult(result);
});
```

**正确做法**：
```typescript
// ✅ 正确：使用 void IIFE 模式
button.addEventListener('click', () => {
    void (async () => {
        const result = await this.sync();
        this.showResult(result);
    })();
});
```

### 2.3 避免重复的 void 操作符

**问题**：`void void` 是冗余代码。

**错误示例**：
```typescript
// ❌ 错误：重复的 void
void void this.loadData();
```

**正确做法**：
```typescript
// ✅ 正确：单个 void
void this.loadData();
```

---

## 3. Obsidian API 使用规范

### 3.1 使用 Setting API 创建标题

**问题**：直接使用 HTML 元素创建标题不符合 Obsidian 的 UI 规范，可能导致样式不一致。

**错误示例**：
```typescript
// ❌ 错误：使用 HTML 元素创建标题
contentEl.createEl('h2', { text: '设置' });
contentEl.createEl('h3', { text: '高级选项' });
```

**正确做法**：
```typescript
// ✅ 正确：使用 Setting API
import { Setting } from 'obsidian';

new Setting(containerEl)
    .setName('设置')
    .setHeading();

new Setting(containerEl)
    .setName('高级选项')
    .setHeading();
```

### 3.2 禁止使用浏览器原生弹窗

**问题**：`confirm()` 和 `alert()` 在 Obsidian 移动端不可用，且不符合插件 UI 规范。

**错误示例**：
```typescript
// ❌ 错误：使用浏览器原生弹窗
if (confirm('确定要删除吗？')) {
    this.delete();
}
```

**正确做法**：
```typescript
// ✅ 正确：使用自定义 Modal
import { Modal, App } from 'obsidian';

class ConfirmModal extends Modal {
    private onConfirm: () => void;

    constructor(app: App, message: string, onConfirm: () => void) {
        super(app);
        this.onConfirm = onConfirm;
        // 创建 UI...
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('p', { text: '确定要删除吗？' });

        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('取消').onClick(() => this.close()))
            .addButton(btn => btn.setButtonText('确定')
                .setCta()
                .onClick(() => {
                    this.onConfirm();
                    this.close();
                }));
    }
}

// 使用
new ConfirmModal(this.app, '确定要删除吗？', () => this.delete()).open();
```

### 3.3 正确处理文件操作

**问题**：文件操作前必须验证文件类型。

**错误示例**：
```typescript
// ❌ 错误：未验证文件类型
const file = this.app.vault.getAbstractFileByPath(path);
await this.app.vault.read(file); // file 可能是 TFolder
```

**正确做法**：
```typescript
// ✅ 正确：验证文件类型
import { TFile } from 'obsidian';

const file = this.app.vault.getAbstractFileByPath(path);
if (file instanceof TFile) {
    const content = await this.app.vault.read(file);
}
```

---

## 4. 代码整洁规范

### 4.1 移除未使用的导入

**问题**：未使用的导入会增加打包体积，降低代码可读性。

**错误示例**：
```typescript
// ❌ 错误：未使用的导入
import { Notice, TFile, TFolder, TAbstractFile } from 'obsidian';
import { UserCollection, Episode, SubjectType } from './types';

// 实际只使用了 Notice 和 SubjectType
```

**正确做法**：
```typescript
// ✅ 正确：只导入需要的
import { Notice } from 'obsidian';
import { SubjectType } from './types';
```

### 4.2 移除未使用的变量

**问题**：未使用的变量（包括 catch 中的 error）会触发编译警告。

**错误示例**：
```typescript
// ❌ 错误：未使用的 error 变量
try {
    await this.sync();
} catch (error) {
    console.error('同步失败');
}

// ❌ 错误：未使用的变量
const originalContent = await this.readFile(path);
// originalContent 从未使用
```

**正确做法**：
```typescript
// ✅ 正确：省略 error 变量
try {
    await this.sync();
} catch {
    console.error('同步失败');
}

// ✅ 正确：使用变量或移除
const originalContent = await this.readFile(path);
return originalContent;
```

### 4.3 case 块使用花括号包裹词法声明

**问题**：switch 的 case 块中的词法声明（let、const）需要花括包裹，避免变量提升问题。

**错误示例**：
```typescript
// ❌ 错误：case 块中的 const 未包裹
switch (type) {
    case 'anime':
        const template = ANIME_TEMPLATE;
        break;
    case 'novel':
        const template = NOVEL_TEMPLATE; // 重复声明
        break;
}
```

**正确做法**：
```typescript
// ✅ 正确：使用花括号包裹
switch (type) {
    case 'anime': {
        const template = ANIME_TEMPLATE;
        break;
    }
    case 'novel': {
        const template = NOVEL_TEMPLATE;
        break;
    }
}
```

### 4.4 避免常量条件循环

**问题**：`while (true)` 等常量条件循环可能导致无限循环，且代码可读性差。

**错误示例**：
```typescript
// ❌ 错误：常量条件循环
while (true) {
    const data = await this.fetchPage(page);
    if (!data.hasMore) break;
    page++;
}
```

**正确做法**：
```typescript
// ✅ 正确：使用明确的循环条件
let hasMore = true;
while (hasMore) {
    const data = await this.fetchPage(page);
    hasMore = data.hasMore;
    page++;
}

// 或使用 for 循环
for (let hasMore = true; hasMore; ) {
    const data = await this.fetchPage(page);
    hasMore = data.hasMore;
    page++;
}
```

### 4.5 禁止内联样式

**问题**：内联样式难以维护，且可能与主题冲突。

**错误示例**：
```typescript
// ❌ 错误：内联样式
element.style.backgroundColor = '#fff';
element.style.padding = '10px';
```

**正确做法**：
```typescript
// ✅ 正确：使用 CSS 类
element.addClass('bangumi-card');

// styles.css
// .bangumi-card {
//     background-color: #fff;
//     padding: 10px;
// }
```

---

## 5. 常见问题与解决方案

### 5.1 问题检查清单

提交 PR 前，请检查以下项目：

| 检查项 | 说明 |
|--------|------|
| TypeScript 严格模式 | `tsconfig.json` 中 `"strict": true` |
| 无 `any` 类型 | 搜索代码中的 `any` 关键字 |
| Promise 处理 | 所有 async 调用都有处理（await 或 void） |
| 类型守卫 | 文件操作前使用 `instanceof TFile` |
| Setting API 标题 | 使用 `.setHeading()` 而非 HTML 元素 |
| 无原生弹窗 | 不使用 `confirm()`、`alert()` |
| 无未使用导入 | 检查 import 语句 |
| 无未使用变量 | 检查变量声明 |
| case 块花括号 | switch 语句中的词法声明 |
| 无常量条件循环 | 检查 while (true) |
| 无内联样式 | 使用 CSS 类 |

### 5.2 常用命令

```bash
# TypeScript 类型检查
npm run build

# 或单独运行 tsc
npx tsc --noEmit

# 搜索代码中的问题模式
grep -r "as any" src/
grep -r "confirm(" src/
grep -r "while (true)" src/
```

### 5.3 推荐的 tsconfig.json 配置

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

---

## 附录：本次 PR 修复记录

### v4.3.4 修复的问题（第一次审核）

| 文件 | 问题 | 修复方式 |
|------|------|----------|
| `common/parser/infoboxParser.ts` | `join()` 用于对象数组 | 添加对象属性检查 |
| `src/settings/settingsTab.ts` | HTML 标题元素 | 改用 `Setting().setHeading()` |
| `src/settings/settingsTab.ts` | async 回调未处理 | 使用 void IIFE 模式 |
| `src/ui/syncOptionsModal.ts` | HTML 标题元素 | 改用 `Setting().setHeading()` |
| `src/ui/syncPreviewModal.ts` | HTML 标题元素 | 改用 `Setting().setHeading()` |
| `src/ui/syncModal.ts` | HTML 标题元素 | 改用 `Setting().setHeading()` |
| `src/panel/batchEditorModal.ts` | `any` 类型 | 使用 `instanceof TFile` |
| `src/panel/batchEditorModal.ts` | `Record<string, any>` | 改为 `Record<string, unknown>` |
| `src/sync/syncManager.ts` | `as any` 断言 | 移除断言，使用正确导入 |
| `src/panel/controlPanel.ts` | 未处理 Promise | 添加 `void` 操作符 |
| `src/panel/controlPanel.ts` | async 回调 | 使用 void IIFE 模式 |
| `src/panel/controlPanel.ts` | 重复 void | 移除重复的 `void` |
| `main.ts` | async 回调 | 使用 void IIFE 模式 |
| 多个文件 | 未使用的导入 | 移除未使用的 import |
| 多个文件 | 未使用的变量 | 移除未使用的变量 |

### v4.4.0 补充修复（Promise 处理检查）

| 文件 | 问题 | 修复方式 |
|------|------|----------|
| `src/panel/controlPanel.ts` | `loadData()` 未处理 | 添加 `void` |
| `src/panel/controlPanel.ts` | `syncSelected()` 未处理 | 添加 `void` |
| `src/panel/controlPanel.ts` | `syncComments()` 未处理 | 添加 `void` |
| `src/panel/controlPanel.ts` | `syncTags()` 未处理 | 添加 `void` |
| `src/panel/controlPanel.ts` | `undoLastEdit()` 未处理 | 添加 `void` |
| `src/panel/commentSyncModal.ts` | `executeSync()` 未处理 | 添加 `void` |
| `src/panel/tagSyncModal.ts` | `executeSync()` 未处理 | 添加 `void` |
| `src/panel/batchEditorModal.ts` | `as any` 断言 | 移除断言（已有类型守卫） |

---

## 参考链接

- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Obsidian API Reference](https://docs.obsidian.md/Reference)
- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- [Obsidian Community Plugins](https://github.com/obsidianmd/obsidian-releases)
