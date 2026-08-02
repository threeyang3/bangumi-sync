import { describe, expect, it } from 'vitest';
import { getSyncCompletionPresentation } from '../../src/sync/syncCompletionPresentation';
import { SyncResultWithRollback } from '../../src/sync/syncStatus';

function result(completion: SyncResultWithRollback['completion'], canRollback = false): SyncResultWithRollback {
	return {
		success: completion === 'success', completion, total: 1, added: 0, skipped: 0, errors: 0,
		created: 0, updated: 0, unchanged: 0, renamed: 0, collisionResolved: 0, failed: 0,
		duration: 0, errorDetails: [], outcomes: [], warnings: [], batchFiles: [], wasCancelled: false, canRollback,
	};
}

describe('getSyncCompletionPresentation', () => {
	it('requires a decision for rollbackable partial success', () => {
		expect(getSyncCompletionPresentation(result('partial-success', true))).toEqual({
			statusKey: 'partialSuccess', severity: 'warning', showCommitButton: true,
			showRollbackButton: true, allowClose: false,
		});
	});

	it('distinguishes rolled back and rollback failed states from completion', () => {
		expect(getSyncCompletionPresentation(result('rolled-back')).statusKey).toBe('rolledBack');
		expect(getSyncCompletionPresentation(result('rollback-failed')).severity).toBe('critical');
	});
});
