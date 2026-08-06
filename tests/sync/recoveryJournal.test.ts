import { describe, expect, it } from 'vitest';
import {
	RecoveryJournalStore,
	RECOVERY_JOURNAL_PATH,
	RECOVERY_JOURNAL_PREVIOUS_PATH,
	RECOVERY_JOURNAL_TEMP_PATH,
	migrateLegacyConfigurationJournal,
	sanitizeConfigurationRecoveryFacts,
	validatePersistentRecoveryJournal,
} from '../../src/sync/recoveryJournal';
import type { PersistentRecoveryJournal } from '../../src/sync/recoveryJournal';
import { hashRecoveryContent } from '../../src/sync/recoveryContent';
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

const LEGACY_SECRET = 'SECRET_TOKEN_MUST_NOT_SURVIVE_6_11_2_MIGRATION';

function legacyConfigurationJournal(secret = LEGACY_SECRET): Record<string, unknown> {
	return {
		...journal(),
		state: 'recovery-required',
		configurationFacts: {
			previousSettings: { accessToken: secret, scanFolderPath: 'Before' },
			candidateSettings: { accessToken: `${secret}-candidate`, scanFolderPath: 'After' },
			currentSettings: { accessToken: `${secret}-candidate` },
			diskSettings: { accessToken: `${secret}-candidate` },
			managerConfig: { accessToken: secret, pathTemplate: 'ACGN/{{id}}.md' },
		},
	};
}

function recoveryFiles(vault: InMemoryVault): string[] {
	return Array.from(vault.contents.entries())
		.filter(([path]) => path.startsWith('.bangumi-sync-recovery') && path.endsWith('.json'))
		.map(([, content]) => content);
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

	it('sanitizes a temporary-only legacy configuration journal before preserving the interrupted candidate', async () => {
		const secret = 'SECRET_TOKEN_MUST_NOT_SURVIVE_LEGACY_TEMP_MIGRATION';
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_TEMP_PATH, JSON.stringify(legacyConfigurationJournal(secret)));

		const result = await new RecoveryJournalStore(vault.app).load();

		expect(result.status).toBe('corrupt');
		expect(recoveryFiles(vault).join('\n')).not.toContain(secret);
		expect(Array.from(vault.files.keys()).some(path => path.includes('corrupt-temp-'))).toBe(true);
	});

	it.each([RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH])(
		'sanitizes a legacy temporary journal before loading a valid candidate from %s',
		async sourcePath => {
			const secret = 'SECRET_TOKEN_MUST_NOT_SURVIVE_LEGACY_TEMP_MIGRATION';
			const vault = new InMemoryVault();
			vault.addFile(sourcePath, JSON.stringify({ ...journal(), journalId: sourcePath }));
			vault.addFile(RECOVERY_JOURNAL_TEMP_PATH, JSON.stringify(legacyConfigurationJournal(secret)));

			const result = await new RecoveryJournalStore(vault.app).load();

			expect(result).toMatchObject({ status: 'loaded', journal: { journalId: sourcePath } });
			expect(recoveryFiles(vault).join('\n')).not.toContain(secret);
		},
	);

	it('keeps a legacy temporary migration failure isolated without creating another secret copy', async () => {
		const secret = 'SECRET_TOKEN_MUST_NOT_SURVIVE_LEGACY_TEMP_MIGRATION';
		const vault = new InMemoryVault();
		const original = JSON.stringify(legacyConfigurationJournal(secret));
		vault.addFile(RECOVERY_JOURNAL_TEMP_PATH, original);
		const adapter = vault.app.vault.adapter;
		const originalWrite = adapter.write.bind(adapter);
		adapter.write = (path, data) => path === RECOVERY_JOURNAL_TEMP_PATH
			? Promise.reject(new Error(`injected ${secret}`))
			: originalWrite(path, data);

		const result = await new RecoveryJournalStore(vault.app).load();

		expect(result).toMatchObject({ status: 'migration-failed', sourcePath: RECOVERY_JOURNAL_TEMP_PATH });
		if (result.status === 'migration-failed') expect(result.message).not.toContain(secret);
		expect(vault.contents.get(RECOVERY_JOURNAL_TEMP_PATH)).toBe(original);
		expect(Array.from(vault.files.keys()).filter(path => path !== RECOVERY_JOURNAL_TEMP_PATH)).toEqual([]);
	});

	it.each([
		['temp write', 'write'],
		['previous removal', 'remove'],
		['current rotation', 'rotate'],
		['temp promotion', 'promote'],
	] as const)('keeps a valid journal candidate when %s fails', async (_name, failure) => {
		const vault = new InMemoryVault();
		const store = new RecoveryJournalStore(vault.app);
		await store.write(journal());
		if (failure === 'remove') vault.addFile(RECOVERY_JOURNAL_PREVIOUS_PATH, JSON.stringify(journal()));
		const adapter = vault.app.vault.adapter;
		const originalWrite = adapter.write.bind(adapter);
		const originalRemove = adapter.remove.bind(adapter);
		const originalRename = adapter.rename.bind(adapter);
		adapter.write = (path, data) => failure === 'write' && path === RECOVERY_JOURNAL_TEMP_PATH
			? Promise.reject(new Error('injected write failure')) : originalWrite(path, data);
		adapter.remove = path => failure === 'remove' && path === RECOVERY_JOURNAL_PREVIOUS_PATH
			? Promise.reject(new Error('injected remove failure')) : originalRemove(path);
		adapter.rename = (from, to) => {
			if (failure === 'rotate' && from === RECOVERY_JOURNAL_PATH) return Promise.reject(new Error('injected rotate failure'));
			if (failure === 'promote' && from === RECOVERY_JOURNAL_TEMP_PATH) return Promise.reject(new Error('injected promote failure'));
			return originalRename(from, to);
		};

		await expect(store.write({ ...journal(), journalId: 'journal-2' })).rejects.toThrow('injected');
		adapter.write = originalWrite;
		adapter.remove = originalRemove;
		adapter.rename = originalRename;
		const loaded = await store.load();
		expect(loaded.status).toBe('loaded');
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

	it.each([RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH])('securely migrates a legacy configuration journal from %s', async sourcePath => {
		const vault = new InMemoryVault();
		vault.addFile(sourcePath, JSON.stringify(legacyConfigurationJournal()));
		const result = await new RecoveryJournalStore(vault.app).load();
		expect(result).toMatchObject({ status: 'loaded', journal: { configurationFacts: { accessTokenChanged: true } } });
		expect(recoveryFiles(vault).join('\n')).not.toContain(LEGACY_SECRET);
	});

	it('migrates a valid legacy previous journal while retaining a corrupt-current backup without secrets', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, '{broken');
		vault.addFile(RECOVERY_JOURNAL_PREVIOUS_PATH, JSON.stringify(legacyConfigurationJournal()));
		const result = await new RecoveryJournalStore(vault.app).load();
		expect(result).toMatchObject({ status: 'loaded', recoveredFromPrevious: true });
		expect(recoveryFiles(vault).join('\n')).not.toContain(LEGACY_SECRET);
	});

	it.each(['write', 'remove'] as const)('keeps the original legacy source and creates no secret backup when migration %s fails', async operation => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, JSON.stringify(legacyConfigurationJournal()));
		const adapter = vault.app.vault.adapter;
		const originalWrite = adapter.write.bind(adapter);
		const originalRemove = adapter.remove.bind(adapter);
		adapter.write = (path, data) => operation === 'write' && path === RECOVERY_JOURNAL_TEMP_PATH
			? Promise.reject(new Error(`injected ${LEGACY_SECRET}`)) : originalWrite(path, data);
		adapter.remove = path => operation === 'remove' && path === RECOVERY_JOURNAL_PATH
			? Promise.reject(new Error(`injected ${LEGACY_SECRET}`)) : originalRemove(path);
		const result = await new RecoveryJournalStore(vault.app).load();
		expect(result).toMatchObject({ status: 'migration-failed', sourcePath: RECOVERY_JOURNAL_PATH });
		if (result.status === 'migration-failed') expect(result.message).not.toContain(LEGACY_SECRET);
		expect(vault.contents.get(RECOVERY_JOURNAL_PATH)).toContain(LEGACY_SECRET);
		expect(Array.from(vault.files.keys()).some(path => path.includes('.corrupt-') || path.includes('.interrupted-'))).toBe(false);
	});

	it('reloads the sanitized journal after a successful legacy migration', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, JSON.stringify(legacyConfigurationJournal()));
		const store = new RecoveryJournalStore(vault.app);
		expect((await store.load()).status).toBe('loaded');
		expect((await store.load()).status).toBe('loaded');
		expect(recoveryFiles(vault).join('\n')).not.toContain(LEGACY_SECRET);
	});

	it('hashes an empty previous access token while migrating a legacy journal', async () => {
		const legacy = legacyConfigurationJournal('');
		const facts = (legacy.configurationFacts as Record<string, Record<string, unknown>>);
		facts.candidateSettings.accessToken = 'new-token';
		facts.currentSettings.accessToken = 'new-token';
		facts.diskSettings.accessToken = 'new-token';

		const migrated = await migrateLegacyConfigurationJournal(legacy);

		expect(migrated?.configurationFacts?.previousAccessTokenSha256).toBe(await hashRecoveryContent(''));
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
