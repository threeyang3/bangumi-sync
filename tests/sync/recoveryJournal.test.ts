import { describe, expect, it } from 'vitest';
import { RecoveryJournalStore, RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH } from '../../src/sync/recoveryJournal';
import type { PersistentRecoveryJournal } from '../../src/sync/recoveryJournal';
import { InMemoryVault } from '../mocks/inMemoryVault';

function journal(): PersistentRecoveryJournal {
	return {
		schemaVersion: 1, journalId: 'journal-1', pluginVersion: '6.11.0', state: 'active', createdAt: 1, updatedAt: 1,
		scanRoot: 'ACGN', affectedSubjectIds: [], originalPathStates: {}, subjectExpectations: [], contentExpectations: [],
		createdPathExpectations: [], renameExpectations: [], createdResourcePaths: [], attempts: [],
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
});
