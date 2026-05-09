/**
 * 同步进度弹窗
 * 支持暂停/恢复、取消（带回滚）、后台运行
 */

import { App, Modal, Setting } from 'obsidian';
import { SyncProgress, SyncCancellationSignal, SyncResultWithRollback } from '../sync/syncStatus';
import { tn, tnFormat } from '../i18n';

export class SyncModal extends Modal {
	private progress: SyncProgress;
	private cancellationSignal: SyncCancellationSignal;
	private progressBar: HTMLElement | null = null;
	private statusText: HTMLElement | null = null;
	private actionsEl: HTMLElement | null = null;
	private pauseBtn: HTMLButtonElement | null = null;
	private cancelBtn: HTMLButtonElement | null = null;
	private completedEl: HTMLElement | null = null;
	private onCancelled: (() => Promise<{ deleted: number; failed: number }>) | null = null;
	private isCompleted = false;

	constructor(app: App, cancellationSignal: SyncCancellationSignal) {
		super(app);
		this.cancellationSignal = cancellationSignal;
		this.progress = {
			current: 0,
			total: 0,
			status: 'preparing',
		};
	}

	onOpen(): void {
		const { contentEl } = this;

		new Setting(contentEl).setName(tn('syncModal', 'title')).setHeading();

		// 进度条容器
		this.progressBar = contentEl.createDiv({ cls: 'bangumi-progress-bar' });
		this.progressBar.createEl('div', { cls: 'bangumi-progress-fill' });

		// 状态文本
		this.statusText = contentEl.createDiv({ cls: 'bangumi-sync-status' });
		this.updateStatus(tn('syncModal', 'preparing'));

		// 按钮区域
		this.actionsEl = contentEl.createDiv({ cls: 'bangumi-sync-actions' });

		this.pauseBtn = this.actionsEl.createEl('button', {
			cls: 'bangumi-sync-pause-btn bangumi-action-btn',
			text: tn('syncModal', 'pause'),
		});
		this.pauseBtn.addEventListener('click', () => this.togglePause());

		this.cancelBtn = this.actionsEl.createEl('button', {
			cls: 'bangumi-sync-cancel-btn bangumi-action-btn',
			text: tn('syncModal', 'cancel'),
		});
		this.cancelBtn.addEventListener('click', () => void this.handleCancel());

		// 完成区域（初始隐藏）
		this.completedEl = contentEl.createDiv({ cls: 'bangumi-sync-completed bangumi-hidden' });
	}

	onClose(): void {
		// 关闭弹窗不取消同步，只隐藏弹窗
		// 同步在后台继续运行，状态栏显示进度
		if (!this.isCompleted) {
			this.contentEl.empty();
		}
	}

	/**
	 * 切换暂停/恢复
	 */
	private togglePause(): void {
		if (this.cancellationSignal.paused) {
			this.cancellationSignal.resume();
			if (this.pauseBtn) {
				this.pauseBtn.setText(tn('syncModal', 'pause'));
			}
			this.progressBar?.removeClass('bangumi-sync-paused');
			this.updateStatus(tn('syncModal', 'processing'));
		} else {
			this.cancellationSignal.pause();
			if (this.pauseBtn) {
				this.pauseBtn.setText(tn('syncModal', 'resume'));
			}
			this.progressBar?.addClass('bangumi-sync-paused');
			this.updateStatus(tn('syncModal', 'paused'));
		}
	}

	/**
	 * 处理取消
	 */
	private handleCancel(): void {
		this.cancellationSignal.cancel();
		if (this.pauseBtn) {
			this.pauseBtn.disabled = true;
		}
		if (this.cancelBtn) {
			this.cancelBtn.disabled = true;
			this.cancelBtn.setText(tn('syncModal', 'cancel') + '...');
		}
		this.updateStatus(tn('notices', 'syncCancelled'));
	}

	/**
	 * 设置回滚回调
	 */
	setRollbackHandler(handler: () => Promise<{ deleted: number; failed: number }>): void {
		this.onCancelled = handler;
	}

	/**
	 * 更新进度
	 */
	updateProgress(progress: SyncProgress): void {
		if (this.isCompleted) return;
		this.progress = progress;

		// 更新进度条
		if (this.progressBar && progress.total > 0) {
			const percent = Math.floor((progress.current / progress.total) * 100);
			const fill = this.progressBar.querySelector('.bangumi-progress-fill') as HTMLElement;
			if (fill) {
				fill.setCssProps({ '--bangumi-progress-width': `${percent}%` });
			}
		}

		// 更新状态文本（暂停状态下不覆盖）
		if (!this.cancellationSignal.paused && progress.message) {
			this.updateStatus(progress.message);
		}
	}

	/**
	 * 显示同步完成状态
	 */
	showCompleted(result: SyncResultWithRollback): void {
		this.isCompleted = true;

		// 隐藏操作按钮
		if (this.actionsEl) {
			this.actionsEl.addClass('bangumi-hidden');
		}

		// 显示完成区域
		if (this.completedEl) {
			this.completedEl.removeClass('bangumi-hidden');
			this.completedEl.empty();

			// 统计信息
			const statsText = tnFormat('syncModal', 'completedStats', {
				added: result.added,
				skipped: result.skipped,
				errors: result.errors,
			});
			this.completedEl.createEl('p', { text: statsText, cls: 'bangumi-sync-stats' });

			// 错误详情（可折叠）
			if (result.errorDetails.length > 0) {
				const detailsEl = this.completedEl.createEl('details', { cls: 'bangumi-sync-error-details' });
				detailsEl.createEl('summary', {
					text: `${tn('syncModal', 'errorDetails')} (${result.errorDetails.length})`,
				});
				const listEl = detailsEl.createEl('ul', { cls: 'bangumi-sync-error-list' });
				for (const detail of result.errorDetails) {
					listEl.createEl('li', { text: detail });
				}
			}

			// 如果是取消状态，显示回滚按钮
			if (result.wasCancelled && result.batchFiles.some(f => f.wasNewlyCreated)) {
				const newFileCount = result.batchFiles.filter(f => f.wasNewlyCreated).length;
				this.completedEl.createEl('p', {
					text: `${tn('notices', 'syncCancelled')} (${newFileCount} files)`,
					cls: 'bangumi-sync-cancelled-info',
				});

				const rollbackBtn = this.completedEl.createEl('button', {
					cls: 'bangumi-rollback-btn mod-warning',
					text: tn('syncModal', 'rollback'),
				});
				rollbackBtn.addEventListener('click', () => void (async () => {
					rollbackBtn.disabled = true;
					rollbackBtn.setText('...');
					if (this.onCancelled) {
						const rollbackResult = await this.onCancelled();
						rollbackBtn.setText(tnFormat('syncModal', 'rollbackComplete', {
							deleted: rollbackResult.deleted,
							failed: rollbackResult.failed,
						}));
					}
				})());
			}

			// 关闭按钮
			const closeBtn = this.completedEl.createEl('button', {
				cls: 'bangumi-sync-close-btn mod-cta',
				text: tn('syncModal', 'completed'),
			});
			closeBtn.addEventListener('click', () => this.close());
		}

		// 更新进度条为完成状态
		if (this.progressBar) {
			this.progressBar.addClass('bangumi-progress-complete');
		}
		if (this.statusText) {
			if (result.wasCancelled) {
				this.updateStatus(tn('notices', 'syncCancelled'));
			} else {
				this.updateStatus(tn('syncModal', 'completed'));
			}
		}
	}

	/**
	 * 显示扫描完成状态
	 */
	showScanCompleted(checked: number, linked: number, skipped: number, failed: number): void {
		this.isCompleted = true;

		if (this.actionsEl) {
			this.actionsEl.addClass('bangumi-hidden');
		}

		if (this.completedEl) {
			this.completedEl.removeClass('bangumi-hidden');
			this.completedEl.empty();

			this.completedEl.createEl('p', {
				text: `检查 ${checked} 个条目，更新 ${linked} 个，跳过 ${skipped} 个，失败 ${failed} 个`,
				cls: 'bangumi-sync-stats',
			});

			const closeBtn = this.completedEl.createEl('button', {
				cls: 'bangumi-sync-close-btn mod-cta',
				text: tn('syncModal', 'completed'),
			});
			closeBtn.addEventListener('click', () => this.close());
		}

		if (this.progressBar) {
			this.progressBar.addClass('bangumi-progress-complete');
		}
		if (this.statusText) {
			this.updateStatus('扫描关联完成');
		}
	}

	/**
	 * 更新状态文本
	 */
	private updateStatus(text: string): void {
		if (this.statusText) {
			this.statusText.setText(text);
		}
	}
}
