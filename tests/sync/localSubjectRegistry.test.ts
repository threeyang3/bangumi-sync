import { describe, expect, it } from 'vitest';
import { LocalSubjectRegistry } from '../../src/sync/localSubjectRegistry';

const app = {} as never;

function record(subjectId: number, path: string) {
	return {
		subjectId,
		path,
		nameCn: '作品',
		identitySource: 'id' as const,
		namingState: 'unknown' as const,
	};
}

describe('local subject registry', () => {
	it('maintains bidirectional identity and normalized path ownership', () => {
		const registry = new LocalSubjectRegistry(app);
		registry.register(record(1, 'ACGN/Anime/Café.md'));
		expect(registry.getById(1)?.path).toBe('ACGN/Anime/Café.md');
		expect(registry.getPathOwner('acgn/anime/Cafe\u0301.md')).toBe(1);
	});

	it('blocks duplicate IDs instead of allowing the later file to win', () => {
		const registry = new LocalSubjectRegistry(app);
		registry.register(record(1, 'ACGN/a.md'));
		registry.register(record(1, 'ACGN/b.md'));
		expect(registry.getById(1)).toBeUndefined();
		expect(registry.duplicateIds.get(1)).toEqual(['ACGN/a.md', 'ACGN/b.md']);
		expect(registry.invalidFiles.filter(problem => problem.code === 'duplicate-id')).toHaveLength(2);
	});

	it('rejects a normalized path owned by a different ID', () => {
		const registry = new LocalSubjectRegistry(app);
		registry.register(record(1, 'ACGN/Work.md'));
		registry.register(record(2, 'acgn/work.md'));
		expect(registry.getById(2)).toBeUndefined();
		expect(registry.invalidFiles.at(-1)?.code).toBe('path-collision');
	});

	it('detects user renames from persisted managed-path state', () => {
		const registry = new LocalSubjectRegistry(app);
		registry.register(record(1, 'ACGN/我最喜欢的旧版乱马.md'));
		registry.reconcilePathStates({
			'1': {
				subjectId: 1,
				currentPath: 'ACGN/乱马.md',
				lastManagedPath: 'ACGN/乱马.md',
				namingState: 'managed',
			},
		});
		expect(registry.getById(1)?.namingState).toBe('user-renamed');
		expect(registry.exportPathStates()['1']).toEqual({
			subjectId: 1,
			currentPath: 'ACGN/我最喜欢的旧版乱马.md',
			lastManagedPath: 'ACGN/乱马.md',
			namingState: 'user-renamed',
		});
	});
});
