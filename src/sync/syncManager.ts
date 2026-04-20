/**
 * 同步管理器
 * 核心同步逻辑
 *
 * 功能：
 * 1. 使用用户自己的标签
 * 2. 通过扫描本地文件夹检测已同步条目
 * 3. 智能数量限制：如果未同步数量不够，同步所有未同步的
 * 4. 支持预览确认（手动同步）和直接同步（自动同步）
 */

import { Notice, App } from 'obsidian';
import { BangumiClient } from '../api/client';
import { Subject, UserCollection, SubjectType, CollectionType, Episode, UserEpisodeCollection } from '../../common/api/types';
import { FileManager } from '../file/fileManager';
import { ImageHandler } from '../../common/file/imageHandler';
import { IncrementalSync } from './incrementalSync';
import { SyncOptions, SyncResult, SyncProgress } from './syncStatus';
import { parseCharacters, CharacterInfo } from '../../common/parser/characterParser';
import { generateFilePath } from '../../common/template/pathTemplate';
import { generateContentByType } from '../template/contentTemplate';
import { getTypeLabel } from '../../common/template/defaultTemplates';
import { SyncPreviewItem, RatingDetails } from '../ui/syncPreviewModal';

/**
 * 同步管理器配置
 */
export interface SyncManagerConfig {
	accessToken: string;
	pathTemplate: string;
	imagePathTemplate: string;
	downloadImages: boolean;
	scanFolderPath: string;  // 扫描本地文件夹的路径
	customTemplates?: {
		anime?: string;
		novel?: string;
		comic?: string;
		game?: string;
		album?: string;
		music?: string;
		real?: string;
	};
}

/**
 * 同步管理器
 */
export class SyncManager {
	private app: App;
	private client: BangumiClient;
	private fileManager: FileManager;
	private imageHandler: ImageHandler;
	private incrementalSync: IncrementalSync;
	private config: SyncManagerConfig;
	private onProgress?: (progress: SyncProgress) => void;

	constructor(app: App, config: SyncManagerConfig) {
		this.app = app;
		this.config = config;
		this.client = new BangumiClient(config.accessToken);
		this.fileManager = new FileManager(app);
		this.imageHandler = new ImageHandler(app, this.fileManager as any);
		this.imageHandler.setDownloadEnabled(config.downloadImages);
		this.incrementalSync = new IncrementalSync(app);
	}

	/**
	 * 设置进度回调
	 */
	setProgressCallback(callback: (progress: SyncProgress) => void): void {
		this.onProgress = callback;
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
	 * 执行同步
	 */
	async sync(options: SyncOptions): Promise<SyncResult> {
		const startTime = Date.now();
		const result: SyncResult = {
			success: false,
			total: 0,
			added: 0,
			skipped: 0,
			errors: 0,
			duration: 0,
		};

		try {
			// 1. 验证 Access Token
			if (!this.config.accessToken) {
				throw new Error('请先配置 Access Token');
			}

			this.reportProgress({ status: 'preparing', message: '验证 Access Token...' });

			const tokenResult = await this.client.validateToken();
			if (!tokenResult.valid) {
				throw new Error(`Access Token 无效: ${tokenResult.error}`);
			}

			const username = tokenResult.username;
			if (!username) {
				throw new Error('无法获取用户名，请检查 Access Token');
			}

			console.log(`[Bangumi Sync] 用户: ${username}`);

			// 2. 获取远程收藏列表
			this.reportProgress({ status: 'fetching', message: '获取收藏列表...' });

			const collections = await this.client.getAllUserCollections(username, {
				subjectType: options.subjectTypes.length === 1 ? options.subjectTypes[0] : undefined,
				collectionType: options.collectionTypes.length === 1 ? options.collectionTypes[0] : undefined,
				onProgress: (current, total) => {
					this.reportProgress({
						status: 'fetching',
						current,
						total,
						message: `获取收藏列表... (${current}/${total})`,
					});
				},
			});

			console.log(`[Bangumi Sync] 获取到 ${collections.length} 条收藏`);

			// 3. 扫描本地文件夹
			this.reportProgress({ status: 'scanning', message: '扫描本地文件夹...' });

			const scanPath = this.config.scanFolderPath || this.extractBasePath(this.config.pathTemplate);
			console.log(`[Bangumi Sync] 扫描路径: ${scanPath}`);

			await this.incrementalSync.scanLocalFolder(scanPath, (current, total) => {
				this.reportProgress({
					status: 'scanning',
					current,
					total,
					message: `扫描本地文件... (${current}/${total})`,
				});
			});

			// 4. 计算差异
			this.reportProgress({ status: 'preparing', message: '计算同步差异...' });

			// 过滤符合条件的收藏（条目类型和收藏类型）
			const filteredCollections = this.filterCollections(collections, options);
			console.log(`[Bangumi Sync] 符合条件的收藏: ${filteredCollections.length}`);

			const diff = this.incrementalSync.computeDiff(filteredCollections, {
				limit: options.limit,
				force: options.force,
			});

			result.total = diff.toAdd.length;
			result.skipped = diff.toSkip.length;

			console.log(`[Bangumi Sync] 需要同步: ${result.total}，已存在跳过: ${result.skipped}`);

			// 5. 处理每个条目
			for (let i = 0; i < diff.toAdd.length; i++) {
				const collection = diff.toAdd[i];

				this.reportProgress({
					status: 'processing',
					current: i + 1,
					total: diff.toAdd.length,
					currentItem: collection.subject.name_cn || collection.subject.name,
					message: `处理条目... (${i + 1}/${diff.toAdd.length})`,
				});

				try {
					await this.processCollection(collection);
					result.added++;
				} catch (error) {
					console.error(`[Bangumi Sync] 处理条目失败: ${collection.subject.name_cn}`, error);
					result.errors++;
				}
			}

			result.success = true;
			this.reportProgress({ status: 'completed', message: '同步完成' });

		} catch (error) {
			console.error('[Bangumi Sync] 同步失败:', error);
			this.reportProgress({ status: 'error', message: String(error) });
			new Notice(`同步失败: ${error}`);
		}

		result.duration = Date.now() - startTime;
		return result;
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
	 * 处理单个收藏
	 */
	private async processCollection(collection: UserCollection): Promise<void> {
		console.log(`[Bangumi Sync] 处理条目: ${collection.subject.name_cn || collection.subject.name}`);

		// 获取完整条目信息
		const { subject, characters: relatedCharacters } = await this.client.getFullSubjectInfo(collection.subject_id);
		console.log(`[Bangumi Sync] 获取到条目信息: ${subject.name_cn}`);

		// 解析角色信息
		const characters = parseCharacters(relatedCharacters, 9);

		// 获取类型标签（用于图片命名）
		const typeLabel = getTypeLabel(subject.type);

		// 下载封面图片
		let coverUrl = subject.images?.large || subject.images?.common || '';
		if (this.config.downloadImages && coverUrl) {
			console.log(`[Bangumi Sync] 下载封面: ${coverUrl}`);
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
			if (localPath && !localPath.startsWith('http')) {
				coverUrl = localPath;
			}
		}

		// V4: 获取章节信息
		const episodeData = await this.fetchEpisodeData(subject);

		// 生成文件路径
		const filePath = generateFilePath(this.config.pathTemplate, subject, collection);
		console.log(`[Bangumi Sync] 生成文件路径: ${filePath}`);

		// 生成文件内容（使用 V3 版本，包含用户自己的标签）
		const content = generateContentByType(
			subject,
			collection,
			characters,
			this.config.customTemplates,
			undefined,  // ratingDetails
			episodeData?.episodes,
			episodeData?.userStatus
		);

		// 创建文件
		await this.fileManager.createOrUpdateFile(filePath, content, {
			overwrite: false,
		});
		console.log(`[Bangumi Sync] 文件创建完成: ${filePath}`);
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
		if (subject.type !== 2 && subject.type !== 1) {
			return null;
		}

		try {
			console.log(`[Bangumi Sync] 获取章节信息: ${subject.name_cn}`);

			// 获取章节列表
			const episodesData = await this.client.getEpisodes(subject.id);
			const episodes = episodesData.data;

			if (!episodes || episodes.length === 0) {
				console.log(`[Bangumi Sync] 无章节信息`);
				return null;
			}

			// 获取用户章节状态
			let userStatus: UserEpisodeCollection[] = [];
			try {
				userStatus = await this.client.getUserEpisodeStatus(subject.id);
			} catch (error) {
				console.log(`[Bangumi Sync] 获取用户章节状态失败，可能未收藏此条目`);
			}

			return { episodes, userStatus };
		} catch (error) {
			console.error(`[Bangumi Sync] 获取章节信息失败:`, error);
			return null;
		}
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
		options?: { overwrite?: boolean },
		onProgress?: (current: number, total: number, message: string) => void
	): Promise<SyncResult> {
		const startTime = Date.now();
		const result: SyncResult = {
			success: false,
			total: collections.length,
			added: 0,
			skipped: 0,
			errors: 0,
			duration: 0,
		};

		const overwrite = options?.overwrite ?? false;

		try {
			console.log(`[Bangumi Sync] 开始按收藏列表同步 ${collections.length} 个条目，覆盖模式: ${overwrite}`);

			for (let i = 0; i < collections.length; i++) {
				const collection = collections[i];

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
					// 获取条目完整信息
					const { subject, characters: relatedCharacters } = await this.client.getFullSubjectInfo(collection.subject_id);

					// 解析角色信息
					const characters = parseCharacters(relatedCharacters, 9);

					// 获取类型标签
					const typeLabel = getTypeLabel(subject.type);

					// 下载封面图片
					let coverUrl = subject.images?.large || subject.images?.common || '';
					if (this.config.downloadImages && coverUrl) {
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
						if (localPath && !localPath.startsWith('http')) {
							coverUrl = localPath;
						}
					}

					// 生成文件路径
					const filePath = generateFilePath(this.config.pathTemplate, subject, collection);

					// V4: 获取章节信息
					const episodeData = await this.fetchEpisodeData(subject);

					// 生成文件内容（使用原始 collection 对象，保留用户数据）
					const content = generateContentByType(
						subject,
						collection,
						characters,
						this.config.customTemplates,
						undefined,  // ratingDetails
						episodeData?.episodes,
						episodeData?.userStatus
					);

					// 创建文件
					await this.fileManager.createOrUpdateFile(filePath, content, {
						overwrite: overwrite,
					});

					result.added++;
					console.log(`[Bangumi Sync] 同步完成: ${subject.name_cn || subject.name}`);

				} catch (error) {
					console.error(`[Bangumi Sync] 同步条目失败 (ID: ${collection.subject_id}):`, error);
					result.errors++;
				}
			}

			result.success = true;
			this.reportProgress({ status: 'completed', message: '同步完成' });

		} catch (error) {
			console.error('[Bangumi Sync] 按收藏列表同步失败:', error);
			this.reportProgress({ status: 'error', message: String(error) });
		}

		result.duration = Date.now() - startTime;
		return result;
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
			// 1. 验证 Access Token
			if (!this.config.accessToken) {
				throw new Error('请先配置 Access Token');
			}

			this.reportProgress({ status: 'preparing', message: '验证 Access Token...' });

			const tokenResult = await this.client.validateToken();
			if (!tokenResult.valid) {
				throw new Error(`Access Token 无效: ${tokenResult.error}`);
			}

			const username = tokenResult.username;
			if (!username) {
				throw new Error('无法获取用户名，请检查 Access Token');
			}

			console.log(`[Bangumi Sync] 用户: ${username}`);

			// 2. 获取远程收藏列表
			this.reportProgress({ status: 'fetching', message: '获取收藏列表...' });

			const collections = await this.client.getAllUserCollections(username, {
				subjectType: options.subjectTypes.length === 1 ? options.subjectTypes[0] : undefined,
				collectionType: options.collectionTypes.length === 1 ? options.collectionTypes[0] : undefined,
				onProgress: (current, total) => {
					this.reportProgress({
						status: 'fetching',
						current,
						total,
						message: `获取收藏列表... (${current}/${total})`,
					});
				},
			});

			console.log(`[Bangumi Sync] 获取到 ${collections.length} 条收藏`);

			// 3. 扫描本地文件夹
			this.reportProgress({ status: 'scanning', message: '扫描本地文件夹...' });

			const scanPath = this.config.scanFolderPath || this.extractBasePath(this.config.pathTemplate);
			console.log(`[Bangumi Sync] 扫描路径: ${scanPath}`);

			await this.incrementalSync.scanLocalFolder(scanPath, (current, total) => {
				this.reportProgress({
					status: 'scanning',
					current,
					total,
					message: `扫描本地文件... (${current}/${total})`,
				});
			});

			// 4. 计算差异
			this.reportProgress({ status: 'preparing', message: '计算同步差异...' });

			// 过滤符合条件的收藏（条目类型和收藏类型）
			const filteredCollections = this.filterCollections(collections, options);
			console.log(`[Bangumi Sync] 符合条件的收藏: ${filteredCollections.length}`);

			const diff = this.incrementalSync.computeDiff(filteredCollections, {
				limit: options.limit,
				force: options.force,
			});

			console.log(`[Bangumi Sync] 需要同步: ${diff.toAdd.length}，已存在跳过: ${diff.toSkip.length}`);

			// 5. 创建预览数据
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
				ratingDetails: {},
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
		action: 'all' | 'selected' | 'unselected'
	): Promise<SyncResult> {
		const startTime = Date.now();
		const result: SyncResult = {
			success: false,
			total: 0,
			added: 0,
			skipped: 0,
			errors: 0,
			duration: 0,
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
			console.log(`[Bangumi Sync] 开始同步 ${itemsToSync.length} 个条目`);

			// 处理每个条目
			for (let i = 0; i < itemsToSync.length; i++) {
				const item = itemsToSync[i];

				this.reportProgress({
					status: 'processing',
					current: i + 1,
					total: itemsToSync.length,
					currentItem: item.name_cn || item.name,
					message: `处理条目... (${i + 1}/${itemsToSync.length})`,
				});

				try {
					await this.processCollectionWithRatingDetails(item.collection, item.ratingDetails);
					result.added++;
				} catch (error) {
					console.error(`[Bangumi Sync] 处理条目失败: ${item.name_cn}`, error);
					result.errors++;
				}
			}

			result.success = true;
			this.reportProgress({ status: 'completed', message: '同步完成' });

		} catch (error) {
			console.error('[Bangumi Sync] 执行同步失败:', error);
			this.reportProgress({ status: 'error', message: String(error) });
			new Notice(`同步失败: ${error}`);
		}

		result.duration = Date.now() - startTime;
		return result;
	}

	/**
	 * 处理单个收藏（带评分明细）
	 */
	private async processCollectionWithRatingDetails(
		collection: UserCollection,
		ratingDetails: RatingDetails
	): Promise<void> {
		console.log(`[Bangumi Sync] 处理条目: ${collection.subject.name_cn || collection.subject.name}`);

		// 获取完整条目信息
		const { subject, characters: relatedCharacters } = await this.client.getFullSubjectInfo(collection.subject_id);
		console.log(`[Bangumi Sync] 获取到条目信息: ${subject.name_cn}`);

		// 解析角色信息
		const characters = parseCharacters(relatedCharacters, 9);

		// 获取类型标签（用于图片命名）
		const typeLabel = getTypeLabel(subject.type);

		// 下载封面图片
		let coverUrl = subject.images?.large || subject.images?.common || '';
		if (this.config.downloadImages && coverUrl) {
			console.log(`[Bangumi Sync] 下载封面: ${coverUrl}`);
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
			if (localPath && !localPath.startsWith('http')) {
				coverUrl = localPath;
			}
		}

		// 生成文件路径
		const filePath = generateFilePath(this.config.pathTemplate, subject, collection);
		console.log(`[Bangumi Sync] 生成文件路径: ${filePath}`);

		// V4: 获取章节信息
		const episodeData = await this.fetchEpisodeData(subject);

		// 生成文件内容（使用 V3 版本，包含用户自己的标签和评分明细）
		const content = generateContentByType(
			subject,
			collection,
			characters,
			this.config.customTemplates,
			ratingDetails,
			episodeData?.episodes,
			episodeData?.userStatus
		);

		// 创建文件
		await this.fileManager.createOrUpdateFile(filePath, content, {
			overwrite: false,
		});
		console.log(`[Bangumi Sync] 文件创建完成: ${filePath}`);
	}
}
