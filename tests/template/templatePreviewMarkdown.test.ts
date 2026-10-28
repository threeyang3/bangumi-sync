import { describe, expect, it } from 'vitest';
import { prepareTemplatePreviewMarkdown } from '../../src/template/templatePreviewMarkdown';

describe('Dataview preview projection', () => {
	it('uses generated properties including lists, zero and false, without altering source', () => {
		const source = '---\n作者: 示例作者\n评分: 0\n完成: false\ntags:\n  - 示例\n  - 动画\n---\n`= this.作者` / `= this.评分` / `= this.完成` / `= this.tags` / `= this.不存在`';
		const result = prepareTemplatePreviewMarkdown(source);
		expect(result.markdown).toBe('示例作者 / 0 / false / 示例, 动画 / —');
		expect(result.resolved).toBe(5);
		expect(source).toContain('`= this.作者`');
	});
	it('leaves executable queries and scripts as inert code', () => {
		const source = '`= length(this.tags)` `$= dv.current()`\n```dataview\nLIST\n```\n> ~~~dataviewjs\n> dv.list([])\n> ~~~';
		const result = prepareTemplatePreviewMarkdown(source);
		expect(result.unsupported).toBe(4);
		expect(result.markdown).toContain('`Dataview: = length(this.tags)`');
		expect(result.markdown).toContain('```text');
		expect(result.markdown).toContain('> ~~~text');
	});
	it('does not substitute fields inside fenced examples and escapes property markup', () => {
		const result = prepareTemplatePreviewMarkdown('---\n作者: <b>甲</b>|乙\n---\n```md\n`= this.作者`\n```\n`= this.作者`');
		expect(result.resolved).toBe(1);
		expect(result.markdown).toContain('```md\n`= this.作者`\n```');
		expect(result.markdown).toContain('&#60;b&#62;甲&#60;/b&#62;&#124;乙');
	});
});
