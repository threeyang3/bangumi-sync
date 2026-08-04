import { normalizePathCollisionKey } from '../../common/file/pathUtils';
import type { LocalSubjectRegistry, SubjectPathState } from './localSubjectRegistry';

export interface RecoverySubjectExpectation {
	subjectId: number;
	expectedToExist: boolean;
	expectedPath?: string;
	expectedSubjectId?: number;
}

export type RecoveryDiagnostic =
	| { code: 'rollback-step-failed'; operation: string; path: string; message: string }
	| { code: 'rescan-failed'; message: string }
	| { code: 'state-restore-failed'; message: string }
	| { code: 'persisted-state-mismatch'; message: string }
	| { code: 'incremental-state-mismatch'; message: string }
	| { code: 'blocking-local-file'; path: string; message: string }
	| { code: 'duplicate-subject-id'; subjectId: number; paths: string[]; message: string }
	| { code: 'temporary-file'; path: string; message: string }
	| { code: 'unexpected-subject-file'; subjectId: number; actualPath: string; message: string }
	| { code: 'missing-subject-file'; subjectId: number; expectedPath?: string; message: string }
	| { code: 'subject-path-mismatch'; subjectId: number; expectedPath: string; actualPath: string; message: string }
	| { code: 'subject-identity-mismatch'; subjectId: number; expectedPath: string; actualSubjectId: number; message: string }
	| { code: 'content-mismatch'; subjectId: number; path: string; expectedHash: string; actualHash: string; message: string }
	| { code: 'content-file-missing'; subjectId: number; path: string; message: string }
	| { code: 'unexpected-created-path'; path: string; actualSubjectId?: number; message: string };

export function collectSubjectExpectationDiagnostics(
	expectations: readonly RecoverySubjectExpectation[],
	registry: Pick<LocalSubjectRegistry, 'getById' | 'getPathOwner'>,
): RecoveryDiagnostic[] {
	const diagnostics: RecoveryDiagnostic[] = [];
	for (const expectation of expectations) {
		const record = registry.getById(expectation.subjectId);
		if (!expectation.expectedToExist) {
			if (record) {
				diagnostics.push({
					code: 'unexpected-subject-file',
					subjectId: expectation.subjectId,
					actualPath: record.path,
					message: `Subject ${expectation.subjectId} was absent before the batch but exists at ${record.path}.`,
				});
			}
			continue;
		}

		const expectedPath = expectation.expectedPath;
		if (expectedPath) {
			const actualSubjectId = registry.getPathOwner(expectedPath);
			const expectedSubjectId = expectation.expectedSubjectId ?? expectation.subjectId;
			if (actualSubjectId !== undefined && actualSubjectId !== expectedSubjectId) {
				diagnostics.push({
					code: 'subject-identity-mismatch',
					subjectId: expectation.subjectId,
					expectedPath,
					actualSubjectId,
					message: `${expectedPath} belongs to subject ${actualSubjectId}, expected subject ${expectedSubjectId}.`,
				});
				continue;
			}
		}

		if (!record) {
			diagnostics.push({
				code: 'missing-subject-file',
				subjectId: expectation.subjectId,
				expectedPath,
				message: `Subject ${expectation.subjectId} existed before the batch but is now missing.`,
			});
			continue;
		}
		if (expectedPath && normalizePathCollisionKey(record.path) !== normalizePathCollisionKey(expectedPath)) {
			diagnostics.push({
				code: 'subject-path-mismatch',
				subjectId: expectation.subjectId,
				expectedPath,
				actualPath: record.path,
				message: `Subject ${expectation.subjectId} is at ${record.path}, expected ${expectedPath}.`,
			});
		}
	}
	return diagnostics;
}

export function subjectPathStateEqual(left: SubjectPathState, right: SubjectPathState): boolean {
	return left.subjectId === right.subjectId
		&& normalizePathCollisionKey(left.currentPath) === normalizePathCollisionKey(right.currentPath)
		&& (left.lastManagedPath ? normalizePathCollisionKey(left.lastManagedPath) : undefined)
			=== (right.lastManagedPath ? normalizePathCollisionKey(right.lastManagedPath) : undefined)
		&& left.namingState === right.namingState;
}

export function pathStatesEqual(
	left: Readonly<Record<string, SubjectPathState>>,
	right: Readonly<Record<string, SubjectPathState>>,
): boolean {
	const leftKeys = Object.keys(left).sort();
	const rightKeys = Object.keys(right).sort();
	if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
	return leftKeys.every(key => subjectPathStateEqual(left[key], right[key]));
}
