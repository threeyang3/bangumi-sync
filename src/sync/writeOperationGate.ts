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

export type WriteOperationGuard = (operation: WriteOperation, lease?: WriteOperationLease) => void;

let activeGuard: WriteOperationGuard | null = null;

export function setWriteOperationGuard(guard: WriteOperationGuard | null): void {
	activeGuard = guard;
}

export interface WriteOperationLease { readonly token: symbol }
let activeLease: WriteOperationLease | undefined;

export function assertWriteLeaseAvailable(lease?: WriteOperationLease): void {
	if (activeLease !== lease) throw new Error('Another write operation is in progress.');
}

export function hasActiveWriteLease(): boolean { return activeLease !== undefined; }

export function assertWriteOperationAllowed(operation: WriteOperation, lease?: WriteOperationLease): void {
	assertWriteLeaseAvailable(lease);
	activeGuard?.(operation, lease);
}

export async function withWriteOperation<T>(operation: WriteOperation, action: (lease: WriteOperationLease) => Promise<T>, lease?: WriteOperationLease): Promise<T> {
	assertWriteOperationAllowed(operation, lease);
	if (lease) return action(lease);
	const owned = { token: Symbol(operation) };
	activeLease = owned;
	try { return await action(owned); }
	finally { if (activeLease === owned) activeLease = undefined; }
}
