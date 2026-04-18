/**
 * 同步管理器
 * 核心同步逻辑
 */

import { Notice, App } from 'obsidian';
import { BangumiClient } from '../api/client';
import { Subject, UserCollection, SubjectType, CollectionType } from '../../../common/api/types';
import { FileManager } from '../../../common/file/fileManager';
import { ImageHandler } from '../../../common/file/imageHandler';
import { IncrementalSync } from './incrementalSync';
import { SyncOptions, SyncResult, SyncState, DEFAULT_SYNC_STATE, SyncProgress } from './syncStatus';
import { parseCharacters, CharacterInfo } from '../parser/characterParser';
import { generateFilePath } from '../../../common/template/pathTemplate';
import { generateContentByType } from '../template/contentTemplate';

/**
 * 同步管理器配置
 */
export interface SyncManagerConfig {
	accessToken: string;
	pathTemplate: string;
	imagePathTemplate: string;
	downloadImages: boolean;
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
	private syncState: SyncState;
	private config: SyncManagerConfig;
	private onProgress?: (progress: SyncProgress) => void;

	constructor(app: App, config: SyncManagerConfig) {
		this.app = app;
		this.config = config;
		this.client = new BangumiClient(config.accessToken);
		this.fileManager = new FileManager(app);
		this.imageHandler = new ImageHandler(app, this.fileManager);
		this.imageHandler.setDownloadEnabled(config.downloadImages);
		this.syncState = { ...DEFAULT_SYNC_STATE };
		this.incrementalSync = new IncrementalSync(this.syncState);
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
			updated: 0,
			skipped: 0,
			errors: 0,
			duration: 0,
		};

		try {
			// 验证 Access Token
			if (!this.config.accessToken) {
				throw new Error('请先配置 Access Token');
			}

			// 获取当前用户信息
			this.reportProgress({ status: 'preparing', message: '验证 Access Token...' });

			const tokenResult = await this.client.validateToken();
			if (!tokenResult.valid) {
				throw new Error(`Access Token 无效: ${tokenResult.error}`);
			}

			// 使用实际用户名（从 Token 验证中获取）
			const username = tokenResult.username;
			if (!username) {
				throw new Error('无法获取用户名，请检查 Access Token');
			}

			console.log(`[Bangumi Sync] 使用用户名: ${username}`);

			// 获取收藏列表
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

			// 应用数量限制
			const limitedCollections = options.limit > 0
				? collections.slice(0, options.limit)
				: collections;

			result.total = limitedCollections.length;

			// 计算差异
			this.reportProgress({ status: 'preparing', message: '计算同步差异...' });

			const diff = this.incrementalSync.computeDiff(limitedCollections, {
				force: options.force,
			});

			// 处理每个条目
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
					console.error(`处理条目失败: ${collection.subject.name_cn}`, error);
					this.incrementalSync.addSyncError(
						collection.subject_id,
						collection.subject.name_cn || collection.subject.name,
						String(error)
					);
					result.errors++;
				}
			}

			result.skipped = diff.toSkip.length;

			// 记录同步状态
			this.incrementalSync.recordSyncState(limitedCollections);

			result.success = true;
			this.reportProgress({ status: 'completed', message: '同步完成' });

		} catch (error) {
			console.error('同步失败:', error);
			this.reportProgress({ status: 'error', message: String(error) });
			new Notice(`同步失败: ${error}`);
		}

		result.duration = Date.now() - startTime;
		return result;
	}

	/**
	 * 处理单个收藏
	 */
	private async processCollection(collection: UserCollection): Promise<void> {
		console.log(`[Bangumi Sync] 处理条目: ${collection.subject.name_cn || collection.subject.name}`);
		console.log(`[Bangumi Sync] 条目ID: ${collection.subject_id}`);

		// 获取完整条目信息
		const { subject, characters: relatedCharacters } = await this.client.getFullSubjectInfo(collection.subject_id);
		console.log(`[Bangumi Sync] 获取到条目信息: ${subject.name_cn}`);

		// 解析角色信息
		const characters = parseCharacters(relatedCharacters, 9);
		console.log(`[Bangumi Sync] 解析到 ${characters.length} 个角色`);

		// 下载封面图片
		let coverUrl = subject.images?.large || subject.images?.common || '';
		if (this.config.downloadImages && coverUrl) {
			console.log(`[Bangumi Sync] 下载封面: ${coverUrl}`);
			const localPath = await this.imageHandler.downloadCover(
				coverUrl,
				subject.id,
				this.config.imagePathTemplate
			);
			// 使用本地路径
			if (localPath && !localPath.startsWith('http')) {
				coverUrl = localPath;
			}
		}

		// 生成文件路径
		const filePath = generateFilePath(this.config.pathTemplate, subject, collection);
		console.log(`[Bangumi Sync] 生成文件路径: ${filePath}`);

		// 生成文件内容
		const content = generateContentByType(
			subject,
			collection,
			characters,
			this.config.customTemplates
		);
		console.log(`[Bangumi Sync] 生成内容长度: ${content.length}`);

		// 创建文件
		console.log(`[Bangumi Sync] 开始创建文件...`);
		await this.fileManager.createOrUpdateFile(filePath, content, {
			overwrite: false,
		});
		console.log(`[Bangumi Sync] 文件创建完成: ${filePath}`);
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
	 * 获取同步状态
	 */
	getSyncState(): SyncState {
		return this.incrementalSync.getSyncState();
	}

	/**
	 * 重置同步状态
	 */
	resetSyncState(): void {
		this.incrementalSync.clearSyncState();
	}
}
