import { describe, expect, it } from 'vitest';
import {
	isDescendantPath,
	limitPathLength,
	normalizePathCollisionKey,
	sanitizeFileName,
} from '../../common/file/pathUtils';

describe('path utilities', () => {
	it('replaces illegal ASCII filename characters with full-width equivalents', () => {
		expect(sanitizeFileName('乱马1/2:重制?*\\')).toBe('乱马1／2：重制？＊＼');
	});

	it('handles reserved names, control characters, trailing dots and spaces', () => {
		expect(sanitizeFileName('CON')).toBe('CON＿');
		expect(sanitizeFileName('COM1.txt')).toBe('COM1.txt＿');
		expect(sanitizeFileName('a\u0000b. ')).toBe('ab．　');
		expect(sanitizeFileName(' . ', '123')).toBe('123');
	});

	it('normalizes Unicode and case for collision detection', () => {
		expect(normalizePathCollisionKey('ACGN/Cafe\u0301.md')).toBe(
			normalizePathCollisionKey('acgn/CAFÉ.md'),
		);
		expect(normalizePathCollisionKey('ＡＣＧＮ／乱马１／２.md')).toBe(
			normalizePathCollisionKey('acgn/乱马1/2.md'),
		);
	});

	it('truncates long names deterministically', () => {
		const value = '作品'.repeat(100);
		const first = sanitizeFileName(value);
		expect(first.length).toBeLessThanOrEqual(120);
		expect(sanitizeFileName(value)).toBe(first);
	});

	it('limits complete paths without losing the Markdown extension', () => {
		const path = `${'目录/'.repeat(80)}${'作品'.repeat(100)}.md`;
		const limited = limitPathLength(path);
		expect(limited.length).toBeLessThanOrEqual(240);
		expect(limited.endsWith('.md')).toBe(true);
		expect(limitPathLength(path)).toBe(limited);
	});

	it('counts emoji as UTF-16 code units for Windows path limits', () => {
		const limited = limitPathLength(`ACGN/${'😀'.repeat(200)}.md`);
		expect(limited.length).toBeLessThanOrEqual(240);
		expect(limited.endsWith('.md')).toBe(true);
	});

	it('matches only the selected folder and its descendants', () => {
		expect(isDescendantPath('ACGN', 'ACGN')).toBe(true);
		expect(isDescendantPath('ACGN/anime/a.md', 'ACGN')).toBe(true);
		expect(isDescendantPath('ACGN_backup/a.md', 'ACGN')).toBe(false);
		expect(isDescendantPath('ACGN-old/a.md', 'ACGN')).toBe(false);
		expect(isDescendantPath('ACGN2/a.md', 'ACGN')).toBe(false);
	});
});
