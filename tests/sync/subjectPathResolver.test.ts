import { describe, expect, it } from 'vitest';
import { SubjectPathCandidate, SubjectPathResolver } from '../../src/sync/subjectPathResolver';

const resolver = new SubjectPathResolver();

function candidate(overrides: Partial<SubjectPathCandidate> & Pick<SubjectPathCandidate, 'subjectId'>): SubjectPathCandidate {
	return {
		preferredPath: 'ACGN/anime/乱马.md',
		year: '1989',
		namingState: 'managed',
		...overrides,
	};
}

describe('subject path resolver', () => {
	it('uses simple names until a collision exists', () => {
		const plan = resolver.plan([candidate({ subjectId: 1 })]);
		expect(plan.allocations.get(1)?.finalPath).toBe('ACGN/anime/乱马.md');
	});

	it('renames a managed collision group symmetrically by unique year', () => {
		const plan = resolver.plan([
			candidate({ subjectId: 1, currentPath: 'ACGN/anime/乱马.md', year: '1989' }),
			candidate({ subjectId: 2, year: '2024' }),
		]);
		expect(plan.allocations.get(1)?.finalPath).toBe('ACGN/anime/乱马（1989）.md');
		expect(plan.allocations.get(2)?.finalPath).toBe('ACGN/anime/乱马（2024）.md');
		expect(plan.renamed).toEqual([
			{ subjectId: 1, from: 'ACGN/anime/乱马.md', to: 'ACGN/anime/乱马（1989）.md' },
		]);
	});

	it('uses IDs when years are equal or missing', () => {
		const sameYear = resolver.plan([
			candidate({ subjectId: 1, year: '2024' }),
			candidate({ subjectId: 2, year: '2024' }),
		]);
		expect(sameYear.allocations.get(1)?.finalPath).toBe('ACGN/anime/乱马（2024）[bgm-1].md');
		expect(sameYear.allocations.get(2)?.finalPath).toBe('ACGN/anime/乱马（2024）[bgm-2].md');

		const missingYear = resolver.plan([
			candidate({ subjectId: 1, year: undefined }),
			candidate({ subjectId: 2, year: '2024' }),
		]);
		expect(missingYear.allocations.get(1)?.finalPath).toBe('ACGN/anime/乱马[bgm-1].md');
		expect(missingYear.allocations.get(2)?.finalPath).toBe('ACGN/anime/乱马（2024）[bgm-2].md');
	});

	it('protects user-renamed and unknown existing paths', () => {
		const plan = resolver.plan([
			candidate({
				subjectId: 1,
				currentPath: '我的动画/最喜欢的旧版乱马.md',
				namingState: 'user-renamed',
			}),
			candidate({ subjectId: 2, year: '2024' }),
		]);
		expect(plan.allocations.get(1)?.finalPath).toBe('我的动画/最喜欢的旧版乱马.md');
		expect(plan.renamed).toHaveLength(0);
		expect(plan.allocations.get(2)?.finalPath).toBe('ACGN/anime/乱马（2024）.md');
	});

	it('resolves collisions after Unicode and case normalization', () => {
		const plan = resolver.plan([
			candidate({ subjectId: 1, preferredPath: 'ＡＣＧＮ/Work/Café.md', year: '2000' }),
			candidate({ subjectId: 2, preferredPath: 'acgn/work/CAFE\u0301.md', year: '2001' }),
		]);
		expect(plan.allocations.get(1)?.finalPath).toContain('（2000）');
		expect(plan.allocations.get(2)?.finalPath).toContain('（2001）');
	});

	it('allocates the same paths regardless of worker input order', () => {
		const inputs = [
			candidate({ subjectId: 1, year: '1989' }),
			candidate({ subjectId: 2, year: '2024' }),
			candidate({ subjectId: 3, year: '2000' }),
		];
		const forward = resolver.plan(inputs).allocations;
		const reverse = resolver.plan([...inputs].reverse()).allocations;
		for (const input of inputs) {
			expect(reverse.get(input.subjectId)?.finalPath).toBe(forward.get(input.subjectId)?.finalPath);
		}
	});
});
