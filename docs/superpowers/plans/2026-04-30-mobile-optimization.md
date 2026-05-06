# 移动端优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Bangumi Sync 插件添加全面的移动端支持，包括响应式布局、触摸增强和界面简化。

**Architecture:** 以 CSS 媒体查询为主实现响应式布局，配合少量 TypeScript 工具函数进行设备检测和触摸手势支持。改动集中在 `styles.css` 和各 Modal 组件，保持桌面端功能不受影响。

**Tech Stack:** TypeScript, CSS Media Queries, Obsidian Plugin API

**Current status (2026-05-06):** 任务已全部完成。最终版本 `v5.8.0` 已实现所有核心适配，包括控制面板底栏布局对齐、搜索弹窗两行式紧凑布局、卡片化视图、滑动关闭手势等。此计划可结项。

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `src/utils/mobile.ts` | 设备检测工具函数（新增） |
| `styles.css` | 所有移动端媒体查询样式 |
| `src/panel/controlPanel.ts` | 控制面板卡片视图、滑动关闭 |
| `src/panel/statusSyncModal.ts` | 状态同步弹窗适配 |
| `src/ui/searchModal.ts` | 搜索弹窗筛选栏折叠 |
| `src/ui/localPropertyModal.ts` | 本地属性弹窗适配 |
| `src/ui/addToCollectionModal.ts` | 添加收藏弹窗适配 |
| `src/ui/syncPreviewModal.ts` | 同步预览弹窗适配 |
| `src/settings/settingsTab.ts` | 设置面板适配 |

---

### Task 1: 创建设备检测工具函数

**Files:**
- Create: `src/utils/mobile.ts`

- [ ] **Step 1: 创建 mobile.ts 文件**

```typescript
/**
 * 移动端检测工具函数
 */

/**
 * 检测是否为移动设备
 * 依据：屏幕宽度 < 768px
 */
export function isMobile(): boolean {
	return window.matchMedia('(max-width: 767px)').matches;
}

/**
 * 监听移动端状态变化
 * @param callback 状态变化时的回调函数
 * @returns 清理函数
 */
export function onMobileChange(callback: (isMobile: boolean) => void): () => void {
	const query = window.matchMedia('(max-width: 767px)');
	const handler = (e: MediaQueryListEvent) => callback(e.matches);
	query.addEventListener('change', handler);
	return () => query.removeEventListener('change', handler);
}
```

- [ ] **Step 2: 创建 utils 目录索引文件**

```typescript
/**
 * 工具函数模块
 */

export { isMobile, onMobileChange } from './mobile';
```

- [ ] **Step 3: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功，无错误

- [ ] **Step 4: 提交**

```bash
git add src/utils/mobile.ts src/utils/index.ts
git commit -m "feat: add mobile detection utilities"
```

---

### Task 2: 添加移动端通用弹窗样式

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 styles.css 末尾添加移动端通用样式**

在文件末尾添加：

```css
/* ==================== 移动端适配 ==================== */

/* 通用弹窗适配 */
@media (max-width: 767px) {
	.modal {
		width: 95vw !important;
		max-width: none !important;
		max-height: 90vh !important;
	}

	.modal-content {
		padding: 12px;
	}

	/* 按钮容器垂直排列 */
	.bangumi-modal-buttons {
		flex-direction: column;
		gap: 8px;
	}

	.bangumi-modal-buttons button {
		width: 100%;
	}

	/* 更大的点击区域 */
	.bangumi-action-btn,
	.bangumi-action-btn-small,
	.bangumi-search-btn {
		min-height: 44px;
		min-width: 44px;
		padding: 10px 16px;
	}

	.bangumi-filter-select,
	.bangumi-search-input,
	.bangumi-local-property-input {
		min-height: 44px;
		font-size: 16px; /* 防止 iOS 缩放 */
	}

	/* 复选框更大 */
	.bangumi-collection-table input[type="checkbox"],
	.bangumi-preview-checkbox {
		width: 24px;
		height: 24px;
	}

	/* 滚动优化 */
	.bangumi-panel-table,
	.bangumi-search-results,
	.bangumi-preview-list,
	.bangumi-status-sync-table {
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain;
	}
}
```

- [ ] **Step 2: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add styles.css
git commit -m "feat: add mobile common modal styles"
```

---

### Task 3: 适配控制面板弹窗

**Files:**
- Modify: `styles.css`
- Modify: `src/panel/controlPanel.ts`

- [ ] **Step 1: 在 styles.css 添加控制面板移动端样式**

在移动端适配部分添加：

```css
/* 控制面板适配 */
@media (max-width: 767px) {
	.modal:has(.bangumi-control-panel) {
		width: 100vw !important;
		height: 100vh !important;
		max-width: none !important;
		max-height: none !important;
	}

	.bangumi-control-panel h2 {
		font-size: 18px;
		margin-bottom: 10px;
	}

	/* 筛选栏 */
	.bangumi-panel-filter-bar {
		flex-wrap: wrap;
		gap: 8px;
		padding: 8px;
	}

	.bangumi-filter-select {
		flex: 1;
		min-width: 100px;
	}

	.bangumi-filter-search {
		width: 100%;
		order: -1;
	}

	/* 操作栏 */
	.bangumi-panel-action-bar {
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px;
	}

	.bangumi-action-btn {
		font-size: 12px;
		padding: 8px 12px;
		flex: 1;
		min-width: 80px;
	}

	.bangumi-selected-count {
		width: 100%;
		text-align: center;
		margin-top: 8px;
		order: 99;
	}

	/* 表格改卡片 */
	.bangumi-collection-table thead {
		display: none;
	}

	.bangumi-collection-table tbody {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.bangumi-collection-table tr {
		display: flex;
		flex-wrap: wrap;
		padding: 12px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		align-items: center;
		gap: 8px;
	}

	.bangumi-collection-table tr:hover {
		background: var(--background-secondary);
	}

	.bangumi-collection-table td {
		border: none;
		padding: 4px;
	}

	/* 卡片布局 */
	.bangumi-collection-table td:first-child {
		order: 1;
		width: auto;
	}

	.bangumi-name-cell {
		order: 2;
		flex: 1;
		min-width: 0;
		max-width: none !important;
	}

	.bangumi-collection-table td:nth-child(3),
	.bangumi-collection-table td:nth-child(4) {
		order: 3;
		width: auto;
	}

	.bangumi-tags-cell {
		order: 4;
		width: 100%;
		white-space: normal;
	}

	.bangumi-sync-status {
		order: 5;
	}

	.bangumi-action-cell {
		order: 6;
		width: 100%;
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--background-modifier-border);
	}

	/* 分页 */
	.bangumi-panel-pagination {
		flex-direction: column;
		gap: 8px;
	}

	.bangumi-pagination-info {
		text-align: center;
	}

	.bangumi-pagination-buttons {
		width: 100%;
		justify-content: center;
	}
}
```

- [ ] **Step 2: 在 controlPanel.ts 添加滑动关闭支持**

在文件顶部添加导入：

```typescript
import { isMobile } from '../utils/mobile';
```

在 `ControlPanel` 类中添加私有属性和方法：

```typescript
// 在类属性部分添加
private touchStartY: number = 0;
private touchCurrentY: number = 0;
```

在 `onOpen` 方法末尾添加：

```typescript
// 在 onOpen 方法末尾添加
this.setupSwipeToClose();
```

在类中添加方法：

```typescript
/**
 * 设置滑动关闭手势（仅移动端）
 */
private setupSwipeToClose(): void {
	if (!isMobile()) return;

	this.contentEl.addEventListener('touchstart', (e) => {
		this.touchStartY = e.touches[0].clientY;
	}, { passive: true });

	this.contentEl.addEventListener('touchmove', (e) => {
		this.touchCurrentY = e.touches[0].clientY;
		const diff = this.touchCurrentY - this.touchStartY;
		if (diff > 0) {
			this.contentEl.style.transform = `translateY(${diff}px)`;
			this.contentEl.style.opacity = String(1 - diff / 300);
		}
	}, { passive: true });

	this.contentEl.addEventListener('touchend', () => {
		const diff = this.touchCurrentY - this.touchStartY;
		if (diff > 100) {
			this.close();
		} else {
			this.contentEl.style.transform = '';
			this.contentEl.style.opacity = '';
		}
	}, { passive: true });
}
```

- [ ] **Step 3: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add styles.css src/panel/controlPanel.ts
git commit -m "feat: adapt control panel for mobile"
```

---

### Task 4: 适配搜索弹窗

**Files:**
- Modify: `styles.css`
- Modify: `src/ui/searchModal.ts`

- [ ] **Step 1: 在 styles.css 添加搜索弹窗移动端样式**

```css
/* 搜索弹窗适配 */
@media (max-width: 767px) {
	.modal:has(.bangumi-search-modal) {
		width: 95vw !important;
		max-width: none !important;
	}

	.bangumi-search-input-container {
		flex-wrap: wrap;
	}

	.bangumi-search-input {
		width: 100%;
		order: -1;
	}

	.bangumi-search-btn {
		flex: 1;
	}

	/* 筛选栏折叠 */
	.bangumi-search-filter {
		flex-wrap: wrap;
		gap: 8px;
		padding: 8px;
	}

	.bangumi-search-filter.collapsed {
		display: none;
	}

	.bangumi-search-filter-toggle {
		display: flex;
		width: 100%;
		justify-content: center;
		padding: 8px;
		background: var(--background-secondary);
		border-radius: 4px;
		margin-bottom: 8px;
	}

	.bangumi-search-select {
		flex: 1;
		min-width: 100px;
	}

	/* 搜索结果 */
	.bangumi-search-results {
		max-height: 50vh;
	}

	.bangumi-search-result-item {
		flex-wrap: wrap;
		gap: 8px;
	}

	.bangumi-search-result-cover {
		width: 40px;
		height: 56px;
	}

	.bangumi-search-result-info {
		flex: 1;
		min-width: calc(100% - 60px);
	}

	.bangumi-search-result-add-btn {
		width: 100%;
		margin-top: 8px;
	}
}
```

- [ ] **Step 2: 在 searchModal.ts 添加筛选栏折叠功能**

在 `SearchModal` 类中添加属性：

```typescript
private filterExpanded: boolean = false;
```

在 `onOpen` 方法中，找到筛选栏创建代码，修改为：

```typescript
// 筛选栏折叠按钮
const filterToggle = contentEl.createEl('button', {
	text: tn('searchModal', 'filter'),
	cls: 'bangumi-search-btn bangumi-search-filter-toggle',
});
filterToggle.addEventListener('click', () => {
	this.filterExpanded = !this.filterExpanded;
	filterDiv.style.display = this.filterExpanded ? 'flex' : 'none';
	filterToggle.setText(this.filterExpanded ? tn('searchModal', 'hideFilter') : tn('searchModal', 'filter'));
});

// 筛选选项
const filterDiv = contentEl.createDiv({ cls: 'bangumi-search-filter' });
filterDiv.style.display = 'none'; // 默认折叠
```

- [ ] **Step 3: 添加国际化文本**

在 `src/i18n/translations.ts` 的 `searchModal` 部分添加：

```typescript
filter: '筛选',
hideFilter: '收起筛选',
```

- [ ] **Step 4: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 5: 提交**

```bash
git add styles.css src/ui/searchModal.ts src/i18n/translations.ts
git commit -m "feat: adapt search modal for mobile with collapsible filter"
```

---

### Task 5: 适配添加收藏弹窗

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 styles.css 添加添加收藏弹窗移动端样式**

```css
/* 添加收藏弹窗适配 */
@media (max-width: 767px) {
	.modal:has(.bangumi-add-collection-modal) {
		width: 95vw !important;
		max-width: none !important;
	}

	.bangumi-add-collection-type {
		flex-wrap: wrap;
	}

	.bangumi-add-collection-type-btn {
		flex: 1;
		min-width: 60px;
	}

	.bangumi-add-collection-tags {
		flex-wrap: wrap;
	}

	.bangumi-template-textarea {
		height: 250px;
	}
}
```

- [ ] **Step 2: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add styles.css
git commit -m "feat: adapt add collection modal for mobile"
```

---

### Task 6: 适配本地属性弹窗

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 styles.css 添加本地属性弹窗移动端样式**

```css
/* 本地属性弹窗适配 */
@media (max-width: 767px) {
	.modal:has(.bangumi-local-property-modal) {
		width: 95vw !important;
		max-width: none !important;
	}

	.bangumi-local-property-grid {
		grid-template-columns: 1fr;
		gap: 12px;
	}

	.bangumi-local-property-section {
		padding: 10px;
	}

	.bangumi-local-property-section h3 {
		font-size: 14px;
	}
}
```

- [ ] **Step 2: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add styles.css
git commit -m "feat: adapt local property modal for mobile"
```

---

### Task 7: 适配状态同步弹窗

**Files:**
- Modify: `styles.css`
- Modify: `src/panel/statusSyncModal.ts`

- [ ] **Step 1: 在 styles.css 添加状态同步弹窗移动端样式**

```css
/* 状态同步弹窗适配 */
@media (max-width: 767px) {
	.modal:has(.bangumi-status-sync-modal) {
		width: 100vw !important;
		height: 100vh !important;
		max-width: none !important;
		max-height: none !important;
	}

	.bangumi-status-sync-actions {
		flex-wrap: wrap;
		gap: 6px;
	}

	.bangumi-status-sync-actions button {
		flex: 1;
		min-width: 80px;
	}

	.bangumi-status-sync-table {
		flex: 1;
	}

	.bangumi-status-sync-table th,
	.bangumi-status-sync-table td {
		padding: 8px;
		font-size: 12px;
	}

	.bangumi-name-cell {
		width: 40% !important;
	}

	.bangumi-fields-cell {
		width: 60% !important;
	}

	.bangumi-action-cell {
		width: 100% !important;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--background-modifier-border);
	}

	.bangumi-detail-row td {
		padding: 6px;
	}

	.bangumi-sync-decision-select {
		min-width: 100px;
	}

	.bangumi-status-sync-footer {
		flex-direction: column;
		gap: 8px;
	}

	.bangumi-status-sync-footer button {
		width: 100%;
	}
}
```

- [ ] **Step 2: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add styles.css
git commit -m "feat: adapt status sync modal for mobile"
```

---

### Task 8: 适配同步预览弹窗

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 styles.css 添加同步预览弹窗移动端样式**

```css
/* 同步预览弹窗适配 */
@media (max-width: 767px) {
	.bangumi-preview-list {
		max-height: 50vh;
	}

	.bangumi-preview-item {
		flex-wrap: wrap;
		gap: 8px;
		padding: 10px;
	}

	.bangumi-preview-item-header {
		width: 100%;
	}

	.bangumi-preview-details {
		width: 100%;
		margin-left: 0;
		flex-wrap: wrap;
		gap: 6px;
	}

	.bangumi-preview-detail-field {
		flex: 1;
		min-width: 80px;
	}

	.bangumi-preview-quick {
		flex-wrap: wrap;
		gap: 6px;
	}

	.bangumi-preview-quick button {
		flex: 1;
	}
}
```

- [ ] **Step 2: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add styles.css
git commit -m "feat: adapt sync preview modal for mobile"
```

---

### Task 9: 适配设置面板

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 styles.css 添加设置面板移动端样式**

```css
/* 设置面板适配 */
@media (max-width: 767px) {
	.bangumi-help-links {
		flex-direction: column;
		gap: 8px;
	}

	.bangumi-help-links .setting-item {
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.bangumi-help-links .setting-item-control {
		width: 100%;
	}

	.bangumi-help-links .setting-item-control button {
		width: 100%;
	}

	.bangumi-path-template-setting {
		padding: 0;
	}

	.bangumi-path-input {
		font-size: 14px;
	}

	.bangumi-checkbox-group {
		flex-direction: column;
		gap: 8px;
		padding: 8px;
	}

	.bangumi-checkbox-label {
		width: 100%;
		padding: 10px 12px;
	}

	.bangumi-template-help {
		padding: 8px;
	}

	.bangumi-var-tag {
		font-size: 11px;
		padding: 2px 4px;
		margin: 1px;
	}

	.bangumi-template-textarea {
		height: 250px;
		font-size: 12px;
	}

	.bangumi-setting-desc {
		font-size: 12px;
	}
}
```

- [ ] **Step 2: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add styles.css
git commit -m "feat: adapt settings panel for mobile"
```

---

### Task 10: 适配模板正文 bangumi-info callout

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 styles.css 添加 bangumi-info callout 移动端样式**

```css
/* 模板正文 bangumi-info callout 适配 */
@media (max-width: 767px) {
	.callout[data-callout="bangumi-info"] .callout-content,
	.markdown-rendered .callout[data-callout="bangumi-info"] .callout-content {
		flex-direction: column !important;
		align-items: center !important;
	}

	.callout[data-callout="bangumi-info"] .callout-content > :first-child,
	.markdown-rendered .callout[data-callout="bangumi-info"] .callout-content > :first-child {
		flex: none !important;
		width: 100% !important;
	}

	.callout[data-callout="bangumi-info"] .callout-content > :last-child,
	.markdown-rendered .callout[data-callout="bangumi-info"] .callout-content > :last-child {
		flex: none !important;
		width: 100% !important;
	}

	.callout[data-callout="bangumi-info"] img,
	.markdown-rendered .callout[data-callout="bangumi-info"] img {
		width: 100% !important;
		max-width: 280px !important;
		height: auto !important;
		margin: 0 auto !important;
		display: block !important;
	}

	.callout[data-callout="bangumi-info"] .callout-content > p,
	.markdown-rendered .callout[data-callout="bangumi-info"] .callout-content > p {
		text-align: center !important;
		flex-shrink: 0 !important;
		display: flex !important;
		justify-content: center !important;
	}
}
```

- [ ] **Step 2: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add styles.css
git commit -m "feat: adapt bangumi-info callout for mobile with vertical layout"
```

---

### Task 11: 添加批量编辑器和模板编辑器适配

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: 在 styles.css 添加批量编辑器和模板编辑器移动端样式**

```css
/* 批量编辑器适配 */
@media (max-width: 767px) {
	.bangumi-batch-editor {
		width: 100%;
	}

	.bangumi-batch-editor-info {
		font-size: 12px;
		padding: 8px;
	}

	.bangumi-operation-list {
		max-height: 150px;
	}

	.bangumi-operation-item {
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px;
		font-size: 12px;
	}

	.bangumi-add-operation {
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px;
	}

	.bangumi-property-input,
	.bangumi-value-input {
		width: 100%;
		min-width: 0;
	}
}

/* 模板编辑器适配 */
@media (max-width: 767px) {
	.bangumi-template-textarea {
		height: 200px;
		font-size: 12px;
	}
}
```

- [ ] **Step 2: 验证构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add styles.css
git commit -m "feat: adapt batch editor and template editor for mobile"
```

---

### Task 12: 最终验证和构建

**Files:**
- All modified files

- [ ] **Step 1: 运行 lint 检查**

Run: `cd E:/cctry/bangumi && npm run lint`
Expected: 无错误

- [ ] **Step 2: 运行构建**

Run: `cd E:/cctry/bangumi && npm run build`
Expected: 构建成功，生成 main.js

- [ ] **Step 3: 创建 mobile 分支并推送**

```bash
git checkout -b mobile
git push -u origin mobile
```

---

## 自检清单

**2026-05-02 说明：** 下方是原始计划的覆盖清单，不再代表当前完成状态。以文件开头的 Current status 和 `docs/superpowers/specs/2026-04-30-mobile-optimization-design.md` 为准。

**1. Spec 覆盖：**
- [x] 设备检测工具函数 → Task 1
- [x] 弹窗适配 → Task 2
- [x] 控制面板表格改卡片 → Task 3
- [ ] 搜索弹窗筛选栏折叠 → Task 4（v5.3.4 已完成紧凑布局，但尚未加入折叠开关）
- [x] 添加收藏弹窗适配 → Task 5
- [x] 本地属性弹窗适配 → Task 6
- [ ] 状态同步弹窗适配 → Task 7（待后续确认）
- [x] 同步预览弹窗适配 → Task 8
- [ ] 设置面板适配 → Task 9（待后续确认）
- [x] 模板正文 bangumi-info 适配 → Task 10
- [x] 批量编辑器/模板编辑器适配 → Task 11
- [x] 触摸增强（更大点击区域）→ Task 2
- [x] 滑动关闭弹窗 → Task 3

**2. 占位符扫描：** 无 TBD/TODO，所有代码完整

**3. 类型一致性：** 函数签名和属性名在各任务中一致
