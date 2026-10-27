import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportTemplateBundle, parseTemplateBundle } from '../../src/template/templateFiles';
import { migrateTemplateSettings } from '../../common/template/templateSystem';
import { DEFAULT_SETTINGS } from '../../src/settings/settings';
import { InMemoryVault } from '../mocks/inMemoryVault';
import { setWriteOperationGuard } from '../../src/sync/writeOperationGate';

afterEach(() => { vi.useRealTimers(); setWriteOperationGuard(null); });
describe('template export and import', () => {
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
		expect(vault.files.size).toBe(0);
	});
});
