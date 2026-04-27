/**
 * 标签同步弹窗
 * 对比本地与云端标签差异，让用户选择保留哪个版本或合并
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import { tn, tnFormat } from '../i18n';
import { UserCollection } from '../../common/api/types';
import { BangumiClient } from '../api/client';
import { IncrementalSync } from '../sync/incrementalSync';

/**
 * 标签差异项
 */
export interface TagDiff {
	subjectId: number;
	name_cn: string;
	name: string;
	localTags: string[] | null;
	cloudTags: string[] | null;
	localPath: string;
	collection: UserCollection;
	decision: 'local' | 'cloud' | 'merge' | 'skip';
}

/**
 * 标签同步弹窗
 */
export class TagSyncModal extends Modal {
	private diffs: TagDiff[];
	private client: BangumiClient;
	private incrementalSync: IncrementalSync;
	private onComplete: () => void;

	private tableEl!: HTMLElement;
	private statusEl!: HTMLElement;

	constructor(
		app: App,
		client: BangumiClient,
		incrementalSync: IncrementalSync,
		diffs: TagDiff[],
		onComplete: () => void
	) {
		super(app);
		this.client = client;
		this.incrementalSync = incrementalSync;
		this.diffs = diffs;
		this.onComplete = onComplete;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.addClass('bangumi-tag-sync-modal');

		// 标题
		contentEl.createEl('h2', { text: tn('tagSync', 'title') });

		// 说明
		contentEl.createEl('p', {
			text: tnFormat('tagSync', 'description', { count: this.diffs.length }),
			cls: 'bangumi-sync-description'
		});

		// 操作按钮栏
		const actionBar = contentEl.createDiv({ cls: 'bangumi-tag-sync-actions' });
		actionBar.createEl('button', { text: tn('tagSync', 'allLocal') }, btn => {
			btn.addEventListener('click', () => this.selectAll('local'));
		});
		actionBar.createEl('button', { text: tn('tagSync', 'allCloud') }, btn => {
			btn.addEventListener('click', () => this.selectAll('cloud'));
		});
		actionBar.createEl('button', { text: tn('tagSync', 'allMerge') }, btn => {
			btn.addEventListener('click', () => this.selectAll('merge'));
		});
		actionBar.createEl('button', { text: tn('tagSync', 'allSkip') }, btn => {
			btn.addEventListener('click', () => this.selectAll('skip'));
		});

		// 状态栏
		this.statusEl = contentEl.createDiv({ cls: 'bangumi-tag-sync-status' });

		// 表格
		this.tableEl = contentEl.createDiv({ cls: 'bangumi-tag-sync-table' });
		this.renderTable();

		// 底部按钮
		const footer = contentEl.createDiv({ cls: 'bangumi-tag-sync-footer' });
		footer.createEl('button', { text: tn('tagSync', 'execute'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => { void this.executeSync(); });
		});
		footer.createEl('button', { text: tn('tagSync', 'cancel') }, btn => {
			btn.addEventListener('click', () => this.close());
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * 渲染表格
	 */
	private renderTable(): void {
		this.tableEl.empty();

		if (this.diffs.length === 0) {
			this.tableEl.createDiv({ text: 'No tag differences to sync', cls: 'bangumi-empty-message' });
			return;
		}

		const table = this.tableEl.createEl('table');

		// 表头
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: tn('tagSync', 'name') });
		headerRow.createEl('th', { text: tn('tagSync', 'localTags') });
		headerRow.createEl('th', { text: tn('tagSync', 'cloudTags') });
		headerRow.createEl('th', { text: tn('tagSync', 'decision') });

		// 表体
		const tbody = table.createEl('tbody');

		this.diffs.forEach((diff, index) => {
			const row = tbody.createEl('tr');

			// 条目名称
			const nameCell = row.createEl('td', { cls: 'bangumi-name-cell' });
			nameCell.createSpan({ text: diff.name_cn || diff.name || 'Unknown' });

			// 本地标签
			const localCell = row.createEl('td', { cls: 'bangumi-tag-local' });
			if (diff.localTags && diff.localTags.length > 0) {
				localCell.setText(diff.localTags.join(', '));
			} else {
				localCell.createSpan({ text: tn('tagSync', 'empty'), cls: 'bangumi-empty-tag' });
			}

			// 云端标签
			const cloudCell = row.createEl('td', { cls: 'bangumi-tag-cloud' });
			if (diff.cloudTags && diff.cloudTags.length > 0) {
				cloudCell.setText(diff.cloudTags.join(', '));
			} else {
				cloudCell.createSpan({ text: tn('tagSync', 'empty'), cls: 'bangumi-empty-tag' });
			}

			// 选择
			const selectCell = row.createEl('td');
			const select = selectCell.createEl('select');
			select.createEl('option', { value: 'skip', text: tn('tagSync', 'skipLabel') });
			select.createEl('option', { value: 'local', text: tn('tagSync', 'keepLocal') });
			select.createEl('option', { value: 'cloud', text: tn('tagSync', 'keepCloud') });
			select.createEl('option', { value: 'merge', text: tn('tagSync', 'merge') });
			select.value = diff.decision;
			select.addEventListener('change', () => {
				this.diffs[index].decision = select.value as 'local' | 'cloud' | 'merge' | 'skip';
			});
		});
	}

	/**
	 * 全部选择
	 */
	private selectAll(decision: 'local' | 'cloud' | 'merge' | 'skip'): void {
		this.diffs.forEach(diff => {
			diff.decision = decision;
		});
		this.renderTable();
	}

	/**
	 * 执行同步
	 */
	private async executeSync(): Promise<void> {
		const toSyncLocal = this.diffs.filter(d => d.decision === 'local');
		const toSyncCloud = this.diffs.filter(d => d.decision === 'cloud');
		const toMerge = this.diffs.filter(d => d.decision === 'merge');

		if (toSyncLocal.length === 0 && toSyncCloud.length === 0 && toMerge.length === 0) {
			new Notice(tn('tagSync', 'noSelection'));
			return;
		}

		this.statusEl.setText(tn('tagSync', 'progress'));
		let successCount = 0;
		let failCount = 0;

		// 同步本地到云端
		for (const diff of toSyncLocal) {
			try {
				await this.client.updateCollection(diff.subjectId, {
					tags: diff.localTags || [],
				});
				successCount++;
				console.debug(`[Bangumi Sync] 已更新云端标签: ${diff.name_cn}`);
			} catch (error) {
				failCount++;
				console.error(`[Bangumi Sync] 更新云端标签失败: ${diff.name_cn}`, error);
			}
		}

		// 同步云端到本地
		for (const diff of toSyncCloud) {
			try {
				const file = this.app.vault.getAbstractFileByPath(diff.localPath);
				if (file instanceof TFile) {
					const content = await this.app.vault.read(file);
					let newContent: string;

					if (diff.cloudTags && diff.cloudTags.length > 0) {
						newContent = this.incrementalSync.updateTags(content, diff.cloudTags);
					} else {
						newContent = this.incrementalSync.removeTags(content);
					}

					await this.app.vault.process(file, () => newContent);
					successCount++;
					console.debug(`[Bangumi Sync] 已更新本地标签: ${diff.name_cn}`);
				}
			} catch (error) {
				failCount++;
				console.error(`[Bangumi Sync] 更新本地标签失败: ${diff.name_cn}`, error);
			}
		}

		// 合并标签
		for (const diff of toMerge) {
			try {
				// 合并本地和云端标签（去重）
				const mergedTags = new Set<string>();
				if (diff.localTags) {
					diff.localTags.forEach(t => mergedTags.add(t));
				}
				if (diff.cloudTags) {
					diff.cloudTags.forEach(t => mergedTags.add(t));
				}
				const mergedArray = Array.from(mergedTags);

				// 更新本地文件
				const file = this.app.vault.getAbstractFileByPath(diff.localPath);
				if (file instanceof TFile) {
					const content = await this.app.vault.read(file);
					const newContent = this.incrementalSync.updateTags(content, mergedArray);
					await this.app.vault.process(file, () => newContent);
				}

				// 更新云端
				await this.client.updateCollection(diff.subjectId, {
					tags: mergedArray,
				});

				successCount++;
				console.debug(`[Bangumi Sync] 已合并标签: ${diff.name_cn}`);
			} catch (error) {
				failCount++;
				console.error(`[Bangumi Sync] 合并标签失败: ${diff.name_cn}`, error);
			}
		}

		this.statusEl.setText(tnFormat('tagSync', 'complete', { success: successCount, failed: failCount }));

		if (successCount > 0) {
			new Notice(tnFormat('tagSync', 'complete', { success: successCount, failed: failCount }));
			this.onComplete();
			this.close();
		} else {
			new Notice(tn('tagSync', 'failed'));
		}
	}
}
