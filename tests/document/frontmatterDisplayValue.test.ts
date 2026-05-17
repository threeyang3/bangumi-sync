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
	coerceFrontmatterDraftValue,
	extractFrontmatterRecord,
	formatFrontmatterDisplayValue,
} from '../../src/document/frontmatterAccess';

describe('frontmatter display values', () => {
	it('keeps primitive values visible for batch editing', () => {
		expect(formatFrontmatterDisplayValue('看过')).toBe('看过');
		expect(formatFrontmatterDisplayValue(9)).toBe('9');
		expect(formatFrontmatterDisplayValue(true)).toBe('true');
		expect(formatFrontmatterDisplayValue(['恋爱', '校园'])).toBe('恋爱, 校园');
	});

	it('coerces edited values using the original frontmatter value shape', () => {
		expect(coerceFrontmatterDraftValue('1, 2, 3', ['a'])).toEqual(['1', '2', '3']);
		expect(coerceFrontmatterDraftValue('10', 1)).toBe(10);
		expect(coerceFrontmatterDraftValue('false', true)).toBe(false);
		expect(coerceFrontmatterDraftValue('文本', undefined)).toBe('文本');
	});

	it('extracts a plain frontmatter record from markdown content', () => {
		const record = extractFrontmatterRecord([
			'---',
			'id: 123',
			'中文名: 测试条目',
			'tags:',
			'  - A',
			'  - B',
			'---',
			'正文',
		].join('\n'));

		expect(record).toMatchObject({
			id: 123,
			中文名: '测试条目',
			tags: ['A', 'B'],
		});
		expect(record.position).toBeUndefined();
	});
});
