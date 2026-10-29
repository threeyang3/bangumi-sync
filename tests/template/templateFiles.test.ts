import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportTemplateBundle, parseTemplateBundle, readTemplateBundleImport, preflightTemplateImport, restoreTemplateBundleFiles } from '../../src/template/templateFiles';
import { migrateTemplateSettings } from '../../common/template/templateSystem';
import { DEFAULT_SETTINGS } from '../../src/settings/settings';
import { InMemoryVault } from '../mocks/inMemoryVault';
import { setWriteOperationGuard } from '../../src/sync/writeOperationGate';

afterEach(() => { vi.useRealTimers(); setWriteOperationGuard(null); });
describe('template export and import', () => {
	it('restores exported file bytes across vaults and keeps original files and inactive drafts', async () => {
		const source = new InMemoryVault(); const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		source.addFile('comic.md', '# Saved {{name}}');
		settings.rules['book/comic'].content = { mode: 'file', filePath: 'comic.md', customContent: 'inactive draft' };
		const folder = await exportTemplateBundle(source.app, settings, 'Templates');
		const bundle = readTemplateBundleImport(source.contents.get(`${folder}/manifest.json`)!);
		source.contents.set('comic.md', 'Changed externally');
		const target = new InMemoryVault(); target.addFile('comic.md', 'Target user file');
		const restored = await restoreTemplateBundleFiles(target.app, bundle, 'Templates');
		const path = restored.rules['book/comic'].content!.filePath!;
		expect(path).not.toBe('comic.md');
		expect(target.contents.get(path)).toBe('# Saved {{name}}');
		expect(target.contents.get('comic.md')).toBe('Target user file');
		expect(restored.rules['book/comic'].content!.customContent).toBe('inactive draft');
		expect(await preflightTemplateImport(target.app, { settings: restored, fileSnapshots: {} }, false)).toEqual([]);
	});
	it('preflights inherited missing, blank and structurally invalid templates without writes', async () => {
		const vault = new InMemoryVault(); const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		settings.rules.anime.content = { mode: 'file', filePath: 'missing.md' };
		const bundle = { settings, fileSnapshots: {} };
		const errors = await preflightTemplateImport(vault.app, bundle, false);
		expect(errors.some(error => error.startsWith('anime/tv ← anime'))).toBe(true);
		await expect(restoreTemplateBundleFiles(vault.app, bundle, 'Templates')).rejects.toThrow();
		expect(vault.files.size).toBe(0);
		for (const text of ['', '{{#if name}}broken']) {
			bundle.fileSnapshots = { anime: text };
			expect((await preflightTemplateImport(vault.app, bundle, true)).length).toBeGreaterThan(0);
		}
	});
	it('accepts old rule-only bundles but rejects malformed snapshot mappings', () => {
		const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		expect(readTemplateBundleImport(JSON.stringify({ format: 'bangumi-template-bundle', settings })).fileSnapshots).toEqual({});
		expect(() => readTemplateBundleImport(JSON.stringify({ format: 'bangumi-template-bundle', settings, fileSnapshots: { anime: 'bad' } }))).toThrow('Invalid file snapshot');
	});
	it('creates unique bundles and never overwrites a user-edited template', async () => {
		vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
		const vault = new InMemoryVault();
		const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		const first = await exportTemplateBundle(vault.app, settings, 'Templates');
		vault.contents.set(`${first}/anime.md`, 'User changes');
		const second = await exportTemplateBundle(vault.app, settings, 'Templates');
		expect(second).not.toBe(first);
		expect(vault.contents.get(`${first}/anime.md`)).toBe('User changes');
		expect(parseTemplateBundle(vault.contents.get(`${second}/manifest.json`)!)).toEqual(settings);
		expect(vault.contents.has(`${second}/anime--tv.md`)).toBe(false);
	});
	it('retains drafts and unavailable file references in backups without substituting builtins', async () => {
		const vault = new InMemoryVault(); const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		settings.rules.anime.content = { mode: 'file', filePath: 'missing.md', customContent: 'unsaved draft' };
		const folder = await exportTemplateBundle(vault.app, settings, 'Templates');
		const manifest = vault.contents.get(`${folder}/manifest.json`)!;
		expect(manifest).toContain('"unavailable"');
		expect(parseTemplateBundle(manifest)).toEqual(settings);
		expect(vault.contents.has(`${folder}/anime.md`)).toBe(false);
	});
	it('obeys the global write gate before any filesystem mutation', async () => {
		const vault = new InMemoryVault();
		setWriteOperationGuard(() => { throw new Error('Recovery required'); });
		await expect(exportTemplateBundle(vault.app, migrateTemplateSettings(DEFAULT_SETTINGS), 'Templates')).rejects.toThrow('Recovery required');
		expect(vault.files.size).toBe(0);
		expect(vault.folders.size).toBe(1);
	});
	it('aborts on a concurrent create conflict without replacing its contents', async () => {
		const vault = new InMemoryVault(); const create = vault.app.vault.create.bind(vault.app.vault);
		vi.spyOn(vault.app.vault, 'create').mockImplementation((path, content) => {
			if (path.endsWith('/anime.md')) vault.addFile(path, 'Concurrent user file');
			return create(path, content);
		});
		await expect(exportTemplateBundle(vault.app, migrateTemplateSettings(DEFAULT_SETTINGS), 'Templates')).rejects.toThrow('File exists');
		expect([...vault.contents.values()]).toContain('Concurrent user file');
	});
	it('rejects invalid imports and directory traversal', async () => {
		const vault = new InMemoryVault();
		expect(() => parseTemplateBundle('{"format":"other"}')).toThrow('Invalid template bundle');
		await expect(exportTemplateBundle(vault.app, migrateTemplateSettings(DEFAULT_SETTINGS), '../notes')).rejects.toThrow('vault-relative');
		await expect(exportTemplateBundle(vault.app, migrateTemplateSettings(DEFAULT_SETTINGS), '  /notes  ')).rejects.toThrow('vault-relative');
		await expect(exportTemplateBundle(vault.app, migrateTemplateSettings(DEFAULT_SETTINGS), '  C:\\notes  ')).rejects.toThrow('vault-relative');
		expect(vault.files.size).toBe(0);
	});
});
