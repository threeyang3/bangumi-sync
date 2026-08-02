import { SyncResultWithRollback } from './syncStatus';

export interface SyncCompletionPresentation {
	statusKey: 'completed' | 'partialSuccess' | 'syncFailed' | 'rolledBack' | 'rollbackFailed' | 'syncCancelled';
	severity: 'success' | 'warning' | 'error' | 'critical';
	showCommitButton: boolean;
	showRollbackButton: boolean;
	allowClose: boolean;
}

export function getSyncCompletionPresentation(result: SyncResultWithRollback): SyncCompletionPresentation {
	const pending = result.canRollback;
	if (result.completion === 'rollback-failed') {
		return { statusKey: 'rollbackFailed', severity: 'critical', showCommitButton: false, showRollbackButton: false, allowClose: true };
	}
	if (result.completion === 'rolled-back') {
		return { statusKey: 'rolledBack', severity: 'error', showCommitButton: false, showRollbackButton: false, allowClose: true };
	}
	if (result.wasCancelled) {
		return { statusKey: 'syncCancelled', severity: 'warning', showCommitButton: pending, showRollbackButton: pending, allowClose: !pending };
	}
	if (result.completion === 'partial-success') {
		return { statusKey: 'partialSuccess', severity: 'warning', showCommitButton: pending, showRollbackButton: pending, allowClose: !pending };
	}
	if (result.completion === 'failed') {
		return { statusKey: 'syncFailed', severity: 'error', showCommitButton: false, showRollbackButton: pending, allowClose: !pending };
	}
	return { statusKey: 'completed', severity: result.warnings.length > 0 ? 'warning' : 'success', showCommitButton: false, showRollbackButton: false, allowClose: true };
}
