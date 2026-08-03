export type WriteOperation =
	| 'collection-sync'
	| 'single-subject-sync'
	| 'path-migration'
	| 'cover-download'
	| 'related-link-scan'
	| 'status-sync'
	| 'batch-edit'
	| 'user-data-import'
	| 'user-data-export'
	| 'episode-status'
	| 'episode-comment'
	| 'subject-note'
	| 'plugin-settings'
	| 'transaction-sensitive-settings';

export type WriteOperationGuard = (operation: WriteOperation) => void;

let activeGuard: WriteOperationGuard | null = null;

export function setWriteOperationGuard(guard: WriteOperationGuard | null): void {
	activeGuard = guard;
}

export function assertWriteOperationAllowed(operation: WriteOperation): void {
	activeGuard?.(operation);
}
