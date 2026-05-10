/**
 * 状态同步弹窗
 * 统一对比本地与云端用户数据差异（评分、短评、标签、状态）
 * 支持双向同步
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import { UserCollection, CollectionType, getCollectionStatusLabel } from '../../common/api/types';
import { BangumiClient } from '../api/client';
import { IncrementalSync } from '../sync/incrementalSync';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import { tn } from '../i18n';

/**
 * 字段决策类型
 */
export type FieldDecision = 'local' | 'cloud' | 'merge' | 'skip';

/**
 * 单个字段的差异信息
 */
export interface FieldDiff<T> {
	localValue: T | null;
	cloudValue: T | null;
	hasDiff: boolean;
	decision: FieldDecision;
}

/**
 * 完整的状态同步差异项
 */
export interface StatusSyncDiff {
	subjectId: number;
	name_cn: string;
	name: string;
	localPath: string;
	collection: UserCollection;
	statusFieldName: string;
	rate: FieldDiff<number>;
	comment: FieldDiff<string>;
	tags: FieldDiff<string[]>;
	status: FieldDiff<number>;
	episodeStatus: FieldDiff<string>;
	hasAnyDiff: boolean;
	expanded: boolean;
}

/**
 * 状态同步弹窗（紧凑模式）
 */
export class StatusSyncModal extends Modal {
	private diffs: StatusSyncDiff[];
	private client: BangumiClient;
	private incrementalSync: IncrementalSync;
	private episodeStatusManager: EpisodeStatusManager | null;
	private onComplete: () => void;

	private tableEl!: HTMLElement;
	private statusEl!: HTMLElement;

	constructor(
		app: App,
		client: BangumiClient,
		incrementalSync: IncrementalSync,
		diffs: StatusSyncDiff[],
		onComplete: () => void,
		episodeStatusManager?: EpisodeStatusManager | null
	) {
		super(app);
		this.client = client;
		this.incrementalSync = incrementalSync;
		this.diffs = diffs;
		this.onComplete = onComplete;
		this.episodeStatusManager = episodeStatusManager ?? null;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.addClass('bangumi-status-sync-modal');

		// 标题
		contentEl.createEl('h2', { text: tn('statusSyncModal', 'title') });

		// 说明
		contentEl.createEl('p', {
			text: tn('statusSyncModal', 'description').replace('{count}', String(this.diffs.length)),
			cls: 'bangumi-sync-description'
		});

		// 批量操作按钮栏
		const actionBar = contentEl.createDiv({ cls: 'bangumi-status-sync-actions' });
		actionBar.createEl('button', { text: tn('statusSyncModal', 'allLocal') }, btn => {
			btn.addEventListener('click', () => this.selectAll('local'));
		});
		actionBar.createEl('button', { text: tn('statusSyncModal', 'allCloud') }, btn => {
			btn.addEventListener('click', () => this.selectAll('cloud'));
		});
		actionBar.createEl('button', { text: tn('statusSyncModal', 'smartMerge') }, btn => {
			btn.addEventListener('click', () => this.smartMerge());
		});
		actionBar.createEl('button', { text: tn('statusSyncModal', 'allSkip') }, btn => {
			btn.addEventListener('click', () => this.selectAll('skip'));
		});

		// 状态栏
		this.statusEl = contentEl.createDiv({ cls: 'bangumi-status-sync-status' });

		// 表格
		this.tableEl = contentEl.createDiv({ cls: 'bangumi-status-sync-table' });
		this.renderTable();

		// 底部按钮
		const footer = contentEl.createDiv({ cls: 'bangumi-status-sync-footer' });

		footer.createEl('button', { text: tn('statusSyncModal', 'execute'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => { void this.executeSync(); });
		});
		footer.createEl('button', { text: tn('statusSyncModal', 'cancel') }, btn => {
			btn.addEventListener('click', () => this.close());
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * 渲染表格（紧凑模式）
	 */
	private renderTable(): void {
		this.tableEl.empty();

		if (this.diffs.length === 0) {
			this.tableEl.createDiv({ text: tn('statusSyncModal', 'noDiff'), cls: 'bangumi-empty-message' });
			return;
		}

		const table = this.tableEl.createEl('table');

		// 表头
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: tn('statusSyncModal', 'subjectName') });
		headerRow.createEl('th', { text: tn('statusSyncModal', 'diffFields') });
		headerRow.createEl('th', { text: tn('statusSyncModal', 'action') });

		// 表体
		const tbody = table.createEl('tbody');

		this.diffs.forEach((diff, index) => {
			// 主行
			const row = tbody.createEl('tr', { cls: 'bangumi-status-row' });

			// 条目名称 + 差异图标
			const nameCell = row.createEl('td', { cls: 'bangumi-name-cell' });
			nameCell.createSpan({ text: diff.name_cn || diff.name || 'Unknown' });
			this.appendDiffIcons(nameCell, diff);

			// 差异字段列表
			const fieldsCell = row.createEl('td', { cls: 'bangumi-fields-cell' });
			const diffFields = this.getDiffFields(diff);
			fieldsCell.setText(diffFields.join('/'));

			// 操作按钮
			const actionCell = row.createEl('td', { cls: 'bangumi-action-cell' });
			actionCell.createEl('button', {
				text: diff.expanded ? tn('statusSyncModal', 'collapse') : tn('statusSyncModal', 'expand'),
				cls: 'bangumi-expand-btn'
			}, btn => {
				btn.addEventListener('click', () => {
					this.diffs[index].expanded = !this.diffs[index].expanded;
					this.renderTable();
				});
			});

			// 详情行（展开时显示）
			if (diff.expanded) {
				const detailRow = tbody.createEl('tr', { cls: 'bangumi-detail-row' });
				const detailCell = detailRow.createEl('td', { attr: { colspan: '3' } });

				this.renderDetailTable(detailCell, diff, index);
			}
		});
	}

	/**
	 * 添加差异图标
	 */
	private appendDiffIcons(el: HTMLElement, diff: StatusSyncDiff): void {
		const icons: string[] = [];
		if (diff.rate.hasDiff) icons.push('⭐');
		if (diff.comment.hasDiff) icons.push('📝');
		if (diff.tags.hasDiff) icons.push('🏷️');
		if (diff.status.hasDiff) icons.push('📊');
		if (diff.episodeStatus.hasDiff) icons.push('🎞️');
		if (icons.length > 0) {
			el.createSpan({ text: ' ' + icons.join(''), cls: 'bangumi-diff-icons' });
		}
	}

	/**
	 * 获取有差异的字段名称列表
	 */
	private getDiffFields(diff: StatusSyncDiff): string[] {
		const fields: string[] = [];
		if (diff.rate.hasDiff) fields.push(tn('statusSyncModal', 'fieldRate'));
		if (diff.comment.hasDiff) fields.push(tn('statusSyncModal', 'fieldComment'));
		if (diff.tags.hasDiff) fields.push(tn('statusSyncModal', 'fieldTags'));
		if (diff.status.hasDiff) fields.push(tn('statusSyncModal', 'fieldStatus'));
		if (diff.episodeStatus.hasDiff) fields.push(tn('statusSyncModal', 'fieldEpisodeStatus'));
		return fields;
	}

	/**
	 * 渲染详情表格
	 */
	private renderDetailTable(el: HTMLElement, diff: StatusSyncDiff, index: number): void {
		const detailTable = el.createEl('table', { cls: 'bangumi-detail-table' });

		// 表头
		const thead = detailTable.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: tn('statusSyncModal', 'field') });
		headerRow.createEl('th', { text: tn('statusSyncModal', 'local') });
		headerRow.createEl('th', { text: tn('statusSyncModal', 'cloud') });
		headerRow.createEl('th', { text: tn('statusSyncModal', 'decision') });

		// 表体
		const tbody = detailTable.createEl('tbody');

		// 评分行
		if (diff.rate.hasDiff) {
			this.renderFieldRow(tbody, tn('statusSyncModal', 'fieldRate'),
				diff.rate.localValue ? String(diff.rate.localValue) : tn('statusSyncModal', 'empty'),
				diff.rate.cloudValue ? String(diff.rate.cloudValue) : tn('statusSyncModal', 'empty'),
				'rate', index, false);
		}

		// 短评行
		if (diff.comment.hasDiff) {
			this.renderFieldRow(tbody, tn('statusSyncModal', 'fieldComment'),
				diff.comment.localValue || tn('statusSyncModal', 'empty'),
				diff.comment.cloudValue || tn('statusSyncModal', 'empty'),
				'comment', index, false);
		}

		// 标签行
		if (diff.tags.hasDiff) {
			this.renderFieldRow(tbody, tn('statusSyncModal', 'fieldTags'),
				diff.tags.localValue ? diff.tags.localValue.join(', ') : tn('statusSyncModal', 'empty'),
				diff.tags.cloudValue ? diff.tags.cloudValue.join(', ') : tn('statusSyncModal', 'empty'),
				'tags', index, true);
		}

		// 状态行
		if (diff.status.hasDiff) {
			this.renderFieldRow(tbody, tn('statusSyncModal', 'fieldStatus'),
				this.getStatusText(diff.status.localValue, diff.collection.subject_type),
				this.getStatusText(diff.status.cloudValue, diff.collection.subject_type),
				'status', index, false);
		}

		if (diff.episodeStatus.hasDiff) {
			this.renderFieldRow(tbody, tn('statusSyncModal', 'fieldEpisodeStatus'),
				diff.episodeStatus.localValue || tn('statusSyncModal', 'empty'),
				diff.episodeStatus.cloudValue || tn('statusSyncModal', 'empty'),
				'episodeStatus', index, false);
		}
	}

	/**
	 * 渲染单个字段行
	 */
	private renderFieldRow(
		tbody: HTMLElement,
		fieldName: string,
		localValue: string,
		cloudValue: string,
		fieldKey: 'rate' | 'comment' | 'tags' | 'status' | 'episodeStatus',
		diffIndex: number,
		supportMerge: boolean
	): void {
		const row = tbody.createEl('tr');

		row.createEl('td', { text: fieldName, cls: 'bangumi-field-name' });
		row.createEl('td', { text: localValue, cls: 'bangumi-local-value bangumi-sync-value' });
		row.createEl('td', { text: cloudValue, cls: 'bangumi-cloud-value bangumi-sync-value' });

		const decisionCell = row.createEl('td');
		const select = decisionCell.createEl('select', { cls: 'bangumi-sync-decision-select' });
		select.createEl('option', { value: 'skip', text: tn('statusSyncModal', 'skip') });
		select.createEl('option', { value: 'local', text: tn('statusSyncModal', 'keepLocal') });
		select.createEl('option', { value: 'cloud', text: tn('statusSyncModal', 'keepCloud') });
		if (supportMerge) {
			select.createEl('option', { value: 'merge', text: tn('statusSyncModal', 'merge') });
		}

		select.value = this.diffs[diffIndex][fieldKey].decision;
		select.addEventListener('change', () => {
			this.diffs[diffIndex][fieldKey].decision = select.value as FieldDecision;
		});
	}

	/**
	 * 获取状态文本
	 */
	private getStatusText(status: number | null, subjectType: number): string {
		if (status === null) return tn('statusSyncModal', 'empty');
		const validStatus = this.toValidCollectionType(status);
		if (validStatus === null) {
			return tn('statusSyncModal', 'empty');
		}
		return getCollectionStatusLabel(validStatus, subjectType, true) || tn('statusSyncModal', 'empty');
	}

	/**
	 * 全部选择
	 */
	private selectAll(decision: FieldDecision): void {
		this.diffs.forEach(diff => {
			diff.rate.decision = decision;
			diff.comment.decision = decision;
			diff.tags.decision = decision;
			diff.status.decision = decision;
			diff.episodeStatus.decision = decision === 'merge' ? 'skip' : decision;
		});
		this.renderTable();
	}

	/**
	 * 智能合并：非空值优先，标签合并所有
	 */
	private smartMerge(): void {
		this.diffs.forEach(diff => {
			if (diff.rate.hasDiff) {
				if (diff.rate.localValue && !diff.rate.cloudValue) {
					diff.rate.decision = 'local';
				} else if (!diff.rate.localValue && diff.rate.cloudValue) {
					diff.rate.decision = 'cloud';
				} else {
					diff.rate.decision = 'local';
				}
			}

			if (diff.comment.hasDiff) {
				if (diff.comment.localValue && !diff.comment.cloudValue) {
					diff.comment.decision = 'local';
				} else if (!diff.comment.localValue && diff.comment.cloudValue) {
					diff.comment.decision = 'cloud';
				} else if (diff.comment.localValue && diff.comment.cloudValue) {
					diff.comment.decision = diff.comment.localValue.length >= diff.comment.cloudValue.length ? 'local' : 'cloud';
				}
			}

			if (diff.tags.hasDiff) {
				diff.tags.decision = 'merge';
			}

			if (diff.status.hasDiff) {
				if (diff.status.localValue && !diff.status.cloudValue) {
					diff.status.decision = 'local';
				} else if (!diff.status.localValue && diff.status.cloudValue) {
					diff.status.decision = 'cloud';
				} else {
					diff.status.decision = 'local';
				}
			}

			if (diff.episodeStatus.hasDiff) {
				if (diff.episodeStatus.localValue && !diff.episodeStatus.cloudValue) {
					diff.episodeStatus.decision = 'local';
				} else if (!diff.episodeStatus.localValue && diff.episodeStatus.cloudValue) {
					diff.episodeStatus.decision = 'cloud';
				} else {
					diff.episodeStatus.decision = 'local';
				}
			}
		});
		this.renderTable();
	}

	/**
	 * 执行同步
	 */
	private async executeSync(): Promise<void> {
		this.statusEl.setText(tn('statusSyncModal', 'syncProgress'));
		let successCount = 0;
		let failCount = 0;

		for (const diff of this.diffs) {
			try {
				await this.syncItem(diff);
				successCount++;
			} catch (error) {
				failCount++;
				console.error(`[Bangumi Sync] 同步失败: ${diff.name_cn}`, error);
			}
		}

		this.statusEl.setText(tn('statusSyncModal', 'syncComplete')
			.replace('{success}', String(successCount))
			.replace('{failed}', String(failCount)));

		if (successCount > 0) {
			new Notice(tn('statusSyncModal', 'syncComplete')
				.replace('{success}', String(successCount))
				.replace('{failed}', String(failCount)));
			this.onComplete();
			this.close();
		} else {
			new Notice(tn('statusSyncModal', 'syncFailed'));
		}
	}

	/**
	 * 同步单个条目
	 */
	private async syncItem(diff: StatusSyncDiff): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(diff.localPath);
		if (!(file instanceof TFile)) {
			throw new Error('File not found');
		}

		const originalContent = await this.app.vault.read(file);
		let content = originalContent;
		const cloudUpdates: { type?: CollectionType; rate?: number; comment?: string; tags?: string[] } = {};

		// 处理评分
		if (diff.rate.hasDiff && diff.rate.decision !== 'skip') {
			if (diff.rate.decision === 'local') {
				cloudUpdates.rate = diff.rate.localValue || undefined;
			} else if (diff.rate.decision === 'cloud') {
				content = this.incrementalSync.updateRate(content, diff.rate.cloudValue);
			}
		}

		// 处理短评
		if (diff.comment.hasDiff && diff.comment.decision !== 'skip') {
			if (diff.comment.decision === 'local') {
				cloudUpdates.comment = diff.comment.localValue || '';
			} else if (diff.comment.decision === 'cloud') {
				if (diff.comment.cloudValue) {
					content = this.incrementalSync.updateComment(content, diff.comment.cloudValue);
				} else {
					content = this.incrementalSync.removeComment(content);
				}
			}
		}

		// 处理标签
		if (diff.tags.hasDiff && diff.tags.decision !== 'skip') {
			if (diff.tags.decision === 'local') {
				cloudUpdates.tags = this.incrementalSync.normalizeTags(diff.tags.localValue);
			} else if (diff.tags.decision === 'cloud') {
				if (diff.tags.cloudValue && diff.tags.cloudValue.length > 0) {
					content = this.incrementalSync.updateTags(content, this.incrementalSync.normalizeTags(diff.tags.cloudValue));
				} else {
					content = this.incrementalSync.removeTags(content);
				}
			} else if (diff.tags.decision === 'merge') {
				const mergedTags = new Set<string>();
				if (diff.tags.localValue) diff.tags.localValue.forEach(t => mergedTags.add(t));
				if (diff.tags.cloudValue) diff.tags.cloudValue.forEach(t => mergedTags.add(t));
				const mergedArray = this.incrementalSync.normalizeTags(Array.from(mergedTags));
				content = this.incrementalSync.updateTags(content, mergedArray);
				cloudUpdates.tags = mergedArray;
			}
		}

		// 处理状态
		if (diff.status.hasDiff && diff.status.decision !== 'skip') {
			if (diff.status.decision === 'local') {
				const localStatus = this.toValidCollectionType(diff.status.localValue);
				if (localStatus !== null) {
					cloudUpdates.type = localStatus;
				}
			} else if (diff.status.decision === 'cloud') {
				content = this.incrementalSync.updateStatus(content, diff.status.cloudValue as CollectionType, diff.statusFieldName);
			}
		}

		// 更新本地文件
		if (content !== originalContent) {
			await this.app.vault.process(file, () => content);
		}

		// 更新云端
		if (Object.keys(cloudUpdates).length > 0) {
			const fallbackType = this.toValidCollectionType(diff.collection.type);
			const finalUpdates = {
				...cloudUpdates,
				type: cloudUpdates.type ?? fallbackType ?? undefined,
			};
			await this.syncCloudUpdates(diff.subjectId, finalUpdates);
		}

		if (diff.episodeStatus.hasDiff && diff.episodeStatus.decision !== 'skip' && this.episodeStatusManager) {
			if (diff.episodeStatus.decision === 'local') {
				const result = await this.episodeStatusManager.syncStatusToCloud(file);
				if (result.failed > 0 && result.success === 0) {
					throw new Error(`单集状态同步到云端全部失败 (${result.failed}集)`);
				}
			} else if (diff.episodeStatus.decision === 'cloud') {
				const synced = await this.episodeStatusManager.syncStatusFromCloud(file, diff.subjectId);
				if (!synced) {
					throw new Error('单集状态从云端同步失败');
				}
			}
		}

		console.debug(`[Bangumi Sync] 已同步: ${diff.name_cn}`);
	}

	private toValidCollectionType(value: number | null | undefined): CollectionType | null {
		if (value === CollectionType.Wish ||
			value === CollectionType.Done ||
			value === CollectionType.Doing ||
			value === CollectionType.OnHold ||
			value === CollectionType.Dropped) {
			return value;
		}
		return null;
	}

	private async syncCloudUpdates(
		subjectId: number,
		updates: { type?: CollectionType; rate?: number; comment?: string; tags?: string[] }
	): Promise<void> {
		const baseType = updates.type;
		const errors: string[] = [];

		const operations: Array<{ field: string; payload: { type?: CollectionType; rate?: number; comment?: string; tags?: string[] } }> = [];

		if (updates.rate !== undefined) {
			operations.push({ field: 'rate', payload: { type: baseType, rate: updates.rate } });
		}

		if (updates.comment !== undefined) {
			operations.push({ field: 'comment', payload: { type: baseType, comment: updates.comment } });
		}

		if (updates.tags !== undefined) {
			operations.push({ field: 'tags', payload: { type: baseType, tags: updates.tags } });
		}

		if (operations.length === 0 && baseType !== undefined) {
			operations.push({ field: 'type', payload: { type: baseType } });
		}

		for (const operation of operations) {
			try {
				await this.client.updateCollection(subjectId, operation.payload);
			} catch (error) {
				console.error(`[Bangumi Sync] 云端字段同步失败: ${operation.field}`, {
					subjectId,
					payload: operation.payload,
					error,
				});
				errors.push(operation.field);
			}
		}

		if (errors.length > 0) {
			throw new Error(`云端更新失败字段: ${errors.join(', ')}`);
		}
	}
}
