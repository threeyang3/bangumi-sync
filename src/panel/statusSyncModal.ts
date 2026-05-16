/**
 * 状态同步弹窗
 * 统一对比本地与云端用户数据差异（评分、短评、标签、状态）
 * 支持双向同步
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import { UserCollection, CollectionType, SubjectType, getCollectionStatusLabel } from '../../common/api/types';
import { BangumiClient } from '../api/client';
import { IncrementalSync } from '../sync/incrementalSync';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import { tn } from '../i18n';
import { parseEpisodes } from '../../common/parser/episodeParser';

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

export type PlatformFieldKey = 'episodeCount' | 'chapterCount' | 'volumeCount' | 'serialState';
export type PlatformFieldDecision = 'cloud' | 'skip';

export interface PlatformFieldDiff {
	key: PlatformFieldKey;
	label: string;
	localValue: string | null;
	cloudValue: string | null;
	hasDiff: boolean;
	decision: PlatformFieldDecision;
}

export interface PlatformSyncPayload {
	serialStatus?: string | null;
	progress?: string | null;
	start?: string | null;
	end?: string | null;
	episodeCount?: number | null;
	chapterCount?: number | null;
	volumeCount?: number | null;
}

export type StatusSyncLoadState = 'pending' | 'loading' | 'ready' | 'failed';
type CloudCollectionUpdates = {
	type?: CollectionType;
	rate?: number;
	comment?: string;
	tags?: string[];
};

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
	platformFields: PlatformFieldDiff[];
	platformSyncPayload?: PlatformSyncPayload;
	hasUserDiff: boolean;
	hasPlatformDiff: boolean;
	hasAnyDiff: boolean;
	expanded: boolean;
	episodeStatusLoadState: StatusSyncLoadState;
	platformLoadState: StatusSyncLoadState;
	backgroundError: string | null;
}

/**
 * 状态同步弹窗（紧凑模式）
 */
export class StatusSyncModal extends Modal {
	private diffs: StatusSyncDiff[];
	private diffIndexBySubjectId: Map<number, number>;
	private client: BangumiClient;
	private incrementalSync: IncrementalSync;
	private episodeStatusManager: EpisodeStatusManager | null;
	private onComplete: () => void;

	private tableEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private renderTimer: number | null = null;
	private isDisposedFlag = false;
	private backgroundCompleted = 0;
	private backgroundTotal = 0;

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
		this.diffIndexBySubjectId = new Map(diffs.map((diff, index) => [diff.subjectId, index]));
		this.onComplete = onComplete;
		this.episodeStatusManager = episodeStatusManager ?? null;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.isDisposedFlag = false;

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
		this.updateStatusSummary();

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
		this.isDisposedFlag = true;
		if (this.renderTimer !== null) {
			this.getOwnerWindow().clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
		const { contentEl } = this;
		contentEl.empty();
	}

	isDisposed(): boolean {
		return this.isDisposedFlag;
	}

	updateBackgroundProgress(completed: number, total: number): void {
		if (this.isDisposedFlag) {
			return;
		}

		this.backgroundCompleted = completed;
		this.backgroundTotal = total;
		this.updateStatusSummary();
	}

	updateDiff(subjectId: number, patch: Partial<StatusSyncDiff>): void {
		if (this.isDisposedFlag) {
			return;
		}

		const diffIndex = this.diffIndexBySubjectId.get(subjectId);
		if (diffIndex === undefined) {
			return;
		}

		const diff = this.diffs[diffIndex];
		Object.assign(diff, patch);
		this.recalculateDiffState(diff);
		this.updateStatusSummary();
		this.scheduleRender();
	}

	/**
	 * 渲染表格（紧凑模式）
	 */
	private renderTable(): void {
		this.tableEl.empty();

		const visibleDiffs = this.getVisibleDiffs();

		if (visibleDiffs.length === 0) {
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

		visibleDiffs.forEach(diff => {
			const index = this.diffIndexBySubjectId.get(diff.subjectId);
			if (index === undefined) {
				return;
			}

			// 主行
			const row = tbody.createEl('tr', { cls: 'bangumi-status-row' });

			// 条目名称 + 差异图标
			const nameCell = row.createEl('td', { cls: 'bangumi-name-cell' });
			nameCell.createSpan({ text: diff.name_cn || diff.name || 'Unknown' });
			this.appendDiffIcons(nameCell, diff);

			// 差异字段列表
			const fieldsCell = row.createEl('td', { cls: 'bangumi-fields-cell' });
			const diffFields = this.getDiffFields(diff);
			fieldsCell.setText(diffFields.length > 0 ? diffFields.join('/') : this.getLoadingHint(diff));

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
		if (diff.hasPlatformDiff) icons.push('📚');
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
		for (const platformField of diff.platformFields) {
			if (platformField.hasDiff) {
				fields.push(platformField.label);
			}
		}
		return fields;
	}

	private getVisibleDiffs(): StatusSyncDiff[] {
		return this.diffs.filter(diff => diff.hasAnyDiff || this.isDiffLoading(diff));
	}

	private isDiffLoading(diff: StatusSyncDiff): boolean {
		return diff.episodeStatusLoadState !== 'ready' || diff.platformLoadState !== 'ready';
	}

	private getLoadingHint(diff: StatusSyncDiff): string {
		if (diff.backgroundError) {
			return this.getLoadStateText('failed');
		}
		if (diff.episodeStatusLoadState === 'loading' || diff.platformLoadState === 'loading') {
			return this.getLoadStateText('loading');
		}
		if (this.isDiffLoading(diff)) {
			return this.getLoadStateText('pending');
		}
		return tn('statusSyncModal', 'noDiff');
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

		if (diff.hasUserDiff) {
			this.renderSectionHeader(tbody, tn('statusSyncModal', 'userDataGroup'));
		}

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
		} else if (diff.episodeStatusLoadState !== 'ready') {
			this.renderLoadingRow(tbody, tn('statusSyncModal', 'fieldEpisodeStatus'), diff.episodeStatusLoadState);
		}

		if (diff.hasPlatformDiff) {
			this.renderSectionHeader(tbody, tn('statusSyncModal', 'platformDataGroup'));
			diff.platformFields
				.filter(field => field.hasDiff)
				.forEach(field => this.renderPlatformFieldRow(tbody, field, index));
		} else if (diff.platformLoadState !== 'ready') {
			this.renderSectionHeader(tbody, tn('statusSyncModal', 'platformDataGroup'));
			this.renderLoadingRow(tbody, tn('statusSyncModal', 'platformDataGroup'), diff.platformLoadState);
		}

		if (diff.backgroundError) {
			const row = tbody.createEl('tr');
			row.createEl('td', { text: tn('statusSyncModal', 'backgroundLoading'), cls: 'bangumi-field-name' });
			row.createEl('td', { text: diff.backgroundError, attr: { colspan: '3' } });
		}
	}

	private renderSectionHeader(tbody: HTMLElement, text: string): void {
		const row = tbody.createEl('tr', { cls: 'bangumi-detail-section-row' });
		row.createEl('td', { text, attr: { colspan: '4' }, cls: 'bangumi-field-name' });
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

	private renderPlatformFieldRow(
		tbody: HTMLElement,
		field: PlatformFieldDiff,
		diffIndex: number,
	): void {
		const row = tbody.createEl('tr');

		row.createEl('td', { text: field.label, cls: 'bangumi-field-name' });
		row.createEl('td', { text: field.localValue || tn('statusSyncModal', 'empty'), cls: 'bangumi-local-value bangumi-sync-value' });
		row.createEl('td', { text: field.cloudValue || tn('statusSyncModal', 'empty'), cls: 'bangumi-cloud-value bangumi-sync-value' });

		const decisionCell = row.createEl('td');
		const select = decisionCell.createEl('select', { cls: 'bangumi-sync-decision-select' });
		select.createEl('option', { value: 'skip', text: tn('statusSyncModal', 'skip') });
		select.createEl('option', { value: 'cloud', text: tn('statusSyncModal', 'keepCloudOnly') });
		select.value = field.decision;
		select.addEventListener('change', () => {
			const platformField = this.diffs[diffIndex].platformFields.find(item => item.key === field.key);
			if (platformField) {
				platformField.decision = select.value as PlatformFieldDecision;
			}
		});
	}

	private renderLoadingRow(tbody: HTMLElement, fieldName: string, state: StatusSyncLoadState): void {
		const row = tbody.createEl('tr');
		row.createEl('td', { text: fieldName, cls: 'bangumi-field-name' });
		row.createEl('td', { text: this.getLoadStateText(state), attr: { colspan: '3' } });
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
			diff.platformFields.forEach(field => {
				field.decision = decision === 'cloud' || decision === 'merge' ? 'cloud' : 'skip';
			});
		});
		this.updateStatusSummary();
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

			diff.platformFields.forEach(field => {
				if (field.hasDiff) {
					field.decision = 'cloud';
				}
			});
		});
		this.updateStatusSummary();
		this.renderTable();
	}

	/**
	 * 执行同步
	 */
	private async executeSync(): Promise<void> {
		this.statusEl.setText(tn('statusSyncModal', 'syncProgress'));
		let successCount = 0;
		let failCount = 0;
		const actionableDiffs = this.diffs.filter(diff => diff.hasAnyDiff);

		for (const diff of actionableDiffs) {
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

	private scheduleRender(): void {
		if (this.renderTimer !== null || this.isDisposedFlag) {
			return;
		}

		this.renderTimer = this.getOwnerWindow().setTimeout(() => {
			this.renderTimer = null;
			if (!this.isDisposedFlag) {
				this.renderTable();
			}
		}, 200);
	}

	private getOwnerWindow(): Window {
		return this.containerEl.ownerDocument.defaultView ?? window;
	}

	private updateStatusSummary(): void {
		if (!this.statusEl) {
			return;
		}

		const visibleCount = this.getVisibleDiffs().length;
		if (this.backgroundTotal > 0 && this.backgroundCompleted < this.backgroundTotal) {
			this.statusEl.setText(
				tn('statusSyncModal', 'progressSummaryLoading')
					.replace('{completed}', String(this.backgroundCompleted))
					.replace('{total}', String(this.backgroundTotal))
					.replace('{visible}', String(visibleCount))
			);
			return;
		}

		if (this.backgroundTotal > 0) {
			this.statusEl.setText(
				tn('statusSyncModal', 'progressSummaryDone')
					.replace('{completed}', String(this.backgroundCompleted))
					.replace('{total}', String(this.backgroundTotal))
					.replace('{visible}', String(visibleCount))
			);
			return;
		}

		this.statusEl.setText(
			tn('statusSyncModal', 'progressSummaryVisible')
				.replace('{visible}', String(visibleCount))
		);
	}

	private recalculateDiffState(diff: StatusSyncDiff): void {
		diff.hasUserDiff =
			diff.rate.hasDiff ||
			diff.comment.hasDiff ||
			diff.tags.hasDiff ||
			diff.status.hasDiff ||
			diff.episodeStatus.hasDiff;
		diff.hasPlatformDiff = diff.platformFields.some(field => field.hasDiff);
		diff.hasAnyDiff = diff.hasUserDiff || diff.hasPlatformDiff;
	}

	private getLoadStateText(state: StatusSyncLoadState): string {
		switch (state) {
			case 'failed':
				return tn('statusSyncModal', 'backgroundLoadFailed');
			case 'loading':
				return tn('statusSyncModal', 'loadInProgress');
			case 'pending':
				return tn('statusSyncModal', 'loadPending');
			case 'ready':
			default:
				return tn('statusSyncModal', 'noDiff');
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
		const cloudUpdates: CloudCollectionUpdates = {};

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
			if (content !== originalContent) {
				await this.app.vault.process(file, () => content);
				content = await this.app.vault.read(file);
			}

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
				content = await this.app.vault.read(file);
			}
		}

		if (diff.hasPlatformDiff && diff.platformFields.some(field => field.hasDiff && field.decision === 'cloud')) {
			content = await this.applyPlatformSync(diff, file, content);
		}

		if (content !== originalContent) {
			await this.app.vault.process(file, () => content);
		}

		console.debug(`[Bangumi Sync] 已同步: ${diff.name_cn}`);
	}

	private async applyPlatformSync(diff: StatusSyncDiff, file: TFile, content: string): Promise<string> {
		if (!diff.platformSyncPayload) {
			return content;
		}

		let nextContent = this.incrementalSync.updatePlatformMetadata(content, diff.platformSyncPayload);
		if (diff.collection.subject_type !== SubjectType.Anime && diff.collection.subject_type !== SubjectType.Real) {
			return nextContent;
		}

		const shouldRefreshEpisodeSection = diff.platformFields.some(field =>
			field.decision === 'cloud' && field.key === 'episodeCount'
		);

		if (!shouldRefreshEpisodeSection) {
			return nextContent;
		}

		const episodesResult = await this.client.getEpisodes(diff.subjectId);
		const episodes = episodesResult?.data ?? [];
		if (episodes.length === 0) {
			return nextContent;
		}

		const statusMap = new Map<number, number>();
		if (this.episodeStatusManager) {
			const localStatuses = await this.episodeStatusManager.getEpisodeStatusMap(file);
			for (const entry of localStatuses.values()) {
				statusMap.set(entry.episodeId, entry.status);
			}
		}

		const renderedEpisodes = parseEpisodes(episodes, statusMap);
		if (!renderedEpisodes) {
			return nextContent;
		}

		nextContent = this.incrementalSync.updateEpisodeSection(nextContent, renderedEpisodes);
		return nextContent;
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
		updates: CloudCollectionUpdates
	): Promise<void> {
		const hasUpdates = Object.values(updates).some(value => value !== undefined);
		if (!hasUpdates) {
			return;
		}

		try {
			await this.client.updateCollection(subjectId, updates);
		} catch (error) {
			console.error('[Bangumi Sync] 云端字段同步失败:', {
				subjectId,
				payload: updates,
				error,
			});
			throw new Error('云端用户数据更新失败');
		}
	}
}
