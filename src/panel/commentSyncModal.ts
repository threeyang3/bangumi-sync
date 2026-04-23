/**
 * 短评同步弹窗
 * 对比本地与云端短评差异，让用户选择保留哪个版本
 */

import { App, Modal, Notice, TFile } from 'obsidian';
import { UserCollection } from '../../common/api/types';
import { BangumiClient } from '../api/client';
import { IncrementalSync } from '../sync/incrementalSync';

/**
 * 短评差异项
 */
export interface CommentDiff {
	subjectId: number;
	name_cn: string;
	name: string;
	localComment: string | null;
	cloudComment: string | null;
	localPath: string;
	collection: UserCollection;
	decision: 'local' | 'cloud' | 'skip';
}

/**
 * 短评同步弹窗
 */
export class CommentSyncModal extends Modal {
	private diffs: CommentDiff[];
	private client: BangumiClient;
	private incrementalSync: IncrementalSync;
	private onComplete: () => void;

	private tableEl: HTMLElement;
	private statusEl: HTMLElement;

	constructor(
		app: App,
		client: BangumiClient,
		incrementalSync: IncrementalSync,
		diffs: CommentDiff[],
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

		contentEl.addClass('bangumi-comment-sync-modal');

		// 标题
		contentEl.createEl('h2', { text: '短评同步' });

		// 说明
		contentEl.createEl('p', {
			text: `发现 ${this.diffs.length} 个条目的短评存在差异，请选择要保留的版本。`,
			cls: 'bangumi-sync-description'
		});

		// 操作按钮栏
		const actionBar = contentEl.createDiv({ cls: 'bangumi-comment-sync-actions' });
		actionBar.createEl('button', { text: '全部保留本地' }, btn => {
			btn.addEventListener('click', () => this.selectAll('local'));
		});
		actionBar.createEl('button', { text: '全部保留云端' }, btn => {
			btn.addEventListener('click', () => this.selectAll('cloud'));
		});
		actionBar.createEl('button', { text: '全部跳过' }, btn => {
			btn.addEventListener('click', () => this.selectAll('skip'));
		});

		// 状态栏
		this.statusEl = contentEl.createDiv({ cls: 'bangumi-comment-sync-status' });

		// 表格
		this.tableEl = contentEl.createDiv({ cls: 'bangumi-comment-sync-table' });
		this.renderTable();

		// 底部按钮
		const footer = contentEl.createDiv({ cls: 'bangumi-comment-sync-footer' });
		footer.createEl('button', { text: '执行同步', cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => { void this.executeSync(); });
		});
		footer.createEl('button', { text: '取消' }, btn => {
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
			this.tableEl.createDiv({ text: '没有需要同步的短评差异', cls: 'bangumi-empty-message' });
			return;
		}

		const table = this.tableEl.createEl('table');

		// 表头
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '条目' });
		headerRow.createEl('th', { text: '本地短评' });
		headerRow.createEl('th', { text: '云端短评' });
		headerRow.createEl('th', { text: '选择' });

		// 表体
		const tbody = table.createEl('tbody');

		this.diffs.forEach((diff, index) => {
			const row = tbody.createEl('tr');

			// 条目名称
			const nameCell = row.createEl('td', { cls: 'bangumi-name-cell' });
			nameCell.createSpan({ text: diff.name_cn || diff.name || '未知' });

			// 本地短评
			const localCell = row.createEl('td', { cls: 'bangumi-comment-local' });
			if (diff.localComment) {
				localCell.setText(this.truncate(diff.localComment, 50));
				localCell.setAttribute('title', diff.localComment);
			} else {
				localCell.createSpan({ text: '(空)', cls: 'bangumi-empty-comment' });
			}

			// 云端短评
			const cloudCell = row.createEl('td', { cls: 'bangumi-comment-cloud' });
			if (diff.cloudComment) {
				cloudCell.setText(this.truncate(diff.cloudComment, 50));
				cloudCell.setAttribute('title', diff.cloudComment);
			} else {
				cloudCell.createSpan({ text: '(空)', cls: 'bangumi-empty-comment' });
			}

			// 选择
			const selectCell = row.createEl('td');
			const select = selectCell.createEl('select');
			select.createEl('option', { value: 'skip', text: '跳过' });
			select.createEl('option', { value: 'local', text: '保留本地' });
			select.createEl('option', { value: 'cloud', text: '保留云端' });
			select.value = diff.decision;
			select.addEventListener('change', () => {
				this.diffs[index].decision = select.value as 'local' | 'cloud' | 'skip';
			});
		});
	}

	/**
	 * 全部选择
	 */
	private selectAll(decision: 'local' | 'cloud' | 'skip'): void {
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

		if (toSyncLocal.length === 0 && toSyncCloud.length === 0) {
			new Notice('没有选择要同步的条目');
			return;
		}

		this.statusEl.setText('正在同步...');
		let successCount = 0;
		let failCount = 0;

		// 同步本地到云端
		for (const diff of toSyncLocal) {
			try {
				await this.client.updateCollection(diff.subjectId, {
					comment: diff.localComment || '',
				});
				successCount++;
				console.debug(`[Bangumi Sync] 已更新云端短评: ${diff.name_cn}`);
			} catch (error) {
				failCount++;
				console.error(`[Bangumi Sync] 更新云端短评失败: ${diff.name_cn}`, error);
			}
		}

		// 同步云端到本地
		for (const diff of toSyncCloud) {
			try {
				const file = this.app.vault.getAbstractFileByPath(diff.localPath);
				if (file instanceof TFile) {
					const content = await this.app.vault.read(file);
					let newContent: string;

					if (diff.cloudComment) {
						newContent = this.incrementalSync.updateComment(content, diff.cloudComment);
					} else {
						newContent = this.incrementalSync.removeComment(content);
					}

					await this.app.vault.modify(file, newContent);
					successCount++;
					console.debug(`[Bangumi Sync] 已更新本地短评: ${diff.name_cn}`);
				}
			} catch (error) {
				failCount++;
				console.error(`[Bangumi Sync] 更新本地短评失败: ${diff.name_cn}`, error);
			}
		}

		this.statusEl.setText(`同步完成：成功 ${successCount} 个，失败 ${failCount} 个`);

		if (successCount > 0) {
			new Notice(`短评同步完成：成功 ${successCount} 个，失败 ${failCount} 个`);
			this.onComplete();
			this.close();
		} else {
			new Notice('同步失败，请检查网络连接');
		}
	}

	/**
	 * 截断文本
	 */
	private truncate(text: string, maxLen: number): string {
		if (text.length <= maxLen) {
			return text;
		}
		return text.substring(0, maxLen) + '...';
	}
}
