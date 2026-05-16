/**
 * 控制面板
 * 展示所有收藏条目，标记同步状态，支持批量操作
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import { UserCollection, SubjectType, CollectionType, Subject, getSubjectTypeName, getCollectionTypeName, getCollectionStatusLabel } from '../../common/api/types';
import { BangumiPluginSettings, PanelFilters, DEFAULT_PANEL_FILTERS } from '../settings/settings';
import { SyncManager } from '../sync/syncManager';
import { IncrementalSync } from '../sync/incrementalSync';
import { BangumiClient } from '../api/client';
import { getTypeLabel } from '../../common/template/defaultTemplates';
import { BatchEditorModal, FrontmatterEditor } from './batchEditorModal';
import { StatusSyncModal, StatusSyncDiff, FieldDiff, PlatformFieldDiff, PlatformSyncPayload } from './statusSyncModal';
import { ConflictDetector } from './conflictResolver';
import { SearchModal } from '../ui/searchModal';
import { getLocale, tn } from '../i18n';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import { SubjectNoteManager } from '../note/subjectNoteManager';
import { loadSubjectsForCollections, LocalPropertyModal, LocalPropertyModalResult, hasLocalPropertyFieldsForCollections } from '../ui/localPropertyModal';
import { isMobile } from '../utils/mobile';
import { parseInfoByType } from '../../common/parser/infoboxParser';

/**
 * 本地条目信息
 */
interface LocalSubjectInfo {
	id: number;
	path: string;
	name_cn: string;
}

/**
 * 缓存数据接口
 */
export interface CachedPanelData {
	collections: UserCollection[];
	localSubjects: Map<number, LocalSubjectInfo>;
}

/**
 * 面板状态
 */
interface PanelState {
	collections: UserCollection[];
	localSubjects: Map<number, LocalSubjectInfo>;
	selectedIds: Set<number>;
	loading: boolean;
	loadingProgress: { current: number; total: number };
	error: string | null;
}

/**
 * 控制面板
 */
export class ControlPanel extends Modal {
	private settings: BangumiPluginSettings;
	private syncManager: SyncManager;
	private client: BangumiClient;
	private incrementalSync: IncrementalSync;
	private frontmatterEditor: FrontmatterEditor;
	private conflictDetector: ConflictDetector;
	private episodeStatusManager: EpisodeStatusManager | null;
	private subjectNoteManager: SubjectNoteManager | null;
	private onFiltersChange: (filters: PanelFilters) => void;

	// 缓存相关
	private cachedData: CachedPanelData | null;
	private onCacheUpdate: (data: CachedPanelData) => void;

	private state: PanelState;
	private filters: PanelFilters;

	// UI 元素
	private filterBarEl!: HTMLElement;
	private actionBarEl!: HTMLElement;
	private tableEl!: HTMLElement;
	private paginationEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private footerBarEl!: HTMLElement;
	private sortBySelect!: HTMLSelectElement;
	private sortDirectionSelect!: HTMLSelectElement;

	// 分页
	private currentPage: number = 1;
	private pageSize: number = 50;

	// 键盘导航
	private focusedRowIndex: number = -1;
	private tableRows: HTMLTableRowElement[] = [];

	// 自动触发状态同步
	private autoSyncStatus: boolean;

	// 滑动关闭（移动端）
	private touchStartY: number = 0;
	private touchCurrentY: number = 0;
	private swipeEnabled: boolean = false;
	private touchStartHandler: ((e: TouchEvent) => void) | null = null;
	private touchMoveHandler: ((e: TouchEvent) => void) | null = null;
	private touchEndHandler: (() => void) | null = null;

	private readonly mobileShortLabels = getLocale() === 'zh-CN'
		? {
			refresh: '刷新',
			syncSelected: '同步',
			forceSync: '强同',
			deleteSelected: '删除',
			batchEdit: '批编',
			syncStatus: '状态',
			undo: '撤销',
			search: '搜索',
		}
		: {
			refresh: 'Refresh',
			syncSelected: 'Sync',
			forceSync: 'Force',
			deleteSelected: 'Delete',
			batchEdit: 'Batch',
			syncStatus: 'Status',
			undo: 'Undo',
			search: 'Search',
		};

	constructor(
		app: App,
		settings: BangumiPluginSettings,
		syncManager: SyncManager,
		onFiltersChange: (filters: PanelFilters) => void,
		cachedData: CachedPanelData | null,
		onCacheUpdate: (data: CachedPanelData) => void,
		subjectNoteManager?: SubjectNoteManager | null,
		episodeStatusManager?: EpisodeStatusManager | null,
		autoSyncStatus?: boolean
	) {
		super(app);
		this.settings = settings;
		this.syncManager = syncManager;
		this.subjectNoteManager = subjectNoteManager ?? null;
		this.episodeStatusManager = episodeStatusManager ?? null;
		this.onFiltersChange = onFiltersChange;
		this.cachedData = cachedData;
		this.onCacheUpdate = onCacheUpdate;
		this.autoSyncStatus = autoSyncStatus ?? false;

		this.client = new BangumiClient(settings.accessToken);
		this.incrementalSync = new IncrementalSync(app);
		this.frontmatterEditor = new FrontmatterEditor(app);
		this.conflictDetector = new ConflictDetector(app);

		this.filters = { ...DEFAULT_PANEL_FILTERS, ...settings.panelFilters };
		this.state = {
			collections: cachedData?.collections || [],
			localSubjects: cachedData?.localSubjects instanceof Map ? cachedData.localSubjects : new Map<number, LocalSubjectInfo>(),
			selectedIds: new Set(),
			loading: false,
			loadingProgress: { current: 0, total: 0 },
			error: null,
		};
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.addClass('bangumi-control-panel');

		// 标题
		contentEl.createEl('h2', { text: tn('controlPanel', 'title') });

		// 筛选栏
		this.filterBarEl = contentEl.createDiv({ cls: 'bangumi-panel-filter-bar' });
		this.renderFilterBar();

		// 操作栏
		this.actionBarEl = contentEl.createDiv({ cls: 'bangumi-panel-action-bar' });
		this.renderActionBar();

		// 表格区域
		this.tableEl = contentEl.createDiv({ cls: 'bangumi-panel-table' });

		// 底栏：状态 + 分页 同行
		this.footerBarEl = contentEl.createDiv({ cls: 'bangumi-panel-footer-bar' });
		this.statusEl = this.footerBarEl.createDiv({ cls: 'bangumi-panel-status' });
		this.paginationEl = this.footerBarEl.createDiv({ cls: 'bangumi-panel-pagination' });

		// 添加键盘导航
		this.tableEl.setAttribute('tabindex', '0');
		this.tableEl.addEventListener('keydown', (e) => this.handleKeyDown(e));

		// 检查是否有缓存数据
		if (this.cachedData && this.cachedData.collections.length > 0) {
			// 使用缓存数据，直接显示
			this.renderStatus(`${tn('controlPanel', 'cachedDataLoaded')} ${this.state.collections.length}`);
			this.applyFilters();

			// 自动触发状态同步
			if (this.autoSyncStatus) {
				void this.syncStatus();
			}
		} else {
			// 无缓存，加载数据
			void this.loadData();
		}

		// 设置滑动关闭（移动端）
		this.setupSwipeToClose();
	}

	onClose(): void {
		// 清理触摸事件监听器
		if (this.touchStartHandler) {
			this.contentEl.removeEventListener('touchstart', this.touchStartHandler);
		}
		if (this.touchMoveHandler) {
			this.contentEl.removeEventListener('touchmove', this.touchMoveHandler);
		}
		if (this.touchEndHandler) {
			this.contentEl.removeEventListener('touchend', this.touchEndHandler);
		}

		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * 渲染筛选栏
	 */
	private renderFilterBar(): void {
		this.filterBarEl.empty();
		this.filterBarEl.addClass('bangumi-panel-toolbar');

		const filterGroup = this.filterBarEl.createDiv({ cls: 'bangumi-toolbar-group bangumi-toolbar-group-filters' });

		// 类型筛选
		const typeSelect = filterGroup.createEl('select', { cls: 'bangumi-filter-select' });
		typeSelect.createEl('option', { value: 'all', text: tn('controlPanel', 'allTypes') });
		Object.values(SubjectType).forEach(type => {
			if (typeof type === 'number') {
				const option = typeSelect.createEl('option', {
					value: String(type),
					text: getSubjectTypeName(type)
				});
				if (this.filters.subjectType === type) {
					option.selected = true;
				}
			}
		});
		typeSelect.addEventListener('change', () => {
			this.filters.subjectType = typeSelect.value === 'all' ? 'all' : parseInt(typeSelect.value);
			this.onFiltersChange(this.filters);
			this.applyFilters();
		});

		// 状态筛选
		const statusSelect = filterGroup.createEl('select', { cls: 'bangumi-filter-select' });
		statusSelect.createEl('option', { value: 'all', text: tn('controlPanel', 'allStatus') });
		Object.values(CollectionType).forEach(type => {
			if (typeof type === 'number') {
				const option = statusSelect.createEl('option', {
					value: String(type),
					text: getCollectionTypeName(type)
				});
				if (this.filters.collectionType === type) {
					option.selected = true;
				}
			}
		});
		statusSelect.addEventListener('change', () => {
			this.filters.collectionType = statusSelect.value === 'all' ? 'all' : parseInt(statusSelect.value);
			this.onFiltersChange(this.filters);
			this.applyFilters();
		});

		// 同步状态筛选
		const syncSelect = filterGroup.createEl('select', { cls: 'bangumi-filter-select' });
		syncSelect.createEl('option', { value: 'all', text: tn('controlPanel', 'allSyncStatus') });
		syncSelect.createEl('option', { value: 'synced', text: tn('controlPanel', 'synced') });
		syncSelect.createEl('option', { value: 'unsynced', text: tn('controlPanel', 'unsynced') });
		syncSelect.value = this.filters.syncStatus;
		syncSelect.addEventListener('change', () => {
			this.filters.syncStatus = syncSelect.value as 'synced' | 'unsynced' | 'all';
			this.onFiltersChange(this.filters);
			this.applyFilters();
		});

		// 排序依据
		const sortByWrapper = filterGroup.createDiv({ cls: 'bangumi-sort-field' });
		sortByWrapper.createEl('label', { text: tn('controlPanel', 'sortBy'), cls: 'bangumi-sort-label' });
		this.sortBySelect = sortByWrapper.createEl('select', { cls: 'bangumi-filter-select bangumi-sort-select' });
		this.sortBySelect.createEl('option', { value: 'default', text: tn('controlPanel', 'sortDefault') });
		this.sortBySelect.createEl('option', { value: 'time', text: tn('controlPanel', 'sortTime') });
		this.sortBySelect.createEl('option', { value: 'title', text: tn('controlPanel', 'sortTitle') });
		this.sortBySelect.createEl('option', { value: 'status', text: tn('controlPanel', 'sortStatus') });
		this.sortBySelect.createEl('option', { value: 'rating', text: tn('controlPanel', 'sortRating') });
		this.sortBySelect.value = this.filters.sortBy;
		this.sortBySelect.addEventListener('change', () => {
			this.filters.sortBy = this.sortBySelect.value as PanelFilters['sortBy'];
			this.onFiltersChange(this.filters);
			this.applyFilters();
		});

		// 排序方向
		const sortDirectionWrapper = filterGroup.createDiv({ cls: 'bangumi-sort-field' });
		sortDirectionWrapper.createEl('label', { text: tn('controlPanel', 'sortDirection'), cls: 'bangumi-sort-label' });
		this.sortDirectionSelect = sortDirectionWrapper.createEl('select', { cls: 'bangumi-filter-select bangumi-sort-select' });
		this.sortDirectionSelect.createEl('option', { value: 'desc', text: tn('controlPanel', 'sortDesc') });
		this.sortDirectionSelect.createEl('option', { value: 'asc', text: tn('controlPanel', 'sortAsc') });
		this.sortDirectionSelect.value = this.filters.sortDirection;
		this.sortDirectionSelect.addEventListener('change', () => {
			this.filters.sortDirection = this.sortDirectionSelect.value as PanelFilters['sortDirection'];
			this.onFiltersChange(this.filters);
			this.applyFilters();
		});

		// 搜索框
		const searchInput = filterGroup.createEl('input', {
			type: 'text',
			placeholder: tn('controlPanel', 'searchPlaceholder'),
			cls: 'bangumi-filter-search'
		});
		searchInput.value = this.filters.keyword;
		searchInput.addEventListener('input', () => {
			this.filters.keyword = searchInput.value;
			this.onFiltersChange(this.filters);
			this.applyFilters();
		});
	}

	/**
	 * 渲染操作栏
	 */
	private renderActionBar(): void {
		this.actionBarEl.empty();

		// 刷新按钮
		this.actionBarEl.createEl('button', { text: tn('controlPanel', 'refresh'), cls: 'bangumi-action-btn bangumi-action-btn-refresh' }, btn => {
			this.decorateMobileButton(btn, this.mobileShortLabels.refresh, tn('controlPanel', 'refresh'));
			btn.addEventListener('click', () => { void this.loadData(); });
		});

		// 同步选中按钮
		this.actionBarEl.createEl('button', { text: tn('controlPanel', 'syncSelected'), cls: 'bangumi-action-btn bangumi-action-btn-sync' }, btn => {
			this.decorateMobileButton(btn, this.mobileShortLabels.syncSelected, tn('controlPanel', 'syncSelected'));
			btn.addEventListener('click', () => { void this.syncSelected(false); });
		});

		// 强制同步按钮
		this.actionBarEl.createEl('button', { text: tn('controlPanel', 'forceSync'), cls: 'bangumi-action-btn bangumi-action-btn-force' }, btn => {
			this.decorateMobileButton(btn, this.mobileShortLabels.forceSync, tn('controlPanel', 'forceSync'));
			btn.addEventListener('click', () => { void this.syncSelected(true); });
		});

		// 删除选中按钮
		this.actionBarEl.createEl('button', { text: tn('controlPanel', 'deleteSelected'), cls: 'bangumi-action-btn bangumi-action-btn-delete' }, btn => {
			this.decorateMobileButton(btn, this.mobileShortLabels.deleteSelected, tn('controlPanel', 'deleteSelected'));
			btn.addEventListener('click', () => this.deleteSelected());
		});

		// 批量编辑按钮
		this.actionBarEl.createEl('button', { text: tn('controlPanel', 'batchEdit'), cls: 'bangumi-action-btn bangumi-action-btn-batch' }, btn => {
			this.decorateMobileButton(btn, this.mobileShortLabels.batchEdit, tn('controlPanel', 'batchEdit'));
			btn.addEventListener('click', () => this.openBatchEditor());
		});

		// 同步状态按钮（统一同步评分、短评、标签、状态）
		this.actionBarEl.createEl('button', { text: tn('controlPanel', 'syncStatus'), cls: 'bangumi-action-btn bangumi-action-btn-status' }, btn => {
			this.decorateMobileButton(btn, this.mobileShortLabels.syncStatus, tn('controlPanel', 'syncStatus'));
			btn.addEventListener('click', () => { void this.syncStatus(); });
		});

		// 撤销按钮
		const undoBtn = this.actionBarEl.createEl('button', { text: tn('controlPanel', 'undo'), cls: 'bangumi-action-btn bangumi-action-btn-undo' }, btn => {
			this.decorateMobileButton(btn, this.mobileShortLabels.undo, tn('controlPanel', 'undo'));
			btn.addEventListener('click', () => { void this.undoLastEdit(); });
		});
		undoBtn.disabled = !this.frontmatterEditor.canUndo();

		// 搜索按钮
		this.actionBarEl.createEl('button', { text: tn('searchModal', 'title'), cls: 'bangumi-action-btn bangumi-action-btn-search' }, btn => {
			this.decorateMobileButton(btn, this.mobileShortLabels.search, tn('searchModal', 'title'));
			btn.addEventListener('click', () => this.openSearchModal());
		});

		this.updateSelectedCount();
	}

	private decorateMobileButton(button: HTMLButtonElement, shortLabel: string, fullLabel: string): void {
		button.dataset.mobileLabel = shortLabel;
		button.setAttribute('aria-label', fullLabel);
		button.setAttribute('title', fullLabel);
	}

	/**
	 * 加载数据
	 */
	private async loadData(): Promise<void> {
		this.state.loading = true;
		this.state.error = null;
		this.renderStatus(tn('controlPanel', 'loadingCollections'));
		this.renderTable();

		try {
			// 1. 验证 Token 并获取用户名
			const validateResult = await this.client.validateToken();
			if (!validateResult.valid || !validateResult.username) {
				throw new Error(validateResult.error || 'Token validation failed');
			}

			// 2. 获取所有收藏
			this.renderStatus(tn('controlPanel', 'fetchingCollections'));
			const collections = await this.client.getAllUserCollections(validateResult.username, {
				onProgress: (current, total) => {
					this.state.loadingProgress = { current, total };
					this.renderStatus(`${tn('controlPanel', 'fetchingCollections')} (${current}/${total})`);
				}
			});

			this.state.collections = collections;

			// 3. 扫描本地文件夹
			this.renderStatus(tn('controlPanel', 'scanningLocal'));
			const scanPath = this.settings.scanFolderPath || 'ACGN';
			await this.incrementalSync.scanLocalFolder(scanPath, (current, total) => {
				this.renderStatus(`${tn('controlPanel', 'scanningFiles')} (${current}/${total})`);
			});

			// 获取本地条目映射
			this.state.localSubjects = new Map();
			const syncedIds = this.incrementalSync.getSyncedIds();
			for (const id of syncedIds) {
				const info = this.incrementalSync.getLocalSubject(id);
				if (info) {
					this.state.localSubjects.set(id, info);
				}
			}

			this.state.loading = false;
			this.renderStatus(`${tn('controlPanel', 'loadComplete')}, ${tn('controlPanel', 'totalItems')} ${collections.length}, ${tn('controlPanel', 'synced')} ${syncedIds.size}`);

			// 更新缓存
			this.onCacheUpdate({
				collections: this.state.collections,
				localSubjects: new Map(this.state.localSubjects),
			});

			this.applyFilters();

		} catch (error) {
			this.state.loading = false;
			this.state.error = error instanceof Error ? error.message : String(error);
			this.renderStatus(`${tn('controlPanel', 'loadFailed')}: ${this.state.error}`);
		}
	}

	/**
	 * 应用筛选
	 */
	private applyFilters(): void {
		this.currentPage = 1;
		this.renderTable();
		this.renderPagination();
	}

	/**
	 * 获取筛选后的数据
	 */
	private getFilteredCollections(): UserCollection[] {
		let result = [...this.state.collections];

		// 类型筛选
		if (this.filters.subjectType !== 'all') {
			result = result.filter(c => c.subject_type === this.filters.subjectType);
		}

		// 状态筛选
		if (this.filters.collectionType !== 'all') {
			result = result.filter(c => c.type === this.filters.collectionType);
		}

		// 同步状态筛选
		if (this.filters.syncStatus === 'synced') {
			result = result.filter(c => this.state.localSubjects.has(c.subject_id));
		} else if (this.filters.syncStatus === 'unsynced') {
			result = result.filter(c => !this.state.localSubjects.has(c.subject_id));
		}

		// 关键词搜索
		if (this.filters.keyword.trim()) {
			const keyword = this.filters.keyword.toLowerCase().trim();
			result = result.filter(c =>
				(c.subject.name_cn && c.subject.name_cn.toLowerCase().includes(keyword)) ||
				(c.subject.name && c.subject.name.toLowerCase().includes(keyword))
			);
		}

		return this.sortCollections(result);
	}

	private sortCollections(collections: UserCollection[]): UserCollection[] {
		const { sortBy, sortDirection } = this.filters;
		if (sortBy === 'default') {
			return collections;
		}

		const direction = sortDirection === 'asc' ? 1 : -1;
		return [...collections].sort((left, right) => {
			let comparison = 0;

			switch (sortBy) {
				case 'time':
					comparison = compareTime(left.updated_at, right.updated_at);
					break;
				case 'title':
					comparison = compareTitle(
						left.subject.name_cn || left.subject.name || '',
						right.subject.name_cn || right.subject.name || ''
					);
					break;
				case 'status':
					comparison = left.type - right.type;
					break;
				case 'rating':
					comparison = compareNumber(left.rate, right.rate);
					if (comparison === 0) {
						comparison = compareNumber(left.subject.score, right.subject.score);
					}
					break;
			}

			if (comparison === 0) {
				comparison = compareTitle(
					left.subject.name_cn || left.subject.name || '',
					right.subject.name_cn || right.subject.name || ''
				);
			}

			if (comparison === 0) {
				comparison = left.subject_id - right.subject_id;
			}

			return comparison * direction;
		});
	}

	/**
	 * 渲染状态栏
	 */
	private renderStatus(message: string): void {
		this.statusEl.empty();
		this.statusEl.createSpan({ cls: 'bangumi-status-message', text: message });
		this.statusEl.createSpan({
			cls: 'bangumi-selected-count',
			text: `${tn('controlPanel', 'selectedCount')}: ${this.state.selectedIds.size}`,
		});

		if (this.state.loading) {
			this.statusEl.addClass('loading');
		} else {
			this.statusEl.removeClass('loading');
		}
	}

	/**
	 * 更新状态栏中的已选数量
	 */
	private updateSelectedCount(): void {
		if (!this.statusEl) return;

		const selectedCount = this.statusEl.querySelector<HTMLElement>('.bangumi-selected-count');
		if (selectedCount) {
			selectedCount.setText(`${tn('controlPanel', 'selectedCount')}: ${this.state.selectedIds.size}`);
		}
	}

	/**
	 * 渲染表格
	 */
	private renderTable(): void {
		this.tableEl.empty();

		if (this.state.loading) {
			this.tableEl.createDiv({ cls: 'bangumi-table-loading', text: tn('controlPanel', 'loading') });
			return;
		}

		if (this.state.error) {
			this.tableEl.createDiv({ cls: 'bangumi-table-error', text: `${tn('controlPanel', 'loadFailed')}: ${this.state.error}` });
			return;
		}

		const filteredCollections = this.getFilteredCollections();
		const startIndex = (this.currentPage - 1) * this.pageSize;
		const endIndex = startIndex + this.pageSize;
		const pageCollections = filteredCollections.slice(startIndex, endIndex);

		if (pageCollections.length === 0) {
			this.tableEl.createDiv({ cls: 'bangumi-table-empty', text: 'No items' });
			return;
		}

		// 创建表格
		const table = this.tableEl.createEl('table', { cls: 'bangumi-collection-table' });

		// 表头
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');

		// 全选复选框
		headerRow.createEl('th').createEl('input', { type: 'checkbox' }, checkbox => {
			// 同步初始状态：当前页全部选中时显示为选中
			const allSelected = pageCollections.length > 0
				&& pageCollections.every(c => this.state.selectedIds.has(c.subject_id));
			checkbox.checked = allSelected;
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					pageCollections.forEach(c => this.state.selectedIds.add(c.subject_id));
				} else {
					pageCollections.forEach(c => this.state.selectedIds.delete(c.subject_id));
				}
				this.renderTable();
				this.renderActionBar();
			});
		});

		headerRow.createEl('th', { text: tn('controlPanel', 'name') });
		headerRow.createEl('th', { text: tn('controlPanel', 'type') });
		headerRow.createEl('th', { text: tn('controlPanel', 'status') });
		headerRow.createEl('th', { text: tn('controlPanel', 'rating') });
		headerRow.createEl('th', { text: tn('controlPanel', 'comment') });
		headerRow.createEl('th', { text: tn('controlPanel', 'tags') });
		headerRow.createEl('th', { text: tn('controlPanel', 'sync') });
		headerRow.createEl('th', { text: tn('controlPanel', 'action') });

		// 表体
		const tbody = table.createEl('tbody');

		// 重置行跟踪
		this.tableRows = [];

		pageCollections.forEach(collection => {
			const row = tbody.createEl('tr');
			this.tableRows.push(row);  // 跟踪行用于键盘导航
			const isSynced = this.state.localSubjects.has(collection.subject_id);
			const localInfo = this.state.localSubjects.get(collection.subject_id);

			// 复选框
			row.createEl('td').createEl('input', { type: 'checkbox' }, checkbox => {
				checkbox.checked = this.state.selectedIds.has(collection.subject_id);
				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.state.selectedIds.add(collection.subject_id);
					} else {
						this.state.selectedIds.delete(collection.subject_id);
					}
					this.renderActionBar();
				});
			});

			// 名称
			const nameCell = row.createEl('td', { cls: 'bangumi-name-cell' });
			nameCell.createSpan({ text: collection.subject.name_cn || collection.subject.name || tn('controlPanel', 'unknown') });
			if (!isMobile() && collection.subject.name && collection.subject.name_cn && collection.subject.name !== collection.subject.name_cn) {
				nameCell.createEl('br');
				nameCell.createSpan({ cls: 'bangumi-name-original', text: collection.subject.name });
			}

			// 类型
			row.createEl('td', { text: getTypeLabel(collection.subject_type) });

			// 状态
			row.createEl('td', { text: getCollectionStatusLabel(collection.type, collection.subject_type) });

			// 评分
			const ratingCell = row.createEl('td');
			if (collection.subject.score) {
				ratingCell.createSpan({ text: `★${collection.subject.score.toFixed(1)}` });
			}
			if (collection.rate) {
				ratingCell.createSpan({ cls: 'bangumi-my-rate', text: ` [${collection.rate}]` });
			}

			// 短评
			const commentCell = row.createEl('td', { cls: 'bangumi-comment-cell' });
			if (collection.comment) {
				// 桌面端截断显示，移动端通过 CSS 在行末截断
				const maxLen = isMobile() ? collection.comment.length : 20;
				const displayComment = !isMobile() && collection.comment.length > maxLen
					? collection.comment.substring(0, maxLen) + '...'
					: collection.comment;
				commentCell.setText(displayComment);
				if (!isMobile()) {
					commentCell.setAttribute('title', collection.comment);
				}
			}

			// 标签
			const tagsCell = row.createEl('td', { cls: 'bangumi-tags-cell' });
			if (collection.tags && collection.tags.length > 0) {
				const displayTags = collection.tags.slice(0, 3).join(', ');
				tagsCell.setText(displayTags);
				if (collection.tags.length > 3) {
					tagsCell.setText(displayTags + '...');
				}
			}

			// 同步状态
			const syncCell = row.createEl('td', { cls: 'bangumi-sync-status' });
			if (isSynced) {
				syncCell.createSpan({ text: `✓ ${tn('controlPanel', 'synced')}`, cls: 'synced' });
			} else {
				syncCell.createSpan({ text: `✗ ${tn('controlPanel', 'unsynced')}`, cls: 'unsynced' });
			}

			// 移动端：添加元数据行（类型 · 状态 · 评分 · 同步状态）
			if (isMobile()) {
				const metaCell = row.createEl('td', { cls: 'bangumi-mobile-meta' });

				// 类型
				metaCell.createSpan({ cls: 'bangumi-mobile-meta-item', text: getTypeLabel(collection.subject_type) });

				// 状态
				metaCell.createSpan({ cls: 'bangumi-mobile-meta-item', text: getCollectionStatusLabel(collection.type, collection.subject_type) });

				// 评分
				const ratingSpan = metaCell.createSpan({ cls: 'bangumi-mobile-meta-item' });
				if (collection.subject.score) {
					ratingSpan.createSpan({ text: `★${collection.subject.score.toFixed(1)}` });
				}
				if (collection.rate) {
					ratingSpan.createSpan({ cls: 'bangumi-my-rate', text: ` [${collection.rate}]` });
				}
				if (!collection.subject.score && !collection.rate) {
					ratingSpan.setText('-');
				}

				// 同步状态
				const syncSpan = metaCell.createSpan({ cls: 'bangumi-mobile-meta-item' });
				if (isSynced) {
					syncSpan.createSpan({ text: `✓ ${tn('controlPanel', 'synced')}`, cls: 'synced' });
				} else {
					syncSpan.createSpan({ text: `✗ ${tn('controlPanel', 'unsynced')}`, cls: 'unsynced' });
				}
			}

			// 操作
			const actionCell = row.createEl('td', { cls: 'bangumi-action-cell' });
			if (isSynced && localInfo) {
				actionCell.createEl('button', { text: tn('controlPanel', 'open'), cls: 'bangumi-action-btn-small' }, btn => {
					btn.addEventListener('click', () => this.openFile(localInfo.path));
				});
				actionCell.createEl('button', { text: tn('controlPanel', 'note'), cls: 'bangumi-action-btn-small' }, btn => {
					btn.addEventListener('click', () => {
						void this.openOrCreateNote(localInfo.path);
					});
				});
			}
		});
	}

	private async openOrCreateNote(path: string): Promise<void> {
		if (!this.subjectNoteManager) {
			new Notice(tn('notices', 'noteManagerNotInit'));
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(tn('controlPanel', 'fileNotFound'));
			return;
		}

		await this.subjectNoteManager.createOrAppendForLocalFile(file);
	}

	/**
	 * 渲染分页
	 */
	private renderPagination(): void {
		this.paginationEl.empty();

		const filteredCollections = this.getFilteredCollections();
		const totalPages = Math.ceil(filteredCollections.length / this.pageSize);

		if (totalPages <= 1) {
			this.footerBarEl.addClass('no-pagination');
			return;
		}

		this.footerBarEl.removeClass('no-pagination');

		this.paginationEl.createEl('button', { text: tn('controlPanel', 'prevPage'), cls: 'bangumi-pagination-btn bangumi-pagination-prev' }, btn => {
			btn.disabled = this.currentPage <= 1;
			btn.addEventListener('click', () => {
				if (this.currentPage > 1) {
					this.currentPage--;
					this.renderTable();
					this.renderPagination();
				}
			});
		});

		const info = this.paginationEl.createSpan({ cls: 'bangumi-pagination-info' });
		info.setText(`${tn('controlPanel', 'totalItems')} ${filteredCollections.length}, ${this.currentPage}/${totalPages}`);

		this.paginationEl.createEl('button', { text: tn('controlPanel', 'nextPage'), cls: 'bangumi-pagination-btn bangumi-pagination-next' }, btn => {
			btn.disabled = this.currentPage >= totalPages;
			btn.addEventListener('click', () => {
				if (this.currentPage < totalPages) {
					this.currentPage++;
					this.renderTable();
					this.renderPagination();
				}
			});
		});
	}

	/**
	 * 打开文件
	 */
	private openFile(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			this.close();
			void this.app.workspace.openLinkText(file.path, '', true);
		} else {
			new Notice(tn('controlPanel', 'fileNotFound'));
		}
	}

	/**
	 * 同步选中条目
	 * @param overwrite 是否强制覆盖已存在的文件
	 */
	private async syncSelected(overwrite: boolean = false): Promise<void> {
		if (this.state.selectedIds.size === 0) {
			new Notice(tn('controlPanel', 'selectToSync'));
			return;
		}

		// 获取选中的条目
		let selectedCollections: UserCollection[];
		if (overwrite) {
			// 强制同步：同步所有选中的条目
			selectedCollections = this.state.collections.filter(c =>
				this.state.selectedIds.has(c.subject_id)
			);
		} else {
			// 普通同步：只同步未同步的条目
			selectedCollections = this.state.collections.filter(c =>
				this.state.selectedIds.has(c.subject_id) && !this.state.localSubjects.has(c.subject_id)
			);
		}

		if (selectedCollections.length === 0) {
			new Notice(overwrite ? tn('controlPanel', 'selectToSync') : tn('controlPanel', 'alreadySynced'));
			return;
		}

		const localPropertyResult = await this.collectLocalPropertyValues(selectedCollections);
		if (localPropertyResult === null) {
			return;
		}

		// 显示同步进度
		this.state.loading = true;
		this.renderStatus(`${tn('controlPanel', 'syncingItems')} ${selectedCollections.length}...`);

		try {
			const result = await this.syncManager.syncByCollections(
				selectedCollections,
				{
					overwrite,
					localPropertyValuesBySubjectId: localPropertyResult.propertyValuesBySubjectId,
					concurrency: this.settings.syncConcurrency,
				},
				(current, total, message) => {
					this.renderStatus(message);
				}
			);

			this.state.loading = false;

			if (result.success) {
				new Notice(`${tn('controlPanel', 'syncComplete')}! ${result.added}, ${result.errors}`);

				// 重新扫描本地文件夹以更新同步状态
				const scanPath = this.settings.scanFolderPath || 'ACGN';
				await this.incrementalSync.scanLocalFolder(scanPath);

				// 更新本地条目映射
				this.state.localSubjects = new Map();
				const syncedIds = this.incrementalSync.getSyncedIds();
				for (const id of syncedIds) {
					const info = this.incrementalSync.getLocalSubject(id);
					if (info) {
						this.state.localSubjects.set(id, info);
					}
				}

				// 清空选中状态
				this.state.selectedIds.clear();

				// 刷新表格
				this.renderStatus(`${tn('controlPanel', 'syncComplete')}, ${tn('controlPanel', 'totalItems')} ${this.state.collections.length}, ${tn('controlPanel', 'synced')} ${syncedIds.size}`);
				this.renderTable();
				this.renderActionBar();
				this.renderPagination();
			} else {
				new Notice(tn('controlPanel', 'syncFailed'));
				this.renderStatus(tn('controlPanel', 'syncFailed'));
			}

		} catch (error) {
			this.state.loading = false;
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`${tn('controlPanel', 'syncError')}: ${errorMsg}`);
			this.renderStatus(`${tn('controlPanel', 'syncError')}: ${errorMsg}`);
		}
	}

	private async collectLocalPropertyValues(
		collections: UserCollection[]
	): Promise<LocalPropertyModalResult | null> {
		// 批量同步超过 10 条时跳过自定义属性弹窗，直接使用默认值
		if (collections.length > 10) {
			console.debug(`[Bangumi Sync] 批量同步 ${collections.length} 条，跳过自定义属性弹窗`);
			return { propertyValuesBySubjectId: new Map() };
		}

		let warned = false;
		const subjectsById = await loadSubjectsForCollections(
			collections,
			this.client,
			(message) => {
				if (!warned) {
					warned = true;
					new Notice(message);
				}
			}
		);

		// 没有可填写的自定义属性时跳过弹窗
		if (!hasLocalPropertyFieldsForCollections(collections, subjectsById, this.syncManager.getCustomTemplates())) {
			console.debug(`[Bangumi Sync] No custom property fields, skipping modal`);
			return { propertyValuesBySubjectId: new Map() };
		}

		console.debug(`[Bangumi Sync] Opening custom properties modal for ${collections.length} collections`);

		return new Promise<LocalPropertyModalResult | null>(resolve => {
			let resolved = false;
			const modal = new LocalPropertyModal(
				this.app,
				collections,
				subjectsById,
				this.syncManager.getCustomTemplates(),
				(result) => {
					resolved = true;
					resolve(result);
				}
			);

			const originalOnClose = modal.onClose.bind(modal);
			modal.onClose = () => {
				originalOnClose();
				if (!resolved) {
					resolved = true;
					resolve(null);
				}
			};
			modal.open();
		});
	}

	/**
	 * 删除选中的本地条目
	 */
	private deleteSelected(): void {
		if (this.state.selectedIds.size === 0) {
			new Notice(tn('controlPanel', 'selectToDelete'));
			return;
		}

		// 获取选中的已同步条目
		const syncedCollections = this.state.collections.filter(c =>
			this.state.selectedIds.has(c.subject_id) && this.state.localSubjects.has(c.subject_id)
		);

		if (syncedCollections.length === 0) {
			new Notice(tn('controlPanel', 'selectSyncedToDelete'));
			return;
		}

		// 确认删除
		const modal = new ConfirmModal(
			this.app,
			tn('controlPanel', 'confirmDeleteMessage'),
			() => {
				void (async () => {
					let deleted = 0;
					let failed = 0;

					for (const collection of syncedCollections) {
						const localInfo = this.state.localSubjects.get(collection.subject_id);
						if (localInfo) {
							try {
								const file = this.app.vault.getAbstractFileByPath(localInfo.path);
								if (file instanceof TFile) {
									await this.app.fileManager.trashFile(file);
									this.state.localSubjects.delete(collection.subject_id);
									deleted++;
								}
							} catch (error) {
								console.error(`Delete file failed: ${localInfo.path}`, error);
								failed++;
							}
						}
					}

					new Notice(`${tn('controlPanel', 'deleteComplete')}: ${deleted}, ${failed}`);

					// 清空选中状态
					this.state.selectedIds.clear();

					// 刷新表格
					this.renderStatus(`${tn('controlPanel', 'totalItems')} ${this.state.collections.length}, ${tn('controlPanel', 'synced')} ${this.state.localSubjects.size}`);
					this.renderTable();
					this.renderActionBar();
				})();
			}
		);
		modal.open();
	}

	/**
	 * 打开批量编辑器
	 */
	private openBatchEditor(): void {
		const selectedCollections = this.state.collections.filter(c =>
			this.state.selectedIds.has(c.subject_id) && this.state.localSubjects.has(c.subject_id)
		);

		if (selectedCollections.length === 0) {
			new Notice(tn('controlPanel', 'selectSyncedToEdit'));
			return;
		}

		const targetItems = selectedCollections
			.map(collection => {
				const localInfo = this.state.localSubjects.get(collection.subject_id);
				if (!localInfo?.path) {
					return null;
				}

				return {
					filePath: localInfo.path,
					displayName: collection.subject.name_cn || collection.subject.name || localInfo.name_cn || String(collection.subject_id),
				};
			})
			.filter((item): item is { filePath: string; displayName: string } => item !== null);

		const modal = new BatchEditorModal(
			this.app,
			targetItems,
			async (submission) => {
				const result = submission.mode === 'uniform'
					? await this.frontmatterEditor.batchModify(
						targetItems.map(item => item.filePath),
						submission.operations ?? []
					)
					: await this.frontmatterEditor.batchApplyPerItemUpdates(submission.perItemUpdates ?? []);
				new Notice(`${tn('controlPanel', 'batchEdit')}: ${result.success}, ${result.failed}`);
				this.renderActionBar(); // 更新撤销按钮状态
			}
		);
		modal.open();
	}

	/**
	 * 打开搜索弹窗
	 */
	private openSearchModal(): void {
		const modal = new SearchModal(
			this.app,
			this.client,
			this.settings,
			this.syncManager,
			() => {
				void this.loadData();
			}
		);
		modal.open();
	}

	/**
	 * 撤销上一次编辑
	 */
	private async undoLastEdit(): Promise<void> {
		if (!this.frontmatterEditor.canUndo()) {
			new Notice(tn('controlPanel', 'noUndo'));
			return;
		}

		const success = await this.frontmatterEditor.undo();
		if (success) {
			new Notice(tn('controlPanel', 'undoSuccess'));
			this.renderActionBar();
		} else {
			new Notice(tn('controlPanel', 'undoFailed'));
		}
	}

	/**
	 * 同步状态
	 * 用户数据对全部条目对比；平台数据仅对本地未明确已完结的条目对比
	 */
	private async syncStatus(): Promise<void> {
		// 获取已同步的条目
		const syncedCollections = this.state.collections.filter(c =>
			this.state.localSubjects.has(c.subject_id)
		);

		if (syncedCollections.length === 0) {
			new Notice(tn('controlPanel', 'noSyncedItemsStatus'));
			return;
		}

		this.state.loading = true;
		this.renderStatus(tn('controlPanel', 'comparingStatus'));

		try {
			const diffs: StatusSyncDiff[] = [];

			for (const collection of syncedCollections) {
				const localInfo = this.state.localSubjects.get(collection.subject_id);
				if (!localInfo) continue;

				// 读取本地文件
				const file = this.app.vault.getAbstractFileByPath(localInfo.path);
				if (!(file instanceof TFile)) continue;

				const content = await this.app.vault.read(file);

				// 获取状态字段名
				const statusFieldName = this.incrementalSync.getStatusFieldName(collection.subject_type);

				// 提取本地数据
				const localRate = this.incrementalSync.extractRate(content);
				const localComment = this.incrementalSync.extractComment(content);
				const localTags = this.incrementalSync.normalizeTags(this.incrementalSync.extractTags(content));
				const localStatus = this.incrementalSync.extractStatus(content, statusFieldName);

				// 云端用户数据
				const cloudRate = collection.rate || null;
				const cloudComment = collection.comment || null;
				const cloudTagsRaw = collection.tags && collection.tags.length > 0 ? collection.tags : null;
				const cloudTags = this.incrementalSync.normalizeTags(cloudTagsRaw);
				const cloudStatus = collection.type || null;
				let episodeStatusDiff: FieldDiff<string>;
				try {
					episodeStatusDiff = await this.buildEpisodeStatusDiff(file, collection.subject_id, collection.subject_type);
				} catch (epError) {
					console.warn(`[Bangumi Sync] 获取章节状态失败 (${collection.subject_id}):`, epError);
					episodeStatusDiff = {
						localValue: null,
						cloudValue: null,
						hasDiff: false,
						decision: 'skip',
					};
				}

				const platformFields = await this.buildPlatformFieldDiffs(collection, content);

				// 构建差异对象
				const diff = this.buildStatusSyncDiff(
					collection,
					localInfo,
					statusFieldName,
					localRate, cloudRate,
					localComment, cloudComment,
					localTags, cloudTags,
					localStatus, cloudStatus,
					episodeStatusDiff,
					platformFields.fields,
					platformFields.payload
				);

				if (diff.hasAnyDiff) {
					diffs.push(diff);
				}
			}

			this.state.loading = false;

			if (diffs.length === 0) {
				new Notice(tn('controlPanel', 'noStatusDiff'));
				this.renderStatus(tn('controlPanel', 'noStatusDiff'));
				return;
			}

			// 打开状态同步弹窗
			const modal = new StatusSyncModal(
				this.app,
				this.client,
				this.incrementalSync,
				diffs,
				() => {
					// 同步完成后刷新
					void this.loadData();
				},
				this.episodeStatusManager
			);
			modal.open();

		} catch (error) {
			this.state.loading = false;
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`${tn('controlPanel', 'compareStatusFailed')}: ${errorMsg}`);
			this.renderStatus(`${tn('controlPanel', 'compareStatusFailed')}: ${errorMsg}`);
		}
	}

	/**
	 * 构建状态同步差异对象
	 */
	private buildStatusSyncDiff(
		collection: UserCollection,
		localInfo: LocalSubjectInfo,
		statusFieldName: string,
		localRate: number | null,
		cloudRate: number | null,
		localComment: string | null,
		cloudComment: string | null,
		localTags: string[] | null,
		cloudTags: string[] | null,
		localStatus: number | null,
		cloudStatus: number | null,
		episodeStatus: FieldDiff<string>,
		platformFields: PlatformFieldDiff[],
		platformSyncPayload?: PlatformSyncPayload
	): StatusSyncDiff {
		// 评分差异
		const rateDiff: FieldDiff<number> = {
			localValue: localRate,
			cloudValue: cloudRate,
			hasDiff: localRate !== cloudRate,
			decision: 'skip',
		};

		// 短评差异（忽略空白差异）
		const localCommentNormalized = this.incrementalSync.normalizeComment(localComment);
		const cloudCommentNormalized = this.incrementalSync.normalizeComment(cloudComment);
		const commentDiff: FieldDiff<string> = {
			localValue: localCommentNormalized,
			cloudValue: cloudCommentNormalized,
			hasDiff: localCommentNormalized !== cloudCommentNormalized,
			decision: 'skip',
		};

		// 标签差异（忽略顺序）
		const localTagSet = localTags ? new Set(localTags.map(t => t.toLowerCase().trim())) : new Set();
		const cloudTagSet = cloudTags ? new Set(cloudTags.map(t => t.toLowerCase().trim())) : new Set();
		const tagsHasDiff = localTagSet.size !== cloudTagSet.size ||
			![...localTagSet].every(t => cloudTagSet.has(t));
		const tagsDiff: FieldDiff<string[]> = {
			localValue: localTags,
			cloudValue: cloudTags,
			hasDiff: tagsHasDiff,
			decision: 'skip',
		};

		// 状态差异
		const statusDiff: FieldDiff<number> = {
			localValue: localStatus,
			cloudValue: cloudStatus,
			hasDiff: localStatus !== cloudStatus,
			decision: 'skip',
		};

		const hasUserDiff = rateDiff.hasDiff || commentDiff.hasDiff || tagsDiff.hasDiff || statusDiff.hasDiff || episodeStatus.hasDiff;
		const hasPlatformDiff = platformFields.some(field => field.hasDiff);
		const hasAnyDiff = hasUserDiff || hasPlatformDiff;

		return {
			subjectId: collection.subject_id,
			name_cn: collection.subject.name_cn || '',
			name: collection.subject.name || '',
			localPath: localInfo.path,
			collection,
			statusFieldName,
			rate: rateDiff,
			comment: commentDiff,
			tags: tagsDiff,
			status: statusDiff,
			episodeStatus,
			platformFields,
			platformSyncPayload,
			hasUserDiff,
			hasPlatformDiff,
			hasAnyDiff,
			expanded: false,
		};
	}

	private async buildPlatformFieldDiffs(
		collection: UserCollection,
		content: string,
	): Promise<{ fields: PlatformFieldDiff[]; payload?: PlatformSyncPayload }> {
		if (
			collection.subject_type !== SubjectType.Anime &&
			collection.subject_type !== SubjectType.Real &&
			collection.subject_type !== SubjectType.Book
		) {
			return { fields: [] };
		}

		const localContext = this.incrementalSync.extractLocalPlatformSyncContext(content);
		if (!this.incrementalSync.isPlatformDataCandidate(localContext)) {
			return { fields: [] };
		}

		const subject = await this.client.getSubject(collection.subject_id);
		const parsedInfo = parseInfoByType(subject.infobox, subject.type, subject.platform);
		const cloudPayload = this.buildPlatformSyncPayload(subject, parsedInfo);
		const fields: PlatformFieldDiff[] = [];

		if (cloudPayload.serialStatus && localContext.serialStatus !== cloudPayload.serialStatus) {
			fields.push({
				key: 'serialState',
				label: tn('statusSyncModal', 'fieldSerialState'),
				localValue: localContext.serialStatus,
				cloudValue: cloudPayload.serialStatus,
				hasDiff: true,
				decision: 'skip',
			});
		}

		if (collection.subject_type === SubjectType.Anime || collection.subject_type === SubjectType.Real) {
			const cloudValue = cloudPayload.episodeCount;
			if (cloudValue !== undefined && cloudValue !== null && localContext.episodeCount !== cloudValue) {
				fields.push({
					key: 'episodeCount',
					label: tn('statusSyncModal', 'fieldEpisodeCount'),
					localValue: localContext.episodeCount !== null ? String(localContext.episodeCount) : null,
					cloudValue: String(cloudValue),
					hasDiff: true,
					decision: 'skip',
				});
			}
		}

		if (collection.subject_type === SubjectType.Book) {
			const isComic = (parsedInfo.category || '').includes('漫画') || localContext.chapterCount !== null;
			if (isComic) {
				if (cloudPayload.chapterCount !== undefined && cloudPayload.chapterCount !== null && localContext.chapterCount !== cloudPayload.chapterCount) {
					fields.push({
						key: 'chapterCount',
						label: tn('statusSyncModal', 'fieldChapterCount'),
						localValue: localContext.chapterCount !== null ? String(localContext.chapterCount) : null,
						cloudValue: String(cloudPayload.chapterCount),
						hasDiff: true,
						decision: 'skip',
					});
				}
				if (cloudPayload.volumeCount !== undefined && cloudPayload.volumeCount !== null && localContext.volumeCount !== cloudPayload.volumeCount) {
					fields.push({
						key: 'volumeCount',
						label: tn('statusSyncModal', 'fieldVolumeCount'),
						localValue: localContext.volumeCount !== null ? String(localContext.volumeCount) : null,
						cloudValue: String(cloudPayload.volumeCount),
						hasDiff: true,
						decision: 'skip',
					});
				}
			} else if (cloudPayload.volumeCount !== undefined && cloudPayload.volumeCount !== null && localContext.volumeCount !== cloudPayload.volumeCount) {
				fields.push({
					key: 'volumeCount',
					label: tn('statusSyncModal', 'fieldVolumeCount'),
					localValue: localContext.volumeCount !== null ? String(localContext.volumeCount) : null,
					cloudValue: String(cloudPayload.volumeCount),
					hasDiff: true,
					decision: 'skip',
				});
			}
		}

		return fields.length > 0 ? { fields, payload: cloudPayload } : { fields: [] };
	}

	private buildPlatformSyncPayload(subject: Subject, parsedInfo: ReturnType<typeof parseInfoByType>): PlatformSyncPayload {
		const episodeCount = subject.total_episodes || subject.eps || parsedInfo.episode || null;
		const volumeCount = subject.volumes || parsedInfo.volumes || null;
		const serialStatus = parsedInfo.status || null;
		const start = parsedInfo.start || null;
		const end = parsedInfo.end || null;
		const progress = parsedInfo.progress || null;

		return {
			serialStatus,
			progress,
			start,
			end,
			episodeCount,
			chapterCount: parsedInfo.episode || null,
			volumeCount,
		};
	}

	private async buildEpisodeStatusDiff(
		file: TFile,
		subjectId: number,
		subjectType: SubjectType
	): Promise<FieldDiff<string>> {
		if (!this.episodeStatusManager || (subjectType !== SubjectType.Anime && subjectType !== SubjectType.Real)) {
			return {
				localValue: null,
				cloudValue: null,
				hasDiff: false,
				decision: 'skip',
			};
		}

		const [localMap, cloudMap] = await Promise.all([
			this.episodeStatusManager.getEpisodeStatusMap(file),
			this.episodeStatusManager.getCloudEpisodeStatusMap(subjectId),
		]);

		const localValue = this.episodeStatusManager.summarizeEpisodeStatuses(localMap);
		const cloudValue = this.episodeStatusManager.summarizeEpisodeStatuses(cloudMap);
		const hasDiff = this.episodeStatusManager.serializeEpisodeStatuses(localMap) !==
			this.episodeStatusManager.serializeEpisodeStatuses(cloudMap);

		return {
			localValue,
			cloudValue,
			hasDiff,
			decision: 'skip',
		};
	}

	/**
	 * 处理键盘导航
	 */
	private handleKeyDown(event: KeyboardEvent): void {
		const filteredCollections = this.getFilteredCollections();
		const startIndex = (this.currentPage - 1) * this.pageSize;
		const pageCollections = filteredCollections.slice(startIndex, startIndex + this.pageSize);

		if (pageCollections.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				this.focusedRowIndex = Math.min(this.focusedRowIndex + 1, pageCollections.length - 1);
				this.updateFocus();
				break;

			case 'ArrowUp':
				event.preventDefault();
				this.focusedRowIndex = Math.max(this.focusedRowIndex - 1, 0);
				this.updateFocus();
				break;

			case 'PageDown':
				event.preventDefault();
				if (this.currentPage < Math.ceil(filteredCollections.length / this.pageSize)) {
					this.currentPage++;
					this.focusedRowIndex = 0;
					this.renderTable();
					this.renderPagination();
				}
				break;

			case 'PageUp':
				event.preventDefault();
				if (this.currentPage > 1) {
					this.currentPage--;
					this.focusedRowIndex = 0;
					this.renderTable();
					this.renderPagination();
				}
				break;

			case 'Enter':
			case ' ':
				event.preventDefault();
				if (this.focusedRowIndex >= 0 && this.focusedRowIndex < pageCollections.length) {
					const collection = pageCollections[this.focusedRowIndex];
					const localInfo = this.state.localSubjects.get(collection.subject_id);
					if (localInfo) {
						this.openFile(localInfo.path);
					}
				}
				break;

			case 'Escape':
				event.preventDefault();
				this.close();
				break;
		}
	}

	/**
	 * 更新焦点样式
	 */
	private updateFocus(): void {
		this.tableRows.forEach((row, index) => {
			if (index === this.focusedRowIndex) {
				row.addClass('focused');
				row.scrollIntoView({ block: 'nearest' });
			} else {
				row.removeClass('focused');
			}
		});
	}

	/**
	 * 设置滑动关闭手势（仅移动端）
	 * 只在从顶部下拉时触发，避免与表格滚动冲突
	 */
	private setupSwipeToClose(): void {
		if (!isMobile()) return;

		this.touchStartHandler = (e) => {
			this.touchStartY = e.touches[0].clientY;
			// 只有当表格在顶部时才允许滑动关闭
			this.swipeEnabled = this.tableEl.scrollTop === 0;
		};

		this.touchMoveHandler = (e) => {
			if (!this.swipeEnabled) return;

			this.touchCurrentY = e.touches[0].clientY;
			const diff = this.touchCurrentY - this.touchStartY;

			// 只有向下拉且表格仍在顶部时才触发
			if (diff > 0 && this.tableEl.scrollTop === 0) {
				this.contentEl.setCssProps({
					'--swipe-y': `${diff}px`,
					'--swipe-opacity': String(1 - diff / 300),
				});
				this.contentEl.addClass('is-swiping');
			}
		};

		this.touchEndHandler = () => {
			if (!this.swipeEnabled) return;

			const diff = this.touchCurrentY - this.touchStartY;
			if (diff > 100 && this.tableEl.scrollTop === 0) {
				this.close();
			} else {
				this.contentEl.setCssProps({
					'--swipe-y': '',
					'--swipe-opacity': '',
				});
				this.contentEl.removeClass('is-swiping');
			}
			this.swipeEnabled = false;
		};

		this.contentEl.addEventListener('touchstart', this.touchStartHandler, { passive: true });
		this.contentEl.addEventListener('touchmove', this.touchMoveHandler, { passive: true });
		this.contentEl.addEventListener('touchend', this.touchEndHandler, { passive: true });
	}
}

function compareTime(left: string | undefined, right: string | undefined): number {
	return parseDateTime(left) - parseDateTime(right);
}

function compareTitle(left: string, right: string): number {
	return left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' });
}

function compareNumber(left: number, right: number): number {
	return left - right;
}

function parseDateTime(value: string | undefined): number {
	if (!value) return 0;
	const time = Date.parse(value);
	return Number.isFinite(time) ? time : 0;
}

/**
 * 确认对话框
 */
class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void | Promise<void>;

	constructor(app: App, message: string, onConfirm: () => void | Promise<void>) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('p', { text: this.message });

		const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });

		const confirmBtn = buttonDiv.createEl('button', { text: tn('controlPanel', 'confirmDelete'), cls: 'mod-cta' });
		confirmBtn.addEventListener('click', () => {
			void this.onConfirm();
			this.close();
		});

		const cancelBtn = buttonDiv.createEl('button', { text: tn('syncOptions', 'cancel') });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
