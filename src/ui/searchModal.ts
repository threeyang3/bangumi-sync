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
import { generateFilePath, extractPathVars } from '../../common/template/pathTemplate';

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
	private currentOffset: number = 0;
	private totalResults: number = 0;
	private searchResults: Subject[] = [];
	private isLoading: boolean = false;

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
			inputEl.value = '';
			this.currentKeyword = '';
			this.searchResults = [];
			this.totalResults = 0;
			this.resultsContainer.empty();
			this.statusEl.setText('');
			this.loadMoreBtn.removeClass('visible');
		});

		typeSelect.addEventListener('change', () => {
			this.currentType = Number(typeSelect.value);
		});

		sortSelect.addEventListener('change', () => {
			this.currentSort = sortSelect.value as 'match' | 'heat' | 'rank' | 'score';
		});
	}

	/**
	 * 执行搜索
	 */
	private async search(isNew: boolean): Promise<void> {
		if (this.isLoading) return;

		if (isNew) {
			this.currentOffset = 0;
			this.searchResults = [];
			this.resultsContainer.empty();
			this.syncedSubjectIds.clear();
			this.collectionStatuses.clear();
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
				offset: this.currentOffset,
			};

			if (this.currentType !== 0) {
				options.filter = { type: [this.currentType] };
			}

			const result: PagedResult<Subject> = await this.client.searchSubjects(
				this.currentKeyword,
				options
			);

			this.totalResults = result.total;
			this.searchResults.push(...result.data);

			// 检查同步状态和收藏状态
			await this.checkStatuses(result.data);

			// 更新状态
			this.statusEl.setText(
				tnFormat('searchModal', 'resultsCount', { count: String(this.searchResults.length), total: String(this.totalResults) })
			);

			// 渲染新结果
			result.data.forEach(subject => {
				this.renderResultItem(subject);
			});

			// 显示/隐藏加载更多按钮
			if (this.searchResults.length < this.totalResults) {
				this.loadMoreBtn.addClass('visible');
			} else {
				this.loadMoreBtn.removeClass('visible');
			}

		} catch (error: unknown) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.statusEl.setText(`${tn('searchModal', 'searchFailed')}: ${errorMsg}`);
		} finally {
			this.isLoading = false;
		}
	}

	/**
	 * 检查条目的同步状态和收藏状态
	 */
	private async checkStatuses(subjects: Subject[]): Promise<void> {
		// 检查本地同步状态
		for (const subject of subjects) {
			const localPath = this.checkLocalSyncStatus(subject);
			if (localPath) {
				this.syncedSubjectIds.add(subject.id);
			}
		}

		// 检查云端收藏状态（批量检查，每个条目单独请求）
		for (const subject of subjects) {
			try {
				const collection = await this.client.getCollectionStatus(subject.id);
				if (collection) {
					this.collectionStatuses.set(subject.id, collection);
				}
			} catch {
				// 忽略错误，继续检查下一个
			}
		}
	}

	/**
	 * 检查条目是否已同步到本地
	 */
	private checkLocalSyncStatus(subject: Subject): string | null {
		try {
			const typeLabel = extractPathVars(subject).type;
			const template = this.settings.pathTemplateByType?.[typeLabel] || this.settings.syncPathTemplate;
			const filePath = generateFilePath(
				template,
				subject
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
		this.currentOffset += 20;
		await this.search(false);
	}

	/**
	 * 渲染单个搜索结果
	 */
	private renderResultItem(subject: Subject): void {
		const itemEl = this.resultsContainer.createDiv({ cls: 'bangumi-search-result-item' });

		// 封面图片
		const imgContainer = itemEl.createDiv({ cls: 'bangumi-search-result-cover' });
		if (subject.images?.medium) {
			imgContainer.createEl('img', {
				attr: {
					src: subject.images.medium,
					alt: subject.name_cn || subject.name,
				},
			});
		}

		// 信息区域
		const infoEl = itemEl.createDiv({ cls: 'bangumi-search-result-info' });

		// 名称
		const nameEl = infoEl.createDiv({ cls: 'bangumi-search-result-name' });
		nameEl.createSpan({ text: subject.name_cn || subject.name, cls: 'bangumi-search-result-name-cn' });
		if (subject.name && subject.name_cn && subject.name !== subject.name_cn) {
			nameEl.createSpan({ text: ` (${subject.name})`, cls: 'bangumi-search-result-name-original' });
		}

		const metaRowEl = infoEl.createDiv({ cls: 'bangumi-search-result-meta-row' });

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
		} else {
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

		addBtn.addEventListener('click', () => {
			this.openAddModal(subject, collection);
		});
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
	private handleAddComplete(input: AddToCollectionInput): void {
		new Notice(tnFormat('searchModal', 'addedSuccess', { name: input.subjectName }));
		this.onComplete();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private decorateMobileButton(button: HTMLButtonElement, shortLabel: string, fullLabel: string): void {
		button.dataset.mobileLabel = shortLabel;
		button.setAttribute('aria-label', fullLabel);
		button.setAttribute('title', fullLabel);
	}
}
