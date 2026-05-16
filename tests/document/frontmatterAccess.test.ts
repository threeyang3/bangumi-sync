import { describe, expect, it } from 'vitest';
import {
	getFrontmatterValue,
	hasFrontmatterField,
	readNumberField,
	readTextField,
	removeYamlListField,
	upsertFrontmatterField,
	upsertQuotedTextField,
	upsertYamlListField,
} from '../../src/document/frontmatterAccess';

describe('frontmatterAccess', () => {
	it('reads text, numbers, and yaml lists from frontmatter', () => {
		const content = [
			'---',
			'评分: "9"',
			'话数: "105话"',
			'tags:',
			'  - 热血',
			'  - 战争',
			'---',
			'',
			'正文',
		].join('\n');

		expect(readTextField(content, '评分')).toBe('9');
		expect(readNumberField(content, '话数')).toBe(105);
		expect(getFrontmatterValue(content, 'tags')).toBe('热血, 战争');
	});

	it('upserts quoted text and removes it when empty', () => {
		const content = [
			'---',
			'连载状态: "连载中"',
			'---',
			'',
			'正文',
		].join('\n');

		const updated = upsertQuotedTextField(content, '连载状态', '已完结');
		expect(readTextField(updated, '连载状态')).toBe('已完结');

		const removed = upsertQuotedTextField(updated, '连载状态', '');
		expect(hasFrontmatterField(removed, '连载状态')).toBe(false);
	});

	it('upserts yaml list fields and removes them cleanly', () => {
		const content = [
			'---',
			'id: 1',
			'---',
			'',
			'正文',
		].join('\n');

		const updated = upsertYamlListField(content, 'tags', ['热血', '战争']);
		expect(getFrontmatterValue(updated, 'tags')).toBe('热血, 战争');

		const removed = removeYamlListField(updated, 'tags');
		expect(hasFrontmatterField(removed, 'tags')).toBe(false);
		expect(removed).not.toContain('\n\n\n');
	});

	it('upserts multiline values without breaking the rest of frontmatter', () => {
		const content = [
			'---',
			'id: 1',
			'标题: 进击的巨人',
			'---',
			'',
			'正文',
		].join('\n');

		const updated = upsertFrontmatterField(content, '感想', '第一段\n第二段');

		expect(updated).toContain('感想: |-');
		expect(updated).toContain('  第一段\n  第二段');
		expect(readTextField(updated, '标题')).toBe('进击的巨人');
	});
});
