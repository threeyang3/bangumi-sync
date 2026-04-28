/**
 * 同步冲突解决器
 * 检测本地与云端数据冲突，提供解决选项
 */

import { App, TFile } from 'obsidian';
import { UserCollection } from '../../common/api/types';

/**
 * 本地条目数据
 */
export interface LocalItemData {
	path: string;
	name_cn: string;
	rate?: number;
	comment?: string;
	tags?: string[];
	type?: number;
	updated_at?: string;
}

/**
 * 冲突项
 */
export interface ConflictItem {
	subjectId: number;
	name_cn: string;
	name: string;
	localModified: string;
	cloudModified: string;
	localData: LocalItemData;
	cloudData: UserCollection;
	diff: ConflictDiff;
	decision: 'local' | 'cloud' | 'skip';
}

/**
 * 冲突差异
 */
export interface ConflictDiff {
	rateChanged: boolean;
	commentChanged: boolean;
	tagsChanged: boolean;
	statusChanged: boolean;
	localRate?: number;
	cloudRate?: number;
	localComment?: string;
	cloudComment?: string;
	localTags?: string[];
	cloudTags?: string[];
	localStatus?: number;
	cloudStatus?: number;
}

/**
 * 冲突解决结果
 */
export interface ConflictResolution {
	resolved: ConflictItem[];
	skipped: ConflictItem[];
}

/**
 * 冲突解决弹窗
 */

/**
 * 冲突检测器
 */
export class ConflictDetector {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 检测冲突
	 * @param localItems 本地条目映射
	 * @param cloudItems 云端收藏列表
	 * @param localModifiedTime 本地修改时间映射
	 */
	detectConflicts(
		localItems: Map<number, LocalItemData>,
		cloudItems: UserCollection[],
		localModifiedTime: Map<number, string>
	): ConflictItem[] {
		const conflicts: ConflictItem[] = [];

		for (const cloudItem of cloudItems) {
			const subjectId = cloudItem.subject_id;
			const localData = localItems.get(subjectId);

			if (!localData) continue;  // 本地不存在，无冲突

			const localModified = localModifiedTime.get(subjectId) || '';
			const cloudModified = cloudItem.updated_at || '';

			// 检测差异
			const diff = this.computeDiff(localData, cloudItem);

			// 如果有差异且本地有修改，则存在冲突
			if (this.hasDiff(diff) && localModified) {
				conflicts.push({
					subjectId,
					name_cn: cloudItem.subject.name_cn || '',
					name: cloudItem.subject.name || '',
					localModified,
					cloudModified,
					localData,
					cloudData: cloudItem,
					diff,
					decision: 'skip',
				});
			}
		}

		return conflicts;
	}

	/**
	 * 计算差异
	 */
	private computeDiff(local: LocalItemData, cloud: UserCollection): ConflictDiff {
		return {
			rateChanged: local.rate !== cloud.rate,
			commentChanged: (local.comment || '') !== (cloud.comment || ''),
			tagsChanged: !this.arraysEqual(local.tags || [], cloud.tags || []),
			statusChanged: local.type !== cloud.type,
			localRate: local.rate,
			cloudRate: cloud.rate,
			localComment: local.comment,
			cloudComment: cloud.comment,
			localTags: local.tags,
			cloudTags: cloud.tags,
			localStatus: local.type,
			cloudStatus: cloud.type,
		};
	}

	/**
	 * 检查是否有差异
	 */
	private hasDiff(diff: ConflictDiff): boolean {
		return diff.rateChanged || diff.commentChanged || diff.tagsChanged || diff.statusChanged;
	}

	/**
	 * 比较数组是否相等
	 */
	private arraysEqual(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		return a.every((val, index) => val === b[index]);
	}

	/**
	 * 从本地文件提取数据
	 */
	extractLocalData(file: TFile): LocalItemData | null {
		try {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

			if (!frontmatter) return null;

			const title = typeof frontmatter.title === 'string' ? frontmatter.title : '';
			const nameCn = typeof frontmatter.name_cn === 'string' ? frontmatter.name_cn : '';
			const rate = typeof frontmatter.my_rate === 'number' ? frontmatter.my_rate : undefined;
			const comment = typeof frontmatter.comment === 'string' ? frontmatter.comment : undefined;
			const status = typeof frontmatter.status === 'number' ? frontmatter.status : undefined;
			const updatedAt = frontmatter.updated_at != null ? String(frontmatter.updated_at) : file.stat.mtime.toString();
			const tags = Array.isArray(frontmatter.tags)
				? frontmatter.tags.map(tag => String(tag).trim()).filter(Boolean)
				: frontmatter.tags != null
					? String(frontmatter.tags).split(',').map((t: string) => t.trim()).filter(Boolean)
					: [];

			return {
				path: file.path,
				name_cn: title || nameCn,
				rate,
				comment,
				tags,
				type: status,
				updated_at: updatedAt,
			};
		} catch (error) {
			console.error('[ConflictDetector] 提取本地数据失败:', error);
			return null;
		}
	}
}
