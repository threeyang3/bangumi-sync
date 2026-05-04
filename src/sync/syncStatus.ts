/**
 * 同步状态跟踪
 */

import { SubjectType, CollectionType } from '../../common/api/types';

/**
 * 同步选项
 */
export interface SyncOptions {
	subjectTypes: SubjectType[];
	collectionTypes: CollectionType[];
	limit: number;           // 用户请求的同步数量
	force: boolean;
}

/**
 * 同步结果
 */
export interface SyncResult {
	success: boolean;
	total: number;          // 需要同步的总数
	added: number;
	skipped: number;        // 已存在跳过的数量
	errors: number;
	duration: number;
	errorDetails: string[]; // 失败条目的详细错误信息
}

/**
 * 同步进度
 */
export interface SyncProgress {
	current: number;
	total: number;
	status: 'preparing' | 'fetching' | 'scanning' | 'processing' | 'completed' | 'error';
	message?: string;
	currentItem?: string;
}

/**
 * 协作式取消信号
 * 同步循环在每个条目之间检查 cancelled 标志
 */
export interface SyncCancellationSignal {
	cancelled: boolean;
	paused: boolean;
	cancel(): void;
	pause(): void;
	resume(): void;
}

/**
 * 批次文件跟踪（用于回滚）
 */
export interface BatchSyncedFile {
	subjectId: number;
	filePath: string;
	name_cn: string;
	wasNewlyCreated: boolean;
}

/**
 * 带回滚能力的同步结果
 */
export interface SyncResultWithRollback extends SyncResult {
	batchFiles: BatchSyncedFile[];
	wasCancelled: boolean;
}

/**
 * 创建取消信号
 */
export function createCancellationSignal(): SyncCancellationSignal {
	return {
		cancelled: false,
		paused: false,
		cancel() { this.cancelled = true; },
		pause() { this.paused = true; },
		resume() { this.paused = false; },
	};
}
