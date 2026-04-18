/**
 * 增量同步逻辑
 */

import { UserCollection, Subject } from '../../../common/api/types';
import { SyncState } from './syncStatus';

export class IncrementalSync {
	private syncState: SyncState;

	constructor(syncState: SyncState) {
		this.syncState = syncState;
	}

	/**
	 * 获取本地已同步的条目 ID 集合
	 */
	getLocalSubjectIds(): Set<number> {
		return new Set(this.syncState.syncedIds);
	}

	/**
	 * 对比远程与本地，返回需要同步的条目
	 */
	computeDiff(
		remoteCollections: UserCollection[],
		options?: {
			force?: boolean;
		}
	): {
		toAdd: UserCollection[];
		toUpdate: UserCollection[];
		toSkip: UserCollection[];
	} {
		// 如果强制同步，所有条目都需要处理
		if (options?.force) {
			return {
				toAdd: remoteCollections,
				toUpdate: [],
				toSkip: [],
			};
		}

		const localIds = this.getLocalSubjectIds();
		const toAdd: UserCollection[] = [];
		const toUpdate: UserCollection[] = [];
		const toSkip: UserCollection[] = [];

		for (const collection of remoteCollections) {
			if (localIds.has(collection.subject_id)) {
				// 已存在，检查是否需要更新
				// 这里可以根据 updated_at 判断是否需要更新
				// 暂时跳过已存在的条目
				toSkip.push(collection);
			} else {
				// 新条目
				toAdd.push(collection);
			}
		}

		return { toAdd, toUpdate, toSkip };
	}

	/**
	 * 记录同步状态
	 */
	recordSyncState(collections: UserCollection[]): void {
		const ids = collections.map(c => c.subject_id);
		this.syncState.syncedIds = [...new Set([...this.syncState.syncedIds, ...ids])];
		this.syncState.lastSyncTime = new Date().toISOString();
		this.syncState.lastSyncCount = collections.length;
	}

	/**
	 * 清除同步状态
	 */
	clearSyncState(): void {
		this.syncState.syncedIds = [];
		this.syncState.lastSyncTime = null;
		this.syncState.lastSyncCount = 0;
		this.syncState.syncErrors = [];
	}

	/**
	 * 添加同步错误
	 */
	addSyncError(subjectId: number, subjectName: string, error: string): void {
		this.syncState.syncErrors.push({
			subjectId,
			subjectName,
			error,
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * 获取同步状态
	 */
	getSyncState(): SyncState {
		return this.syncState;
	}
}
