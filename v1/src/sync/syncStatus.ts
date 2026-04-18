/**
 * 同步状态跟踪
 */

import { SubjectType, CollectionType } from '../../../common/api/types';

/**
 * 同步状态
 */
export interface SyncState {
	lastSyncTime: string | null;     // 上次同步时间 (ISO 格式)
	lastSyncCount: number;           // 上次同步数量
	syncedIds: number[];             // 已同步的条目 ID 列表
	syncErrors: SyncError[];         // 同步错误记录
}

/**
 * 同步错误记录
 */
export interface SyncError {
	subjectId: number;
	subjectName: string;
	error: string;
	timestamp: string;
}

/**
 * 同步选项
 */
export interface SyncOptions {
	subjectTypes: SubjectType[];     // 要同步的条目类型
	collectionTypes: CollectionType[]; // 要同步的收藏类型
	limit: number;                   // 同步数量限制
	force: boolean;                  // 是否强制全量同步
}

/**
 * 同步结果
 */
export interface SyncResult {
	success: boolean;
	total: number;
	added: number;
	updated: number;
	skipped: number;
	errors: number;
	duration: number;  // 毫秒
}

/**
 * 同步进度
 */
export interface SyncProgress {
	current: number;
	total: number;
	currentItem?: string;
	status: 'preparing' | 'fetching' | 'processing' | 'completed' | 'error';
	message?: string;
}

/**
 * 默认同步状态
 */
export const DEFAULT_SYNC_STATE: SyncState = {
	lastSyncTime: null,
	lastSyncCount: 0,
	syncedIds: [],
	syncErrors: [],
};
