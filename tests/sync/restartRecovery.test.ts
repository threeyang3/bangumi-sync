import { describe, expect, it } from 'vitest';
import type { SyncManagerConfig } from '../../src/sync/syncManager';
import { RecoveryRequiredError, SyncManager } from '../../src/sync/syncManager';
import { encodeRecoveryBase64, hashRecoveryBytes, hashRecoveryContent } from '../../src/sync/recoveryContent';
import { PersistentRecoveryJournal, RecoveryJournalStore, RECOVERY_JOURNAL_PATH } from '../../src/sync/recoveryJournal';
import { InMemoryVault } from '../mocks/inMemoryVault';

function config(): SyncManagerConfig {
	return {
		accessToken: '', pathTemplate: 'ACGN/{{id}}.md', imagePathTemplate: 'assets/{{id}}.jpg',
		downloadImages: false, imageQuality: 'large', imageUpdateExisting: false, scanFolderPath: 'ACGN', subjectPathStates: {},
	};
}

function resultSnapshot(): PersistentRecoveryJournal['resultSnapshot'] {
	return {
		total: 1, added: 0, skipped: 0, errors: 1, created: 0, updated: 1, unchanged: 0, renamed: 1,
		collisionResolved: 0, failed: 1, duration: 1, errorDetails: ['crash'], outcomes: [], warnings: [], rolledBack: 0,
		success: false, completion: 'failed', batchFiles: [], wasCancelled: false, canRollback: true,
	};
}

async function renamedJournal(options: { temporary?: boolean; originalContent?: string } = {}): Promise<PersistentRecoveryJournal> {
	const originalContent = options.originalContent ?? '---\nid: 1\n---\nold';
	return {
		schemaVersion: 1, journalId: 'restart', pluginVersion: '6.11.1', state: 'rollback-failed', createdAt: 1, updatedAt: 1,
		scanRoot: 'ACGN', affectedSubjectIds: [1], originalPathStates: {},
		subjectExpectations: [{ subjectId: 1, expectedToExist: true, expectedPath: 'ACGN/A.md', expectedSubjectId: 1 }],
		contentExpectations: [{ subjectId: 1, path: 'ACGN/A.md', expectedContentHash: await hashRecoveryContent(originalContent), originalContentLength: originalContent.length, originalContent }],
		createdPathExpectations: [], renameExpectations: [{ subjectId: 1, originalPath: 'ACGN/A.md', temporaryPath: options.temporary ? 'ACGN/.bangumi-sync-1-0-0.tmp.md' : undefined, finalPath: 'ACGN/B.md', expectedTerminalPath: 'ACGN/A.md' }],
		createdResourcePaths: [], updatedResourceExpectations: [], orphanTemporaryPaths: [], attempts: [], resultSnapshot: resultSnapshot(),
	};
}

describe('restart recovery ordering', () => {
	it.each([
		['final path', false],
		['hidden temporary path', true],
	] as const)('restores rename and original content in one retry from the %s', async (_label, temporary) => {
		const vault = new InMemoryVault();
		const journal = await renamedJournal({ temporary });
		vault.addFile(temporary ? 'ACGN/.bangumi-sync-1-0-0.tmp.md' : 'ACGN/B.md', '---\nid: 1\n---\nupdated');
		await new RecoveryJournalStore(vault.app).write(journal);
		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();
		const recovered = await manager.retryRecovery();
		expect(recovered).toMatchObject({ status: 'rolled-back', recovered: true });
		expect(vault.contents.get('ACGN/A.md')).toBe('---\nid: 1\n---\nold');
		expect(vault.files.has('ACGN/B.md')).toBe(false);
		expect(vault.files.has('ACGN/.bangumi-sync-1-0-0.tmp.md')).toBe(false);
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
	});

	it('keeps the gate when the recorded rename source belongs to another subject', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/B.md', '---\nid: 2\n---\nwrong owner');
		await new RecoveryJournalStore(vault.app).write(await renamedJournal());
		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();
		expect(await manager.retryRecovery()).toMatchObject({ status: 'rollback-failed', recovered: false });
		expect(manager.getRecoveryRequired()).not.toBeNull();
		expect(() => manager.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(true);
	});

	it('matches Windows-style path casing while restoring the recorded canonical path', async () => {
		const vault = new InMemoryVault();
		vault.addFile('acgn/b.md', '---\nid: 1\n---\nupdated');
		await new RecoveryJournalStore(vault.app).write(await renamedJournal());
		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();
		expect(await manager.retryRecovery()).toMatchObject({ status: 'rolled-back', recovered: true });
		expect(vault.contents.get('ACGN/A.md')).toBe('---\nid: 1\n---\nold');
		expect(vault.files.has('acgn/b.md')).toBe(false);
	});

	it('keeps recovery required when post-validation still finds a duplicate ID', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/B.md', '---\nid: 1\n---\nupdated');
		vault.addFile('ACGN/duplicate.md', '---\nid: 1\n---\nduplicate');
		await new RecoveryJournalStore(vault.app).write(await renamedJournal());
		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();
		const result = await manager.retryRecovery();
		expect(result).toMatchObject({ status: 'rollback-failed', recovered: false });
		expect(manager.getRecoveryRequired()).not.toBeNull();
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(true);
	});

	it('restores an updated binary from the journal after reload and verifies its hash', async () => {
		const vault = new InMemoryVault();
		const original = new Uint8Array([1, 2, 3, 4]);
		vault.addBinaryFile('assets/1.jpg', new Uint8Array([9, 9, 9]));
		const journal = await renamedJournal();
		journal.subjectExpectations = [];
		journal.contentExpectations = [];
		journal.renameExpectations = [];
		journal.updatedResourceExpectations = [{
			path: 'assets/1.jpg', originalByteLength: original.byteLength,
			originalSha256: await hashRecoveryBytes(original), originalContentBase64: encodeRecoveryBase64(original),
		}];
		await new RecoveryJournalStore(vault.app).write(journal);
		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();
		expect(await manager.retryRecovery()).toMatchObject({ status: 'rolled-back', recovered: true });
		expect(Array.from(vault.binaryContents.get('assets/1.jpg') ?? [])).toEqual([1, 2, 3, 4]);
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
	});

	it('retains the journal and gate when binary restoration fails', async () => {
		const vault = new InMemoryVault();
		const original = new Uint8Array([1, 2, 3]);
		const file = vault.addBinaryFile('assets/1.jpg', new Uint8Array([9]));
		const journal = await renamedJournal();
		journal.subjectExpectations = [];
		journal.contentExpectations = [];
		journal.renameExpectations = [];
		journal.updatedResourceExpectations = [{ path: file.path, originalByteLength: 3, originalSha256: await hashRecoveryBytes(original), originalContentBase64: encodeRecoveryBase64(original) }];
		await new RecoveryJournalStore(vault.app).write(journal);
		vault.app.vault.modifyBinary = () => Promise.reject(new Error('injected binary restore failure'));
		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();
		expect(await manager.retryRecovery()).toMatchObject({ status: 'rollback-failed', recovered: false });
		expect(manager.getRecoveryRequired()).not.toBeNull();
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(true);
	});

	it('blocks manual confirmation while an updated binary hash differs from the original', async () => {
		const vault = new InMemoryVault();
		const original = new Uint8Array([1, 2, 3]);
		vault.addBinaryFile('assets/1.jpg', new Uint8Array([9, 9, 9]));
		const journal = await renamedJournal();
		journal.subjectExpectations = [];
		journal.contentExpectations = [];
		journal.renameExpectations = [];
		journal.updatedResourceExpectations = [{
			path: 'assets/1.jpg', originalByteLength: original.byteLength,
			originalSha256: await hashRecoveryBytes(original), originalContentBase64: encodeRecoveryBase64(original),
		}];
		await new RecoveryJournalStore(vault.app).write(journal);
		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();

		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'blocked', recovered: false });
		expect(manager.getRecoveryRequired()).not.toBeNull();
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(true);
	});
});
