import { describe, expect, it } from 'vitest';
import { FileManager } from '../../common/file/fileManager';
import { SyncTransaction } from '../../src/sync/syncTransaction';
import { InMemoryVault } from '../mocks/inMemoryVault';

describe('SyncTransaction staged rename log', () => {
	it('captures strict original-content hashes and concrete created paths', async () => {
		const vault = new InMemoryVault();
		const original = '---\nid: 1\n---\r\noriginal';
		vault.addFile('A/existing.md', original);
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app));

		await transaction.createOrUpdateFile('A/existing.md', '---\nid: 1\n---\nchanged', { overwrite: true, subjectId: 1 });
		await transaction.createOrUpdateFile('A/created.md', '---\nid: 2\n---\ncreated', { overwrite: false, subjectId: 2 });
		const expectations = transaction.getRecoveryExpectations();

		expect(expectations.createdFiles).toEqual([{ subjectId: 2, createdPath: 'A/created.md', expectedToExistAfterRollback: false }]);
		expect(expectations.updatedContents).toHaveLength(1);
		expect(expectations.updatedContents[0]).toMatchObject({ subjectId: 1, path: 'A/existing.md', originalContentLength: original.length });
		expect(expectations.updatedContents[0].expectedContentHash).toMatch(/^[a-f0-9]{64}$/u);

		const lfVault = new InMemoryVault();
		lfVault.addFile('A/existing.md', '---\nid: 1\n---\noriginal');
		const lfTransaction = new SyncTransaction(lfVault.app, new FileManager(lfVault.app));
		await lfTransaction.createOrUpdateFile('A/existing.md', 'changed', { overwrite: true, subjectId: 1 });
		const lfExpectations = lfTransaction.getRecoveryExpectations();
		expect(lfExpectations.updatedContents[0].expectedContentHash)
			.not.toBe(expectations.updatedContents[0].expectedContentHash);
	});

	it('does not report an empty transaction as an attempted rollback', async () => {
		const vault = new InMemoryVault();
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app));

		expect(await transaction.rollback()).toEqual({
			attempted: false, changed: false,
			deletedCreatedFiles: 0, restoredContents: 0, restoredPaths: 0, failed: 0,
		});
	});
	it('restores the first temporary path when staging the second rename fails', async () => {
		const vault = new InMemoryVault();
		vault.addFile('A/one.md', '---\nid: 1\n---\none');
		vault.addFile('A/two.md', '---\nid: 2\n---\ntwo');
		const original = vault.app.fileManager.renameFile.bind(vault.app.fileManager);
		let calls = 0;
		vault.app.fileManager.renameFile = (file, path) => ++calls === 2
			? Promise.reject(new Error('staging failed'))
			: original(file, path);
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app));

		await expect(transaction.executeRenames([
			{ subjectId: 1, from: 'A/one.md', to: 'A/one-new.md' },
			{ subjectId: 2, from: 'A/two.md', to: 'A/two-new.md' },
		])).rejects.toThrow('staging failed');
		const rollback = await transaction.rollback();

		expect(rollback).toMatchObject({ restoredPaths: 1, failed: 0 });
		expect(Array.from(vault.files.keys()).sort()).toEqual(['A/one.md', 'A/two.md']);
	});

	it('restores temporary and final phases after a final rename fails', async () => {
		const vault = new InMemoryVault();
		vault.addFile('A/one.md', '---\nid: 1\n---\none');
		vault.addFile('A/two.md', '---\nid: 2\n---\ntwo');
		const original = vault.app.fileManager.renameFile.bind(vault.app.fileManager);
		let calls = 0;
		vault.app.fileManager.renameFile = (file, path) => ++calls === 4
			? Promise.reject(new Error('final failed'))
			: original(file, path);
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app));

		await expect(transaction.executeRenames([
			{ subjectId: 1, from: 'A/one.md', to: 'A/one-new.md' },
			{ subjectId: 2, from: 'A/two.md', to: 'A/two-new.md' },
		])).rejects.toThrow('final failed');
		const rollback = await transaction.rollback();

		expect(rollback).toMatchObject({ restoredPaths: 2, failed: 0 });
		expect(Array.from(vault.files.keys()).sort()).toEqual(['A/one.md', 'A/two.md']);
	});

	it('reports the temporary file when restoring its original path fails', async () => {
		const vault = new InMemoryVault();
		vault.addFile('A/one.md', '---\nid: 1\n---\none');
		const original = vault.app.fileManager.renameFile.bind(vault.app.fileManager);
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app));
		await transaction.executeRenames([{ subjectId: 1, from: 'A/one.md', to: 'A/one-new.md' }]);
		vault.app.fileManager.renameFile = (file, path) => path === 'A/one.md'
			? Promise.reject(new Error('restore failed'))
			: original(file, path);

		const rollback = await transaction.rollback();

		expect(rollback.failed).toBe(1);
		expect(rollback.failures?.[0]).toMatchObject({ operation: 'restore-path', path: 'A/one.md' });
		expect(Array.from(vault.files.keys())[0]).toContain('.bangumi-sync-1-');
	});
});
