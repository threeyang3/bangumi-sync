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
import { Subject, UserCollection, Episode, UserEpisodeCollection, SubjectType, RelatedSubject } from '../../common/api/types';
import { FileManager, FileWriteStatus } from '../../common/file/fileManager';
import { ImageHandler } from '../../common/file/imageHandler';
import { IncrementalSync } from './incrementalSync';
import { determineSyncCompletion, SyncOptions, SyncResult, SyncProgress, SyncCancellationSignal, SyncResultWithRollback } from './syncStatus';
import { parseCharacters } from '../../common/parser/characterParser';
import { generateFilePath, extractPathVars } from '../../common/template/pathTemplate';
import { applyNamedPropertyValuesToContent, CustomTemplates, generateContentByType } from '../template/contentTemplate';
import { getTypeLabel } from '../../common/template/defaultTemplates';
import { SyncPreviewItem } from '../ui/syncPreviewModal';
import { CoverLinkType, PathNamingStrategy } from '../settings/settings';
import { UserDataExtractor, UserDataMerger, DataProtectionSettings, DEFAULT_DATA_PROTECTION_SETTINGS } from '../userData';
import { LocalPropertyModalResult, LocalPropertyValueMap } from '../ui/localPropertyModal';
import { buildExtraTemplateVarsFromPropertyValues, getTemplatePropertyGroupsForSubject } from '../template/templateProperties';
import { tn, tnFormat } from '../i18n/translations';
import { SubjectPathAllocation, SubjectPathResolver } from './subjectPathResolver';
import { SyncTransaction } from './syncTransaction';
import { SubjectPathState } from './localSubjectRegistry';
import {
	formatDiagnosticReport,
	LocalSubjectDiagnosticReport,
	PathDiagnosticIssue,
	PathMigrationPreview,
} from './pathDiagnostics';
import { normalizePathCollisionKey } from '../../common/file/pathUtils';

type FullSubjectInfo = Awaited<ReturnType<BangumiClient['getFullSubjectInfo']>>;

interface PreparedCollection {
	collection: UserCollection;
	fullInfo: FullSubjectInfo;
	allocation: SubjectPathAllocation;
}

interface PreparationFailure {
	collection: UserCollection;
	error: string;
}

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
	pathTemplateByType?: Record<string, string>;  // 各类型独立路径模板
	customTemplates?: Record<string, string | undefined>;  // 按 category 键索引的模板
	dataProtection?: DataProtectionSettings;  // 数据保护设置
	subjectPathStates?: Record<string, SubjectPathState>;
	onPathStatesChanged?: (states: Record<string, SubjectPathState>) => Promise<void>;
	pathNamingStrategy?: PathNamingStrategy;
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
	private pathResolver = new SubjectPathResolver();
	private activeTransaction: SyncTransaction | null = null;

	constructor(app: App, config: SyncManagerConfig) {
		this.app = app;
		this.config = config;
		this.client = new BangumiClient(config.accessToken);
		this.fileManager = new FileManager(app);
		this.imageHandler = new ImageHandler(app, this.fileManager);
		this.imageHandler.setDownloadEnabled(config.downloadImages);
		this.incrementalSync = new IncrementalSync(app);
		this.incrementalSync.setPathStates(config.subjectPathStates ?? {});
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
	async rollbackBatch(): Promise<{ deleted: number; restored?: number; failed: number }> {
		if (this.activeTransaction) {
			const result = await this.activeTransaction.rollback();
			await this.incrementalSync.scanLocalFolder(this.config.scanFolderPath || 'ACGN');
			await this.persistPathStates();
			this.activeTransaction = null;
			return result;
		}
		return this.incrementalSync.rollbackBatch();
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<SyncManagerConfig>): void {
		this.config = { ...this.config, ...config };
		this.client.setAccessToken(config.accessToken || '');
		this.imageHandler.setDownloadEnabled(config.downloadImages ?? true);
		if (config.subjectPathStates) {
			this.incrementalSync.setPathStates(config.subjectPathStates);
		}
	}

	private async persistPathStates(): Promise<void> {
		const states = this.incrementalSync.exportPathStates();
		this.config.subjectPathStates = states;
		await this.config.onPathStatesChanged?.(states);
	}

	async diagnoseLocalSubjects(): Promise<LocalSubjectDiagnosticReport> {
		const scanRoot = this.config.scanFolderPath || 'ACGN';
		await this.incrementalSync.scanLocalFolder(scanRoot);
		const registry = this.incrementalSync.getRegistry();
		const issues: PathDiagnosticIssue[] = registry.invalidFiles.map(problem => ({ ...problem }));
		const preferredGroups = new Map<string, Array<{ subjectId: number; path: string }>>();

		await this.processConcurrently(Array.from(registry.idToRecord.values()), 3, async record => {
			if (record.namingState !== 'managed') {
				issues.push({
					severity: 'needs-user-decision',
					code: record.namingState === 'user-renamed' ? 'user-renamed' : 'unknown-path-state',
					message: record.namingState === 'user-renamed'
						? 'The current filename is user-managed and will not be renamed automatically.'
						: 'No previous managed-path state exists; automatic rename is disabled.',
					subjectId: record.subjectId,
					path: record.path,
				});
			}
			try {
				const subject = await this.client.getSubject(record.subjectId);
				const preferredPath = this.generatePreferredPath(subject);
				const key = normalizePathCollisionKey(preferredPath);
				const group = preferredGroups.get(key) ?? [];
				group.push({ subjectId: record.subjectId, path: preferredPath });
				preferredGroups.set(key, group);
			} catch (error) {
				issues.push({
					severity: 'needs-user-decision',
					code: 'subject-lookup-failed',
					message: error instanceof Error ? error.message : String(error),
					subjectId: record.subjectId,
					path: record.path,
				});
			}
		});

		for (const group of preferredGroups.values()) {
			if (group.length < 2) continue;
			issues.push({
				severity: 'needs-user-decision',
				code: 'template-path-collision',
				message: `The current template maps ${group.length} subjects to the same normalized path.`,
				subjectId: group[0].subjectId,
				path: group[0].path,
				relatedPaths: group.map(item => `${item.subjectId}: ${item.path}`),
			});
		}

		return {
			generatedAt: new Date().toISOString(),
			scanRoot,
			validSubjects: registry.idToRecord.size,
			issues,
		};
	}

	async exportDiagnosticReport(report?: LocalSubjectDiagnosticReport): Promise<string> {
		const actualReport = report ?? await this.diagnoseLocalSubjects();
		const stamp = actualReport.generatedAt.replace(/[:.]/g, '-');
		const path = `Bangumi Sync/Diagnostics/diagnostic-${stamp}.md`;
		await this.fileManager.ensureDirectory(path);
		await this.app.vault.create(path, formatDiagnosticReport(actualReport));
		return path;
	}

	async previewPathMigration(options: { includeUnknown?: boolean; includeUserRenamed?: boolean } = {}): Promise<PathMigrationPreview> {
		await this.incrementalSync.scanLocalFolder(this.config.scanFolderPath || 'ACGN');
		const registry = this.incrementalSync.getRegistry();
		const selected = Array.from(registry.idToRecord.values()).filter(record =>
			record.namingState === 'managed'
			|| (record.namingState === 'unknown' && options.includeUnknown)
			|| (record.namingState === 'user-renamed' && options.includeUserRenamed)
		);
		const selectedIds = new Set(selected.map(record => record.subjectId));
		const occupied = new Map(registry.pathToId);
		for (const record of selected) occupied.delete(normalizePathCollisionKey(record.path));
		const details = new Map<number, Subject>();
		const failures = new Map<number, string>();
		await this.processConcurrently(selected, 3, async record => {
			try {
				details.set(record.subjectId, await this.client.getSubject(record.subjectId));
			} catch (error) {
				failures.set(record.subjectId, error instanceof Error ? error.message : String(error));
			}
		});
		const candidates = selected.flatMap(record => {
			const subject = details.get(record.subjectId);
			if (!subject) return [];
			return [{
				subjectId: record.subjectId,
				preferredPath: this.generatePreferredPath(subject),
				year: extractPathVars(subject).year,
				namingState: 'managed' as const,
			}];
		});
		const plan = this.pathResolver.plan(candidates, occupied);
		const entries = Array.from(registry.idToRecord.values()).map(record => {
			if (!selectedIds.has(record.subjectId)) {
				return {
					subjectId: record.subjectId,
					name: record.nameCn,
					from: record.path,
					to: record.path,
					namingState: record.namingState,
					status: 'protected' as const,
					reason: 'User-renamed or unknown paths require explicit inclusion.',
				};
			}
			const error = failures.get(record.subjectId);
			if (error) {
				return { subjectId: record.subjectId, name: record.nameCn, from: record.path, to: record.path, namingState: record.namingState, status: 'failed' as const, reason: error };
			}
			const allocation = plan.allocations.get(record.subjectId);
			const to = allocation?.finalPath ?? record.path;
			return {
				subjectId: record.subjectId,
				name: record.nameCn,
				from: record.path,
				to,
				namingState: record.namingState,
				status: normalizePathCollisionKey(record.path) === normalizePathCollisionKey(to) ? 'unchanged' as const : 'rename' as const,
			};
		});
		return { generatedAt: new Date().toISOString(), entries };
	}

	async applyPathMigration(preview: PathMigrationPreview): Promise<{ renamed: number; failed: number }> {
		const renames = preview.entries
			.filter(entry => entry.status === 'rename')
			.map(entry => ({ subjectId: entry.subjectId, from: entry.from, to: entry.to }));
		const transaction = new SyncTransaction(this.app, this.fileManager);
		this.activeTransaction = transaction;
		try {
			await transaction.executeRenames(renames);
			for (const rename of renames) this.incrementalSync.renameLocalSubject(rename.subjectId, rename.to);
			await this.persistPathStates();
			return { renamed: renames.length, failed: 0 };
		} catch {
			await transaction.rollback();
			await this.incrementalSync.scanLocalFolder(this.config.scanFolderPath || 'ACGN');
			return { renamed: 0, failed: renames.length };
		}
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
		const batchFiles = this.incrementalSync.getBatchSyncedFiles();
		return {
			...base,
			batchFiles,
			wasCancelled,
			canRollback: Boolean(this.activeTransaction?.hasChanges()) || batchFiles.some(file => file.wasNewlyCreated),
		};
	}

	private createSyncResult(total = 0): SyncResult {
		return {
			success: false,
			completion: 'failed',
			total,
			added: 0,
			skipped: 0,
			errors: 0,
			created: 0,
			updated: 0,
			unchanged: 0,
			renamed: 0,
			collisionResolved: 0,
			failed: 0,
			duration: 0,
			errorDetails: [],
			outcomes: [],
		};
	}

	private recordPreparedFailure(result: SyncResult, failure: PreparationFailure): void {
		const name = failure.collection.subject.name_cn || failure.collection.subject.name || String(failure.collection.subject_id);
		result.failed++;
		result.errorDetails.push(`[${failure.collection.subject_id}] ${name}: ${failure.error}`);
		result.outcomes.push({
			status: 'failed',
			subjectId: failure.collection.subject_id,
			name,
			error: failure.error,
		});
	}

	private recordWriteOutcome(result: SyncResult, prepared: PreparedCollection, writeStatus: FileWriteStatus): void {
		result.added++;
		result[writeStatus]++;
		if (prepared.allocation.renameFrom) {
			result.outcomes.push({
				status: 'renamed-and-updated',
				subjectId: prepared.collection.subject_id,
				oldPath: prepared.allocation.renameFrom,
				newPath: prepared.allocation.finalPath,
			});
			return;
		}
		if (prepared.allocation.collisionResolved) {
			result.collisionResolved++;
			result.outcomes.push({
				status: 'collision-resolved',
				subjectId: prepared.collection.subject_id,
				preferredPath: prepared.allocation.preferredPath,
				finalPath: prepared.allocation.finalPath,
			});
			return;
		}
		result.outcomes.push({ status: writeStatus, subjectId: prepared.collection.subject_id, path: prepared.allocation.finalPath });
	}

	private recordProcessingFailure(result: SyncResult, prepared: PreparedCollection, error: unknown): void {
		const collection = prepared.collection;
		const errorMessage = error instanceof Error ? error.message : String(error);
		const name = collection.subject.name_cn || collection.subject.name || String(collection.subject_id);
		result.failed++;
		result.errorDetails.push(`[${collection.subject_id}] ${name}: ${errorMessage}`);
		result.outcomes.push({
			status: 'failed',
			subjectId: collection.subject_id,
			name,
			preferredPath: prepared.allocation.preferredPath,
			actualPath: prepared.allocation.finalPath,
			error: errorMessage,
		});
	}

	private finalizeSyncResult(result: SyncResult, wasCancelled: boolean): void {
		result.errors = result.failed;
		result.completion = determineSyncCompletion(result.added, result.failed, wasCancelled);
		result.success = result.completion === 'success';
	}

	/**
	 * 执行同步
	 * 优化：支持并发处理多个条目，提高同步速度
	 */
	async sync(options: SyncOptions, concurrency: number = 3): Promise<SyncResultWithRollback> {
		const startTime = Date.now();
		let wasCancelled = false;
		const result = this.createSyncResult();

		try {
			const { diff } = await this.prepareSyncData(options);

			result.total = diff.toAdd.length;
			result.skipped = diff.toSkip.length;

			// 开始批次同步
			this.incrementalSync.startBatch();
			const batch = await this.prepareCollectionBatch(diff.toAdd, concurrency);
			result.renamed = this.activeTransaction?.getRenameCount() ?? 0;
			for (const failure of batch.failures) {
				this.recordPreparedFailure(result, failure);
			}

			// 使用并发控制处理条目
			await this.processConcurrently(
				batch.prepared,
				concurrency,
				async (prepared, index) => {
					const collection = prepared.collection;
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
						const processResult = await this.processCollection(
							collection,
							{ overwrite: false, preserveUserDataOnOverwrite: false },
							prepared,
						);
						if (processResult) {
							this.recordWriteOutcome(result, prepared, processResult.writeStatus);
						}
					} catch (error) {
						const name = collection.subject.name_cn || collection.subject.name || String(collection.subject_id);
						console.error(`[Bangumi Sync] 处理条目失败: ${name}`, error);
						this.recordProcessingFailure(result, prepared, error);
					}
				}
			);

			this.finalizeSyncResult(result, wasCancelled);
			await this.persistPathStates();

			if (!wasCancelled) {
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

	private async prepareCollectionBatch(
		collections: UserCollection[],
		concurrency: number,
	): Promise<{ prepared: PreparedCollection[]; failures: PreparationFailure[] }> {
		await this.incrementalSync.scanLocalFolder(this.config.scanFolderPath || 'ACGN');
		const registry = this.incrementalSync.getRegistry();
		const details = new Map<number, FullSubjectInfo>();
		const failures: PreparationFailure[] = [];

		await this.processConcurrently(collections, concurrency, async collection => {
			if (registry.duplicateIds.has(collection.subject_id)) {
				failures.push({
					collection,
					error: `Subject ${collection.subject_id} appears in multiple local files.`,
				});
				return;
			}
			try {
				details.set(collection.subject_id, await this.client.getFullSubjectInfo(collection.subject_id));
			} catch (error) {
				failures.push({
					collection,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		});

		const candidates = collections.flatMap(collection => {
			const fullInfo = details.get(collection.subject_id);
			if (!fullInfo) return [];
			const existing = registry.getById(collection.subject_id);
			return [{
				subjectId: collection.subject_id,
				preferredPath: this.generatePreferredPath(fullInfo.subject, collection),
				year: extractPathVars(fullInfo.subject, collection).year,
				currentPath: existing?.path,
				namingState: existing?.namingState ?? 'managed' as const,
			}];
		});
		const incomingTitleKeys = new Set(Array.from(details.values()).map(({ subject }) =>
			normalizePathCollisionKey(subject.name_cn || subject.name || String(subject.id)),
		));
		const contextRecords = Array.from(registry.idToRecord.values()).filter(record =>
			!details.has(record.subjectId)
			&& incomingTitleKeys.has(normalizePathCollisionKey(record.nameCn)),
		);
		await this.processConcurrently(contextRecords, concurrency, async record => {
			try {
				const subject = await this.client.getSubject(record.subjectId);
				candidates.push({
					subjectId: record.subjectId,
					preferredPath: this.generatePreferredPath(subject),
					year: extractPathVars(subject).year,
					currentPath: record.path,
					namingState: record.namingState,
				});
			} catch {
				// The existing subject remains protected by its current path if context lookup fails.
			}
		});
		const pathPlan = this.pathResolver.plan(candidates, registry.pathToId);
		this.activeTransaction = new SyncTransaction(this.app, this.fileManager);
		await this.activeTransaction.executeRenames(pathPlan.renamed);
		for (const rename of pathPlan.renamed) {
			this.incrementalSync.renameLocalSubject(rename.subjectId, rename.to);
		}
		await this.persistPathStates();

		const prepared: PreparedCollection[] = [];
		for (const collection of collections) {
			const fullInfo = details.get(collection.subject_id);
			const allocation = pathPlan.allocations.get(collection.subject_id);
			if (fullInfo && allocation) {
				prepared.push({ collection, fullInfo, allocation });
			}
		}
		return { prepared, failures };
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

		const scanPath = this.config.scanFolderPath || 'ACGN';
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
	 * 根据条目类型解析路径模板
	 * 优先使用类型独立模板，回退到默认模板
	 */
	private resolvePathTemplate(subject: Subject): string {
		if (this.config.pathTemplateByType) {
			const vars = extractPathVars(subject);
			const typeTemplate = this.config.pathTemplateByType[vars.type];
			if (typeTemplate) return typeTemplate;
		}
		return this.config.pathTemplate;
	}

	private generatePreferredPath(subject: Subject, collection?: UserCollection): string {
		const basePath = generateFilePath(this.resolvePathTemplate(subject), subject, collection);
		const strategy = this.config.pathNamingStrategy ?? 'simple-until-collision';
		if (strategy === 'always-id') {
			return this.appendPathSuffix(basePath, `[bgm-${subject.id}]`);
		}
		if (strategy === 'always-year') {
			const year = extractPathVars(subject, collection).year;
			return this.appendPathSuffix(basePath, year ? `（${year}）` : `[bgm-${subject.id}]`);
		}
		return basePath;
	}

	private appendPathSuffix(path: string, suffix: string): string {
		return path.toLocaleLowerCase('en-US').endsWith('.md')
			? `${path.slice(0, -3)}${suffix}.md`
			: `${path}${suffix}.md`;
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
		// 三次元（type=6）始终获取
		if (subject.type !== SubjectType.Anime && subject.type !== SubjectType.Book && subject.type !== SubjectType.Real) {
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
		const result = this.createSyncResult(collections.length);

		const overwrite = options?.overwrite ?? false;
		const localPropertyValuesBySubjectId = options?.localPropertyValuesBySubjectId;
		const concurrency = options?.concurrency ?? 3;

		try {
			console.debug(`[Bangumi Sync] 开始按收藏列表同步 ${collections.length} 个条目，覆盖模式: ${overwrite}，并发数: ${concurrency}`);

			// 开始批次同步
			this.incrementalSync.startBatch();
			const batch = await this.prepareCollectionBatch(collections, concurrency);
			result.renamed = this.activeTransaction?.getRenameCount() ?? 0;
			for (const failure of batch.failures) {
				this.recordPreparedFailure(result, failure);
			}

			// 收集每个条目的 relations 数据，用于后处理同批次相关条目的双向链接
			const batchRelations: { subjectId: number; filePath: string; relations: RelatedSubject[] }[] = [];

			// 使用并发控制处理条目
			await this.processConcurrently(
				batch.prepared,
				concurrency,
				async (prepared, i) => {
					const collection = prepared.collection;
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
						const processResult = await this.processCollection(collection, {
							overwrite,
							preserveUserDataOnOverwrite: true,
							localPropertyValues: localPropertyValuesBySubjectId?.get(collection.subject_id),
						}, prepared);
						if (processResult) {
							batchRelations.push(processResult);
							this.recordWriteOutcome(result, prepared, processResult.writeStatus);
						}
					} catch (error) {
						console.error(`[Bangumi Sync] 同步条目失败 (ID: ${collection.subject_id}):`, error);
						this.recordProcessingFailure(result, prepared, error);
					}
				}
			);

			// 后处理：为同批次相关条目补充双向链接
			if (batchRelations.length > 1) {
				await this.postProcessBatchRelations(batchRelations);
			}

			this.finalizeSyncResult(result, wasCancelled);
			await this.persistPathStates();

			if (!wasCancelled) {
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
		const result = this.createSyncResult();

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
			const batch = await this.prepareCollectionBatch(
				itemsToSync.map(item => item.collection),
				concurrency,
			);
			result.renamed = this.activeTransaction?.getRenameCount() ?? 0;
			for (const failure of batch.failures) {
				this.recordPreparedFailure(result, failure);
			}

			// 收集每个条目的 relations 数据，用于后处理同批次相关条目的双向链接
			const batchRelations: { subjectId: number; filePath: string; relations: RelatedSubject[] }[] = [];

			// 使用并发控制处理条目
			await this.processConcurrently(
				batch.prepared,
				concurrency,
				async (prepared, i) => {
					const item = itemsToSync.find(candidate => candidate.collection.subject_id === prepared.collection.subject_id);
					if (!item) return;
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
						const processResult = await this.processCollection(item.collection, {
							overwrite: false,
							preserveUserDataOnOverwrite: false,
							localPropertyValues: localPropertyResult?.propertyValuesBySubjectId?.get(item.collection.subject_id),
						}, prepared);
						if (processResult) {
							batchRelations.push(processResult);
							this.recordWriteOutcome(result, prepared, processResult.writeStatus);
						}
					} catch (error) {
						console.error(`[Bangumi Sync] 处理条目失败: ${item.name_cn || item.name}`, error);
						this.recordProcessingFailure(result, prepared, error);
					}
				}
			);

			// 后处理：为同批次相关条目补充双向链接
			if (batchRelations.length > 1) {
				await this.postProcessBatchRelations(batchRelations);
			}

			this.finalizeSyncResult(result, wasCancelled);
			await this.persistPathStates();

			if (!wasCancelled) {
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
		options: { overwrite: boolean; localPropertyValues?: LocalPropertyValueMap; preserveUserDataOnOverwrite: boolean },
		prepared?: Pick<PreparedCollection, 'fullInfo' | 'allocation'>,
	): Promise<{ subjectId: number; filePath: string; relations: RelatedSubject[]; writeStatus: FileWriteStatus } | undefined> {
		console.debug(`[Bangumi Sync] 处理条目: ${collection.subject.name_cn || collection.subject.name}`);

		// 获取完整条目信息
		const { subject, characters: relatedCharacters, relations, persons } = prepared?.fullInfo
			?? await this.client.getFullSubjectInfo(collection.subject_id);
		console.debug(`[Bangumi Sync] 获取到条目信息: ${subject.name_cn}`);

		// 解析角色信息
		const characters = parseCharacters(relatedCharacters, 9);

		// 获取类型标签
		const typeLabel = getTypeLabel(subject.type);

		// 下载封面图片
		const localCoverPath = await this.resolveLocalCoverPath(subject, typeLabel);

		// 生成文件路径
		const filePath = prepared?.allocation.finalPath
			?? this.incrementalSync.getLocalPath(subject.id)
			?? this.generatePreferredPath(subject, collection);

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

		// 文件已存在时保护用户数据（记录、感想等）
		if (options.preserveUserDataOnOverwrite) {
			const existingFile = await this.fileManager.assertPathOwnership(filePath, subject.id);
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

		// 创建或更新文件
		// 当 preserveUserDataOnOverwrite 为 true 且文件已存在时，使用 overwrite 确保 API 数据（如具体类型）更新
		const shouldOverwrite = options.overwrite || (options.preserveUserDataOnOverwrite && fileExisted);
		const writeOptions = { overwrite: shouldOverwrite, subjectId: subject.id };
		const writeResult = this.activeTransaction
			? await this.activeTransaction.createOrUpdateFile(filePath, content, writeOptions)
			: await this.fileManager.createOrUpdateFile(filePath, content, writeOptions);
		console.debug(`[Bangumi Sync] 文件创建完成: ${filePath}`);

		// 添加到批次已同步列表
		this.incrementalSync.addBatchSyncedItem(subject.id, filePath, subject.name_cn || subject.name, !fileExisted);

		// 更新已同步相关条目的链接（双向链接）
		if (this.config.enableRelatedLinks !== false && relations && relations.length > 0) {
			await this.updateRelatedItemsBidirectional(subject.id, filePath, subject.name_cn || subject.name, relations);
		}

		return { subjectId: subject.id, filePath, relations, writeStatus: writeResult.status };
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
		const updatesByFile = new Map<string, { subjectId: number; links: string[] }>();

		for (const relation of relations) {
			const relatedPath = this.resolveRelatedLocalPath(relation.id);
			if (relatedPath) {
				const existing = updatesByFile.get(relatedPath) ?? { subjectId: relation.id, links: [] };
				existing.links.push(currentLink);
				updatesByFile.set(relatedPath, existing);
			}
		}

		// 批量更新每个目标文件
		for (const [path, update] of updatesByFile) {
			try {
				await this.updateRelatedFile(path, update.subjectId, update.links);
			} catch (error) {
				console.error(`[Bangumi Sync] 更新相关条目链接失败: ${path}`, error);
			}
		}
	}

	/**
	 * 后处理同批次相关条目的双向链接
	 * 解决并发同步时相关条目互相检测不到的问题
	 * 按目标文件分组，每个文件只读写一次
	 */
	private async postProcessBatchRelations(
		batchItems: { subjectId: number; filePath: string; relations: RelatedSubject[] }[]
	): Promise<void> {
		if (this.config.enableRelatedLinks === false) return;

		const batchSubjectIds = new Set(batchItems.map(item => item.subjectId));
		const updatesByFile = new Map<string, { subjectId: number; links: string[] }>();

		for (const item of batchItems) {
			const batchRelations = item.relations.filter(r => batchSubjectIds.has(r.id));
			if (batchRelations.length === 0) continue;

			const currentDisplayName = this.extractDisplayNameFromPath(item.filePath);
			const currentLink = `[[${item.filePath}|${currentDisplayName}]]`;

			for (const relation of batchRelations) {
				const relatedPath = this.resolveRelatedLocalPath(relation.id);
				if (!relatedPath) continue;

				// 当前条目 → 相关条目
				const relatedDisplayName = this.extractDisplayNameFromPath(relatedPath);
				const relatedLink = `[[${relatedPath}|${relatedDisplayName}]]`;
				const existing1 = updatesByFile.get(item.filePath) ?? { subjectId: item.subjectId, links: [] };
				existing1.links.push(relatedLink);
				updatesByFile.set(item.filePath, existing1);

				// 相关条目 → 当前条目（反向）
				const existing2 = updatesByFile.get(relatedPath) ?? { subjectId: relation.id, links: [] };
				existing2.links.push(currentLink);
				updatesByFile.set(relatedPath, existing2);
			}
		}

		if (updatesByFile.size === 0) return;

		console.debug(`[Bangumi Sync] 后处理同批次相关链接: ${updatesByFile.size} 个文件需要更新`);

		for (const [path, update] of updatesByFile) {
			try {
				await this.updateRelatedFile(path, update.subjectId, update.links);
			} catch (error) {
				console.error(`[Bangumi Sync] 后处理更新相关链接失败: ${path}`, error);
			}
		}
	}

	private async updateRelatedFile(path: string, subjectId: number, links: string[]): Promise<void> {
		const file = await this.fileManager.assertPathOwnership(path, subjectId);
		if (!file) return;
		const content = await this.app.vault.read(file);
		const updatedContent = this.incrementalSync.updateRelated(content, links);
		if (updatedContent === content) return;
		if (this.activeTransaction) {
			await this.activeTransaction.createOrUpdateFile(path, updatedContent, { overwrite: true, subjectId });
		} else {
			await this.app.vault.process(file, () => updatedContent);
		}
		console.debug(`[Bangumi Sync] 已更新相关链接: ${path} (+${links.length})`);
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
	): Promise<{ success: boolean; filePath?: string; writeStatus?: FileWriteStatus; error?: string }> {
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
				await this.incrementalSync.scanLocalFolder(this.config.scanFolderPath || 'ACGN');
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
				const filePath = this.incrementalSync.getLocalPath(subject.id)
					?? this.generatePreferredPath(subject, collection);

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
				const writeResult = await this.fileManager.createOrUpdateFile(filePath, finalContent, {
					overwrite: false,
					subjectId: subject.id,
				});
				console.debug(`[Bangumi Sync] 文件创建完成: ${filePath}`);
				this.incrementalSync.addBatchSyncedItem(
					subject.id,
					filePath,
					subject.name_cn || subject.name,
					writeResult.status === 'created',
				);
				await this.persistPathStates();

				return { success: true, filePath, writeStatus: writeResult.status };
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
		const scanPath = this.config.scanFolderPath || 'ACGN';
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
	 * 扫描所有本地已同步条目，为相关条目补充双向链接
	 * 使用并查集查找连通分量，确保同系列所有条目互相关联
	 */
	async scanAndLinkRelated(): Promise<{ checked: number; linked: number; skipped: number; failed: number; details: { name: string; addedLinks: string[] }[] }> {
		const scanPath = this.config.scanFolderPath || 'ACGN';
		console.debug(`[Bangumi Sync] 扫描关联条目，scanFolderPath: "${this.config.scanFolderPath}"，实际扫描路径: "${scanPath}"，pathTemplate: "${this.config.pathTemplate}"`);
		await this.incrementalSync.scanLocalFolder(scanPath);

		const localSubjects = this.incrementalSync.getLocalSubjects();
		console.debug(`[Bangumi Sync] 扫描到 ${localSubjects.size} 个本地条目`);

		if (localSubjects.size === 0) {
			console.warn(`[Bangumi Sync] 未扫描到任何本地条目，扫描路径: "${scanPath}"`);
		}

		const allIds = [...localSubjects.keys()];
		console.debug(`[Bangumi Sync] 本地条目 ID: ${allIds.join(', ')}`);

		const result = { checked: localSubjects.size, linked: 0, skipped: 0, failed: 0, details: [] as { name: string; addedLinks: string[] }[] };
		let processed = 0;

		// 构建 subjectId → path 映射
		const localPathMap = new Map<number, string>();
		for (const [id, info] of localSubjects) {
			if (info.path) {
				localPathMap.set(id, info.path);
			}
		}

		// === 第一阶段：获取所有本地条目的关联关系，用并查集构建连通分量 ===

		// 并查集
		const parent = new Map<number, number>();
		const find = (x: number): number => {
			if (!parent.has(x)) parent.set(x, x);
			if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
			return parent.get(x)!;
		};
		const union = (a: number, b: number) => {
			const ra = find(a), rb = find(b);
			if (ra !== rb) parent.set(ra, rb);
		};

		// 存储每个条目的本地关联 ID 列表（用于后续补全链接）
		const localRelationMap = new Map<number, number[]>();

		for (const [subjectId, info] of localSubjects) {
			processed++;
			this.reportProgress({
				status: 'scanning',
				current: processed,
				total: localSubjects.size,
				currentItem: info.name_cn || String(subjectId),
			});

			try {
				const relations = await this.client.getSubjectRelations(subjectId);
				console.debug(`[Bangumi Sync] [${processed}/${localSubjects.size}] ${info.name_cn || subjectId} (ID:${subjectId}): ${relations.length} 个关联`);

				const localRelatedIds: number[] = [];
				for (const relation of relations) {
					if (!localPathMap.has(relation.id) || relation.id === subjectId) continue;
					localRelatedIds.push(relation.id);
					union(subjectId, relation.id);
				}

				localRelationMap.set(subjectId, localRelatedIds);
				if (localRelatedIds.length > 0) {
					console.debug(`[Bangumi Sync]   本地关联: ${localRelatedIds.join(', ')}`);
				}
			} catch (error) {
				console.warn(`[Bangumi Sync] 获取关联关系失败: ${info.name_cn} (${subjectId})`, error);
				result.failed++;
				localRelationMap.set(subjectId, []);
			}
		}

		// === 第二阶段：按连通分量分组 ===

		const components = new Map<number, number[]>();
		for (const subjectId of localSubjects.keys()) {
			const root = find(subjectId);
			if (!components.has(root)) components.set(root, []);
			components.get(root)!.push(subjectId);
		}

		// 过滤出含 2+ 条目的分量（需要补全链接的组）
		const multiComponents = [...components.entries()].filter(([, ids]) => ids.length >= 2);
		console.debug(`[Bangumi Sync] 连通分量: ${components.size} 组，其中 ${multiComponents.length} 组含 2+ 条目`);

		for (const [root, ids] of multiComponents) {
			console.debug(`[Bangumi Sync] 分量 (root:${root}): ${ids.map(id => `${localSubjects.get(id)?.name_cn || id}(${id})`).join(', ')}`);
		}

		// === 第三阶段：为每组补全所有互链 ===

		const updatesByFile = new Map<string, string[]>();
		let alreadyCorrect = 0;

		for (const [, componentIds] of multiComponents) {
			// 收集该组中所有条目的链接
			const allLinks: { subjectId: number; link: string }[] = [];
			for (const id of componentIds) {
				const info = localSubjects.get(id);
				if (!info?.path) continue;
				const displayName = this.extractDisplayNameFromPath(info.path);
				allLinks.push({ subjectId: id, link: `[[${info.path}|${displayName}]]` });
			}

			// 为每个条目检查是否缺少对组内其他条目的链接
			for (const id of componentIds) {
				const info = localSubjects.get(id);
				if (!info?.path) continue;

				const existingRelated = localRelationMap.get(id) || [];
				const existingSet = new Set(existingRelated);
				const missingLinks: string[] = [];

				for (const { subjectId: otherId, link } of allLinks) {
					if (otherId === id) continue;
					if (!existingSet.has(otherId)) {
						missingLinks.push(link);
					}
				}

				if (missingLinks.length > 0) {
					updatesByFile.set(info.path, missingLinks);
					console.debug(`[Bangumi Sync] ${info.name_cn || id}: 补充 ${missingLinks.length} 个链接`);
				} else {
					alreadyCorrect++;
				}
			}
		}

		result.skipped = alreadyCorrect;

		console.debug(`[Bangumi Sync] 扫描完成，需要更新 ${updatesByFile.size} 个文件`);

		// === 第四阶段：批量更新文件 ===

		for (const [path, links] of updatesByFile) {
			try {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) {
					console.warn(`[Bangumi Sync] 文件不存在或非 TFile: ${path}`);
					result.failed++;
					continue;
				}
				const content = await this.app.vault.read(file);
				const updatedContent = this.incrementalSync.updateRelated(content, links);
				if (updatedContent !== content) {
					await this.app.vault.process(file, () => updatedContent);
					result.linked++;
					// 提取条目名（从文件路径或 frontmatter）
					const name = this.extractFrontmatterString(content, '中文名') || file.basename;
					// 提取新增链接的显示名称
					const addedNames = links.map(link => {
						const match = link.match(/\[\[.*?\|(.+?)\]\]/);
						return match ? match[1] : link;
					});
					result.details.push({ name, addedLinks: addedNames });
					console.debug(`[Bangumi Sync] 扫描关联更新: ${path} (+${links.length})`);
				} else {
					console.debug(`[Bangumi Sync] 文件无需更新（链接已存在）: ${path}`);
					result.skipped++;
				}
			} catch (error) {
				console.error(`[Bangumi Sync] 扫描关联更新失败: ${path}`, error);
				result.failed++;
			}
		}

		this.reportProgress({
			status: 'completed',
			message: `关联完成: 检查 ${result.checked} 个条目，更新 ${result.linked} 个，跳过 ${result.skipped} 个，失败 ${result.failed} 个`,
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
