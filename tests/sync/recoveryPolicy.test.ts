import { describe, expect, it } from 'vitest';
import { getRecoveryActionPolicy, getVisibleRecoveryActions } from '../../src/sync/recoveryPolicy';
import type { RecoveryRequiredState } from '../../src/sync/syncManager';

function recovery(reason: RecoveryRequiredState['reason'], withFacts = false): RecoveryRequiredState {
	return {
		reason,
		rollback: { attempted: false, changed: false, deletedCreatedFiles: 0, restoredContents: 0, restoredPaths: 0, failed: 0 },
		affectedSubjectIds: [], originalPathStates: {}, subjectExpectations: [], scanRoot: 'ACGN',
		contentExpectations: withFacts ? [{ subjectId: 1, path: 'A.md', expectedContentHash: 'a'.repeat(64), originalContentLength: 1, originalContent: 'a' }] : [],
		forbiddenPathsAfterRollback: [], resourcePathsAfterRollback: [], updatedResourceExpectations: [],
		orphanTemporaryPaths: [], renameExpectations: [], attempts: [], detectedAt: 1,
	};
}

describe('recovery action policy', () => {
	it.each(['rollback-failed', 'rescan-failed', 'state-restore-failed'] as const)('allows retry for %s', reason => {
		expect(getRecoveryActionPolicy(recovery(reason))).toMatchObject({
			allowRetryRollback: true, allowManualConfirmation: true, allowRescan: true, retryRequiresPostValidation: true,
		});
	});

	it('allows a recovered journal retry only when transaction facts exist', () => {
		expect(getRecoveryActionPolicy(recovery('journal-recovered')).allowRetryRollback).toBe(false);
		expect(getRecoveryActionPolicy(recovery('journal-recovered', true)).allowRetryRollback).toBe(true);
	});

	it.each(['orphan-temporary', 'configuration-rollback-failed'] as const)('rejects empty retry for %s', reason => {
		expect(getRecoveryActionPolicy(recovery(reason))).toMatchObject({
			allowRetryRollback: false, allowManualConfirmation: true, allowRescan: true,
		});
	});

	it('requires explicit unverifiable-risk acceptance for a corrupt journal', () => {
		expect(getRecoveryActionPolicy(recovery('journal-corrupt'))).toMatchObject({
			allowRetryRollback: false, allowManualConfirmation: true, allowRescan: true,
			requiresUnverifiableRiskAcceptance: true,
		});
	});

	it('exposes only retry migration for a legacy journal migration failure', () => {
		const state = recovery('legacy-journal-migration-failed');
		state.legacyMigration = { sourcePath: '.bangumi-sync-recovery.json' };
		expect(getRecoveryActionPolicy(state)).toMatchObject({
			allowRetryMigration: true,
			allowRetryRollback: false,
			allowRetryCleanup: false,
			allowManualConfirmation: false,
			allowRescan: false,
		});
		expect(getVisibleRecoveryActions(getRecoveryActionPolicy(state))).toEqual(['retry-migration']);
	});

	it.each([
		['journal-finalization-failed', ['retry-rollback', 'rescan']],
		['journal-cleanup-failed', ['retry-cleanup', 'rescan']],
		['rollback-failed', ['retry-rollback', 'confirm-manual', 'rescan']],
		['journal-corrupt', ['confirm-manual', 'rescan']],
		['orphan-temporary', ['confirm-manual', 'rescan']],
		['configuration-rollback-failed', ['confirm-manual', 'rescan']],
	] as const)('renders only policy-approved Recovery Center buttons for %s', (reason, expected) => {
		expect(getVisibleRecoveryActions(getRecoveryActionPolicy(recovery(reason)))).toEqual(expected);
	});
});
