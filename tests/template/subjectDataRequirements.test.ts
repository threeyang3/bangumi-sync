import { describe, expect, it } from 'vitest';
import { Subject, SubjectType } from '../../common/api/types';
import { getSubjectDataRequirements } from '../../src/template/subjectDataRequirements';

const subject = (type = SubjectType.Anime, platform = 'TV') => ({ type, platform, infobox: [] } as unknown as Subject);
const needs = (template: string, value = subject(), links = false) => getSubjectDataRequirements(value,
	{ TV: template, '__template_key__:animeTemplateConfig': template, '__template_key__:novelTemplateConfig': template,
		'__template_key__:comicTemplateConfig': template, '__template_key__:realTemplateConfig': template }, links);

describe('subject data requirements', () => {
	it('uses only full subject fields for minimal templates, including path author/category/year inputs', () => {
		expect(needs('{{id}} {{summary}} {{author}} {{category}} {{year}} {{episode}}')).toEqual({ characters: false, persons: false, relations: false, episodes: false });
	});
	it.each(['{{character1}}', '{{characterCV9|Unknown}}', '{{#if characterPhoto3}}present{{/if}}', '{{#if name}}{{character2}}{{/if}}'])('recognizes character dependency in %s', template => {
		expect(needs(template).characters).toBe(true);
	});
	it('conservatively inspects conditional bodies, defaults and conditional keys', () => {
		expect(needs('{{#if name}}{{episodes|No episodes}}{{/if}}').episodes).toBe(true);
		expect(needs('{{#if animeMake}}Studio{{/if}}').persons).toBe(true);
	});
	it('uses infobox and copyright studio values before requesting persons', () => {
		const value = subject();
		value.infobox = [{ key: '动画制作', value: 'Studio' }];
		expect(needs('{{animeMake}}', value).persons).toBe(false);
		value.infobox = [{ key: 'Copyright', value: '© 1989 Studio Ghibli' }];
		expect(needs('{{animeMake}}', value).persons).toBe(false);
	});
	it('keeps relation fetching tied to the feature even if related is absent from the template', () => {
		expect(needs('{{id}}', subject(), true).relations).toBe(true);
		expect(needs('{{related}}', subject(), false).relations).toBe(false);
	});
	it.each([
		[SubjectType.Anime, 'TV', '{{episodes}}', true],
		[SubjectType.Real, '电视剧', '{{episodes}}', true],
		[SubjectType.Book, '小说', '{{volumes_display}}', true],
		[SubjectType.Book, '漫画', '{{episodes}}', true],
		[SubjectType.Book, '小说', '{{episodes}}', false],
		[SubjectType.Book, '画集', '{{episodes}}{{volumes_display}}', false],
		[SubjectType.Music, '', '{{episodes}}', false],
	] as const)('matches episode display support for type %s / %s', (type, platform, template, expected) => {
		expect(needs(template, subject(type, platform)).episodes).toBe(expected);
	});
	it('resolves actual category templates before fallback templates', () => {
		const value = subject();
		expect(getSubjectDataRequirements(value, { TV: '{{id}}', '__template_key__:animeTemplateConfig': '{{episodes}}' }, false).episodes).toBe(false);
	});
	it('follows the renderer novel-first rule when book category contains both novel and comic', () => {
		const value = subject(SubjectType.Book, '漫画');
		value.infobox = [{ key: '类型', value: '小说漫画' }];
		expect(needs('{{episodes}}', value).episodes).toBe(false);
		expect(needs('{{volumes_display}}', value).episodes).toBe(true);
	});
});
