/**
 * 同步管理器
 * 核心同步逻辑
 *
 * 功能：
 * 1. 使用用户自己的标签
 * 2. 通过扫描本地文件夹检测已同步条目
 * 3. 智能数量限制：如果未同步数量不够，同步所有未同步的
 * 4. 支持预览确认（手动同步）和直接同步（自动同步）
 * 5. 支持相关条目双向链接
 */

import { Notice, App, TFile } from 'obsidian';
import { BangumiClient } from '../api/client';
import { Subject, UserCollection, Episode, UserEpisodeCollection, SubjectType } from '../../common/api/types';
import { FileManager } from '../../common/file/fileManager';
import { ImageHandler } from '../../common/file/imageHandler';
import { IncrementalSync } from './incrementalSync';
import { SyncOptions, SyncResult, SyncProgress, SyncCancellationSignal, SyncResultWithRollback } from './syncStatus';
import { parseCharacters } from '../../common/parser/characterParser';
import { generateFilePath } from '../../common/template/pathTemplate';
import { applyNamedPropertyValuesToContent, CustomTemplates, generateContentByType } from '../template/contentTemplate';
import { getTypeLabel } from '../../common/template/defaultTemplates';
import { SyncPreviewItem } from '../ui/syncPreviewModal';
import { CoverLinkType } from '../settings/settings';
import { UserDataExtractor, UserDataMerger, DataProtectionSettings, DEFAULT_DATA_PROTECTION_SETTINGS } from '../userData';
import { LocalPropertyModalResult, LocalPropertyValueMap } from '../ui/localPropertyModal';
import { buildExtraTemplateVarsFromPropertyValues, getTemplatePropertyGroupsForSubject } from '../template/templateProperties';
import { tn, tnFormat } from '../i18n/translations';

/**
 * 同步管理器配置
 */
export interface SyncManagerConfig {
	accessToken: string;
	pathTemplate: string;
	imagePathTemplate: string;
	notePathTemplate?: string;  // 笔记链接路径模板
	downloadImages: boolean;
	scanFolderPath: string;  // 扫描本地文件夹的路径
	coverLinkType?: CoverLinkType;  // 封面链接类型
	enableRelatedLinks?: boolean;  // 是否自动处理关联条目链接
	customTemplates?: {
		anime?: string;
		novel?: string;
		comic?: string;
		game?: string;
		album?: string;
		music?: string;
		real?: string;
	};
	dataProtection?: DataProtectionSettings;  // 数据保护设置
}

/**
 * 同步管理器
 */
export class SyncManager {
	private app: App;
	public client: BangumiClient;
	private fileManager: FileManager;
	private imageHandler: ImageHandler;
	private incrementalSync: IncrementalSync;
	private userDataExtractor: UserDataExtractor;
	private userDataMerger: UserDataMerger;
	private config: SyncManagerConfig;
	private onProgress?: (progress: SyncProgress) => void;
	private cancellationSignal: SyncCancellationSignal | null = null;

	constructor(app: App, config: SyncManagerConfig) {
		this.app = app;
		this.config = config;
		this.client = new BangumiClient(config.accessToken);
		this.fileManager = new FileManager(app);
		this.imageHandler = new ImageHandler(app, this.fileManager);
		this.imageHandler.setDownloadEnabled(config.downloadImages);
		this.incrementalSync = new IncrementalSync(app);
		this.userDataExtractor = new UserDataExtractor(app);
		this.userDataMerger = new UserDataMerger(app);
	}

	/**
	 * 设置进度回调
	 */
	setProgressCallback(callback: (progress: SyncProgress) => void): void {
		this.onProgress = callback;
	}

	/**
	 * 设置取消信号
	 */
	setCancellationSignal(signal: SyncCancellationSignal | null): void {
		this.cancellationSignal = signal;
	}

	/**
	 * 回滚本次批次新建的文件
	 */
	async rollbackBatch(): Promise<{ deleted: number; failed: number }> {
		return this.incrementalSync.rollbackBatch();
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<SyncManagerConfig>): void {
		this.config = { ...this.config, ...config };
		this.client.setAccessToken(config.accessToken || '');
		this.imageHandler.setDownloadEnabled(config.downloadImages ?? true);
	}

	/**
	 * 检查取消/暂停信号
	 * @returns true 如果已取消
	 */
	private async checkCancellation(): Promise<boolean> {
		if (this.cancellationSignal?.cancelled) {
			return true;
		}
		while (this.cancellationSignal?.paused) {
			await new Promise(resolve => activeWindow.setTimeout(resolve, 200));
		}
		return this.cancellationSignal?.cancelled ?? false;
	}

	/**
	 * 创建带回滚能力的同步结果
	 */
	private createSyncResultWithRollback(base: SyncResult, wasCancelled: boolean): SyncResultWithRollback {
		return {
			...base,
			batchFiles: this.incrementalSync.getBatchSyncedFiles(),
			wasCancelled,
		};
	}

	/**
	 * 执行同步
	 * 优化：支持并发处理多个条目，提高同步速度
	 */
	async sync(options: SyncOptions, concurrency: number = 3): Promise<SyncResultWithRollback> {
		const startTime = Date.now();
		let wasCancelled = false;
		const result: SyncResult = {
			success: false,
			total: 0,
			added: 0,
			skipped: 0,
			errors: 0,
			duration: 0,
			errorDetails: [],
		};

		try {
			const { diff } = await this.prepareSyncData(options);

			result.total = diff.toAdd.length;
			result.skipped = diff.toSkip.length;

			// 开始批次同步
			this.incrementalSync.startBatch();

			let completedCount = 0;

			// 使用并发控制处理条目
			await this.processConcurrently(
				diff.toAdd,
				concurrency,
				async (collection, index) => {
					if (wasCancelled) return;

					if (await this.checkCancellation()) {
						wasCancelled = true;
						return;
					}

					this.reportProgress({
						status: 'processing',
						current: index + 1,
						total: diff.toAdd.length,
						currentItem: collection.subject.name_cn || collection.subject.name,
						message: `处理条目... (${index + 1}/${diff.toAdd.length})`,
					});

					try {
						await this.processCollection(collection, { overwrite: false, preserveUserDataOnOverwrite: false });
						completedCount++;
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : String(error);
						const name = collection.subject.name_cn || collection.subject.name || String(collection.subject_id);
						console.error(`[Bangumi Sync] 处理条目失败: ${name}`, error);
						result.errorDetails.push(`${name}: ${errorMsg}`);
					}
				}
			);

			result.added = completedCount;
			result.errors = result.errorDetails.length;

			if (!wasCancelled) {
				result.success = true;
				this.reportProgress({ status: 'completed', message: tn('notices', 'syncComplete') });
			} else {
				this.reportProgress({ status: 'error', message: tn('notices', 'syncCancelled') });
			}

		} catch (error: unknown) {
			console.error('[Bangumi Sync] 同步失败:', error);
			this.reportProgress({ status: 'error', message: error instanceof Error ? error.message : String(error) });
			new Notice(`${tn('notices', 'syncFailed')}: ${error instanceof Error ? error.message : String(error)}`);
		}

		result.duration = Date.now() - startTime;
		return this.createSyncResultWithRollback(result, wasCancelled);
	}

	/**
	 * 并发处理数组中的元素
	 * @param items 要处理的数组
	 * @param concurrency 并发数
	 * @param processor 处理函数
	 */
	private async processConcurrently<T>(
		items: T[],
		concurrency: number,
		processor: (item: T, index: number) => Promise<void>
	): Promise<void> {
		const queue = [...items.map((item, index) => ({ item, index }))];
		const workers: Promise<void>[] = [];

		// 创建工作线程
		for (let i = 0; i < Math.min(concurrency, items.length); i++) {
			workers.push(this.processQueue(queue, processor));
		}

		// 等待所有工作线程完成
		await Promise.all(workers);
	}

	/**
	 * 处理队列中的任务
	 */
	private async processQueue<T>(
		queue: { item: T; index: number }[],
		processor: (item: T, index: number) => Promise<void>
	): Promise<void> {
		while (queue.length > 0) {
			const task = queue.shift();
			if (!task) break;

			await processor(task.item, task.index);
		}
	}

	/**
	 * 准备同步数据：验证 Token、获取收藏、扫描本地、计算差异
	 * sync() 和 prepareSync() 的共享逻辑
	 */
	private async prepareSyncData(options: SyncOptions): Promise<{
		username: string;
		collections: UserCollection[];
		diff: { toAdd: UserCollection[]; toSkip: UserCollection[] };
	}> {
		// 1. 验证 Access Token
		if (!this.config.accessToken) {
			throw new Error(tn('notices', 'configureTokenFirst'));
		}

		this.reportProgress({ status: 'preparing', message: tn('syncModal', 'validatingToken') });

		const tokenResult = await this.client.validateToken();
		if (!tokenResult.valid) {
			throw new Error(tnFormat('notices', 'tokenInvalid', { error: tokenResult.error || '' }));
		}

		const username = tokenResult.username;
		if (!username) {
			throw new Error(tn('notices', 'usernameNotFound'));
		}

		console.debug(`[Bangumi Sync] 用户: ${username}`);

		// 2. 获取远程收藏列表
		this.reportProgress({ status: 'fetching', message: tn('syncModal', 'fetchingCollections') });

		const collections = await this.client.getAllUserCollections(username, {
			subjectType: options.subjectTypes.length === 1 ? options.subjectTypes[0] : undefined,
			collectionType: options.collectionTypes.length === 1 ? options.collectionTypes[0] : undefined,
			onProgress: (current, total) => {
				this.reportProgress({
					status: 'fetching',
					current,
					total,
					message: `${tn('syncModal', 'fetchingCollections')} (${current}/${total})`,
				});
			},
		});

		console.debug(`[Bangumi Sync] 获取到 ${collections.length} 条收藏`);

		// 3. 扫描本地文件夹
		this.reportProgress({ status: 'scanning', message: tn('syncModal', 'scanningLocal') });

		const scanPath = this.config.scanFolderPath || this.extractBasePath(this.config.pathTemplate);
		console.debug(`[Bangumi Sync] 扫描路径: ${scanPath}`);

		await this.incrementalSync.scanLocalFolder(scanPath, (current, total) => {
			this.reportProgress({
				status: 'scanning',
				current,
				total,
				message: `${tn('syncModal', 'scanningLocal')} (${current}/${total})`,
			});
		});

		// 4. 计算差异
		this.reportProgress({ status: 'preparing', message: tn('syncModal', 'computingDiff') });

		const filteredCollections = this.filterCollections(collections, options);
		console.debug(`[Bangumi Sync] 符合条件的收藏: ${filteredCollections.length}`);

		const diff = this.incrementalSync.computeDiff(filteredCollections, {
			limit: options.limit,
			force: options.force,
		});

		console.debug(`[Bangumi Sync] 需要同步: ${diff.toAdd.length}，已存在跳过: ${diff.toSkip.length}`);

		return { username, collections, diff };
	}

	/**
	 * 过滤符合条件的收藏
	 */
	private filterCollections(
		collections: UserCollection[],
		options: SyncOptions
	): UserCollection[] {
		return collections.filter(c => {
			// 检查条目类型
			if (options.subjectTypes.length > 0 && !options.subjectTypes.includes(c.subject_type)) {
				return false;
			}
			// 检查收藏类型
			if (options.collectionTypes.length > 0 && !options.collectionTypes.includes(c.type)) {
				return false;
			}
			return true;
		});
	}

	/**
	 * 从路径模板提取基础路径
	 * 例如: "ACGN/{{type}}/{{name_cn}}.md" -> "ACGN"
	 */
	private extractBasePath(pathTemplate: string): string {
		const match = pathTemplate.match(/^([^/{}]+)/);
		return match ? match[1] : '';
	}

	/**
	 * V4: 获取章节数据
	 * 仅对动画、小说、漫画类型获取
	 */
	private async fetchEpisodeData(subject: Subject): Promise<{
		episodes: Episode[];
		userStatus: UserEpisodeCollection[];
	} | null> {
		// 判断是否需要获取章节
		// 动画（type=2）始终获取
		// 书籍（type=1）需要检查 category 是否为小说或漫画
		if (subject.type !== SubjectType.Anime && subject.type !== SubjectType.Book) {
			return null;
		}

		try {
			console.debug(`[Bangumi Sync] 获取章节信息: ${subject.name_cn}`);

			// 获取章节列表
			const episodesData = await this.client.getEpisodes(subject.id);
			const episodes = episodesData.data;

			if (!episodes || episodes.length === 0) {
				console.debug(`[Bangumi Sync] 无章节信息`);
				return null;
			}

			// 获取用户章节状态
			let userStatus: UserEpisodeCollection[] = [];
			try {
				userStatus = await this.client.getUserEpisodeStatus(subject.id);
			} catch {
				console.debug(`[Bangumi Sync] 获取用户章节状态失败，可能未收藏此条目`);
			}

			return { episodes, userStatus };
		} catch (error) {
			console.error(`[Bangumi Sync] 获取章节信息失败:`, error);
			return null;
		}
	}

	/**
	 * 从文件路径提取显示名称（不含扩展名）
	 * 例如: "ACGN/anime/金牌得主(动画).md" -> "金牌得主(动画)"
	 */
	private extractDisplayNameFromPath(path: string): string {
		const fileName = path.split('/').pop() || path;
		return fileName.replace(/\.md$/, '');
	}

	getCustomTemplates(): CustomTemplates | undefined {
		return this.config.customTemplates;
	}

	/**
	 * 下载并解析本地封面路径
	 */
	private async resolveLocalCoverPath(subject: Subject, typeLabel: string): Promise<string> {
		const coverUrl = subject.images?.large || subject.images?.common || '';
		if (!this.config.downloadImages || !coverUrl) {
			return '';
		}

		console.debug(`[Bangumi Sync] 下载封面: ${coverUrl}`);
		const localPath = await this.imageHandler.downloadCover(
			coverUrl,
			subject.id,
			this.config.imagePathTemplate,
			{
				name_cn: subject.name_cn,
				name: subject.name,
				typeLabel,
			}
		);

		return localPath && !localPath.startsWith('http') ? localPath : '';
	}

	/**
	 * 生成相关条目链接
	 * 返回已同步条目的链接（包括本批次已同步的）
	 * 显示名称使用文件名（带类型后缀）
	 */
	private generateRelatedLinks(relations: { id: number; name_cn: string; name: string }[]): string[] {
		console.debug(`[Bangumi Sync] 处理 ${relations?.length || 0} 个相关条目`);
		if (!relations || relations.length === 0) {
			console.debug(`[Bangumi Sync] 无相关条目数据`);
			return [];
		}
		const links: string[] = [];
		for (const relation of relations) {
			console.debug(`[Bangumi Sync] 检查相关条目: ${relation.name_cn || relation.name} (ID: ${relation.id})`);
			const localPath = this.resolveRelatedLocalPath(relation.id);
			console.debug(`[Bangumi Sync] 本地路径: ${localPath || '未同步'}`);
			if (localPath) {
				// 使用文件名作为显示名称（带类型后缀）
				const displayName = this.extractDisplayNameFromPath(localPath);
				const link = `[[${localPath}|${displayName}]]`;
				links.push(link);
				console.debug(`[Bangumi Sync] 相关条目已同步: ${relation.name_cn} -> ${link}`);
			}
		}
		console.debug(`[Bangumi Sync] 生成了 ${links.length} 个相关链接`);
		return links;
	}

	private resolveRelatedLocalPath(subjectId: number): string | undefined {
		const indexedPath = this.incrementalSync.getLocalPath(subjectId);
		if (indexedPath) {
			return indexedPath;
		}

		// 使用优化的 metadataCache 查找方法
		const scanRoot = this.config.scanFolderPath || '';
		return this.incrementalSync.resolvePathByMetadataCache(subjectId, scanRoot);
	}

	/**
	 * 报告进度
	 */
	private reportProgress(progress: Partial<SyncProgress>): void {
		if (this.onProgress) {
			this.onProgress({
				current: 0,
				total: 0,
				status: 'preparing',
				...progress,
			});
		}
	}

	/**
	 * 按 UserCollection 列表同步条目
	 * 用于控制面板选中同步功能，保留用户数据（评分、状态、短评等）
	 */
	async syncByCollections(
		collections: UserCollection[],
		options?: {
			overwrite?: boolean;
			localPropertyValuesBySubjectId?: Map<number, LocalPropertyValueMap>;
			concurrency?: number;
		},
		onProgress?: (current: number, total: number, message: string) => void
	): Promise<SyncResultWithRollback> {
		const startTime = Date.now();
		let wasCancelled = false;
		const result: SyncResult = {
			success: false,
			total: collections.length,
			added: 0,
			skipped: 0,
			errors: 0,
			duration: 0,
			errorDetails: [],
		};

		const overwrite = options?.overwrite ?? false;
		const localPropertyValuesBySubjectId = options?.localPropertyValuesBySubjectId;
		const concurrency = options?.concurrency ?? 3;

		try {
			console.debug(`[Bangumi Sync] 开始按收藏列表同步 ${collections.length} 个条目，覆盖模式: ${overwrite}，并发数: ${concurrency}`);

			// 开始批次同步
			this.incrementalSync.startBatch();

			// 使用并发控制处理条目
			await this.processConcurrently(
				collections,
				concurrency,
				async (collection, i) => {
					if (await this.checkCancellation()) {
						wasCancelled = true;
						return;
					}

					if (onProgress) {
						onProgress(i + 1, collections.length, `正在同步条目 ${i + 1}/${collections.length}`);
					}

					this.reportProgress({
						status: 'processing',
						current: i + 1,
						total: collections.length,
						message: `同步条目... (${i + 1}/${collections.length})`,
					});

					try {
						await this.processCollection(collection, {
							overwrite,
							preserveUserDataOnOverwrite: true,
							localPropertyValues: localPropertyValuesBySubjectId?.get(collection.subject_id),
						});
						result.added++;
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : String(error);
						const name = collection.subject.name_cn || collection.subject.name || String(collection.subject_id);
						console.error(`[Bangumi Sync] 同步条目失败 (ID: ${collection.subject_id}):`, error);
						result.errorDetails.push(`${name}: ${errorMsg}`);
					}
				}
			);

			result.errors = result.errorDetails.length;

			if (!wasCancelled) {
				result.success = true;
				this.reportProgress({ status: 'completed', message: tn('notices', 'syncComplete') });
			} else {
				this.reportProgress({ status: 'error', message: tn('notices', 'syncCancelled') });
			}

		} catch (error) {
			console.error('[Bangumi Sync] 按收藏列表同步失败:', error);
			this.reportProgress({ status: 'error', message: String(error) });
		}

		result.duration = Date.now() - startTime;
		return this.createSyncResultWithRollback(result, wasCancelled);
	}

	/**
	 * 重置同步状态
	 */
	resetSyncState(): void {
		this.incrementalSync.clear();
	}

	/**
	 * 准备同步：获取数据并计算差异，返回预览数据
	 * 用于手动同步模式，在显示预览弹窗前调用
	 */
	async prepareSync(options: SyncOptions): Promise<{
		success: boolean;
		previewItems?: SyncPreviewItem[];
		skipped: number;
		error?: string;
	}> {
		try {
			const { diff } = await this.prepareSyncData(options);

			// 创建预览数据
			const previewItems: SyncPreviewItem[] = diff.toAdd.map(collection => ({
				id: collection.subject_id,
				name_cn: collection.subject.name_cn || '',
				name: collection.subject.name || '',
				type: collection.subject_type,
				typeLabel: getTypeLabel(collection.subject_type),
				rating: collection.subject.score || 0,
				my_rate: collection.rate,
				collection,
				selected: true,
			}));

			return {
				success: true,
				previewItems,
				skipped: diff.toSkip.length,
			};

		} catch (error) {
			console.error('[Bangumi Sync] 准备同步失败:', error);
			this.reportProgress({ status: 'error', message: String(error) });
			return {
				success: false,
				skipped: 0,
				error: String(error),
			};
		}
	}

	/**
	 * 执行同步：根据预览数据执行实际导入
	 * 用于手动同步模式，在用户确认后调用
	 */
	async executeSync(
		previewItems: SyncPreviewItem[],
		action: 'all' | 'selected' | 'unselected',
		localPropertyResult?: LocalPropertyModalResult,
		concurrency: number = 3
	): Promise<SyncResultWithRollback> {
		const startTime = Date.now();
		let wasCancelled = false;
		const result: SyncResult = {
			success: false,
			total: 0,
			added: 0,
			skipped: 0,
			errors: 0,
			duration: 0,
			errorDetails: [],
		};

		try {
			// 根据用户选择过滤条目
			let itemsToSync: SyncPreviewItem[];
			if (action === 'all') {
				itemsToSync = previewItems;
			} else if (action === 'selected') {
				itemsToSync = previewItems.filter(item => item.selected);
			} else {
				itemsToSync = previewItems.filter(item => !item.selected);
			}

			result.total = itemsToSync.length;
			console.debug(`[Bangumi Sync] 开始同步 ${itemsToSync.length} 个条目，并发数: ${concurrency}`);

			// 开始批次同步
			this.incrementalSync.startBatch();

			// 使用并发控制处理条目
			await this.processConcurrently(
				itemsToSync,
				concurrency,
				async (item, i) => {
					if (await this.checkCancellation()) {
						wasCancelled = true;
						return;
					}

					this.reportProgress({
						status: 'processing',
						current: i + 1,
						total: itemsToSync.length,
						currentItem: item.name_cn || item.name,
						message: `处理条目... (${i + 1}/${itemsToSync.length})`,
					});

					try {
						await this.processCollection(item.collection, {
							overwrite: false,
							preserveUserDataOnOverwrite: false,
							localPropertyValues: localPropertyResult?.propertyValuesBySubjectId?.get(item.collection.subject_id),
						});
						result.added++;
					} catch (error) {
						const errorMsg = error instanceof Error ? error.message : String(error);
						const name = item.name_cn || item.name || String(item.id);
						console.error(`[Bangumi Sync] 处理条目失败: ${name}`, error);
						result.errorDetails.push(`${name}: ${errorMsg}`);
					}
				}
			);

			result.errors = result.errorDetails.length;

			if (!wasCancelled) {
				result.success = true;
				this.reportProgress({ status: 'completed', message: tn('notices', 'syncComplete') });
			} else {
				this.reportProgress({ status: 'error', message: tn('notices', 'syncCancelled') });
			}

		} catch (error: unknown) {
			console.error('[Bangumi Sync] 执行同步失败:', error);
			this.reportProgress({ status: 'error', message: error instanceof Error ? error.message : String(error) });
			new Notice(`${tn('notices', 'syncFailed')}: ${error instanceof Error ? error.message : String(error)}`);
		}

		result.duration = Date.now() - startTime;
		return this.createSyncResultWithRollback(result, wasCancelled);
	}

	/**
	 * 处理单个收藏条目
	 * 统一处理：获取详情、生成内容、写入文件、更新双向链接
	 */
	private async processCollection(
		collection: UserCollection,
		options: { overwrite: boolean; localPropertyValues?: LocalPropertyValueMap; preserveUserDataOnOverwrite: boolean }
	): Promise<void> {
		console.debug(`[Bangumi Sync] 处理条目: ${collection.subject.name_cn || collection.subject.name}`);

		// 获取完整条目信息
		const { subject, characters: relatedCharacters, relations, persons } = await this.client.getFullSubjectInfo(collection.subject_id);
		console.debug(`[Bangumi Sync] 获取到条目信息: ${subject.name_cn}`);

		// 解析角色信息
		const characters = parseCharacters(relatedCharacters, 9);

		// 获取类型标签
		const typeLabel = getTypeLabel(subject.type);

		// 下载封面图片
		const localCoverPath = await this.resolveLocalCoverPath(subject, typeLabel);

		// 生成文件路径
		const filePath = generateFilePath(this.config.pathTemplate, subject, collection);

		// 获取章节信息
		const episodeData = await this.fetchEpisodeData(subject);

		// 构建额外模板变量（当有自定义属性或需要覆盖时才解析）
		let extraTemplateVars: Record<string, string> | undefined;
		if (options.localPropertyValues || options.overwrite) {
			const templateProperties = getTemplatePropertyGroupsForSubject(subject, this.config.customTemplates).customProperties;
			extraTemplateVars = buildExtraTemplateVarsFromPropertyValues(templateProperties, options.localPropertyValues);
		}

		// 生成相关条目链接
		const relatedLinks = this.config.enableRelatedLinks !== false
			? this.generateRelatedLinks(relations)
			: [];

		// 生成文件内容
		let content = generateContentByType(
			subject,
			collection,
			characters,
			this.config.customTemplates,
			undefined,
			episodeData?.episodes,
			episodeData?.userStatus,
			this.config.notePathTemplate,
			this.config.coverLinkType,
			localCoverPath,
			relatedLinks,
			extraTemplateVars,
			persons
		);

		// 应用自定义属性值
		const explicitLocalPropertyValues = options.localPropertyValues && Object.keys(options.localPropertyValues).length > 0
			? options.localPropertyValues
			: undefined;
		if (explicitLocalPropertyValues) {
			content = applyNamedPropertyValuesToContent(content, explicitLocalPropertyValues);
		}

		// 强制同步时保护用户数据
		if (options.overwrite && options.preserveUserDataOnOverwrite) {
			const existingFile = this.fileManager.getFile(filePath);
			if (existingFile) {
				const localUserData = await this.userDataExtractor.extractFromFileAsync(existingFile);
				if (localUserData) {
					const dataProtection = this.config.dataProtection || DEFAULT_DATA_PROTECTION_SETTINGS;
					content = this.userDataMerger.mergeUserData(existingFile, content, localUserData, dataProtection);
					console.debug(`[Bangumi Sync] 已保护用户数据: ${localUserData.identifier.name_cn}`);
				}
			}
			if (explicitLocalPropertyValues) {
				content = applyNamedPropertyValuesToContent(content, explicitLocalPropertyValues);
			}
		}

		// 判断文件是否已存在（用于回滚跟踪）
		const fileExisted = this.fileManager.getFile(filePath) !== null;

		// 创建文件
		await this.fileManager.createOrUpdateFile(filePath, content, { overwrite: options.overwrite });
		console.debug(`[Bangumi Sync] 文件创建完成: ${filePath}`);

		// 添加到批次已同步列表
		this.incrementalSync.addBatchSyncedItem(subject.id, filePath, subject.name_cn || subject.name, !fileExisted);

		// 更新已同步相关条目的链接（双向链接）
		if (this.config.enableRelatedLinks !== false && relations && relations.length > 0) {
			await this.updateRelatedItemsBidirectional(subject.id, filePath, subject.name_cn || subject.name, relations);
		}
	}

	/**
	 * 更新已同步相关条目的链接（双向链接）
	 * 批量处理：先收集所有需要更新的关联关系，按目标文件分组，每个文件只读写一次
	 */
	private async updateRelatedItemsBidirectional(
		currentId: number,
		currentPath: string,
		currentName: string,
		relations: { id: number; name_cn: string; name: string }[]
	): Promise<void> {
		const displayName = this.extractDisplayNameFromPath(currentPath);
		const currentLink = `[[${currentPath}|${displayName}]]`;

		// 收集需要更新的文件及其新增链接
		const updatesByFile = new Map<string, string[]>();

		for (const relation of relations) {
			const relatedPath = this.resolveRelatedLocalPath(relation.id);
			if (relatedPath) {
				const existing = updatesByFile.get(relatedPath) || [];
				existing.push(currentLink);
				updatesByFile.set(relatedPath, existing);
			}
		}

		// 批量更新每个目标文件
		for (const [path, links] of updatesByFile) {
			try {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					const content = await this.app.vault.read(file);
					const updatedContent = this.incrementalSync.updateRelated(content, links);
					if (updatedContent !== content) {
						await this.app.vault.process(file, () => updatedContent);
						console.debug(`[Bangumi Sync] 已更新 ${path} 的相关链接 (${links.length} 条)`);
					}
				}
			} catch (error) {
				console.error(`[Bangumi Sync] 更新相关条目链接失败: ${path}`, error);
			}
		}
	}

	/**
	 * 同步单个条目（用于搜索功能）
	 * @param subjectId 条目 ID
	 * @param input 用户输入的收藏信息
	 * @returns 是否成功
	 */
	async syncSingleSubject(
		subjectId: number,
		input: {
			type: number;
			rate: number;
			comment: string;
			tags: string[];
			private: boolean;
			localPropertyValues?: LocalPropertyValueMap;
			syncToCloud: boolean;
			createLocal: boolean;
		}
	): Promise<{ success: boolean; filePath?: string; error?: string }> {
		try {
			// 1. 同步到云端
			if (input.syncToCloud) {
				await this.client.createOrUpdateCollection(subjectId, {
					type: input.type,
					rate: input.rate,
					comment: input.comment,
					tags: input.tags,
					private: input.private,
				});
				console.debug(`[Bangumi Sync] 已同步到云端: ${subjectId}`);
			}

			// 2. 创建本地文件
			if (input.createLocal) {
				// 获取完整条目信息
				const { subject, characters: relatedCharacters, relations, persons } = await this.client.getFullSubjectInfo(subjectId);

				// 解析角色信息
				const characters = parseCharacters(relatedCharacters, 9);

				// 获取类型标签
				const typeLabel = getTypeLabel(subject.type);

				// 下载封面图片
				const localCoverPath = await this.resolveLocalCoverPath(subject, typeLabel);

				// 创建临时 collection 对象
				const collection: UserCollection = {
					subject_id: subject.id,
					subject_type: subject.type,
					type: input.type,
					rate: input.rate,
					comment: input.comment,
					tags: input.tags,
					private: input.private,
					ep_status: 0,
					vol_status: 0,
					updated_at: new Date().toISOString(),
					subject: {
						id: subject.id,
						type: subject.type,
						name: subject.name,
						name_cn: subject.name_cn,
						short_summary: subject.summary?.substring(0, 100) || '',
						date: subject.date,
						images: subject.images,
						volumes: subject.volumes,
						eps: subject.eps,
						collection_total: subject.collection?.collect || 0,
						score: subject.rating?.score || 0,
						rank: subject.rating?.rank || 0,
						tags: subject.tags,
					},
				};

				// 生成文件路径
				const filePath = generateFilePath(this.config.pathTemplate, subject, collection);

				// V4: 获取章节信息
				const episodeData = await this.fetchEpisodeData(subject);
				const templateProperties = getTemplatePropertyGroupsForSubject(subject, this.config.customTemplates).customProperties;
				const extraTemplateVars = buildExtraTemplateVarsFromPropertyValues(templateProperties, input.localPropertyValues);

				// 生成相关条目链接
				const relatedLinks = this.config.enableRelatedLinks !== false
					? this.generateRelatedLinks(relations)
					: [];

				// 生成文件内容
				const content = generateContentByType(
					subject,
					collection,
					characters,
					this.config.customTemplates,
					undefined,
					episodeData?.episodes,
					episodeData?.userStatus,
					this.config.notePathTemplate,
					this.config.coverLinkType,
					localCoverPath,
					relatedLinks,
					extraTemplateVars,
					persons
				);

				const finalContent = input.localPropertyValues && Object.keys(input.localPropertyValues).length > 0
					? applyNamedPropertyValuesToContent(content, input.localPropertyValues)
					: content;

				// 创建文件
				await this.fileManager.createOrUpdateFile(filePath, finalContent, { overwrite: false });
				console.debug(`[Bangumi Sync] 文件创建完成: ${filePath}`);

				return { success: true, filePath };
			}

			return { success: true };

		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`[Bangumi Sync] 同步单个条目失败:`, error);
			return { success: false, error: errorMsg };
		}
	}

	/**
	 * 批量下载封面图片并替换链接
	 * 扫描所有本地条目，将网络封面下载到本地，并替换 frontmatter 和正文中的链接
	 */
	async batchDownloadCovers(): Promise<{ downloaded: number; skipped: number; failed: number }> {
		const scanPath = this.config.scanFolderPath || this.extractBasePath(this.config.pathTemplate);
		await this.incrementalSync.scanLocalFolder(scanPath);

		const localSubjects = this.incrementalSync.getLocalSubjects();
		const result = { downloaded: 0, skipped: 0, failed: 0 };
		let processed = 0;

		for (const [subjectId, info] of localSubjects) {
			processed++;
			this.reportProgress({
				status: 'processing',
				current: processed,
				total: localSubjects.size,
				currentItem: info.name_cn || String(subjectId),
			});

			try {
				const file = this.app.vault.getAbstractFileByPath(info.path);
				if (!(file instanceof TFile)) {
					result.skipped++;
					continue;
				}

				const content = await this.app.vault.read(file);
				const coverValue = this.extractCoverValue(content);

				if (!coverValue || !coverValue.startsWith('http')) {
					result.skipped++;
					continue;
				}

				// 提取模板变量
				const name_cn = this.extractFrontmatterString(content, '中文名') || info.name_cn;
				const name = this.extractFrontmatterString(content, '原名') || '';
				const typeLabel = this.extractFrontmatterString(content, '作品大类') || '';

				// 下载封面图片
				const localPath = await this.imageHandler.downloadCover(
					coverValue, subjectId, this.config.imagePathTemplate,
					{ name_cn, name, typeLabel }
				);

				if (!localPath || localPath.startsWith('http')) {
					result.failed++;
					continue;
				}

				// 更新文件内容
				let updatedContent = this.replaceCoverInFrontmatter(content, localPath);
				updatedContent = this.replaceCoverInBody(updatedContent, localPath);

				await this.app.vault.process(file, () => updatedContent);
				result.downloaded++;
				console.debug(`[Bangumi Sync] 封面下载完成: ${info.name_cn} -> ${localPath}`);
			} catch (error) {
				console.error(`[Bangumi Sync] 封面下载失败: ${info.name_cn}`, error);
				result.failed++;
			}
		}

		this.reportProgress({
			status: 'completed',
			message: tnFormat('notices', 'coverDownloadComplete', {
				downloaded: result.downloaded,
				skipped: result.skipped,
				failed: result.failed,
			}),
		});

		return result;
	}

	/**
	 * 从 frontmatter 提取封面值
	 */
	private extractCoverValue(content: string): string {
		const match = content.match(/^---\n[\s\S]*?\n封面:\s*"?([^"\n]+)"?/);
		return match ? match[1].trim() : '';
	}

	/**
	 * 从 frontmatter 提取字符串值
	 */
	private extractFrontmatterString(content: string, key: string): string {
		const regex = new RegExp(`^---\\n[\\s\\S]*?\\n${key}:\\s*"?([^"\\n]+)"?`);
		const match = content.match(regex);
		return match ? match[1].trim() : '';
	}

	/**
	 * 替换 frontmatter 中的封面值
	 */
	private replaceCoverInFrontmatter(content: string, localPath: string): string {
		const coverRegex = /^(---\n[\s\S]*?\n封面:\s*)"?[^"\n]+"?/m;
		return content.replace(coverRegex, `$1"${localPath}"`);
	}

	/**
	 * 替换正文中的封面图片链接
	 */
	private replaceCoverInBody(content: string, localPath: string): string {
		const imgRegex = /!\[cover\|[^\]]*\]\(https?:\/\/[^)]+\)/g;
		return content.replace(imgRegex, `![cover|400](${localPath})`);
	}
}
