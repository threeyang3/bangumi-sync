import { describe, expect, it, vi } from 'vitest';
import { resolveScanRoot } from '../../src/sync/scanScope';
import { LocalSubjectRegistry } from '../../src/sync/localSubjectRegistry';
import { InMemoryVault } from '../mocks/inMemoryVault';
import { UserDataExtractor } from '../../src/userData/userDataExtractor';

describe('scan scope contract', () => {
	it.each([
		['Media/{{type}}/{{name_cn}}.md', 'Media'],
		['Media/Anime/{{name_cn}}.md', 'Media/Anime'],
		['{{type}}/{{name_cn}}.md', ''],
		['{{name_cn}}.md', ''],
		['Media//{{id}}.md', 'Media'],
	])('infers %s as %s', (pathTemplate, expected) => {
		expect(resolveScanRoot({ scanFolderPath: '', pathTemplate })).toBe(expected);
	});
	it('uses one common ancestor for all type templates and supports vault-root scans', () => {
		const config = { scanFolderPath: '', pathTemplate: 'Media/Default/{{id}}.md', pathTemplateByType: { anime: 'Media/Anime/{{id}}.md', book: 'Media/Books/{{id}}.md' } };
		expect(resolveScanRoot(config)).toBe('Media');
		expect(resolveScanRoot({ ...config, pathTemplateByType: { book: 'Books/{{id}}.md' } })).toBe('');
		expect(resolveScanRoot({ ...config, scanFolderPath: '/' })).toBe('');
	});
	it('rejects explicit scopes that do not cover every rendered template root', () => {
		expect(() => resolveScanRoot({ scanFolderPath: 'ACGN', pathTemplate: 'Media/{{id}}.md' })).toThrow('does not cover');
		expect(() => resolveScanRoot({ scanFolderPath: 'Media', pathTemplate: 'Media/{{id}}.md', pathTemplateByType: { book: 'Books/{{id}}.md' } })).toThrow('does not cover');
		expect(resolveScanRoot({ scanFolderPath: 'Media/', pathTemplate: 'Media/Anime/{{id}}.md' })).toBe('Media');
	});
	it('accounts for long-path flattening into the first static segment', () => {
		expect(resolveScanRoot({ scanFolderPath: '', pathTemplate: 'Media/Anime/{{name_cn}}/{{name}}/{{id}}.md' })).toBe('Media');
	});
	it('allows an initial missing output folder when no subject notes exist', async () => {
		const vault = new InMemoryVault(); vault.addFile('Welcome.md', 'Welcome');
		expect(await new LocalSubjectRegistry(vault.app).scan('Media')).toBe(0);
	});
	it('refuses a missing or file-valued root when identities could be hidden', async () => {
		const vault = new InMemoryVault(); vault.addFile('Moved/manually-renamed.md', '---\nid: 12345\n---\nKeep');
		await expect(new LocalSubjectRegistry(vault.app).scan('Media')).rejects.toThrow('unavailable');
		vault.addFile('Media', 'Folder path is occupied');
		await expect(new LocalSubjectRegistry(vault.app).scan('Media')).rejects.toThrow('unavailable');
	});
	it('does not read unrelated files on the normal existing-root path', async () => {
		const vault = new InMemoryVault(); const managed = vault.addFile('Media/manual.md', '---\nid: 1\n---');
		vault.addFile('Other/other.md', '---\nid: 2\n---'); const reads = vi.spyOn(vault.app.vault, 'read');
		expect(await new LocalSubjectRegistry(vault.app).scan('Media')).toBe(1);
		expect(reads).toHaveBeenCalledExactlyOnceWith(managed);
	});
	it('uses the Vault root API for a blank root, including user-data extraction', async () => {
		const vault = new InMemoryVault(); vault.addFile('Media/manual.md', '---\nid: 1\n评分: 5\n---\nKeep');
		const lookup = vault.app.vault.getAbstractFileByPath.bind(vault.app.vault);
		vi.spyOn(vault.app.vault, 'getAbstractFileByPath').mockImplementation(path => path === '' ? null : lookup(path));
		expect(await new LocalSubjectRegistry(vault.app).scan('')).toBe(1);
		expect((await new UserDataExtractor(vault.app).extractForExportFromFolder('')).has(1)).toBe(true);
	});
});
