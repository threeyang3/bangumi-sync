import { describe, expect, it } from 'vitest';
import { Subject, SubjectType } from '../../common/api/types';
import { extractPathVars, generateFilePath } from '../../common/template/pathTemplate';

function subject(overrides: Partial<Subject> = {}): Subject {
	return {
		id: 123,
		type: SubjectType.Anime,
		name: 'Ranma 1/2',
		name_cn: '乱马1/2',
		summary: '',
		date: '1989-04-15',
		platform: 'TV',
		images: {},
		infobox: [{ key: '中文名', value: '乱马1/2' }],
		rating: { rank: 0, total: 0, count: {}, score: 0 },
		collection: { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 },
		tags: [],
		nsfw: false,
		locked: false,
		series: false,
		volumes: 0,
		eps: 0,
		total_episodes: 0,
		meta_tags: [],
		...overrides,
	};
}

describe('path templates', () => {
	it('supports year and id while preserving illegal title characters visibly', () => {
		expect(generateFilePath('ACGN/{{type}}/{{name_cn}}（{{year}}）[{{id}}]', subject()))
			.toBe('ACGN/anime/乱马1／2（1989）[123].md');
	});

	it('uses an empty year for missing or malformed dates', () => {
		expect(extractPathVars(subject({ date: undefined })).year).toBe('');
		expect(extractPathVars(subject({ date: 'unknown' })).year).toBe('');
	});

	it('removes path segments made empty by template variables', () => {
		expect(generateFilePath('ACGN/{{author}}/{{name_cn}}.md', subject({ infobox: [] })))
			.toBe('ACGN/乱马1／2.md');
	});

	it('rejects unknown variables instead of emitting an unsafe literal path', () => {
		expect(() => generateFilePath('ACGN/{{unknown}}/{{name_cn}}.md', subject()))
			.toThrow('Unknown path template variable(s): unknown');
	});

	it('falls back from Chinese name to original name and then ID', () => {
		expect(generateFilePath('{{name_cn}}', subject({ name_cn: '', name: 'Ranma' }))).toBe('Ranma.md');
		expect(generateFilePath('{{name_cn}}', subject({ name_cn: '', name: '' }))).toBe('123.md');
	});

	it('makes Windows reserved stems safe before the Markdown extension', () => {
		expect(generateFilePath('{{name_cn}}.md', subject({ name_cn: 'CON' }))).toBe('CON＿.md');
	});
});
