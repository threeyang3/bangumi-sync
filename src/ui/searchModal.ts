/**
 * 搜索弹窗
 * 搜索 Bangumi 条目并添加到收藏
 */

import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { Subject, SubjectType, PagedResult, UserCollection, getCollectionStatusLabel } from '../../common/api/types';
import { BangumiClient } from '../api/client';
import { BangumiPluginSettings } from '../settings/settings';
import { SyncManager } from '../sync/syncManager';
import { AddToCollectionModal, AddToCollectionInput } from './addToCollectionModal';
import { getLocale, tn, tnFormat } from '../i18n';
import { getTypeLabel } from '../../common/template/defaultTemplates';
import { generatePreferredFilePath } from '../../common/template/pathTemplate';
import { classifySubject, migrateTemplateSettings, resolveTemplateRule } from '../../common/template/templateSystem';

/**
 * 条目类型选项
 */
const SUBJECT_TYPE_OPTIONS: { value: SubjectType | 0; labelKey: 'all' | 'anime' | 'game' | 'book' | 'music' | 'real' }[] = [
	{ value: 0, labelKey: 'all' },
	{ value: SubjectType.Anime, labelKey: 'anime' },
	{ value: SubjectType.Game, labelKey: 'game' },
	{ value: SubjectType.Book, labelKey: 'book' },
	{ value: SubjectType.Music, labelKey: 'music' },
	{ value: SubjectType.Real, labelKey: 'real' },
];

/**
 * 排序选项
 */
const SORT_OPTIONS: { value: 'match' | 'heat' | 'rank' | 'score'; labelKey: 'sort_match' | 'sort_heat' | 'sort_rank' | 'sort_score' }[] = [
	{ value: 'match', labelKey: 'sort_match' },
	{ value: 'heat', labelKey: 'sort_heat' },
	{ value: 'rank', labelKey: 'sort_rank' },
	{ value: 'score', labelKey: 'sort_score' },
];

const SEARCH_SHORT_LABELS = getLocale() === 'zh-CN'
	? {
		search: '搜索',
		clear: '清空',
		add: '添加',
		edit: '编辑',
	}
	: {
		search: 'Search',
		clear: 'Clear',
		add: 'Add',
		edit: 'Edit',
	};

/**
 * 搜索弹窗
 */
export class SearchModal extends Modal {
	private client: BangumiClient;
	private settings: BangumiPluginSettings;
	private syncManager: SyncManager;
	private onComplete: () => void;

	// 搜索状态
	private currentKeyword: string = '';
	private currentType: SubjectType | 0 = 0;
	private currentSort: 'match' | 'heat' | 'rank' | 'score' = 'match';
	private totalResults: number = 0;
	private searchResults: Subject[] = [];
	private isLoading: boolean = false;
	private nextOffset = 0;
	private paginationEnded = false;
	private requestGeneration = 0;
	private resolvedStatusIds = new Set<number>();
	private failedStatusIds = new Set<number>();
	private resultElements = new Map<number, HTMLElement>();

	// 状态缓存
	private syncedSubjectIds: Set<number> = new Set();
	private collectionStatuses: Map<number, UserCollection> = new Map();

	// UI 元素
	private resultsContainer!: HTMLElement;
	private statusEl!: HTMLElement;
	private loadMoreBtn!: HTMLButtonElement;

	constructor(
		app: App,
		client: BangumiClient,
		settings: BangumiPluginSettings,
		syncManager: SyncManager,
		onComplete: () => void
	) {
		super(app);
		this.client = client;
		this.settings = settings;
		this.syncManager = syncManager;
		this.onComplete = onComplete;
	}

	onOpen(): void {
		this.modalEl.addClass('bangumi-modal');
		const { contentEl } = this;
		contentEl.addClass('bangumi-search-modal');

		new Setting(contentEl).setName(tn('searchModal', 'title')).setHeading();

		// 搜索输入
		const searchDiv = contentEl.createDiv({ cls: 'bangumi-search-input-container' });
		const inputEl = searchDiv.createEl('input', {
			type: 'text',
			placeholder: tn('searchModal', 'searchPlaceholder'),
			cls: 'bangumi-search-input',
		});

		const searchBtn = searchDiv.createEl('button', {
			text: tn('searchModal', 'search'),
			cls: 'bangumi-search-btn',
		});
		this.decorateMobileButton(searchBtn, SEARCH_SHORT_LABELS.search, tn('searchModal', 'search'));

		const clearBtn = searchDiv.createEl('button', {
			text: tn('searchModal', 'clear'),
			cls: 'bangumi-search-btn',
		});
		this.decorateMobileButton(clearBtn, SEARCH_SHORT_LABELS.clear, tn('searchModal', 'clear'));

		// 选择器容器
		const selectorsDiv = searchDiv.createDiv({ cls: 'bangumi-search-selectors-container' });

		// 类型选择
		const typeSelect = selectorsDiv.createEl('select', { cls: 'bangumi-search-select' });
		SUBJECT_TYPE_OPTIONS.forEach(opt => {
			typeSelect.createEl('option', {
				value: String(opt.value),
				text: tn('subjectTypes', opt.labelKey),
			});
		});

		// 排序选择
		const sortSelect = selectorsDiv.createEl('select', { cls: 'bangumi-search-select' });
		SORT_OPTIONS.forEach(opt => {
			sortSelect.createEl('option', {
				value: opt.value,
				text: tn('searchModal', opt.labelKey),
			});
		});

		// 状态显示
		this.statusEl = contentEl.createDiv({ cls: 'bangumi-search-status' });

		// 结果容器
		this.resultsContainer = contentEl.createDiv({ cls: 'bangumi-search-results' });

		// 加载更多按钮
		this.loadMoreBtn = contentEl.createEl('button', {
			text: tn('searchModal', 'loadMore'),
			cls: 'bangumi-search-load-more',
		});
		this.loadMoreBtn.addEventListener('click', () => {
			void this.loadMore();
		});

		// 事件绑定
		const performSearch = () => {
			const keyword = inputEl.value.trim();
			if (keyword) {
				this.currentKeyword = keyword;
				this.currentType = Number(typeSelect.value);
				this.currentSort = sortSelect.value as 'match' | 'heat' | 'rank' | 'score';
				void this.search(true);
			}
		};

		searchBtn.addEventListener('click', performSearch);
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				performSearch();
			}
		});

		clearBtn.addEventListener('click', () => {
			this.requestGeneration++;
			this.isLoading = false;
			inputEl.value = '';
			this.currentKeyword = '';
			this.clearResultState();
			this.totalResults = 0;
			this.resultsContainer.empty();
			this.statusEl.setText('');
			this.loadMoreBtn.removeClass('visible');
		});

		typeSelect.addEventListener('change', () => {
			void this.changeSearchOptions(Number(typeSelect.value), this.currentSort);
		});

		sortSelect.addEventListener('change', () => {
			void this.changeSearchOptions(this.currentType, sortSelect.value as 'match' | 'heat' | 'rank' | 'score');
		});
	}

	private async changeSearchOptions(type: SubjectType | 0, sort: 'match' | 'heat' | 'rank' | 'score'): Promise<void> {
		if (type === this.currentType && sort === this.currentSort) return;
		this.currentType = type;
		this.currentSort = sort;
		if (this.currentKeyword) await this.search(true);
	}

	/**
	 * 执行搜索
	 */
	private async search(isNew: boolean): Promise<void> {
		if (!isNew && (this.isLoading || this.paginationEnded)) return;
		const generation = isNew ? ++this.requestGeneration : this.requestGeneration;

		if (isNew) {
			this.loadMoreBtn.removeClass('visible');
			this.resultsContainer.empty();
			this.clearResultState();
		}

		this.isLoading = true;
		this.statusEl.setText(tn('searchModal', 'searching'));

		try {
			const options: {
				sort?: 'match' | 'heat' | 'rank' | 'score';
				filter?: { type?: SubjectType[] };
				limit: number;
				offset: number;
			} = {
				sort: this.currentSort,
				limit: 20,
				offset: this.nextOffset,
			};

			if (this.currentType !== 0) {
				options.filter = { type: [this.currentType] };
			}

			const result: PagedResult<Subject> = await this.client.searchSubjects(
				this.currentKeyword,
				options
			);

			if (generation !== this.requestGeneration) return;
			this.totalResults = result.total;
			const acceptedIds = new Set(this.searchResults.map(subject => subject.id));
			const newSubjects = result.data.filter(subject => {
				if (acceptedIds.has(subject.id)) return false;
				acceptedIds.add(subject.id);
				return true;
			});
			this.nextOffset += result.data.length;
			this.paginationEnded = newSubjects.length === 0 || this.nextOffset >= result.total;
			this.searchResults.push(...newSubjects);

			// 检查同步状态和收藏状态
			for (const subject of newSubjects) {
				if (this.checkLocalSyncStatus(subject)) this.syncedSubjectIds.add(subject.id);
			}

			// 更新状态
			this.statusEl.setText(
				tnFormat('searchModal', 'resultsCount', { count: String(this.searchResults.length), total: String(this.totalResults) })
			);
			if (newSubjects.length === 0 && this.nextOffset < result.total) {
				this.statusEl.setText(tn('searchModal', 'noProgress'));
			}

			// 渲染新结果
			newSubjects.forEach(subject => {
				this.renderResultItem(subject);
			});
			void this.checkStatuses(newSubjects, generation);

			// 显示/隐藏加载更多按钮
			if (!this.paginationEnded) {
				this.loadMoreBtn.addClass('visible');
			} else {
				this.loadMoreBtn.removeClass('visible');
			}

		} catch (error: unknown) {
			if (generation !== this.requestGeneration) return;
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.statusEl.setText(`${tn('searchModal', 'searchFailed')}: ${errorMsg}`);
		} finally {
			if (generation === this.requestGeneration) this.isLoading = false;
		}
	}

	/**
	 * 检查条目的同步状态和收藏状态
	 */
	private async checkStatuses(subjects: Subject[], generation: number): Promise<void> {
		// 检查云端收藏状态（批量检查，每个条目单独请求）
		for (const subject of subjects) {
			if (generation !== this.requestGeneration) return;
			try {
				const collection = await this.client.getCollectionStatus(subject.id);
				if (generation !== this.requestGeneration) return;
				this.resolvedStatusIds.add(subject.id);
				this.failedStatusIds.delete(subject.id);
				if (collection) {
					this.collectionStatuses.set(subject.id, collection);
				}
			} catch {
				if (generation !== this.requestGeneration) return;
				this.failedStatusIds.add(subject.id);
			}
			this.renderResultItem(subject);
		}
	}

	/**
	 * 检查条目是否已同步到本地
	 */
	private checkLocalSyncStatus(subject: Subject): string | null {
		try {
			const template = resolveTemplateRule(migrateTemplateSettings(this.settings), classifySubject(subject).nodeId).pathTemplate;
			const filePath = generatePreferredFilePath(
				template,
				subject,
				this.settings.pathNamingStrategy
			);

			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				return filePath;
			}
		} catch {
			// 忽略错误
		}
		return null;
	}

	/**
	 * 加载更多
	 */
	private async loadMore(): Promise<void> {
		await this.search(false);
	}

	/**
	 * 渲染单个搜索结果
	 */
	private renderResultItem(subject: Subject): void {
		let itemEl = this.resultElements.get(subject.id);
		if (!itemEl) {
			itemEl = this.resultsContainer.createDiv({ cls: 'bangumi-search-result-item' });
			this.resultElements.set(subject.id, itemEl);
			this.renderResultContent(itemEl, subject);
		}
		const resolved = this.resolvedStatusIds.has(subject.id);
		const failed = this.failedStatusIds.has(subject.id);
		const metaRowEl = itemEl.querySelector<HTMLElement>('.bangumi-search-result-meta-row')!;
		metaRowEl.empty();

		// 类型、评分和收藏状态
		const metaEl = metaRowEl.createDiv({ cls: 'bangumi-search-result-meta' });
		const typeLabel = getTypeLabel(subject.type);
		metaEl.createSpan({ text: typeLabel, cls: 'bangumi-search-result-type' });

		if (subject.rating?.score) {
			metaEl.createSpan({ text: `★${subject.rating.score.toFixed(1)}`, cls: 'bangumi-search-result-rating' });
		}

		// 本地同步状态
		const isSynced = this.syncedSubjectIds.has(subject.id);
		if (isSynced) {
			metaEl.createSpan({ text: tn('searchModal', 'synced'), cls: 'bangumi-status-badge bangumi-status-synced' });
		}

		// 云端收藏状态
		const collection = this.collectionStatuses.get(subject.id);
		if (collection) {
			const collectionTypeLabel = getCollectionStatusLabel(collection.type, subject.type);
			metaEl.createSpan({ text: collectionTypeLabel, cls: 'bangumi-status-badge bangumi-status-collected' });
		} else if (resolved) {
			metaEl.createSpan({ text: tn('searchModal', 'notCollected'), cls: 'bangumi-status-badge bangumi-status-not-collected' });
		}

		// 添加按钮
		const addBtn = metaRowEl.createEl('button', {
			text: collection ? tn('searchModal', 'editCollection') : tn('searchModal', 'addToCollection'),
			cls: `bangumi-search-result-add-btn ${collection ? 'is-editing' : 'is-adding'}`,
		});
		this.decorateMobileButton(
			addBtn,
			collection ? SEARCH_SHORT_LABELS.edit : SEARCH_SHORT_LABELS.add,
			collection ? tn('searchModal', 'editCollection') : tn('searchModal', 'addToCollection')
		);
		if (!resolved) {
			const label = failed ? tn('controlPanel', 'refresh') : tn('searchModal', 'searching');
			addBtn.setText(label);
			this.decorateMobileButton(addBtn, label, label);
			addBtn.disabled = !failed;
		}

		addBtn.addEventListener('click', () => {
			if (!resolved) {
				addBtn.disabled = true;
				void this.checkStatuses([subject], this.requestGeneration);
				return;
			}
			this.openAddModal(subject, collection);
		});
	}

	/** Create static content once; status updates must not recreate covers. */
	private renderResultContent(itemEl: HTMLElement, subject: Subject): void {
		const imgContainer = itemEl.createDiv({ cls: 'bangumi-search-result-cover' });
		if (subject.images?.medium) {
			imgContainer.createEl('img', {
				attr: { src: subject.images.medium, alt: subject.name_cn || subject.name },
			});
		}
		const infoEl = itemEl.createDiv({ cls: 'bangumi-search-result-info' });
		const nameEl = infoEl.createDiv({ cls: 'bangumi-search-result-name' });
		nameEl.createSpan({ text: subject.name_cn || subject.name, cls: 'bangumi-search-result-name-cn' });
		if (subject.name && subject.name_cn && subject.name !== subject.name_cn) {
			nameEl.createSpan({ text: ` (${subject.name})`, cls: 'bangumi-search-result-name-original' });
		}
		infoEl.createDiv({ cls: 'bangumi-search-result-meta-row' });
	}

	/**
	 * 打开添加收藏弹窗
	 */
	private openAddModal(subject: Subject, existingCollection?: UserCollection | null): void {
		const modal = new AddToCollectionModal(
			this.app,
			this.client,
			this.settings,
			this.syncManager,
			subject,
			(input: AddToCollectionInput) => {
				void this.handleAddComplete(input);
			},
			existingCollection
		);
		modal.open();
	}

	/**
	 * 处理添加完成
	 */
	private async handleAddComplete(input: AddToCollectionInput): Promise<void> {
		new Notice(tnFormat('searchModal', 'addedSuccess', { name: input.subjectName }));
		const subject = this.searchResults.find(subject => subject.id === input.subjectId);
		if (subject && this.contentEl.isConnected) {
			if (this.checkLocalSyncStatus(subject)) this.syncedSubjectIds.add(subject.id);
			if (input.syncToCloud) {
				// A successful write invalidates the old edit snapshot. Do not allow
				// another edit until the saved server state is known.
				this.collectionStatuses.delete(subject.id);
				this.resolvedStatusIds.delete(subject.id);
				this.failedStatusIds.delete(subject.id);
				this.renderResultItem(subject);
				await this.checkStatuses([subject], this.requestGeneration);
			} else {
				this.renderResultItem(subject);
			}
		}
		this.onComplete();
	}

	private clearResultState(): void {
		this.nextOffset = 0;
		this.paginationEnded = false;
		this.resultElements.clear();
		this.searchResults = [];
		this.collectionStatuses.clear();
		this.syncedSubjectIds.clear();
		this.resolvedStatusIds.clear();
		this.failedStatusIds.clear();
	}

	onClose(): void {
		this.requestGeneration++;
		this.clearResultState();
		const { contentEl } = this;
		contentEl.empty();
	}

	private decorateMobileButton(button: HTMLButtonElement, shortLabel: string, fullLabel: string): void {
		button.dataset.mobileLabel = shortLabel;
		button.setAttribute('aria-label', fullLabel);
		button.setAttribute('title', fullLabel);
	}
}
