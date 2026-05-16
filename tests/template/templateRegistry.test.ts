import { describe, expect, it } from 'vitest';
import { SubjectType } from '../../common/api/types';
import {
	findTemplateCategoryOption,
	getTemplateFallbackLookupKey,
	getTemplateKeyFallbackForSubjectType,
	resolveTemplateTarget,
} from '../../common/template/templateRegistry';

describe('templateRegistry', () => {
	it('resolves explicit categories to the correct template key', () => {
		expect(findTemplateCategoryOption('TV')?.templateKey).toBe('animeTemplateConfig');
		expect(findTemplateCategoryOption('OVA')?.templateKey).toBe('animeTemplateConfig');
		expect(findTemplateCategoryOption('剧场版')?.templateKey).toBe('animeTemplateConfig');
		expect(findTemplateCategoryOption('漫画')?.templateKey).toBe('comicTemplateConfig');
		expect(findTemplateCategoryOption('画集')?.templateKey).toBe('albumTemplateConfig');
		expect(findTemplateCategoryOption('小说')?.templateKey).toBe('novelTemplateConfig');
		expect(findTemplateCategoryOption('日剧')?.templateKey).toBe('realTemplateConfig');
	});

	it('falls back by subject type when category is missing', () => {
		expect(getTemplateKeyFallbackForSubjectType(SubjectType.Anime)).toBe('animeTemplateConfig');
		expect(getTemplateKeyFallbackForSubjectType(SubjectType.Music)).toBe('musicTemplateConfig');
		expect(getTemplateKeyFallbackForSubjectType(SubjectType.Game)).toBe('gameTemplateConfig');
		expect(getTemplateKeyFallbackForSubjectType(SubjectType.Real)).toBe('realTemplateConfig');
		expect(getTemplateKeyFallbackForSubjectType(SubjectType.Book)).toBe('novelTemplateConfig');
	});

	it('prefers category routing but falls back cleanly when unknown', () => {
		expect(resolveTemplateTarget(SubjectType.Book, '漫画')).toMatchObject({
			templateKey: 'comicTemplateConfig',
			categoryOption: { key: 'book-comic' },
		});

		expect(resolveTemplateTarget(SubjectType.Book, '未知分类')).toEqual({
			categoryOption: undefined,
			templateKey: 'novelTemplateConfig',
		});
	});

	it('builds stable template fallback lookup keys', () => {
		expect(getTemplateFallbackLookupKey('animeTemplateConfig')).toBe('__template_key__:animeTemplateConfig');
	});
});
