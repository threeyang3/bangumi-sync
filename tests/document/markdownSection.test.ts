import { describe, expect, it } from 'vitest';
import {
	extractMarkdownSection,
	updateEpisodeMarkdownSection,
	updateMarkdownSection,
} from '../../src/document/markdownSection';

describe('markdownSection', () => {
	it('extracts a section until the next same-level heading', () => {
		const content = [
			'# 标题',
			'',
			'## 记录',
			'第一行',
			'第二行',
			'',
			'## 感想',
			'后续内容',
		].join('\n');

		expect(extractMarkdownSection(content, '记录')).toBe('第一行\n第二行');
	});

	it('updates an existing section without swallowing the next section', () => {
		const content = [
			'## 记录',
			'旧内容',
			'',
			'## 感想',
			'保留内容',
		].join('\n');

		const updated = updateMarkdownSection(content, '记录', '新内容');

		expect(updated).toContain('## 记录\n\n新内容\n## 感想');
		expect(extractMarkdownSection(updated, '感想')).toBe('保留内容');
	});

	it('appends a missing section with normalized spacing', () => {
		const content = [
			'---',
			'id: 1',
			'---',
			'',
			'正文',
		].join('\n');

		expect(updateMarkdownSection(content, '感想', '补充内容')).toBe([
			'---',
			'id: 1',
			'---',
			'',
			'正文',
			'',
			'## 感想',
			'',
			'补充内容',
			'',
		].join('\n'));
	});

	it('inserts the episode section before 记录 when missing', () => {
		const content = [
			'---',
			'id: 1',
			'---',
			'',
			'## 记录',
			'原有记录',
		].join('\n');

		const updated = updateEpisodeMarkdownSection(content, '- 01');

		expect(updated).toContain('## 集数\n\n- 01\n\n## 记录');
	});
});
