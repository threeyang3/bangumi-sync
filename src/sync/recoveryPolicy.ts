import type { RecoveryRequiredState } from './syncManager';

export interface RecoveryActionPolicy {
	allowRetryRollback: boolean;
	allowManualConfirmation: boolean;
	allowRescan: boolean;
	retryRequiresPostValidation: boolean;
	requiresUnverifiableRiskAcceptance: boolean;
}

export type VisibleRecoveryAction = 'retry-rollback' | 'confirm-manual' | 'rescan';

/** Single source of truth for the Recovery Center buttons and service action policy. */
export function getVisibleRecoveryActions(policy: RecoveryActionPolicy): VisibleRecoveryAction[] {
	const actions: VisibleRecoveryAction[] = [];
	if (policy.allowRetryRollback) actions.push('retry-rollback');
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
		case 'journal-corrupt':
			return {
				allowRetryRollback: false,
				allowManualConfirmation: true,
				allowRescan: true,
				retryRequiresPostValidation: true,
				requiresUnverifiableRiskAcceptance: true,
			};
		case 'orphan-temporary':
		case 'configuration-rollback-failed':
			return {
				allowRetryRollback: false,
				allowManualConfirmation: true,
				allowRescan: true,
				retryRequiresPostValidation: true,
				requiresUnverifiableRiskAcceptance: false,
			};
		case 'journal-recovered':
			return {
				allowRetryRollback: hasRollbackFacts,
				allowManualConfirmation: true,
				allowRescan: true,
				retryRequiresPostValidation: true,
				requiresUnverifiableRiskAcceptance: false,
			};
		default:
			return {
				allowRetryRollback: true,
				allowManualConfirmation: true,
				allowRescan: true,
				retryRequiresPostValidation: true,
				requiresUnverifiableRiskAcceptance: false,
			};
	}
}
