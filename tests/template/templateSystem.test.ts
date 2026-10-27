import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings/settings';
import { TEMPLATE_CATEGORY_OPTIONS, resolveTemplateTarget } from '../../common/template/templateRegistry';
import { classifySubject, compileTemplateSettings, LEGACY_CATEGORY_IDS, migrateTemplateSettings, resolveNodeContent, resolveTemplateRule, TEMPLATE_GROUP_IDS, TEMPLATE_NODES, templateLookupKey, validateTemplateSettings } from '../../common/template/templateSystem';
import { Subject, SubjectType } from '../../common/api/types';
import { getBuiltInTemplateByKey } from '../../common/template/defaultTemplates';
import { resolveTemplateForSubject } from '../../src/template/contentTemplate';
import { getSubjectDataRequirements } from '../../src/template/subjectDataRequirements';
import { generatePreferredFilePath } from '../../common/template/pathTemplate';
import { SyncManager } from '../../src/sync/syncManager';
import { InMemoryVault } from '../mocks/inMemoryVault';

const subject = (type: SubjectType, platform: string, category = ''): Subject => ({ id: 10, type, platform, name: 'Example', name_cn: '测试/标题', date: '2026-01-01', summary: '', infobox: [{ key: '类型', value: category }], images: {}, rating: { rank: 0, total: 0, score: 0, count: {} }, collection: { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 }, tags: [], nsfw: false, locked: false, series: false, volumes: 0, eps: 0, total_episodes: 0, meta_tags: [] });
const noFile = () => Promise.reject<string>(new Error('Missing'));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('unified template system', () => {
	it('uses compiled group paths and content through the real identity-safe sync pipeline', async () => {
		vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
		const vault = new InMemoryVault();
		const system = migrateTemplateSettings(DEFAULT_SETTINGS);
		system.rules['book/comic'] = { content: { mode: 'custom', customContent: '---\nid: {{id}}\n---\nComic {{name_cn}}' }, path: { mode: 'custom', value: 'ACGN/Comics/{{id}}.md' } };
		const compiled = await compileTemplateSettings(system, noFile);
		const value = subject(SubjectType.Book, '漫画', '少年漫画');
		const manager = new SyncManager(vault.app, { accessToken: '', pathTemplate: compiled.paths.default, pathTemplateByType: compiled.paths, customTemplates: compiled.customTemplates, imagePathTemplate: 'ACGN/{{id}}.jpg', downloadImages: false, imageQuality: 'large', imageUpdateExisting: false, enableRelatedLinks: false, scanFolderPath: 'ACGN' });
		vi.spyOn(manager.client, 'getFullSubjectInfo').mockResolvedValue({ subject: value, characters: [], persons: [], relations: [] });
		const result = await manager.syncByCollections([{ subject_id: 10, subject_type: SubjectType.Book, type: 2, rate: 0, tags: [], ep_status: 0, vol_status: 0, updated_at: '', private: false, subject: { ...value, short_summary: '', collection_total: 0, score: 0, rank: 0 } }], {});
		expect(result.completion).toBe('success');
		expect(vault.contents.get('ACGN/Comics/10.md')).toContain('Comic 测试/标题');
	});
	it('maps all seven groups, twenty-five category overrides and five paths without mutating legacy settings', async () => {
		const legacy = structuredClone(DEFAULT_SETTINGS);
		legacy.templateConfigByCategory = {};
		for (const option of TEMPLATE_CATEGORY_OPTIONS) legacy.templateConfigByCategory[option.key] = { source: 'custom', customContent: option.key, filePath: 'draft.md' };
		legacy.pathTemplateByType = Object.fromEntries(['anime', 'book', 'game', 'music', 'real'].map(type => [type, `Library/${type}/{{id}}.md`]));
		const before = JSON.stringify(legacy);
		const migrated = migrateTemplateSettings(legacy);
		expect(TEMPLATE_CATEGORY_OPTIONS).toHaveLength(25);
		for (const [key, id] of Object.entries(TEMPLATE_GROUP_IDS)) expect(await resolveNodeContent(migrated, id, noFile)).toBe(getBuiltInTemplateByKey(key as keyof typeof TEMPLATE_GROUP_IDS, false));
		for (const option of TEMPLATE_CATEGORY_OPTIONS) {
			const id = LEGACY_CATEGORY_IDS[option.key];
			expect(await resolveNodeContent(migrated, id, noFile)).toBe(option.key);
			expect(migrated.rules[id].content?.filePath).toBe('draft.md');
			expect(resolveTemplateRule(migrated, id).pathTemplate).toBe(legacy.pathTemplateByType[id.split('/')[0]]);
		}
		expect(JSON.stringify(legacy)).toBe(before);
		expect(migrated.sharedNote).toEqual({ path: legacy.notePathTemplate, content: legacy.noteTemplateContent });
		expect(migrateTemplateSettings({ ...legacy, templateSettings: migrated })).toEqual(migrated);
	});
	it('retains exact custom, file and author settings including inactive drafts', () => {
		for (const source of ['custom', 'file', 'author', 'standard'] as const) {
			const migrated = migrateTemplateSettings({ ...DEFAULT_SETTINGS, comicTemplateConfig: { source, filePath: 'Templates/漫画.md', customContent: 'draft' } });
			expect(migrated.rules['book/comic'].content).toMatchObject({ mode: source === 'author' || source === 'standard' ? 'builtin' : source, filePath: 'Templates/漫画.md', customContent: 'draft' });
		}
	});
	it('separates raw genres from groups and fences categories by subject type', () => {
		expect(classifySubject(subject(SubjectType.Book, '漫画', '少年漫画')).nodeId).toBe('book/comic/main');
		expect(classifySubject(subject(SubjectType.Book, '轻小说')).nodeId).toBe('book/novel/light-novel');
		expect(classifySubject(subject(SubjectType.Book, '画册')).nodeId).toBe('book/album/artbook');
		expect(classifySubject(subject(SubjectType.Real, 'TV')).templateKey).toBe('realTemplateConfig');
		expect(resolveTemplateTarget(SubjectType.Game, '漫画').templateKey).toBe('gameTemplateConfig');
	});
	it('inherits content and path independently and resolves parent edits dynamically', async () => {
		const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		settings.rules.book = { content: { mode: 'custom', customContent: 'book' }, path: { mode: 'custom', value: 'Books/{{id}}.md' } };
		settings.rules['book/comic'] = { content: { mode: 'inherit', customContent: 'preserved draft', filePath: 'draft.md' } };
		expect(await resolveNodeContent(settings, 'book/comic/main', noFile)).toBe('book');
		expect(resolveTemplateRule(settings, 'book/comic/main')).toMatchObject({ contentSource: 'book', pathSource: 'book' });
		settings.rules.book.content!.customContent = 'changed';
		expect(await resolveNodeContent(settings, 'book/comic/main', noFile)).toBe('changed');
		settings.rules['book/comic'].content!.mode = 'custom';
		expect(await resolveNodeContent(settings, 'book/comic/main', noFile)).toBe('preserved draft');
		expect(resolveTemplateRule(settings, 'book/comic/main').pathTemplate).toBe('Books/{{id}}.md');
	});
	it('uses the same selection for API requirements and final content', async () => {
		const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		settings.rules['book/comic'].content = { mode: 'custom', customContent: '{{character1}} {{episodes}}' };
		const compiled = await compileTemplateSettings(settings, noFile);
		const comic = subject(SubjectType.Book, '漫画', '少年漫画');
		expect(resolveTemplateForSubject(comic, compiled.customTemplates)).toBe('{{character1}} {{episodes}}');
		expect(getSubjectDataRequirements(comic, compiled.customTemplates, false)).toMatchObject({ characters: true, episodes: true });
	});
	it('fails closed per affected subject for missing and empty templates, reading each file once per snapshot', async () => {
		const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		settings.rules['book/comic'].content = { mode: 'file', filePath: 'missing.md' };
		const read = vi.fn(noFile);
		const compiled = await compileTemplateSettings(settings, read);
		expect(read).toHaveBeenCalledTimes(1);
		expect(() => resolveTemplateForSubject(subject(SubjectType.Book, '漫画'), compiled.customTemplates)).toThrow('Template unavailable');
		expect(resolveTemplateForSubject(subject(SubjectType.Anime, 'TV'), compiled.customTemplates)).toBeTruthy();
		settings.rules['book/comic'].content = { mode: 'custom', customContent: '' };
		await expect(resolveNodeContent(settings, 'book/comic', noFile)).rejects.toThrow('Empty template');
	});
	it('recompiles changed files without a permanent cache', async () => {
		const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		settings.rules.anime.content = { mode: 'file', filePath: 'a.md' };
		const first = await compileTemplateSettings(settings, () => Promise.resolve('first'));
		const second = await compileTemplateSettings(settings, () => Promise.resolve('second'));
		expect(first.customTemplates[templateLookupKey('anime/tv')]).toBe('first');
		expect(second.customTemplates[templateLookupKey('anime/tv')]).toBe('second');
	});
	it('rejects unsupported schema and unknown nodes instead of dropping settings', () => {
		const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		settings.rules['book/not-a-category'] = {};
		expect(() => validateTemplateSettings(settings)).toThrow('Unknown template node');
		expect(new Set(TEMPLATE_NODES.map(node => node.id)).size).toBe(TEMPLATE_NODES.length);
	});
	it('preserves earlier shared-note compatibility conversions without changing the legacy backup', () => {
		const legacy = { ...DEFAULT_SETTINGS, notePathTemplate: 'Notes/', noteTemplateContent: '---\nid:\n{{id_yaml}}\n---' };
		const migrated = migrateTemplateSettings(legacy);
		expect(migrated.sharedNote.path).toBe('Notes/{{name_cn}}.md');
		expect(migrated.sharedNote.content).toContain('笔记ID:\n{{id_yaml}}');
		expect(legacy.notePathTemplate).toBe('Notes/');
		expect(legacy.noteTemplateContent).toContain('\nid:');
	});
	it('blocks structurally invalid templates before generating subject content', async () => {
		const settings = migrateTemplateSettings(DEFAULT_SETTINGS);
		settings.rules.anime.content = { mode: 'custom', customContent: '{{#if name}}unfinished' };
		await expect(resolveNodeContent(settings, 'anime/tv', noFile)).rejects.toThrow('unclosed');
	});
	it('renders production path cleaning and naming consistently', () => {
		const book = subject(SubjectType.Book, '漫画');
		expect(generatePreferredFilePath('Books/{{name_cn}}.md', book, 'always-id')).toBe('Books/测试／标题[bgm-10].md');
		expect(() => generatePreferredFilePath('Books/{{unknown}}.md', book)).toThrow('Unknown path template');
	});
	it('invalidates preview contexts even when file contents are reverted and defers new writes until refresh', () => {
		const vault = new InMemoryVault();
		const manager = new SyncManager(vault.app, { accessToken: '', pathTemplate: 'ACGN/{{id}}.md', imagePathTemplate: 'ACGN/{{id}}.jpg', downloadImages: false, imageQuality: 'large', imageUpdateExisting: false, scanFolderPath: 'ACGN' });
		const valid = manager.createSyncContextValidator();
		expect(valid()).toBe(true);
		manager.invalidateTemplateSources();
		expect(valid()).toBe(false);
		expect(() => manager.ensureCanStartSync()).toThrow('Template files changed');
		manager.acknowledgeTemplateSources();
		expect(valid()).toBe(false);
		expect(() => manager.ensureCanStartSync()).not.toThrow();
	});
});
