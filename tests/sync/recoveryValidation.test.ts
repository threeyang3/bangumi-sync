import { describe, expect, it } from 'vitest';
import { collectSubjectExpectationDiagnostics, pathStatesEqual, RecoverySubjectExpectation } from '../../src/sync/recoveryValidation';
import type { LocalSubjectRecord, SubjectPathState } from '../../src/sync/localSubjectRegistry';
import { normalizePathCollisionKey } from '../../common/file/pathUtils';

function registry(records: Array<Pick<LocalSubjectRecord, 'subjectId' | 'path'>>) {
	const byId = new Map(records.map(record => [record.subjectId, record]));
	const byPath = new Map(records.map(record => [normalizePathCollisionKey(record.path), record.subjectId]));
	return {
		getById: (subjectId: number) => byId.get(subjectId) as LocalSubjectRecord | undefined,
		getPathOwner: (path: string) => byPath.get(normalizePathCollisionKey(path)),
	};
}

function expectation(subjectId: number, expectedToExist: boolean, expectedPath?: string): RecoverySubjectExpectation {
	return { subjectId, expectedToExist, expectedPath, expectedSubjectId: subjectId };
}

describe('recovery subject expectation matrix', () => {
	it('accepts absent/absent and present/same-path/same-identity states', () => {
		const diagnostics = collectSubjectExpectationDiagnostics([
			expectation(1, false),
			expectation(2, true, 'ACGN/Two.md'),
		], registry([{ subjectId: 2, path: 'ACGN/Two.md' }]));
		expect(diagnostics).toEqual([]);
	});

	it('reports an unexpected file for absent/present', () => {
		expect(collectSubjectExpectationDiagnostics(
			[expectation(1, false)], registry([{ subjectId: 1, path: 'ACGN/One.md' }]),
		)[0]).toMatchObject({ code: 'unexpected-subject-file', subjectId: 1, actualPath: 'ACGN/One.md' });
	});

	it('reports a missing file for present/absent', () => {
		expect(collectSubjectExpectationDiagnostics(
			[expectation(1, true, 'ACGN/One.md')], registry([]),
		)[0]).toMatchObject({ code: 'missing-subject-file', subjectId: 1, expectedPath: 'ACGN/One.md' });
	});

	it('reports a path mismatch when the expected subject moved', () => {
		expect(collectSubjectExpectationDiagnostics(
			[expectation(1, true, 'ACGN/One.md')], registry([{ subjectId: 1, path: 'ACGN/Moved.md' }]),
		)[0]).toMatchObject({ code: 'subject-path-mismatch', expectedPath: 'ACGN/One.md', actualPath: 'ACGN/Moved.md' });
	});

	it('reports an identity mismatch before treating the expected subject as missing', () => {
		const diagnostics = collectSubjectExpectationDiagnostics(
			[expectation(1, true, 'ACGN/One.md')], registry([{ subjectId: 9, path: 'ACGN/One.md' }]),
		);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({ code: 'subject-identity-mismatch', subjectId: 1, actualSubjectId: 9 });
	});
});

describe('pathStatesEqual', () => {
	const state = (subjectId: number, currentPath: string): SubjectPathState => ({ subjectId, currentPath, lastManagedPath: currentPath, namingState: 'managed' });

	it('normalizes path collision keys and ignores record insertion order', () => {
		expect(pathStatesEqual(
			{ '1': state(1, 'ACGN/ONE.md'), '2': state(2, 'ACGN/Two.md') },
			{ '2': state(2, 'acgn/two.md'), '1': state(1, 'acgn/one.md') },
		)).toBe(true);
	});

	it('requires the complete state set and all non-path fields to match', () => {
		expect(pathStatesEqual({ '1': state(1, 'ACGN/One.md') }, {})).toBe(false);
		expect(pathStatesEqual(
			{ '1': state(1, 'ACGN/One.md') },
			{ '1': { ...state(1, 'ACGN/One.md'), namingState: 'user-renamed' } },
		)).toBe(false);
	});
});
