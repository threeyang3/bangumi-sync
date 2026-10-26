import { describe, expect, it, vi } from 'vitest';
import { UserDataImporter } from '../../src/userData/userDataImporter';
import { UserDataType } from '../../src/userData/types';
import { InMemoryVault } from '../mocks/inMemoryVault';

describe('import writeback safety', () => {
	it.each(['plan', 'decisions', 'missing'])('preserves a concurrent edit in the %s entry', async entry => {
		const vault = new InMemoryVault(); const original = '---\nid: 1\n评分: 5\n---\nBody';
		const file = vault.addFile('ACGN/one.md', original);
		const importer = new UserDataImporter(vault.app);
		const process = vault.app.vault.process.bind(vault.app.vault);
		vi.spyOn(vault.app.vault, 'process').mockImplementation((target, updater) => {
			vault.contents.set(file.path, original + '\nNew thoughts'); return process(target, updater);
		});
		if (entry === 'plan') {
			const result = await importer.applyImportPlan([{ name: 'fixture.json', content: JSON.stringify({
				version: '3.0', items: { 1: { identifier: { id: 1, name_cn: '', type: 2 }, customProperties: { '评分': 8 } } },
			}) }], { mergeStrategy: 'prefer_import', dataTypes: [UserDataType.ALL] });
			expect(result.success).toBe(0); expect(result.errors).toHaveLength(1);
		} else if (entry === 'decisions') {
			await expect(importer.applyImportDecisions([{ subjectId: 1, name_cn: '', hasDiff: true, diffs: [
				{ fieldName: '评分', fieldType: 'frontmatter', localValue: 5, importValue: 8, decision: 'import' },
			] }])).rejects.toThrow('Note changed');
		} else {
			await expect(importer.applyMissingFieldDecisions([{ subjectId: 1, subjectName: '', fieldName: 'test', fieldValue: 'new', decision: 'add' }])).rejects.toThrow('Note changed');
		}
		expect(vault.contents.get(file.path)).toBe(original + '\nNew thoughts');
	});
});
