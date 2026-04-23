/**
 * 同步冲突解决器
 * 检测本地与云端数据冲突，提供解决选项
 */

import { App, Modal, TFile } from 'obsidian';
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
export class ConflictResolverModal extends Modal {
	private conflicts: ConflictItem[];
	private onResolve: (resolution: ConflictResolution) => void;

	constructor(
		app: App,
		conflicts: ConflictItem[],
		onResolve: (resolution: ConflictResolution) => void
	) {
		super(app);
		this.conflicts = conflicts;
		this.onResolve = onResolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('bangumi-conflict-resolver');

		contentEl.createEl('h2', { text: '同步冲突检测' });

		// 说明
		contentEl.createDiv({ cls: 'bangumi-conflict-info' }, div => {
			div.setText(`检测到 ${this.conflicts.length} 个条目存在本地与云端数据冲突。请选择保留哪个版本。`);
		});

		// 冲突列表
		const listEl = contentEl.createDiv({ cls: 'bangumi-conflict-list' });
		this.renderConflictList(listEl);

		// 操作按钮
		const buttonsEl = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });
		buttonsEl.createEl('button', { text: '全部保留本地' }, btn => {
			btn.addEventListener('click', () => this.resolveAll('local'));
		});
		buttonsEl.createEl('button', { text: '全部保留云端' }, btn => {
			btn.addEventListener('click', () => this.resolveAll('cloud'));
		});
		buttonsEl.createEl('button', { text: '跳过所有冲突' }, btn => {
			btn.addEventListener('click', () => this.resolveAll('skip'));
		});
		buttonsEl.createEl('button', { text: '确认选择', cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => this.confirmSelection());
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * 渲染冲突列表
	 */
	private renderConflictList(container: HTMLElement): void {
		this.conflicts.forEach((conflict, index) => {
			const itemEl = container.createDiv({ cls: 'bangumi-conflict-item' });

			// 标题
			itemEl.createDiv({ cls: 'bangumi-conflict-header' }, header => {
				header.createEl('strong', { text: conflict.name_cn || conflict.name });
				header.createSpan({ cls: 'bangumi-conflict-time', text: `本地: ${conflict.localModified} | 云端: ${conflict.cloudModified}` });
			});

			// 差异对比
			const diffEl = itemEl.createDiv({ cls: 'bangumi-conflict-diff' });
			this.renderDiff(diffEl, conflict.diff);

			// 选择按钮
			const choiceEl = itemEl.createDiv({ cls: 'bangumi-conflict-choice' });
			choiceEl.createEl('button', {
				text: '保留本地',
				cls: conflict.decision === 'local' ? 'mod-cta' : ''
			}, btn => {
				btn.addEventListener('click', () => {
					conflict.decision = 'local';
					this.renderConflictList(container);
				});
			});
			choiceEl.createEl('button', {
				text: '保留云端',
				cls: conflict.decision === 'cloud' ? 'mod-cta' : ''
			}, btn => {
				btn.addEventListener('click', () => {
					conflict.decision = 'cloud';
					this.renderConflictList(container);
				});
			});
			choiceEl.createEl('button', {
				text: '跳过',
				cls: conflict.decision === 'skip' ? 'mod-cta' : ''
			}, btn => {
				btn.addEventListener('click', () => {
					conflict.decision = 'skip';
					this.renderConflictList(container);
				});
			});
		});
	}

	/**
	 * 渲染差异对比
	 */
	private renderDiff(container: HTMLElement, diff: ConflictDiff): void {
		if (diff.rateChanged) {
			container.createDiv({ cls: 'bangumi-diff-row' }, row => {
				row.createSpan({ cls: 'bangumi-diff-label', text: '评分:' });
				row.createSpan({ cls: 'bangumi-diff-local', text: `本地 ${diff.localRate ?? '无'}` });
				row.createSpan({ text: ' vs ' });
				row.createSpan({ cls: 'bangumi-diff-cloud', text: `云端 ${diff.cloudRate ?? '无'}` });
			});
		}
		if (diff.commentChanged) {
			container.createDiv({ cls: 'bangumi-diff-row' }, row => {
				row.createSpan({ cls: 'bangumi-diff-label', text: '短评:' });
				const localComment = diff.localComment ? (diff.localComment.length > 30 ? diff.localComment.substring(0, 30) + '...' : diff.localComment) : '无';
				const cloudComment = diff.cloudComment ? (diff.cloudComment.length > 30 ? diff.cloudComment.substring(0, 30) + '...' : diff.cloudComment) : '无';
				row.createSpan({ cls: 'bangumi-diff-local', text: `本地 "${localComment}"` });
				row.createSpan({ text: ' vs ' });
				row.createSpan({ cls: 'bangumi-diff-cloud', text: `云端 "${cloudComment}"` });
			});
		}
		if (diff.tagsChanged) {
			container.createDiv({ cls: 'bangumi-diff-row' }, row => {
				row.createSpan({ cls: 'bangumi-diff-label', text: '标签:' });
				row.createSpan({ cls: 'bangumi-diff-local', text: `本地 [${diff.localTags?.join(', ') ?? ''}]` });
				row.createSpan({ text: ' vs ' });
				row.createSpan({ cls: 'bangumi-diff-cloud', text: `云端 [${diff.cloudTags?.join(', ') ?? ''}]` });
			});
		}
	}

	/**
	 * 全部选择同一决策
	 */
	private resolveAll(decision: 'local' | 'cloud' | 'skip'): void {
		this.conflicts.forEach(c => c.decision = decision);
		this.confirmSelection();
	}

	/**
	 * 确认选择
	 */
	private confirmSelection(): void {
		const resolved = this.conflicts.filter(c => c.decision !== 'skip');
		const skipped = this.conflicts.filter(c => c.decision === 'skip');

		this.onResolve({ resolved, skipped });
		this.close();
	}
}

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
	async extractLocalData(file: TFile): Promise<LocalItemData | null> {
		try {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

			if (!frontmatter) return null;

			return {
				path: file.path,
				name_cn: frontmatter.title || frontmatter.name_cn || '',
				rate: frontmatter.my_rate,
				comment: frontmatter.comment,
				tags: frontmatter.tags ? String(frontmatter.tags).split(',').map((t: string) => t.trim()) : [],
				type: frontmatter.status,
				updated_at: frontmatter.updated_at || file.stat.mtime.toString(),
			};
		} catch (error) {
			console.error('[ConflictDetector] 提取本地数据失败:', error);
			return null;
		}
	}
}
