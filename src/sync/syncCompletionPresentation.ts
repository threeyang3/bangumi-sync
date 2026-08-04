import { SyncResultWithRollback } from './syncStatus';
import type { PendingDecisionResult } from './syncManager';
import type { RollbackFailure } from './syncTransaction';

export interface SyncCompletionPresentation {
	statusKey: 'completed' | 'partialSuccess' | 'syncFailed' | 'rolledBack' | 'rollbackFailed' | 'syncCancelled';
	severity: 'success' | 'warning' | 'error' | 'critical';
	showCommitButton: boolean;
	showRollbackButton: boolean;
	allowClose: boolean;
}

export function pendingDecisionAllowsClose(decision: PendingDecisionResult): boolean {
	return decision.status === 'committed'
		|| decision.status === 'rolled-back'
		|| decision.status === 'rollback-failed'
		|| decision.status === 'no-pending';
}

export function formatRollbackFailureDetail(failure: RollbackFailure): string {
	return `${failure.operation}: ${failure.path} — ${failure.message}`;
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
