import { describe, expect, it } from 'vitest';
import {
	RecoveryJournalStore,
	RECOVERY_JOURNAL_PATH,
	RECOVERY_JOURNAL_PREVIOUS_PATH,
	RECOVERY_JOURNAL_TEMP_PATH,
	sanitizeConfigurationRecoveryFacts,
	validatePersistentRecoveryJournal,
} from '../../src/sync/recoveryJournal';
import type { PersistentRecoveryJournal } from '../../src/sync/recoveryJournal';
import { InMemoryVault } from '../mocks/inMemoryVault';

function journal(): PersistentRecoveryJournal {
	return {
		schemaVersion: 1, journalId: 'journal-1', pluginVersion: '6.11.1', state: 'active', createdAt: 1, updatedAt: 1,
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

describe('persistent recovery journal', () => {
	it('atomically writes, loads, and clears a complete journal', async () => {
		const vault = new InMemoryVault();
		const store = new RecoveryJournalStore(vault.app);
		await store.write(journal());
		expect((await store.load())).toMatchObject({ status: 'loaded', journal: { journalId: 'journal-1' } });
		await store.clear();
		expect(await store.load()).toEqual({ status: 'none' });
	});

	it('restores the previous complete journal if final replacement fails', async () => {
		const vault = new InMemoryVault();
		const store = new RecoveryJournalStore(vault.app);
		await store.write(journal());
		const adapter = vault.app.vault.adapter;
		const originalRename = adapter.rename.bind(adapter);
		let calls = 0;
		adapter.rename = (from, to) => ++calls === 2 ? Promise.reject(new Error('crash')) : originalRename(from, to);
		await expect(store.write({ ...journal(), journalId: 'journal-2' })).rejects.toThrow('crash');
		expect(vault.files.has(RECOVERY_JOURNAL_PATH) || vault.files.has(RECOVERY_JOURNAL_PREVIOUS_PATH)).toBe(true);
		adapter.rename = originalRename;
		expect((await store.load())).toMatchObject({ status: 'loaded', journal: { journalId: 'journal-1' } });
	});

	it('backs up corrupt and unsupported journals instead of deleting them silently', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, '{broken');
		const corrupt = await new RecoveryJournalStore(vault.app).load();
		expect(corrupt).toMatchObject({ status: 'corrupt' });
		if (corrupt.status === 'corrupt') expect(vault.contents.get(corrupt.backupPath)).toBe('{broken');

		vault.addFile(RECOVERY_JOURNAL_PATH, JSON.stringify({ schemaVersion: 99 }));
		const unsupported = await new RecoveryJournalStore(vault.app).load();
		expect(unsupported).toMatchObject({ status: 'unsupported', schemaVersion: 99 });
	});

	it('backs up a temporary-only interrupted journal and blocks startup recovery', async () => {
		const vault = new InMemoryVault();
		vault.addFile('.bangumi-sync-recovery.tmp.json', JSON.stringify(journal()));
		const result = await new RecoveryJournalStore(vault.app).load();
		expect(result.status).toBe('corrupt');
		if (result.status === 'corrupt') {
			expect(result.message).toContain('temporary');
			expect(vault.files.has(result.backupPath)).toBe(true);
		}
	});

	it.each([
		['empty object', {}],
		['schema-only object', { schemaVersion: 1 }],
		['string subject IDs', { ...journal(), affectedSubjectIds: '1' }],
		['null subject expectations', { ...journal(), subjectExpectations: null }],
		['missing original content', { ...journal(), contentExpectations: [{ subjectId: 1, path: 'A.md', expectedContentHash: 'a'.repeat(64), originalContentLength: 1 }] }],
		['invalid content hash', { ...journal(), contentExpectations: [{ subjectId: 1, path: 'A.md', expectedContentHash: 'abc', originalContentLength: 1, originalContent: 'a' }] }],
		['incomplete rename', { ...journal(), renameExpectations: [{ subjectId: 1, originalPath: 'A.md' }] }],
		['invalid attempt member', { ...journal(), attempts: [{ action: 'erase', status: 'ok', diagnostics: null }] }],
		['missing result snapshot', { ...journal(), resultSnapshot: undefined }],
		['invalid state', { ...journal(), state: 'clean' }],
		['non-finite timestamp', { ...journal(), createdAt: Number.NaN }],
		['infinite timestamp', { ...journal(), updatedAt: Number.POSITIVE_INFINITY }],
	])('rejects malformed schema-1 journal: %s', (_name, value) => {
		const validation = validatePersistentRecoveryJournal(value);
		expect(validation.valid).toBe(false);
		if (!validation.valid) expect(validation.errors.length).toBeGreaterThan(0);
	});

	it('accepts a complete journal and returns normalized 6.11.1 optional facts', () => {
		const legacyCompatible = { ...journal() } as Record<string, unknown>;
		delete legacyCompatible.updatedResourceExpectations;
		delete legacyCompatible.orphanTemporaryPaths;
		const validation = validatePersistentRecoveryJournal(legacyCompatible);
		expect(validation).toMatchObject({ valid: true, journal: { updatedResourceExpectations: [], orphanTemporaryPaths: [] } });
	});

	it('backs up parseable schema-1 journals whose structure is corrupt', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, JSON.stringify({ schemaVersion: 1 }));
		const result = await new RecoveryJournalStore(vault.app).load();
		expect(result).toMatchObject({ status: 'corrupt' });
		if (result.status === 'corrupt') {
			expect(result.backupPath).toContain('corrupt-structure');
			expect(vault.contents.get(result.backupPath)).toBe(JSON.stringify({ schemaVersion: 1 }));
		}
	});

	it.each([
		['invalid JSON', '{broken', 'corrupt-current'],
		['unsupported schema', JSON.stringify({ schemaVersion: 99 }), 'unsupported-current'],
		['malformed schema 1', JSON.stringify({ schemaVersion: 1 }), 'corrupt-structure-current'],
	])('loads a valid previous journal when current is %s', async (_name, current, backupMarker) => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, current);
		vault.addFile(RECOVERY_JOURNAL_PREVIOUS_PATH, JSON.stringify({ ...journal(), journalId: 'previous-valid' }));

		const result = await new RecoveryJournalStore(vault.app).load();

		expect(result).toMatchObject({ status: 'loaded', recoveredFromPrevious: true, journal: { journalId: 'previous-valid' } });
		expect(vault.files.has(RECOVERY_JOURNAL_PREVIOUS_PATH)).toBe(true);
		expect(Array.from(vault.files.keys()).some(path => path.includes(backupMarker))).toBe(true);
	});

	it('loads a previous-only journal and preserves it as the last valid candidate', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PREVIOUS_PATH, JSON.stringify({ ...journal(), journalId: 'previous-only' }));
		expect(await new RecoveryJournalStore(vault.app).load()).toMatchObject({
			status: 'loaded', recoveredFromPrevious: true, journal: { journalId: 'previous-only' },
		});
		expect(vault.files.has(RECOVERY_JOURNAL_PREVIOUS_PATH)).toBe(true);
	});

	it('backs up interrupted temp without blocking a valid current or previous candidate', async () => {
		for (const source of [RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH]) {
			const vault = new InMemoryVault();
			vault.addFile(source, JSON.stringify({ ...journal(), journalId: source }));
			vault.addFile(RECOVERY_JOURNAL_TEMP_PATH, '{interrupted');
			const result = await new RecoveryJournalStore(vault.app).load();
			expect(result).toMatchObject({ status: 'loaded', journal: { journalId: source }, temporaryFilePresent: true });
			expect(Array.from(vault.files.keys()).some(path => path.includes('interrupted-'))).toBe(true);
		}
	});

	it('backs up both invalid candidates and reports that neither is usable', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, '{broken-current');
		vault.addFile(RECOVERY_JOURNAL_PREVIOUS_PATH, JSON.stringify({ schemaVersion: 1 }));
		const result = await new RecoveryJournalStore(vault.app).load();
		expect(result).toMatchObject({ status: 'corrupt' });
		if (result.status === 'corrupt') {
			expect(result.message).toContain('No valid recovery journal candidate');
			expect(result.backupPaths).toHaveLength(2);
		}
		expect(vault.files.has(RECOVERY_JOURNAL_PATH)).toBe(false);
		expect(vault.files.has(RECOVERY_JOURNAL_PREVIOUS_PATH)).toBe(false);
	});

	it('removes secret-bearing keys recursively from configuration recovery facts', () => {
		const secret = 'SECRET_TOKEN_MUST_NEVER_REACH_JOURNAL_6_11_2';
		const facts = sanitizeConfigurationRecoveryFacts({
			previousSettings: { accessToken: secret, nested: { authorization: `Bearer ${secret}`, safe: 'kept' } },
			candidateSettings: { accessToken: `${secret}-next` },
			currentSettings: { token: secret },
			diskSettings: { apiKey: secret },
			managerConfig: { bearerToken: secret, pathTemplate: 'ACGN/{{id}}.md' },
		});
		const serialized = JSON.stringify(facts);
		expect(serialized).not.toContain(secret);
		expect(serialized).not.toContain('Bearer ');
		expect(facts.previousSettings).toEqual({ nested: { safe: 'kept' } });
		expect(facts.accessTokenChanged).toBe(true);
	});

	it('keeps a terminal current journal when previous cleanup fails', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, JSON.stringify({ ...journal(), state: 'committed-cleanup-pending' }));
		vault.addFile(RECOVERY_JOURNAL_PREVIOUS_PATH, JSON.stringify(journal()));
		const adapter = vault.app.vault.adapter;
		const originalRemove = adapter.remove.bind(adapter);
		adapter.remove = path => path === RECOVERY_JOURNAL_PREVIOUS_PATH
			? Promise.reject(new Error('previous cannot be removed')) : originalRemove(path);

		await expect(new RecoveryJournalStore(vault.app).clear()).rejects.toThrow('previous cannot be removed');
		expect(vault.files.has(RECOVERY_JOURNAL_PATH)).toBe(true);
	});

	it('keeps a terminal current journal when temp cleanup fails', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, JSON.stringify({ ...journal(), state: 'rolled-back-cleanup-pending' }));
		vault.addFile(RECOVERY_JOURNAL_TEMP_PATH, JSON.stringify(journal()));
		const adapter = vault.app.vault.adapter;
		const originalRemove = adapter.remove.bind(adapter);
		adapter.remove = path => path === RECOVERY_JOURNAL_TEMP_PATH
			? Promise.reject(new Error('temp cannot be removed')) : originalRemove(path);

		await expect(new RecoveryJournalStore(vault.app).clear()).rejects.toThrow('temp cannot be removed');
		expect(vault.files.has(RECOVERY_JOURNAL_PATH)).toBe(true);
	});
});
