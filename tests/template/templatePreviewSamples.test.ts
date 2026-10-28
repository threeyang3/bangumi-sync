import { describe, expect, it } from 'vitest';
import { createTemplatePreviewSample, previewSampleNodes } from '../../src/template/templatePreviewSamples';
import { generatePreferredFilePath } from '../../common/template/pathTemplate';
import { TEMPLATE_NODES, classifySubject } from '../../common/template/templateSystem';
import { extractTemplateVars, generateContentByType } from '../../src/template/contentTemplate';

describe('offline template preview samples', () => {
	it('offers seven root samples, three book samples and keeps leaves fixed', () => {
		expect(previewSampleNodes('default')).toHaveLength(7);
		expect(previewSampleNodes('book')).toEqual(['book/novel', 'book/comic', 'book/album']);
		expect(previewSampleNodes('anime/ova')).toEqual(['anime/ova']);
	});
	it('keeps classification but exercises missing data and filename fallback', () => {
		for (const node of TEMPLATE_NODES) {
			const sample = createTemplatePreviewSample(node.id, 'missing');
			expect(classifySubject(sample.subject).templateKey).toBe(node.templateKey);
			expect(sample.collection).toBeUndefined();
			expect(sample.episodes).toEqual([]);
			expect(sample.characters).toEqual([]);
			expect(sample.subject.name_cn).toBe('');
			expect(sample.subject.date).toBeUndefined();
			expect(generatePreferredFilePath('{{name_cn}}.md', sample.subject)).toBe(sample.subject.name + '.md');
		}
	});
	it('routes all category leaves back to their selected template and preserves category metadata', () => {
		for (const node of TEMPLATE_NODES) {
			const sample = createTemplatePreviewSample(node.id);
			expect(classifySubject(sample.subject).templateKey, node.id).toBe(node.templateKey);
			if (node.category) {
				expect(classifySubject(sample.subject).nodeId, node.id).toBe(node.id);
				expect(sample.subject.platform).toBe(node.category);
			}
		}
	});
	it.each([
		['anime', 'animeMake', '星海动画工作室'], ['book/novel', 'illustration', '示例插画师'],
		['book/comic', 'staff', '示例漫画家'], ['book/album', 'pages', '128'],
		['game', 'develop', '浮岛游戏工作室'], ['music', 'category', '音乐'], ['real', 'actor', '示例演员甲'],
	])('renders relevant data for %s', (id, key, expected) => {
		const { subject, collection, characters, episodes, userEpisodeStatus } = createTemplatePreviewSample(id);
		const vars = extractTemplateVars(subject, collection, characters, undefined, episodes, userEpisodeStatus);
		expect(vars[key]).toContain(expected);
		expect(vars.my_rate).toBe('8');
		expect(vars.my_comment).toContain('虚构短评');
		expect(generateContentByType(subject, collection, characters, undefined, undefined, episodes, userEpisodeStatus)).toContain(subject.name_cn);
	});
	it('renders novel volumes and comic/anime episodes with sample progress', () => {
		for (const id of ['anime', 'book/novel', 'book/comic', 'real']) {
			const { subject, collection, characters, episodes, userEpisodeStatus } = createTemplatePreviewSample(id);
			const vars = extractTemplateVars(subject, collection, characters, undefined, episodes, userEpisodeStatus);
			expect(vars[id === 'book/novel' ? 'volumes_display' : 'episodes']).toContain('启程');
		}
	});
	it('returns independent data on every preview', () => {
		const sample = createTemplatePreviewSample('anime'); sample.subject.name_cn = 'changed'; sample.episodes.length = 0;
		expect(createTemplatePreviewSample('anime').subject.name_cn).toContain('星海列车');
		expect(createTemplatePreviewSample('anime').episodes).toHaveLength(3);
	});
});
