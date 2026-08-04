import { describe, expect, it } from 'vitest';
import { SubjectDocumentService } from '../../src/document/subjectDocumentService';

const service = new SubjectDocumentService({} as never);

describe('subject identity', () => {
	it('prefers the canonical id field', () => {
		const identity = service.getSubjectIdentityFromContent('---\nid: 123\nBangumiID: 123\n---\n');
		expect(identity).toEqual({ subjectId: 123, source: 'id' });
	});

	it('supports legacy and migration fallback sources', () => {
		expect(service.getSubjectIdentityFromContent('---\nBangumiID: "456"\n---\n').source).toBe('BangumiID');
		expect(service.getSubjectIdentityFromContent('https://bgm.tv/subject/789').source).toBe('bangumi-url');
		expect(service.getSubjectIdentityFromContent('![[assets/987_cover.jpg]]').source).toBe('cover-path');
	});

	it('reports disagreement instead of silently choosing one identity', () => {
		const identity = service.getSubjectIdentityFromContent(
			'---\nid: 123\nBangumiID: 456\nBangumi链接: https://bgm.tv/subject/789\n封面: assets/987_cover.jpg\n---\n',
		);
		expect(identity.subjectId).toBe(123);
		expect(identity.conflicts).toEqual([
			{ source: 'BangumiID', value: 456 },
			{ source: 'bangumi-url', value: 789 },
			{ source: 'cover-path', value: 987 },
		]);
	});

	it('ignores unrelated Bangumi links in the note body when frontmatter owns the identity', () => {
		const identity = service.getSubjectIdentityFromContent(
			'---\nid: 123\n---\n\nSee also https://bgm.tv/subject/456',
		);
		expect(identity).toEqual({ subjectId: 123, source: 'id' });
	});

	it('reports a missing identity', () => {
		expect(service.getSubjectIdentityFromContent('---\n中文名: 乱马\n---\n'))
			.toEqual({ subjectId: null, source: 'missing' });
	});
});
