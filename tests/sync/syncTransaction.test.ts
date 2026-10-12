import { afterEach, describe, expect, it, vi } from 'vitest';
import * as recoveryContent from '../../src/sync/recoveryContent';
import { FileManager } from '../../common/file/fileManager';
import { SyncTransaction } from '../../src/sync/syncTransaction';
import { InMemoryVault } from '../mocks/inMemoryVault';

afterEach(() => vi.restoreAllMocks());

describe('SyncTransaction staged rename log', () => {
	it('shares the original-content digest across concurrent exports and repeated writes', async () => {
		const vault = new InMemoryVault();
		const original = '---\nid: 1\n---\r\n原文';
		vault.addFile('A/one.md', original);
		const expectedHash = await recoveryContent.hashRecoveryContent(original);
		const hash = vi.spyOn(recoveryContent, 'hashRecoveryContent');
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app));
		await transaction.createOrUpdateFile('A/one.md', '---\nid: 1\n---\nchanged', { overwrite: true, subjectId: 1 });
		const exports = await Promise.all(Array.from({ length: 5 }, () => transaction.getRecoveryExpectations()));
		for (const facts of exports) expect(facts.updatedContents[0]).toMatchObject({ originalContent: original, expectedContentHash: expectedHash });
		await transaction.createOrUpdateFile('A/one.md', '---\nid: 1\n---\nchanged again', { overwrite: true, subjectId: 1 });
		expect((await transaction.getRecoveryExpectations()).updatedContents[0].expectedContentHash).toBe(expectedHash);
		expect(hash).toHaveBeenCalledTimes(1);
		expect(await transaction.rollback()).toMatchObject({ restoredContents: 1, failed: 0 });
		expect(vault.contents.get('A/one.md')).toBe(original);
		expect((await transaction.getRecoveryExpectations()).updatedContents).toEqual([]);
	});

	it('blocks mutation on digest failure and retries without a poisoned cache', async () => {
		const vault = new InMemoryVault();
		const original = '---\nid: 1\n---\noriginal';
		vault.addFile('A/one.md', original);
		const hash = vi.spyOn(recoveryContent, 'hashRecoveryContent').mockRejectedValueOnce(new Error('digest failed'));
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app), () => Promise.resolve());
		await expect(transaction.createOrUpdateFile('A/one.md', '---\nid: 1\n---\nchanged', { overwrite: true, subjectId: 1 })).rejects.toThrow('digest failed');
		expect(vault.contents.get('A/one.md')).toBe(original);
		await transaction.createOrUpdateFile('A/one.md', '---\nid: 1\n---\nchanged', { overwrite: true, subjectId: 1 });
		expect((await transaction.getRecoveryExpectations()).updatedContents[0].originalContent).toBe(original);
		expect(hash).toHaveBeenCalledTimes(2);
		transaction.commit();
		expect((await transaction.getRecoveryExpectations()).updatedContents).toEqual([]);
	});

	it('resolves the pre-rename path when exporting a cached original digest', async () => {
		const vault = new InMemoryVault();
		vault.addFile('A/one.md', '---\nid: 1\n---\noriginal');
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app), () => Promise.resolve());
		await transaction.createOrUpdateFile('A/one.md', '---\nid: 1\n---\nchanged', { overwrite: true, subjectId: 1 });
		const before = (await transaction.getRecoveryExpectations()).updatedContents[0];
		await transaction.executeRenames([{ subjectId: 1, from: 'A/one.md', to: 'B/one.md' }]);
		expect((await transaction.getRecoveryExpectations()).updatedContents[0]).toEqual(before);
	});

	it('captures strict original-content hashes and concrete created paths', async () => {
		const vault = new InMemoryVault();
		const original = '---\nid: 1\n---\r\noriginal';
		vault.addFile('A/existing.md', original);
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app));

		await transaction.createOrUpdateFile('A/existing.md', '---\nid: 1\n---\nchanged', { overwrite: true, subjectId: 1 });
		await transaction.createOrUpdateFile('A/created.md', '---\nid: 2\n---\ncreated', { overwrite: false, subjectId: 2 });
		const expectations = await transaction.getRecoveryExpectations();

		expect(expectations.createdFiles).toEqual([{ subjectId: 2, createdPath: 'A/created.md', expectedToExistAfterRollback: false }]);
		expect(expectations.updatedContents).toHaveLength(1);
		expect(expectations.updatedContents[0]).toMatchObject({ subjectId: 1, path: 'A/existing.md', originalContentLength: original.length });
		expect(expectations.updatedContents[0].originalContent).toBe(original);
		expect(expectations.updatedContents[0].expectedContentHash).toMatch(/^[a-f0-9]{64}$/u);

		const lfVault = new InMemoryVault();
		lfVault.addFile('A/existing.md', '---\nid: 1\n---\noriginal');
		const lfTransaction = new SyncTransaction(lfVault.app, new FileManager(lfVault.app));
		await lfTransaction.createOrUpdateFile('A/existing.md', 'changed', { overwrite: true, subjectId: 1 });
		const lfExpectations = await lfTransaction.getRecoveryExpectations();
		expect(lfExpectations.updatedContents[0].expectedContentHash)
			.not.toBe(expectations.updatedContents[0].expectedContentHash);
	});

	it('records original, temporary, final, and terminal rename paths', async () => {
		const vault = new InMemoryVault();
		vault.addFile('A/one.md', '---\nid: 1\n---\none');
		const transaction = new SyncTransaction(vault.app, new FileManager(vault.app));
		await transaction.executeRenames([{ subjectId: 1, from: 'A/one.md', to: 'B/one.md' }]);

		const [rename] = (await transaction.getRecoveryExpectations()).renames;
		expect(rename).toMatchObject({
			subjectId: 1, originalPath: 'A/one.md', finalPath: 'B/one.md', expectedTerminalPath: 'A/one.md',
		});
		expect(rename.temporaryPath).toContain('.bangumi-sync-1-');
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
