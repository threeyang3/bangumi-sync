import { App, Modal, Setting } from 'obsidian';
import { tn } from '../i18n';
import type { TranslationStrings } from '../i18n';
import type {
	RecoveryAction,
	RecoveryActionResult,
	RecoveryDiagnostic,
	RecoveryAttempt,
	RecoveryRequiredState,
	RecoveryStateListener,
} from '../sync/syncManager';
import { getRecoveryActionPolicy, getVisibleRecoveryActions } from '../sync/recoveryPolicy';

export interface RecoveryCenterHandlers {
	getRecovery: () => RecoveryRequiredState | null;
	retryRollback: () => Promise<RecoveryActionResult>;
	retryCleanup: () => Promise<RecoveryActionResult>;
	retryMigration: () => Promise<RecoveryActionResult>;
	confirmManual: (acceptUnverifiableJournalRisk?: boolean) => Promise<RecoveryActionResult>;
	rescan: () => Promise<RecoveryActionResult>;
	subscribe: (listener: RecoveryStateListener) => () => void;
}

export class RecoveryCenterModal extends Modal {
	private working = false;
	private lastResult: RecoveryActionResult | null = null;
	private actionError: string | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(app: App, private readonly handlers: RecoveryCenterHandlers) {
		super(app);
	}

	onOpen(): void {
		this.unsubscribe = this.handlers.subscribe(() => this.render());
		this.render();
	}

	onClose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private render(): void {
		this.contentEl.empty();
		new Setting(this.contentEl).setName(tn('recoveryCenter', 'title')).setHeading();
		const recovery = this.handlers.getRecovery();
		if (!recovery) {
			this.contentEl.createEl('p', { text: tn('recoveryCenter', 'noRecovery'), cls: 'bangumi-sync-stats' });
			if (this.lastResult?.recovered) {
				this.contentEl.createEl('p', { text: tn('recoveryCenter', 'recovered'), cls: 'bangumi-sync-stats' });
				this.contentEl.createEl('p', { text: `${tn('recoveryCenter', 'currentFailures')}: ${this.lastResult.rollback?.failed ?? 0}`, cls: 'bangumi-sync-stats' });
				this.renderAttemptHistory(this.lastResult.attempts ?? []);
			}
			this.addCloseButton();
			return;
		}

		this.contentEl.createEl('p', { text: `${tn('recoveryCenter', 'cause')}: ${recovery.reason}` });
		this.contentEl.createEl('p', { text: `${tn('recoveryCenter', 'detectedAt')}: ${new Date(recovery.detectedAt).toLocaleString()}` });
		this.contentEl.createEl('p', { text: `${tn('recoveryCenter', 'affectedSubjects')}: ${recovery.affectedSubjectIds.join(', ')}` });
		if (recovery.orphanTemporaryPaths.length > 0) {
			this.contentEl.createEl('p', { text: `${tn('recoveryCenter', 'orphanPaths')}: ${recovery.orphanTemporaryPaths.join(', ')}` });
		}
		if (recovery.legacyMigration) this.contentEl.createEl('p', { text: `${tn('recoveryCenter', 'legacyMigrationSource')}: ${recovery.legacyMigration.sourcePath}` });
		const policy = getRecoveryActionPolicy(recovery);
		if (policy.requiresUnverifiableRiskAcceptance) {
			this.contentEl.createEl('p', { text: tn('recoveryCenter', 'factsInsufficient'), cls: 'bangumi-sync-error' });
		}

		const expectations = this.contentEl.createEl('details', { attr: { open: '' } });
		expectations.createEl('summary', { text: `${tn('recoveryCenter', 'expectations')} (${recovery.subjectExpectations.length})` });
		const expectationList = expectations.createEl('ul');
		for (const item of recovery.subjectExpectations) {
			expectationList.createEl('li', {
				text: `${item.subjectId}: ${item.expectedToExist ? tn('recoveryCenter', 'expectedPresent') : tn('recoveryCenter', 'expectedAbsent')}${item.expectedPath ? ` — ${item.expectedPath}` : ''}`,
			});
		}

		const latest = recovery.latestAttempt;
		if (latest) {
			this.contentEl.createEl('p', { text: `${tn('recoveryCenter', 'latestAttempt')}: ${latest.action} — ${latest.status}` });
		}
		this.renderAttemptHistory(recovery.attempts);

		const diagnostics = this.lastResult?.diagnostics ?? latest?.diagnostics ?? [];
		if (diagnostics.length > 0) this.renderDiagnostics(diagnostics);
		if (this.lastResult && !this.lastResult.recovered) {
			this.contentEl.createEl('p', {
				text: this.lastResult.status === 'failed' ? tn('recoveryCenter', 'actionFailed') : tn('recoveryCenter', 'blocked'),
				cls: 'bangumi-sync-error',
			});
		}
		if (this.actionError) this.contentEl.createEl('p', { text: `${tn('recoveryCenter', 'actionFailed')}: ${this.actionError}`, cls: 'bangumi-sync-error' });
		if (this.working) this.contentEl.createEl('p', { text: tn('recoveryCenter', 'working') });

		const actions = this.contentEl.createDiv({ cls: 'bangumi-sync-actions' });
		for (const action of getVisibleRecoveryActions(policy)) {
			const label = action === 'retry-rollback' ? tn('recoveryCenter', 'retryRollback')
				: action === 'retry-cleanup' ? tn('recoveryCenter', 'retryCleanup')
					: action === 'retry-migration' ? tn('recoveryCenter', 'retryMigration')
				: action === 'confirm-manual' ? tn('recoveryCenter', 'confirmManual')
					: tn('recoveryCenter', 'rescan');
			const cls = action === 'retry-rollback' || action === 'retry-cleanup' ? 'mod-warning' : action === 'confirm-manual' ? 'mod-cta' : '';
			this.addActionButton(actions, label, action, cls);
		}
		this.addCloseButton(actions);
	}

	private renderAttemptHistory(attempts: readonly RecoveryAttempt[]): void {
		if (attempts.length === 0) return;
		const history = this.contentEl.createEl('details');
		history.createEl('summary', { text: `${tn('recoveryCenter', 'attemptHistory')} (${attempts.length})` });
		const list = history.createEl('ul');
		for (const attempt of attempts) list.createEl('li', { text: `${new Date(attempt.finishedAt).toLocaleString()} — ${attempt.action}: ${attempt.status}` });
	}

	private addActionButton(container: HTMLElement, label: string, action: Exclude<RecoveryAction, 'automatic-rollback'>, cls: string): void {
		const button = container.createEl('button', { text: label, cls });
		button.disabled = this.working;
		button.addEventListener('click', () => void this.runAction(action));
	}

	private addCloseButton(container: HTMLElement = this.contentEl): void {
		const button = container.createEl('button', { text: tn('recoveryCenter', 'close') });
		button.disabled = this.working;
		button.addEventListener('click', () => this.close());
	}

	private async runAction(action: Exclude<RecoveryAction, 'automatic-rollback'>): Promise<void> {
		if (this.working) return;
		this.working = true;
		this.actionError = null;
		this.render();
		try {
			const recovery = this.handlers.getRecovery();
			const acceptsRisk = action === 'confirm-manual' && recovery?.reason === 'journal-corrupt'
				? this.contentEl.ownerDocument.defaultView?.confirm(tn('recoveryCenter', 'corruptRiskPrompt')) === true
				: false;
			if (action === 'confirm-manual' && recovery?.reason === 'journal-corrupt' && !acceptsRisk) return;
			this.lastResult = action === 'retry-rollback'
				? await this.handlers.retryRollback()
				: action === 'retry-cleanup'
					? await this.handlers.retryCleanup()
					: action === 'retry-migration'
						? await this.handlers.retryMigration()
				: action === 'confirm-manual'
					? await this.handlers.confirmManual(acceptsRisk)
					: await this.handlers.rescan();
		} catch (error) {
			this.actionError = error instanceof Error ? error.message : String(error);
		} finally {
			this.working = false;
			this.render();
		}
	}

	private renderDiagnostics(diagnostics: readonly RecoveryDiagnostic[]): void {
		const details = this.contentEl.createEl('details', { cls: 'bangumi-sync-error-details', attr: { open: '' } });
		details.createEl('summary', { text: `${tn('recoveryCenter', 'diagnostics')} (${diagnostics.length})` });
		const list = details.createEl('ul', { cls: 'bangumi-sync-error-list' });
		for (const diagnostic of diagnostics) list.createEl('li', { text: this.formatDiagnostic(diagnostic) });
	}

	private formatDiagnostic(diagnostic: RecoveryDiagnostic): string {
		const labels: Record<RecoveryDiagnostic['code'], keyof TranslationStrings['recoveryCenter']> = {
			'rollback-step-failed': 'diagnosticRollbackStepFailed',
			'rescan-failed': 'diagnosticRescanFailed',
			'state-restore-failed': 'diagnosticStateRestoreFailed',
			'persisted-state-mismatch': 'diagnosticPersistedStateMismatch',
			'incremental-state-mismatch': 'diagnosticIncrementalStateMismatch',
			'blocking-local-file': 'diagnosticBlockingLocalFile',
			'duplicate-subject-id': 'diagnosticDuplicateSubjectId',
			'temporary-file': 'diagnosticTemporaryFile',
			'unexpected-subject-file': 'diagnosticUnexpectedSubjectFile',
			'missing-subject-file': 'diagnosticMissingSubjectFile',
			'subject-path-mismatch': 'diagnosticSubjectPathMismatch',
			'subject-identity-mismatch': 'diagnosticSubjectIdentityMismatch',
			'content-mismatch': 'diagnosticContentMismatch',
			'content-file-missing': 'diagnosticContentFileMissing',
			'unexpected-created-path': 'diagnosticUnexpectedCreatedPath',
		};
		const context = 'path' in diagnostic ? diagnostic.path
			: 'actualPath' in diagnostic ? diagnostic.actualPath
				: 'expectedPath' in diagnostic && diagnostic.expectedPath ? diagnostic.expectedPath
					: 'subjectId' in diagnostic ? String(diagnostic.subjectId) : '';
		return `${tn('recoveryCenter', labels[diagnostic.code])}${context ? ` — ${context}` : ''}: ${diagnostic.message}`;
	}
}
