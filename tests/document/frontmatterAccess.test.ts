import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
	parseYaml: (input: string) => {
		const result: Record<string, unknown> = {};
		const lines = input.split('\n');
		let currentListKey: string | null = null;

		for (const rawLine of lines) {
			if (!rawLine.trim()) {
				continue;
			}

			const listItemMatch = rawLine.match(/^\s*-\s*(.+)$/);
			if (listItemMatch && currentListKey) {
				const current = result[currentListKey];
				if (Array.isArray(current)) {
					current.push(listItemMatch[1].trim().replace(/^"|"$/g, ''));
				}
				continue;
			}

			const fieldMatch = rawLine.match(/^([^:]+):\s*(.*)$/);
			if (!fieldMatch) {
				currentListKey = null;
				continue;
			}

			const key = fieldMatch[1].trim();
			const value = fieldMatch[2].trim();
			if (!value) {
				result[key] = [];
				currentListKey = key;
				continue;
			}

			currentListKey = null;
			if (/^\d+$/.test(value)) {
				result[key] = Number(value);
			} else if (value === 'true' || value === 'false') {
				result[key] = value === 'true';
			} else {
				result[key] = value.replace(/^"|"$/g, '');
			}
		}

		return result;
	},
}));
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
			'进度: "更新至第 12 集"',
			'---',
			'',
			'正文',
		].join('\n');

		const updated = upsertQuotedTextField(content, '进度', '全 13 集');
		expect(readTextField(updated, '进度')).toBe('全 13 集');

		const removed = upsertQuotedTextField(updated, '进度', '');
		expect(hasFrontmatterField(removed, '进度')).toBe(false);
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
