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

// 兼容旧版本的类型别名
export type SyncOptionsV3 = SyncOptions;
export type SyncResultV3 = SyncResult;
export type SyncProgressV3 = SyncProgress;
