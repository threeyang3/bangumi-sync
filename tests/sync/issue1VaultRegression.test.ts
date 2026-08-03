import { describe, expect, it } from 'vitest';
import { FileManager } from '../../common/file/fileManager';
import { LocalSubjectRegistry } from '../../src/sync/localSubjectRegistry';
import { SubjectPathResolver } from '../../src/sync/subjectPathResolver';
import { SyncTransaction } from '../../src/sync/syncTransaction';
import { InMemoryVault } from '../mocks/inMemoryVault';

describe('Issue #1 vault regression', () => {
	it('keeps Ranma 1989 and 2024 as distinct ID-owned files and rolls back safely', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/anime/乱马.md', '---\nid: 1\n中文名: 乱马\n---\n旧版用户数据');
		const fileManager = new FileManager(vault.app);
		const registry = new LocalSubjectRegistry(vault.app);
		registry.register({
			subjectId: 1,
			path: 'ACGN/anime/乱马.md',
			nameCn: '乱马',
			identitySource: 'id',
			namingState: 'managed',
		});
		const plan = new SubjectPathResolver().plan([
			{ subjectId: 1, preferredPath: 'ACGN/anime/乱马.md', currentPath: 'ACGN/anime/乱马.md', year: '1989', namingState: 'managed' },
			{ subjectId: 2, preferredPath: 'ACGN/anime/乱马.md', year: '2024', namingState: 'managed' },
		], registry.pathToId);
		const transaction = new SyncTransaction(vault.app, fileManager);

		await transaction.executeRenames(plan.renamed);
		await transaction.createOrUpdateFile(
			plan.allocations.get(2)?.finalPath ?? '',
			'---\nid: 2\n中文名: 乱马\n---\n重制版',
			{ subjectId: 2 },
		);

		expect(Array.from(vault.files.keys()).sort()).toEqual([
			'ACGN/anime/乱马（1989）.md',
			'ACGN/anime/乱马（2024）.md',
		]);
		expect(vault.contents.get('ACGN/anime/乱马（1989）.md')).toContain('id: 1');
		expect(vault.contents.get('ACGN/anime/乱马（2024）.md')).toContain('id: 2');
		const rescanned = new LocalSubjectRegistry(vault.app);
		await rescanned.scan('ACGN');
		expect(rescanned.getById(1)?.path).toBe('ACGN/anime/乱马（1989）.md');
		expect(rescanned.getById(2)?.path).toBe('ACGN/anime/乱马（2024）.md');

		const rollback = await transaction.rollback();
		expect(rollback).toEqual({ attempted: true, changed: true, deletedCreatedFiles: 1, restoredContents: 0, restoredPaths: 1, failed: 0 });
		expect(Array.from(vault.files.keys())).toEqual(['ACGN/anime/乱马.md']);
		expect(vault.contents.get('ACGN/anime/乱马.md')).toContain('旧版用户数据');
	});

	it('restores overwritten content when a cancelled batch rolls back', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/anime/自定义乱马.md', '---\nid: 1\n---\n用户记录');
		const fileManager = new FileManager(vault.app);
		const transaction = new SyncTransaction(vault.app, fileManager);
		await transaction.createOrUpdateFile(
			'ACGN/anime/自定义乱马.md',
			'---\nid: 1\n---\n云端内容',
			{ subjectId: 1, overwrite: true },
		);
		expect(transaction.hasChanges()).toBe(true);
		expect(vault.contents.get('ACGN/anime/自定义乱马.md')).toContain('云端内容');
		await transaction.rollback();
		expect(vault.contents.get('ACGN/anime/自定义乱马.md')).toContain('用户记录');
		expect(await transaction.rollback()).toEqual({
			attempted: false, changed: false, deletedCreatedFiles: 0, restoredContents: 0, restoredPaths: 0, failed: 0,
		});
	});
});
