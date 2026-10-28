import { describe, expect, it } from 'vitest';
import { createTemplatePreviewSample } from '../../src/template/templatePreviewSamples';
import { TEMPLATE_NODES, classifySubject } from '../../common/template/templateSystem';
import { extractTemplateVars, generateContentByType } from '../../src/template/contentTemplate';

describe('offline template preview samples', () => {
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
