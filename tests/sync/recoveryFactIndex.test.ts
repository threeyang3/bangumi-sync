import { afterEach, describe, expect, it, vi } from 'vitest';
import * as pathUtils from '../../common/file/pathUtils';
import { matchCreatedPathExpectations, RecoveryFactIndex } from '../../src/sync/recoveryFactIndex';
import type { PersistentRecoveryJournal } from '../../src/sync/recoveryJournal';
import type { TransactionRecoveryExpectations } from '../../src/sync/syncTransaction';

function journal(): PersistentRecoveryJournal {
	return {
		schemaVersion: 1, journalId: 'index-test', pluginVersion: 'test', state: 'active', createdAt: 1, updatedAt: 1,
		scanRoot: 'ACGN', affectedSubjectIds: [], originalPathStates: {}, subjectExpectations: [], contentExpectations: [],
		createdPathExpectations: [], renameExpectations: [], createdResourcePaths: [], updatedResourceExpectations: [],
		orphanTemporaryPaths: [], attempts: [],
		resultSnapshot: {
			total: 0, added: 0, skipped: 0, errors: 0, created: 0, updated: 0, unchanged: 0, renamed: 0,
			collisionResolved: 0, failed: 0, duration: 0, errorDetails: [], outcomes: [], warnings: [], rolledBack: 0,
			success: false, completion: 'failed', batchFiles: [], wasCancelled: false, canRollback: false,
		},
	};
}

const created = (createdPath: string, subjectId = 1) => ({ subjectId, createdPath, expectedToExistAfterRollback: false as const });
const facts = (createdFiles: TransactionRecoveryExpectations['createdFiles']): TransactionRecoveryExpectations => ({ createdFiles, updatedContents: [], renames: [] });

afterEach(() => vi.restoreAllMocks());

describe('recovery fact indexing', () => {
	it('detects changes to every persisted content and rename field', () => {
		const content = { subjectId: 1, path: 'ACGN/A.md', expectedContentHash: 'hash', originalContentLength: 3, originalContent: 'old' };
		for (const [field, value] of Object.entries({ subjectId: 2, path: 'acgn/a.md', expectedContentHash: 'new-hash', originalContentLength: 4, originalContent: 'new' })) {
			const target = journal();
			const index = new RecoveryFactIndex(target);
			index.mergeInto(target, { createdFiles: [], updatedContents: [content], renames: [] });
			const previous = target.contentExpectations;
			const changed = { ...content, [field]: value };
			index.mergeInto(target, { createdFiles: [], updatedContents: [changed], renames: [] });
			expect(target.contentExpectations).not.toBe(previous);
			expect(target.contentExpectations).toEqual([changed]);
			expect(previous).toEqual([content]);
		}
		const rename = { subjectId: 1, originalPath: 'ACGN/A.md', finalPath: 'ACGN/B.md', expectedTerminalPath: 'ACGN/A.md', temporaryPath: 'ACGN/temp.md' };
		for (const [field, value] of Object.entries({ subjectId: 2, originalPath: 'acgn/a.md', finalPath: 'ACGN/C.md', expectedTerminalPath: 'ACGN/old.md', temporaryPath: undefined })) {
			const target = journal();
			const index = new RecoveryFactIndex(target);
			index.mergeInto(target, { createdFiles: [], updatedContents: [], renames: [rename] });
			const previous = target.renameExpectations;
			const changed = { ...rename, [field]: value };
			index.mergeInto(target, { createdFiles: [], updatedContents: [], renames: [changed] });
			expect(target.renameExpectations).not.toBe(previous);
			expect(target.renameExpectations[target.renameExpectations.length - 1]).toEqual(changed);
			expect(previous).toEqual([rename]);
		}
	});

	it('reuses unchanged snapshots and copies only changed fact categories', () => {
		const target = journal();
		const index = new RecoveryFactIndex(target);
		index.mergeInto(target, facts([created('ACGN/A.md')]));
		const previous = { ...target };
		index.mergeInto(target, facts([created('ACGN/A.md')]));
		expect(target.createdPathExpectations).toBe(previous.createdPathExpectations);
		expect(target.contentExpectations).toBe(previous.contentExpectations);
		expect(target.renameExpectations).toBe(previous.renameExpectations);
		index.mergeInto(target, facts([created('ACGN/A.md', 2)]));
		expect(target.createdPathExpectations).not.toBe(previous.createdPathExpectations);
		expect(target.createdPathExpectations[0].subjectId).toBe(2);
		expect(previous.createdPathExpectations[0].subjectId).toBe(1);
		expect(target.contentExpectations).toBe(previous.contentExpectations);
		expect(target.renameExpectations).toBe(previous.renameExpectations);
	});

	it('preserves first match, requested order, duplicate requests, and missing-path fallback', () => {
		const first = created('ACGN/Ａ.md');
		const second = created('acgn/a.md', 2);
		const decomposed = created('ACGN/e\u0301.md', 3);
		const paths = ['acgn/a.md', 'ACGN/é.md', 'acgn/a.md', 'ACGN/missing.md'];
		const result = matchCreatedPathExpectations([first, second, decomposed], paths);
		expect(result).toEqual([first, decomposed, first, created('ACGN/missing.md', -1)]);
		expect(result[0]).toBe(first);
	});

	it('keeps filename separators distinct from fullwidth characters', () => {
		const item = created('ACGN/A／B.md');
		expect(matchCreatedPathExpectations([item], ['ACGN/A/B.md'])).toEqual([created('ACGN/A/B.md', -1)]);
	});

	it('normalizes only a linear number of paths when finalizing 1303 items', () => {
		const items = Array.from({ length: 1303 }, (_, i) => created(`ACGN/Anime/Item ${i}.md`, i + 1));
		const normalize = vi.spyOn(pathUtils, 'normalizePathCollisionKey');
		expect(matchCreatedPathExpectations(items, items.map(item => item.createdPath))).toEqual(items);
		expect(normalize).toHaveBeenCalledTimes(2606);
	});

	it('preserves last-value/first-position semantics for loaded duplicates and new facts', () => {
		const target = journal();
		target.createdPathExpectations = [created('ACGN/A.md'), created('ACGN/B.md', 2), created('acgn/a.md', 3)];
		const index = new RecoveryFactIndex(target);
		index.mergeInto(target, facts([created('ACGN/C.md', 4), created('ACGN/Ａ.md', 5)]));
		expect(target.createdPathExpectations).toEqual([created('ACGN/Ａ.md', 5), created('ACGN/B.md', 2), created('ACGN/C.md', 4)]);
	});

	it('does not renormalize history or repeated cumulative facts and keeps earlier snapshots intact', () => {
		const target = journal();
		const normalize = vi.spyOn(pathUtils, 'normalizePathCollisionKey');
		const index = new RecoveryFactIndex(target);
		const cumulative: TransactionRecoveryExpectations['createdFiles'] = [];
		for (let i = 0; i < 1303; i++) {
			cumulative.push(created(`ACGN/Item ${i}.md`, i + 1));
			index.mergeInto(target, facts(cumulative));
		}
		expect(normalize).toHaveBeenCalledTimes(1303);
		const previous = target.createdPathExpectations;
		const incoming = created('ACGN/Item 0.md', 2000);
		index.mergeInto(target, facts([incoming]));
		incoming.subjectId = 3000;
		expect(previous[0].subjectId).toBe(1);
		expect(target.createdPathExpectations[0].subjectId).toBe(2000);
		expect(previous).not.toBe(target.createdPathExpectations);
	});

	it('matches the original merge algorithm for created, content and rename facts across repeated updates', () => {
		const target = journal();
		const expected = journal();
		const index = new RecoveryFactIndex(target);
		for (let i = 0; i < 70; i++) {
			const path = `${i % 2 ? 'ACGN' : 'acgn'}/Item ${i % 11}.md`;
			const incoming: TransactionRecoveryExpectations = {
				createdFiles: [created(path, i + 1)],
				updatedContents: [{ subjectId: i + 1, path, expectedContentHash: 'hash', originalContentLength: 1, originalContent: String(i) }],
				renames: [{ subjectId: i % 7 + 1, originalPath: path, finalPath: `${path}.new`, expectedTerminalPath: path }],
			};
			const byCreated = new Map(expected.createdPathExpectations.map(item => [pathUtils.normalizePathCollisionKey(item.createdPath), item]));
			for (const item of incoming.createdFiles) byCreated.set(pathUtils.normalizePathCollisionKey(item.createdPath), { ...item });
			expected.createdPathExpectations = [...byCreated.values()];
			const byContent = new Map(expected.contentExpectations.map(item => [pathUtils.normalizePathCollisionKey(item.path), item]));
			for (const item of incoming.updatedContents) byContent.set(pathUtils.normalizePathCollisionKey(item.path), { ...item });
			expected.contentExpectations = [...byContent.values()];
			const byRename = new Map(expected.renameExpectations.map(item => [item.subjectId, item]));
			for (const item of incoming.renames) byRename.set(item.subjectId, { ...item });
			expected.renameExpectations = [...byRename.values()];
			index.mergeInto(target, incoming);
			expect(target).toEqual(expected);
		}
	});
});
