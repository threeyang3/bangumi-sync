import type { RecoveryRequiredState } from './syncManager';

export interface RecoveryActionPolicy {
	allowRetryRollback: boolean;
	allowRetryCleanup: boolean;
	allowRetryMigration: boolean;
	allowManualConfirmation: boolean;
	allowRescan: boolean;
	retryRequiresPostValidation: boolean;
	requiresUnverifiableRiskAcceptance: boolean;
}

export type VisibleRecoveryAction = 'retry-rollback' | 'retry-cleanup' | 'retry-migration' | 'confirm-manual' | 'rescan';

/** Single source of truth for the Recovery Center buttons and service action policy. */
export function getVisibleRecoveryActions(policy: RecoveryActionPolicy): VisibleRecoveryAction[] {
	const actions: VisibleRecoveryAction[] = [];
	if (policy.allowRetryRollback) actions.push('retry-rollback');
	if (policy.allowRetryCleanup) actions.push('retry-cleanup');
	if (policy.allowRetryMigration) actions.push('retry-migration');
	if (policy.allowManualConfirmation) actions.push('confirm-manual');
	if (policy.allowRescan) actions.push('rescan');
	return actions;
}

export function getRecoveryActionPolicy(
	recovery: Pick<RecoveryRequiredState, 'reason' | 'renameExpectations' | 'contentExpectations' | 'forbiddenPathsAfterRollback' | 'resourcePathsAfterRollback' | 'updatedResourceExpectations'>,
): RecoveryActionPolicy {
	const hasRollbackFacts = recovery.renameExpectations.length > 0
		|| recovery.contentExpectations.length > 0
		|| recovery.forbiddenPathsAfterRollback.length > 0
		|| recovery.resourcePathsAfterRollback.length > 0
		|| recovery.updatedResourceExpectations.length > 0;
	switch (recovery.reason) {
		case 'legacy-journal-migration-failed':
			return {
				allowRetryRollback: false,
				allowRetryCleanup: false,
				allowRetryMigration: true,
				allowManualConfirmation: false,
				allowRescan: false,
				retryRequiresPostValidation: false,
				requiresUnverifiableRiskAcceptance: false,
			};
		case 'journal-cleanup-failed':
		case 'journal-finalization-failed':
			return {
				allowRetryRollback: recovery.reason === 'journal-finalization-failed',
				allowRetryCleanup: true,
				allowRetryMigration: false,
				allowManualConfirmation: false,
				allowRescan: true,
				retryRequiresPostValidation: false,
				requiresUnverifiableRiskAcceptance: false,
			};
		case 'journal-corrupt':
			return {
				allowRetryRollback: false,
				allowRetryCleanup: false,
				allowRetryMigration: false,
				allowManualConfirmation: true,
				allowRescan: true,
				retryRequiresPostValidation: true,
				requiresUnverifiableRiskAcceptance: true,
			};
		case 'orphan-temporary':
		case 'configuration-rollback-failed':
			return {
				allowRetryRollback: false,
				allowRetryCleanup: false,
				allowRetryMigration: false,
				allowManualConfirmation: true,
				allowRescan: true,
				retryRequiresPostValidation: true,
				requiresUnverifiableRiskAcceptance: false,
			};
		case 'journal-recovered':
			return {
				allowRetryRollback: hasRollbackFacts,
				allowRetryCleanup: false,
				allowRetryMigration: false,
				allowManualConfirmation: true,
				allowRescan: true,
				retryRequiresPostValidation: true,
				requiresUnverifiableRiskAcceptance: false,
			};
		default:
			return {
				allowRetryRollback: true,
				allowRetryCleanup: false,
				allowRetryMigration: false,
				allowManualConfirmation: true,
				allowRescan: true,
				retryRequiresPostValidation: true,
				requiresUnverifiableRiskAcceptance: false,
			};
	}
}
