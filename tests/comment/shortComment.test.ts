import { describe, expect, it } from 'vitest';
import {
	buildShortCommentCalloutBlock,
	extractShortComment,
	removeShortComment,
	updateShortComment,
} from '../../src/comment/shortComment';

describe('shortComment', () => {
	it('extracts multi-paragraph comments from a callout block', () => {
		const content = [
			'---',
			'id: 1',
			'---',
			'',
			'> [!abstract]+ **短评**',
			'> 第一段。',
			'>',
			'> 第二段。',
			'',
			'## 感想',
			'正文',
		].join('\n');

		expect(extractShortComment(content)).toBe('第一段。\n第二段。');
	});

	it('stops extracting at the next callout or heading', () => {
		const content = [
			'> [!abstract]+ **短评**',
			'> 第一段。',
			'不是引用但仍属于短评',
			'> [!note]+ **简介**',
			'> 不该被吞进去',
			'## 感想',
			'也不该被吞进去',
		].join('\n');

		expect(extractShortComment(content)).toBe('第一段。\n不是引用但仍属于短评');
	});

	it('renders all paragraphs inside the callout when updating comments', () => {
		const original = [
			'---',
			'id: 1',
			'---',
			'',
			'## 简介',
			'内容',
		].join('\n');

		const updated = updateShortComment(original, '第一段。\n\n第二段。');

		expect(updated).toContain('> [!abstract]+ **短评**');
		expect(updated).toContain('> 第一段。\n> 第二段。');
		expect(extractShortComment(updated)).toBe('第一段。\n第二段。');
	});

	it('removes an empty short comment block without breaking structure', () => {
		const content = [
			'---',
			'id: 1',
			'---',
			'',
			'> [!abstract]+ **短评**',
			'> 要删除',
			'',
			'## 感想',
			'正文',
		].join('\n');

		const updated = removeShortComment(content);
		expect(updated).not.toContain('**短评**');
		expect(updated).toContain('## 感想');
		expect(updated).not.toContain('\n\n\n');
	});

	it('builds an empty block as null and normalizes whitespace', () => {
		expect(buildShortCommentCalloutBlock(' \n\t ')).toBeNull();
		expect(buildShortCommentCalloutBlock(' 第一段 \r\n\r\n 第二段 ')).toBe(
			'> [!abstract]+ **短评**\n> 第一段\n> 第二段'
		);
	});
});
