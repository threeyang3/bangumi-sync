/**
 * 同步进度弹窗
 * 支持暂停/恢复、取消（带回滚）、后台运行
 */

import { App, Modal, Setting } from 'obsidian';
import { SyncProgress, SyncCancellationSignal, SyncResultWithRollback } from '../sync/syncStatus';
import type { PendingDecisionResult, RecoveryCheckResult } from '../sync/syncManager';
import { formatRollbackFailureDetail, getSyncCompletionPresentation, pendingDecisionAllowsClose } from '../sync/syncCompletionPresentation';
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
	private onCancelled: (() => Promise<PendingDecisionResult>) | null = null;
	private onCommitted: (() => Promise<PendingDecisionResult>) | null = null;
	private onRecoveryRetry: (() => Promise<PendingDecisionResult>) | null = null;
	private onManualRecovery: (() => Promise<RecoveryCheckResult>) | null = null;
	private isCompleted = false;
	private pendingDecision = false;
	private decisionInProgress = false;
	private decisionButtons: HTMLButtonElement[] = [];
	private pendingClosePrompt: PendingSyncDecisionModal | null = null;

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

	close(): void {
		if (this.pendingDecision) {
			this.showPendingClosePrompt();
			return;
		}
		super.close();
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
	setRollbackHandler(handler: () => Promise<PendingDecisionResult>): void {
		this.onCancelled = handler;
	}

	setCommitHandler(handler: () => Promise<PendingDecisionResult>): void {
		this.onCommitted = handler;
	}

	setRecoveryHandlers(
		retry: () => Promise<PendingDecisionResult>,
		confirmManual: () => Promise<RecoveryCheckResult>,
	): void {
		this.onRecoveryRetry = retry;
		this.onManualRecovery = confirmManual;
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
		this.decisionButtons = [];
		const presentation = getSyncCompletionPresentation(result);
		this.pendingDecision = !presentation.allowClose;

		// 隐藏操作按钮
		if (this.actionsEl) {
			this.actionsEl.addClass('bangumi-hidden');
		}

		// 显示完成区域
		if (this.completedEl) {
			this.completedEl.removeClass('bangumi-hidden');
			this.completedEl.empty();

			// 统计信息
			const statsText = tnFormat('syncModal', 'detailedStats', {
				created: result.created,
				updated: result.updated,
				unchanged: result.unchanged,
				renamed: result.renamed,
				collisionResolved: result.collisionResolved,
				skipped: result.skipped,
				failed: result.failed,
			});
			this.completedEl.createEl('p', { text: statsText, cls: 'bangumi-sync-stats' });
			if (result.rollback) {
				this.completedEl.createEl('p', {
					text: result.rollback.failed > 0
						? `${tn('syncModal', 'rollbackFailed')}: ${result.rollback.failed}`
						: tnFormat('syncModal', 'rollbackComplete', {
							deleted: result.rollback.deletedCreatedFiles,
							contents: result.rollback.restoredContents,
							paths: result.rollback.restoredPaths,
							failed: result.rollback.failed,
						}),
					cls: result.rollback.failed > 0 ? 'bangumi-sync-error' : 'bangumi-sync-stats',
				});
				if (result.rollback.failures?.length) {
					const rollbackDetails = this.completedEl.createEl('details', { cls: 'bangumi-sync-error-details' });
					rollbackDetails.createEl('summary', { text: `${tn('syncModal', 'rollbackFailed')} (${result.rollback.failures.length})` });
					const list = rollbackDetails.createEl('ul', { cls: 'bangumi-sync-error-list' });
					for (const failure of result.rollback.failures) list.createEl('li', { text: formatRollbackFailureDetail(failure) });
				}
			}

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

			if (presentation.showCommitButton || presentation.showRollbackButton) {
				this.completedEl.createEl('p', {
					text: tn('syncModal', 'pendingDecision'),
					cls: 'bangumi-sync-cancelled-info',
				});
			}
			if (result.warnings.length > 0) {
				const warningsEl = this.completedEl.createEl('details', { cls: 'bangumi-sync-warning-details' });
				warningsEl.createEl('summary', { text: `${tn('syncModal', 'warnings')} (${result.warnings.length})` });
				const listEl = warningsEl.createEl('ul');
				for (const warning of result.warnings) {
					listEl.createEl('li', { text: `${warning.operation}: ${warning.message}` });
				}
			}
			if (presentation.showCommitButton) {
				const commitBtn = this.completedEl.createEl('button', {
					cls: 'bangumi-commit-btn mod-cta', text: tn('syncModal', 'keepSuccessful'),
				});
				this.decisionButtons.push(commitBtn);
				commitBtn.addEventListener('click', () => void this.resolvePendingDecision('keep'));
			}
			if (presentation.showRollbackButton) {
				const rollbackBtn = this.completedEl.createEl('button', {
					cls: 'bangumi-rollback-btn mod-warning',
					text: tn('syncModal', 'rollbackBatch'),
				});
				this.decisionButtons.push(rollbackBtn);
				rollbackBtn.addEventListener('click', () => void this.resolvePendingDecision('rollback'));
			}
			if (result.completion === 'rollback-failed' && this.onRecoveryRetry && this.onManualRecovery) {
				const retryBtn = this.completedEl.createEl('button', {
					cls: 'bangumi-rollback-btn mod-warning', text: 'Retry recovery',
				});
				const confirmBtn = this.completedEl.createEl('button', {
					cls: 'bangumi-commit-btn', text: 'Confirm manual recovery',
				});
				this.decisionButtons.push(retryBtn, confirmBtn);
				retryBtn.addEventListener('click', () => void this.retryRecovery());
				confirmBtn.addEventListener('click', () => void this.confirmManualRecovery());
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
			} else if (result.completion === 'partial-success') {
				this.updateStatus(tn('syncModal', 'partialSuccess'));
			} else if (result.completion === 'rolled-back') {
				this.updateStatus(tn('syncModal', 'rolledBack'));
			} else if (result.completion === 'rollback-failed') {
				this.updateStatus(tn('syncModal', 'rollbackFailed'));
			} else if (result.completion === 'failed') {
				this.updateStatus(tn('notices', 'syncFailed'));
			} else {
				this.updateStatus(tn('syncModal', 'completed'));
			}
		}
	}

	private async resolvePendingDecision(decision: 'keep' | 'rollback'): Promise<PendingDecisionResult | undefined> {
		if (this.decisionInProgress) return undefined;
		const handler = decision === 'keep' ? this.onCommitted : this.onCancelled;
		if (!handler) return undefined;
		this.decisionInProgress = true;
		for (const button of this.decisionButtons) button.disabled = true;
		try {
			const resolved = await handler();
			this.pendingDecision = !pendingDecisionAllowsClose(resolved);
			if (resolved.result) this.showCompleted(resolved.result);
			return resolved;
		} finally {
			this.decisionInProgress = false;
			if (this.pendingDecision) for (const button of this.decisionButtons) button.disabled = false;
		}
	}

	private async retryRecovery(): Promise<void> {
		if (this.decisionInProgress || !this.onRecoveryRetry) return;
		this.decisionInProgress = true;
		for (const button of this.decisionButtons) button.disabled = true;
		try {
			const resolved = await this.onRecoveryRetry();
			if (resolved.result) this.showCompleted(resolved.result);
		} finally {
			this.decisionInProgress = false;
		}
	}

	private async confirmManualRecovery(): Promise<void> {
		if (this.decisionInProgress || !this.onManualRecovery) return;
		this.decisionInProgress = true;
		for (const button of this.decisionButtons) button.disabled = true;
		try {
			const check = await this.onManualRecovery();
			if (check.recovered) {
				this.pendingDecision = false;
				this.updateStatus('Recovery confirmed');
				this.completedEl?.createEl('p', { text: 'Local recovery checks passed. Sync can continue.', cls: 'bangumi-sync-stats' });
			} else if (this.completedEl) {
				const details = this.completedEl.createEl('details', { cls: 'bangumi-sync-error-details', attr: { open: '' } });
				details.createEl('summary', { text: `Recovery blockers (${check.blockingDiagnostics.length})` });
				const list = details.createEl('ul', { cls: 'bangumi-sync-error-list' });
				for (const diagnostic of check.blockingDiagnostics) list.createEl('li', { text: diagnostic });
				for (const button of this.decisionButtons) button.disabled = false;
			}
		} finally {
			this.decisionInProgress = false;
		}
	}

	private showPendingClosePrompt(): void {
		if (this.pendingClosePrompt) return;
		this.pendingClosePrompt = new PendingSyncDecisionModal(this.app, async decision => {
			if (decision === 'return') return true;
			const resolved = await this.resolvePendingDecision(decision);
			if (resolved && pendingDecisionAllowsClose(resolved)) {
				this.pendingDecision = false;
				super.close();
				return true;
			}
			return false;
		}, () => { this.pendingClosePrompt = null; });
		this.pendingClosePrompt.open();
	}

	/**
	 * 显示扫描完成状态
	 */
	showScanCompleted(checked: number, linked: number, skipped: number, failed: number, details?: { name: string; addedLinks: string[] }[]): void {
		this.isCompleted = true;

		if (this.actionsEl) {
			this.actionsEl.addClass('bangumi-hidden');
		}

		if (this.completedEl) {
			this.completedEl.removeClass('bangumi-hidden');
			this.completedEl.empty();

			this.completedEl.createEl('p', {
				text: tnFormat('syncModal', 'scanCompletedStats', {
					checked, linked, skipped, failed,
				}),
				cls: 'bangumi-sync-stats',
			});

			if (details && details.length > 0) {
				const detailsEl = this.completedEl.createEl('details', { cls: 'bangumi-sync-error-details' });
				detailsEl.createEl('summary', { text: `${tn('syncModal', 'updateDetails')} (${details.length})` });
				const listEl = detailsEl.createEl('ul', { cls: 'bangumi-sync-error-list' });
				for (const item of details) {
					listEl.createEl('li', {
						text: `${item.name} → 新增: ${item.addedLinks.join('、')}`,
					});
				}
			}

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
			this.updateStatus(tn('syncModal', 'scanCompleted'));
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

class PendingSyncDecisionModal extends Modal {
	private resolving = false;
	constructor(
		app: App,
		private readonly decide: (decision: 'keep' | 'rollback' | 'return') => Promise<boolean>,
		private readonly closed: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		new Setting(this.contentEl).setName(tn('syncModal', 'pendingDecision')).setHeading();
		const actions = this.contentEl.createDiv({ cls: 'bangumi-sync-actions' });
		for (const [decision, label, cls] of [
			['keep', tn('syncModal', 'keepSuccessful'), 'mod-cta'],
			['rollback', tn('syncModal', 'rollbackBatch'), 'mod-warning'],
			['return', tn('syncModal', 'returnToResult'), ''],
		] as const) {
			const button = actions.createEl('button', { text: label, cls });
			button.addEventListener('click', () => void (async () => {
				if (this.resolving) return;
				this.resolving = true;
				for (const child of Array.from(actions.querySelectorAll('button'))) child.disabled = true;
				const shouldClose = await this.decide(decision);
				if (shouldClose) this.close();
				else {
					this.resolving = false;
					for (const child of Array.from(actions.querySelectorAll('button'))) child.disabled = false;
				}
			})());
		}
	}

	onClose(): void {
		this.closed();
	}
}
