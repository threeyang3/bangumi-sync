import { describe, expect, it } from 'vitest';
import { FileManager, SubjectPathCollisionError } from '../../common/file/fileManager';
import { InMemoryVault } from '../mocks/inMemoryVault';

describe('FileManager identity-safe writes', () => {
	it('never overwrites or merges a different subject at the same path', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/anime/乱马.md', '---\nid: 1\n评分: 10\n---\nold');
		const manager = new FileManager(vault.app);

		await expect(manager.createOrUpdateFile(
			'ACGN/anime/乱马.md',
			'---\nid: 2\n---\nnew',
			{ overwrite: true, subjectId: 2 },
		)).rejects.toBeInstanceOf(SubjectPathCollisionError);
		expect(vault.contents.get('ACGN/anime/乱马.md')).toContain('id: 1');
		expect(vault.contents.get('ACGN/anime/乱马.md')).toContain('评分: 10');
	});

	it('returns created, updated and unchanged truthfully', async () => {
		const vault = new InMemoryVault();
		const manager = new FileManager(vault.app);
		const first = await manager.createOrUpdateFile('ACGN/a.md', '---\nid: 1\n---\n', { subjectId: 1 });
		const unchanged = await manager.createOrUpdateFile('ACGN/a.md', 'different', { subjectId: 1 });
		const updated = await manager.createOrUpdateFile('ACGN/a.md', '---\nid: 1\n---\nupdated', {
			subjectId: 1,
			overwrite: true,
		});
		expect([first.status, unchanged.status, updated.status]).toEqual(['created', 'unchanged', 'updated']);
	});
});
