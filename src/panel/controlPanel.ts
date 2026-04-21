/**
 * 控制面板
 * 展示所有收藏条目，标记同步状态，支持批量操作
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import { UserCollection, SubjectType, CollectionType, getSubjectTypeName, getCollectionTypeName, getCollectionStatusEmoji } from '../../common/api/types';
import { BangumiPluginSettings, PanelFilters, DEFAULT_PANEL_FILTERS } from '../settings/settings';
import { SyncManager } from '../sync/syncManager';
import { IncrementalSync } from '../sync/incrementalSync';
import { BangumiClient } from '../api/client';
import { getTypeLabel } from '../../common/template/defaultTemplates';
import { BatchEditorModal, BatchEditOperation, FrontmatterEditor } from './batchEditorModal';
import { CommentSyncModal, CommentDiff } from './commentSyncModal';
import { TagSyncModal, TagDiff } from './tagSyncModal';
import { ConflictDetector, ConflictResolverModal, LocalItemData } from './conflictResolver';

/**
 * 本地条目信息
 */
interface LocalSubjectInfo {
	id: number;
	path: string;
	name_cn: string;
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
	private onFiltersChange: (filters: PanelFilters) => void;

	private state: PanelState;
	private filters: PanelFilters;

	// UI 元素
	private filterBarEl: HTMLElement;
	private actionBarEl: HTMLElement;
	private tableEl: HTMLElement;
	private paginationEl: HTMLElement;
	private statusEl: HTMLElement;

	// 分页
	private currentPage: number = 1;
	private pageSize: number = 50;

	// 键盘导航
	private focusedRowIndex: number = -1;
	private tableRows: HTMLTableRowElement[] = [];

	constructor(
		app: App,
		settings: BangumiPluginSettings,
		syncManager: SyncManager,
		onFiltersChange: (filters: PanelFilters) => void
	) {
		super(app);
		this.settings = settings;
		this.syncManager = syncManager;
		this.onFiltersChange = onFiltersChange;

		this.client = new BangumiClient(settings.accessToken);
		this.incrementalSync = new IncrementalSync(app);
		this.frontmatterEditor = new FrontmatterEditor(app);
			this.conflictDetector = new ConflictDetector(app);

		this.filters = { ...settings.panelFilters };
		this.state = {
			collections: [],
			localSubjects: new Map(),
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
		contentEl.createEl('h2', { text: 'Bangumi 收藏管理面板' });

		// 筛选栏
		this.filterBarEl = contentEl.createDiv({ cls: 'bangumi-panel-filter-bar' });
		this.renderFilterBar();

		// 操作栏
		this.actionBarEl = contentEl.createDiv({ cls: 'bangumi-panel-action-bar' });
		this.renderActionBar();

		// 状态栏
		this.statusEl = contentEl.createDiv({ cls: 'bangumi-panel-status' });

		// 表格区域
		this.tableEl = contentEl.createDiv({ cls: 'bangumi-panel-table' });

		// 分页
		this.paginationEl = contentEl.createDiv({ cls: 'bangumi-panel-pagination' });

		// 添加键盘导航
		this.tableEl.setAttribute('tabindex', '0');
		this.tableEl.addEventListener('keydown', (e) => this.handleKeyDown(e));

		// 加载数据
		this.loadData();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * 渲染筛选栏
	 */
	private renderFilterBar(): void {
		this.filterBarEl.empty();

		// 类型筛选
		const typeSelect = this.filterBarEl.createEl('select', { cls: 'bangumi-filter-select' });
		typeSelect.createEl('option', { value: 'all', text: '全部类型' });
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
		const statusSelect = this.filterBarEl.createEl('select', { cls: 'bangumi-filter-select' });
		statusSelect.createEl('option', { value: 'all', text: '全部状态' });
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
		const syncSelect = this.filterBarEl.createEl('select', { cls: 'bangumi-filter-select' });
		syncSelect.createEl('option', { value: 'all', text: '全部同步状态' });
		syncSelect.createEl('option', { value: 'synced', text: '已同步' });
		syncSelect.createEl('option', { value: 'unsynced', text: '未同步' });
		syncSelect.value = this.filters.syncStatus;
		syncSelect.addEventListener('change', () => {
			this.filters.syncStatus = syncSelect.value as 'synced' | 'unsynced' | 'all';
			this.onFiltersChange(this.filters);
			this.applyFilters();
		});

		// 搜索框
		const searchInput = this.filterBarEl.createEl('input', {
			type: 'text',
			placeholder: '搜索条目名称...',
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
		this.actionBarEl.createEl('button', { text: '刷新', cls: 'bangumi-action-btn' }, btn => {
			btn.addEventListener('click', () => this.loadData());
		});

		// 同步选中按钮
		this.actionBarEl.createEl('button', { text: '同步选中', cls: 'bangumi-action-btn' }, btn => {
			btn.addEventListener('click', () => this.syncSelected(false));
		});

		// 强制同步按钮
		this.actionBarEl.createEl('button', { text: '强制同步', cls: 'bangumi-action-btn' }, btn => {
			btn.addEventListener('click', () => this.syncSelected(true));
		});

		// 删除选中按钮
		this.actionBarEl.createEl('button', { text: '删除选中', cls: 'bangumi-action-btn' }, btn => {
			btn.addEventListener('click', () => this.deleteSelected());
		});

		// 批量编辑按钮
		this.actionBarEl.createEl('button', { text: '批量编辑', cls: 'bangumi-action-btn' }, btn => {
			btn.addEventListener('click', () => this.openBatchEditor());
		});

		// 同步短评按钮
		this.actionBarEl.createEl('button', { text: '同步短评', cls: 'bangumi-action-btn' }, btn => {
			btn.addEventListener('click', () => this.syncComments());
		});

		// 同步标签按钮
		this.actionBarEl.createEl('button', { text: '同步标签', cls: 'bangumi-action-btn' }, btn => {
			btn.addEventListener('click', () => this.syncTags());
		});

		// 撤销按钮
		const undoBtn = this.actionBarEl.createEl('button', { text: '撤销', cls: 'bangumi-action-btn' }, btn => {
			btn.addEventListener('click', () => this.undoLastEdit());
		});
		undoBtn.disabled = !this.frontmatterEditor.canUndo();

		// 已选数量
		const selectedCount = this.actionBarEl.createSpan({ cls: 'bangumi-selected-count' });
		selectedCount.setText(`已选: ${this.state.selectedIds.size} 项`);
	}

	/**
	 * 加载数据
	 */
	private async loadData(): Promise<void> {
		this.state.loading = true;
		this.state.error = null;
		this.renderStatus('正在加载收藏数据...');
		this.renderTable();

		try {
			// 1. 验证 Token 并获取用户名
			const validateResult = await this.client.validateToken();
			if (!validateResult.valid || !validateResult.username) {
				throw new Error(validateResult.error || 'Token 验证失败');
			}

			// 2. 获取所有收藏
			this.renderStatus('正在获取收藏列表...');
			const collections = await this.client.getAllUserCollections(validateResult.username, {
				onProgress: (current, total) => {
					this.state.loadingProgress = { current, total };
					this.renderStatus(`正在获取收藏列表... (${current}/${total})`);
				}
			});

			this.state.collections = collections;

			// 3. 扫描本地文件夹
			this.renderStatus('正在扫描本地文件夹...');
			const scanPath = this.settings.scanFolderPath || 'ACGN';
			await this.incrementalSync.scanLocalFolder(scanPath, (current, total) => {
				this.renderStatus(`正在扫描本地文件... (${current}/${total})`);
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
			this.renderStatus(`加载完成，共 ${collections.length} 条收藏，${syncedIds.size} 条已同步`);
			this.applyFilters();

		} catch (error) {
			this.state.loading = false;
			this.state.error = error instanceof Error ? error.message : String(error);
			this.renderStatus(`加载失败: ${this.state.error}`);
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

		return result;
	}

	/**
	 * 渲染状态栏
	 */
	private renderStatus(message: string): void {
		this.statusEl.empty();
		this.statusEl.setText(message);

		if (this.state.loading) {
			this.statusEl.addClass('loading');
		} else {
			this.statusEl.removeClass('loading');
		}
	}

	/**
	 * 渲染表格
	 */
	private renderTable(): void {
		this.tableEl.empty();

		if (this.state.loading) {
			this.tableEl.createDiv({ cls: 'bangumi-table-loading', text: '加载中...' });
			return;
		}

		if (this.state.error) {
			this.tableEl.createDiv({ cls: 'bangumi-table-error', text: `错误: ${this.state.error}` });
			return;
		}

		const filteredCollections = this.getFilteredCollections();
		const startIndex = (this.currentPage - 1) * this.pageSize;
		const endIndex = startIndex + this.pageSize;
		const pageCollections = filteredCollections.slice(startIndex, endIndex);

		if (pageCollections.length === 0) {
			this.tableEl.createDiv({ cls: 'bangumi-table-empty', text: '没有符合条件的条目' });
			return;
		}

		// 创建表格
		const table = this.tableEl.createEl('table', { cls: 'bangumi-collection-table' });

		// 表头
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');

		// 全选复选框
		headerRow.createEl('th').createEl('input', { type: 'checkbox' }, checkbox => {
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

		headerRow.createEl('th', { text: '名称' });
		headerRow.createEl('th', { text: '类型' });
		headerRow.createEl('th', { text: '状态' });
		headerRow.createEl('th', { text: '评分' });
		headerRow.createEl('th', { text: '短评' });
		headerRow.createEl('th', { text: '标签' });
		headerRow.createEl('th', { text: '同步' });
		headerRow.createEl('th', { text: '操作' });

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
			nameCell.createSpan({ text: collection.subject.name_cn || collection.subject.name || '未知' });
			if (collection.subject.name && collection.subject.name_cn && collection.subject.name !== collection.subject.name_cn) {
				nameCell.createEl('br');
				nameCell.createSpan({ cls: 'bangumi-name-original', text: collection.subject.name });
			}

			// 类型
			row.createEl('td', { text: getTypeLabel(collection.subject_type) });

			// 状态
			row.createEl('td', { text: getCollectionStatusEmoji(collection.type) });

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
				const maxLen = 20;
				const displayComment = collection.comment.length > maxLen
					? collection.comment.substring(0, maxLen) + '...'
					: collection.comment;
				commentCell.setText(displayComment);
				commentCell.setAttribute('title', collection.comment);
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
				syncCell.createSpan({ text: '✓ 已同步', cls: 'synced' });
			} else {
				syncCell.createSpan({ text: '✗ 未同步', cls: 'unsynced' });
			}

			// 操作
			const actionCell = row.createEl('td', { cls: 'bangumi-action-cell' });
			if (isSynced && localInfo) {
				actionCell.createEl('button', { text: '打开', cls: 'bangumi-action-btn-small' }, btn => {
					btn.addEventListener('click', () => this.openFile(localInfo.path));
				});
			}
		});
	}

	/**
	 * 渲染分页
	 */
	private renderPagination(): void {
		this.paginationEl.empty();

		const filteredCollections = this.getFilteredCollections();
		const totalPages = Math.ceil(filteredCollections.length / this.pageSize);

		if (totalPages <= 1) {
			return;
		}

		const info = this.paginationEl.createSpan({ cls: 'bangumi-pagination-info' });
		info.setText(`共 ${filteredCollections.length} 条，当前 ${this.currentPage}/${totalPages} 页`);

		const buttons = this.paginationEl.createDiv({ cls: 'bangumi-pagination-buttons' });

		buttons.createEl('button', { text: '上一页' }, btn => {
			btn.disabled = this.currentPage <= 1;
			btn.addEventListener('click', () => {
				if (this.currentPage > 1) {
					this.currentPage--;
					this.renderTable();
					this.renderPagination();
				}
			});
		});

		buttons.createEl('button', { text: '下一页' }, btn => {
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
			this.app.workspace.openLinkText(file.path, '', true);
		} else {
			new Notice('文件不存在');
		}
	}

	/**
	 * 同步选中条目
	 * @param overwrite 是否强制覆盖已存在的文件
	 */
	private async syncSelected(overwrite: boolean = false): Promise<void> {
		if (this.state.selectedIds.size === 0) {
			new Notice('请先选择要同步的条目');
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
			new Notice(overwrite ? '请选择要同步的条目' : '选中的条目都已同步');
			return;
		}

		// 显示同步进度
		this.state.loading = true;
		this.renderStatus(`正在同步 ${selectedCollections.length} 个条目...`);

		try {
			const result = await this.syncManager.syncByCollections(
				selectedCollections,
				{ overwrite },
				(current, total, message) => {
					this.renderStatus(message);
				}
			);

			this.state.loading = false;

			if (result.success) {
				new Notice(`同步完成！成功: ${result.added}, 失败: ${result.errors}`);

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
				this.renderStatus(`同步完成，共 ${this.state.collections.length} 条收藏，${syncedIds.size} 条已同步`);
				this.renderTable();
				this.renderActionBar();
				this.renderPagination();
			} else {
				new Notice('同步失败');
				this.renderStatus('同步失败');
			}

		} catch (error) {
			this.state.loading = false;
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`同步出错: ${errorMsg}`);
			this.renderStatus(`同步出错: ${errorMsg}`);
		}
	}

	/**
	 * 删除选中的本地条目
	 */
	private async deleteSelected(): Promise<void> {
		if (this.state.selectedIds.size === 0) {
			new Notice('请先选择要删除的条目');
			return;
		}

		// 获取选中的已同步条目
		const syncedCollections = this.state.collections.filter(c =>
			this.state.selectedIds.has(c.subject_id) && this.state.localSubjects.has(c.subject_id)
		);

		if (syncedCollections.length === 0) {
			new Notice('选中的条目都未同步，无法删除');
			return;
		}

		// 确认删除
		const confirmed = confirm(`确定要删除 ${syncedCollections.length} 个本地文件吗？\n此操作将移动到系统回收站。`);
		if (!confirmed) {
			return;
		}

		let deleted = 0;
		let failed = 0;

		for (const collection of syncedCollections) {
			const localInfo = this.state.localSubjects.get(collection.subject_id);
			if (localInfo) {
				try {
					const file = this.app.vault.getAbstractFileByPath(localInfo.path);
					if (file instanceof TFile) {
						await this.app.vault.trash(file, true);
						this.state.localSubjects.delete(collection.subject_id);
						deleted++;
					}
				} catch (error) {
					console.error(`删除文件失败: ${localInfo.path}`, error);
					failed++;
				}
			}
		}

		new Notice(`删除完成：成功 ${deleted} 个，失败 ${failed} 个`);

		// 清空选中状态
		this.state.selectedIds.clear();

		// 刷新表格
		this.renderStatus(`共 ${this.state.collections.length} 条收藏，${this.state.localSubjects.size} 条已同步`);
		this.renderTable();
		this.renderActionBar();
	}

	/**
	 * 打开批量编辑器
	 */
	private openBatchEditor(): void {
		const selectedCollections = this.state.collections.filter(c =>
			this.state.selectedIds.has(c.subject_id) && this.state.localSubjects.has(c.subject_id)
		);

		if (selectedCollections.length === 0) {
			new Notice('请先选择已同步的条目进行编辑');
			return;
		}

		const filePaths = selectedCollections
			.map(c => this.state.localSubjects.get(c.subject_id)?.path)
			.filter((path): path is string => path !== undefined);

		const modal = new BatchEditorModal(
			this.app,
			filePaths,
			async (operations: BatchEditOperation[]) => {
				const result = await this.frontmatterEditor.batchModify(filePaths, operations);
				new Notice(`批量编辑完成：成功 ${result.success} 个，失败 ${result.failed} 个`);
				this.renderActionBar(); // 更新撤销按钮状态
			}
		);
		modal.open();
	}

	/**
	 * 撤销上一次编辑
	 */
	private async undoLastEdit(): Promise<void> {
		if (!this.frontmatterEditor.canUndo()) {
			new Notice('没有可撤销的操作');
			return;
		}

		const success = await this.frontmatterEditor.undo();
		if (success) {
			new Notice('撤销成功');
			this.renderActionBar();
		} else {
			new Notice('撤销失败');
		}
	}

	/**
	 * 同步短评
	 * 对比本地与云端短评差异
	 */
	private async syncComments(): Promise<void> {
		// 获取已同步的条目
		const syncedCollections = this.state.collections.filter(c =>
			this.state.localSubjects.has(c.subject_id)
		);

		if (syncedCollections.length === 0) {
			new Notice('没有已同步的条目，无法对比短评');
			return;
		}

		this.state.loading = true;
		this.renderStatus('正在对比短评差异...');

		try {
			const diffs: CommentDiff[] = [];

			for (const collection of syncedCollections) {
				const localInfo = this.state.localSubjects.get(collection.subject_id);
				if (!localInfo) continue;

				// 读取本地文件
				const file = this.app.vault.getAbstractFileByPath(localInfo.path);
				if (!(file instanceof TFile)) continue;

				const content = await this.app.vault.read(file);
				const localComment = this.incrementalSync.extractComment(content);
				const cloudComment = collection.comment || null;

				// 对比差异（忽略空白差异）
				const localNormalized = localComment?.trim() || null;
				const cloudNormalized = cloudComment?.trim() || null;

				if (localNormalized !== cloudNormalized) {
					diffs.push({
						subjectId: collection.subject_id,
						name_cn: collection.subject.name_cn || '',
						name: collection.subject.name || '',
						localComment: localNormalized,
						cloudComment: cloudNormalized,
						localPath: localInfo.path,
						collection,
						decision: 'skip',
					});
				}
			}

			this.state.loading = false;

			if (diffs.length === 0) {
				new Notice('没有短评差异');
				this.renderStatus('没有短评差异');
				return;
			}

			// 打开短评同步弹窗
			const modal = new CommentSyncModal(
				this.app,
				this.client,
				this.incrementalSync,
				diffs,
				() => {
					// 同步完成后刷新
					this.loadData();
				}
			);
			modal.open();

		} catch (error) {
			this.state.loading = false;
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`对比短评失败: ${errorMsg}`);
			this.renderStatus(`对比短评失败: ${errorMsg}`);
		}
	}

	/**
	 * 同步标签
	 * 对比本地与云端标签差异
	 */
	private async syncTags(): Promise<void> {
		// 获取已同步的条目
		const syncedCollections = this.state.collections.filter(c =>
			this.state.localSubjects.has(c.subject_id)
		);

		if (syncedCollections.length === 0) {
			new Notice('没有已同步的条目，无法对比标签');
			return;
		}

		this.state.loading = true;
		this.renderStatus('正在对比标签差异...');

		try {
			const diffs: TagDiff[] = [];

			for (const collection of syncedCollections) {
				const localInfo = this.state.localSubjects.get(collection.subject_id);
				if (!localInfo) continue;

				// 读取本地文件
				const file = this.app.vault.getAbstractFileByPath(localInfo.path);
				if (!(file instanceof TFile)) continue;

				const content = await this.app.vault.read(file);
				const localTags = this.incrementalSync.extractTags(content);
				const cloudTags = collection.tags && collection.tags.length > 0 ? collection.tags : null;

				// 对比差异（忽略顺序）
				const localSet = localTags ? new Set(localTags.map(t => t.toLowerCase().trim())) : new Set();
				const cloudSet = cloudTags ? new Set(cloudTags.map(t => t.toLowerCase().trim())) : new Set();

				// 检查是否有差异
				const hasDiff = localSet.size !== cloudSet.size ||
					![...localSet].every(t => cloudSet.has(t));

				if (hasDiff) {
					diffs.push({
						subjectId: collection.subject_id,
						name_cn: collection.subject.name_cn || '',
						name: collection.subject.name || '',
						localTags,
						cloudTags,
						localPath: localInfo.path,
						collection,
						decision: 'skip',
					});
				}
			}

			this.state.loading = false;

			if (diffs.length === 0) {
				new Notice('没有标签差异');
				this.renderStatus('没有标签差异');
				return;
			}

			// 打开标签同步弹窗
			const modal = new TagSyncModal(
				this.app,
				this.client,
				this.incrementalSync,
				diffs,
				() => {
					// 同步完成后刷新
					this.loadData();
				}
			);
			modal.open();

		} catch (error) {
			this.state.loading = false;
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`对比标签失败: ${errorMsg}`);
			this.renderStatus(`对比标签失败: ${errorMsg}`);
		}
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
}
