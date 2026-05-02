---
name: 移动端优化设计
description: Bangumi Sync 插件移动端全面适配方案，包括响应式布局、触摸增强和界面简化
type: project
---

# 移动端优化设计

## 当前实现状态（2026-05-02）

截至 `v5.3.2`，`mobile` 分支已经完成控制面板移动端优先优化，并发布同名 prerelease 供 BRAT 测试。已落地内容包括：

- 控制面板在移动端使用卡片式条目列表，左列放选择框和已同步条目的“打开 / 笔记”按钮，右列放标题、元数据、短评、标签
- 顶部操作栏压缩为更紧凑的按钮网格，并补充边框按钮样式
- 状态栏将 `已选` 计数放到加载状态文字右侧
- 底部分页压缩为“上一页 / 页码 / 下一页”单行布局
- 控制面板关闭按钮避开 iOS 顶部状态栏安全区
- 滑动关闭只在列表滚动到顶部时启用，减少误触
- 移动端检测只使用 `max-width: 767px` 断点，不再把触摸屏桌面设备误判为移动端

未完整落地的原始设想仍包括：搜索弹窗筛选栏折叠、状态同步弹窗折叠列表、设置页分组折叠。这些内容仍可作为后续计划，但不要按本文旧草案误判为已经全部完成。

## 背景

Bangumi Sync 插件已在 `manifest.json` 中声明支持移动端（`isDesktopOnly: false`），但现有 UI 主要针对桌面端设计，存在以下问题：

1. 弹窗使用固定宽度（800px-1440px），在移动端显示不佳
2. 表格布局在小屏幕上难以操作
3. 点击区域较小，触摸操作不友好
4. 复杂界面在移动端信息过载

## 目标

- 全面适配所有弹窗和 UI 组件
- 添加触摸增强（更大点击区域、滑动关闭弹窗）
- 移动端简化复杂界面（表格改卡片、隐藏次要操作）

## 设计方案

采用 CSS 媒体查询为主，配合少量 JS 检测和交互增强。

### 1. 设备检测

**新增文件：** `src/utils/mobile.ts`

```typescript
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
 */
export function onMobileChange(callback: (isMobile: boolean) => void): void {
  const query = window.matchMedia('(max-width: 767px)');
  query.addEventListener('change', (e) => callback(e.matches));
}
```

**使用场景：**
- 表格/卡片视图切换
- 触摸手势启用判断

### 2. 弹窗适配

**断点：** 768px（平板/手机分界点）

**CSS 策略：** 使用 `@media (max-width: 767px)` 媒体查询

| 弹窗 | 桌面端宽度 | 移动端调整 |
|------|-----------|-----------|
| 控制面板 | 1440px | 100vw, 全屏显示 |
| 搜索弹窗 | 800px | 95vw, 简化筛选栏 |
| 添加收藏弹窗 | 900px | 95vw, 垂直布局 |
| 本地属性弹窗 | 980px | 95vw, 单列布局 |
| 状态同步弹窗 | 1280px | 100vw, 全屏显示 |
| 批量编辑器 | 500px | 95vw |
| 模板编辑器 | 默认 | 95vw, 减少高度 |

**通用样式：**
```css
@media (max-width: 767px) {
  .modal {
    width: 95vw !important;
    max-width: none !important;
    max-height: 90vh !important;
  }

  .modal-content {
    padding: 12px;
  }

  .modal-button-container {
    flex-direction: column;
    gap: 8px;
  }
}
```

### 3. 表格改卡片视图

#### 3.1 控制面板表格

**桌面端：** 表格形式，每行一个条目

**移动端：** 卡片列表，每张卡片包含：
- 顶部：封面缩略图（左，50x70px）+ 名称/原名（中）+ 类型标签（右）
- 中部：状态、评分、标签
- 底部：操作按钮（打开、笔记）

**CSS 实现：**
```css
@media (max-width: 767px) {
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
  }

  .bangumi-collection-table td {
    border: none;
    padding: 4px;
  }
}
```

#### 3.2 状态同步表格

**移动端：** 折叠列表形式
- 默认只显示条目名称和差异摘要
- 点击展开显示详细差异

### 4. 触摸增强

#### 4.1 更大点击区域

```css
@media (max-width: 767px) {
  .bangumi-action-btn,
  .bangumi-action-btn-small,
  .bangumi-search-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 10px 16px;
  }

  .bangumi-filter-select,
  .bangumi-search-input {
    min-height: 44px;
    font-size: 16px; /* 防止 iOS 缩放 */
  }

  .bangumi-collection-table input[type="checkbox"] {
    width: 24px;
    height: 24px;
  }
}
```

#### 4.2 滑动关闭弹窗

**实现方式：** 在 Modal 基类中添加触摸手势支持

```typescript
// 在 Modal 的 onOpen 中添加
private setupSwipeToClose(): void {
  if (!isMobile()) return;

  let startY = 0;
  let currentY = 0;

  this.contentEl.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
  });

  this.contentEl.addEventListener('touchmove', (e) => {
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    if (diff > 0) {
      this.contentEl.style.transform = `translateY(${diff}px)`;
    }
  });

  this.contentEl.addEventListener('touchend', () => {
    const diff = currentY - startY;
    if (diff > 100) {
      this.close();
    } else {
      this.contentEl.style.transform = '';
    }
  });
}
```

#### 4.3 滚动优化

```css
@media (max-width: 767px) {
  .bangumi-panel-table,
  .bangumi-search-results,
  .bangumi-preview-list {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
}
```

### 5. 界面简化

#### 5.1 控制面板

**隐藏/调整：**
- 隐藏"撤销"按钮（移动端不常用）
- 操作栏按钮改为图标 + 简短文字
- 筛选栏折叠，点击展开

```css
@media (max-width: 767px) {
  .bangumi-panel-action-bar {
    flex-wrap: wrap;
    gap: 6px;
  }

  .bangumi-action-btn {
    font-size: 12px;
    padding: 8px 12px;
  }

  .bangumi-selected-count {
    width: 100%;
    text-align: center;
    margin-top: 8px;
  }
}
```

#### 5.2 搜索弹窗

**筛选栏折叠：**
- 默认只显示搜索框和搜索按钮
- 点击"筛选"按钮展开类型/排序选项

#### 5.3 设置面板

**分组折叠：**
- 每个设置分组可折叠
- 默认展开常用设置（认证、路径）
- 折叠不常用设置（数据保护、模板）

### 6. 模板正文适配

**`bangumi-info` callout 布局调整**

当前宽屏布局：图片（400px）与表格并排

移动端布局：图片和表格纵向排列

```css
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
  }
}
```

## 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/utils/mobile.ts` | 新增 | 设备检测工具函数 |
| `styles.css` | 修改 | 添加移动端媒体查询 |
| `src/panel/controlPanel.ts` | 修改 | 添加卡片视图渲染逻辑 |
| `src/panel/statusSyncModal.ts` | 待后续确认 | 原计划添加折叠列表支持，v5.3.2 尚未完整实现 |
| `src/ui/searchModal.ts` | 待后续确认 | 原计划添加筛选栏折叠功能，v5.3.2 尚未完整实现 |
| `src/ui/localPropertyModal.ts` | 修改 | 移动端布局适配 |
| `src/ui/addToCollectionModal.ts` | 修改 | 移动端布局适配 |
| `src/settings/settingsTab.ts` | 待后续确认 | 原计划添加设置分组折叠，v5.3.2 尚未完整实现 |

## 测试计划

1. **iOS Safari** - iPhone 14 Pro 尺寸
2. **Android Chrome** - Pixel 7 尺寸
3. **iPad Safari** - 平板尺寸
4. **桌面端浏览器** - 窄窗口模拟移动端

**测试用例：**
- [ ] 控制面板：打开、筛选、同步、删除
- [ ] 搜索弹窗：搜索、筛选、添加收藏
- [ ] 状态同步：查看差异、执行同步
- [ ] 设置面板：各项设置修改
- [ ] 模板正文：bangumi-info callout 布局
- [ ] 触摸手势：滑动关闭弹窗
- [ ] 横竖屏切换：布局自适应

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| CSS 改动影响桌面端 | 中 | 使用精确的媒体查询，只在移动端断点生效 |
| 触摸手势与 Obsidian 冲突 | 低 | 只在移动端启用，测试常见手势 |
| 性能影响 | 低 | CSS 优先，JS 改动最小化 |

## 发布说明

Release notes 示例：

```markdown
## 新功能

- 移动端全面适配，支持手机和平板
- 触摸友好：更大的点击区域、滑动关闭弹窗
- 移动端卡片视图，替代表格显示

## 改进

- 弹窗响应式布局，适配各种屏幕尺寸
- 模板正文在移动端纵向排列
- 筛选栏可折叠，节省屏幕空间
```
