import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subject, SubjectType, UserCollection } from '../../common/api/types';
import { SyncManager } from '../../src/sync/syncManager';
import { InMemoryVault } from '../mocks/inMemoryVault';
import { setRequestUrlHandler } from '../mocks/obsidian';
import { createCancellationSignal } from '../../src/sync/syncStatus';

function subject(type: SubjectType, platform: string): Subject {
	return { id: 1, type, platform, name: 'Synthetic', name_cn: 'Synthetic', summary: 'Full summary', date: '2026-01-01',
		infobox: [{ key: '作者', value: 'Writer' }], images: {}, rating: { rank: 0, total: 0, score: 0, count: {} },
		collection: { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 }, tags: [], nsfw: false, locked: false, series: false,
		volumes: 0, eps: 1, total_episodes: 1, meta_tags: [] };
}
const collection = (value: Subject): UserCollection => ({ subject_id: value.id, subject_type: value.type, type: 2,
	rate: 0, comment: '', tags: [], private: false, ep_status: 0, vol_status: 0, updated_at: '',
	subject: { ...value, short_summary: 'Short', collection_total: 0, score: 0, rank: 0 } });

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function sync(template: string, value: Subject, links = false, failStatus = false, emptyEpisodes = false) {
	vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
	const vault = new InMemoryVault();
	if (links) vault.addFile('ACGN/Related.md', '---\nid: 2\n---\nKeep related body');
	const urls: string[] = [];
	setRequestUrlHandler(options => {
		const url = new URL(options.url); urls.push(url.pathname);
		let json: unknown;
		if (url.pathname === '/v0/subjects/1') json = value;
		else if (url.pathname.endsWith('/characters')) json = [{ name: 'Hero', relation: '主角', actors: [{ name: 'Actor' }], images: { grid: 'hero.png' } }];
		else if (url.pathname.endsWith('/persons')) json = [{ id: 3, name: 'Fallback Studio', relation: '动画制作' }];
		else if (url.pathname.endsWith('/subjects')) json = [{ id: 2, type: 3, name: 'Related', name_cn: 'Related', relation: '关联' }];
		else if (url.pathname === '/v0/episodes') json = { total: emptyEpisodes ? 0 : 1, data: emptyEpisodes ? [] : [{ id: 10, ep: 1, sort: 1, type: 0, name: 'Episode', name_cn: 'Episode', airdate: '2026-01-01', duration: '24m' }] };
		else if (url.pathname.endsWith('/episodes')) {
			if (failStatus) return Promise.resolve({ status: 401, arrayBuffer: new ArrayBuffer(0), json: { title: 'Unauthorized' } });
			json = { total: 1, data: [{ episode: { id: 10 }, type: 2 }] };
		} else throw new Error(`Unexpected synthetic request ${url.pathname}`);
		return Promise.resolve({ status: 200, arrayBuffer: new ArrayBuffer(0), json });
	});
	const templates = Object.fromEntries(['anime', 'novel', 'comic', 'music', 'game', 'real'].map(type => [`__template_key__:${type}TemplateConfig`, template]));
	const manager = new SyncManager(vault.app, { accessToken: 'synthetic', scanFolderPath: 'ACGN',
		pathTemplate: 'ACGN/{{author}}/{{year}}-{{id}}.md', imagePathTemplate: 'assets/{{id}}', downloadImages: false,
		imageQuality: 'large', imageUpdateExisting: false, enableRelatedLinks: links, customTemplates: templates });
	const result = await manager.syncByCollections([collection(value)], { concurrency: 2 });
	const output = [...vault.contents].find(([path]) => path.endsWith('2026-1.md'));
	return { result, output, urls, vault, manager };
}

describe('real client and manager demand loading', () => {
	it.each([false, true])('restores shared background concurrency after a single-worker sync, failed=%s', async failed => {
		const value = subject(SubjectType.Music, '');
		const { manager } = await sync('---\nid: {{id}}\n---\n{{summary}}', value);
		manager.client.setRequestConcurrency(3);
		if (failed) {
			vi.spyOn(console, 'error').mockImplementation(() => undefined);
			setRequestUrlHandler(() => Promise.resolve({ status: 401, arrayBuffer: new ArrayBuffer(0), json: { title: 'Unauthorized' } }));
		}
		const result = await manager.syncByCollections([collection(value)], { concurrency: 1 });
		expect(result.completion).toBe(failed ? 'failed' : 'success');
		let release!: () => void, active = 0, maximum = 0;
		const held = new Promise<void>(resolve => { release = resolve; });
		setRequestUrlHandler(async () => {
			maximum = Math.max(maximum, ++active); await held; active--;
			return { status: 200, arrayBuffer: new ArrayBuffer(0), json: {} };
		});
		const background = manager.client.getFullSubjectInfo(11);
		try { await vi.waitFor(() => expect(maximum).toBe(3)); }
		finally { release(); }
		await background; expect(active).toBe(0);
	});
	it('pins queued HTTP requests to their manager signal even after the signal is cleared', async () => {
		const { manager } = await sync('---\nid: {{id}}\n---\n{{summary}}', subject(SubjectType.Music, ''));
		manager.client.setRequestConcurrency(1);
		const old = createCancellationSignal(); manager.setCancellationSignal(old);
		let release!: () => void;
		const held = new Promise<void>(resolve => { release = resolve; });
		const ids: number[] = [];
		setRequestUrlHandler(async options => {
			const id = Number(options.url.split('/').pop()); ids.push(id); await held;
			return { status: 200, arrayBuffer: new ArrayBuffer(0), json: { id } };
		});
		const cancelled = Promise.allSettled([manager.client.getSubject(11), manager.client.getSubject(12)]);
		await vi.waitFor(() => expect(ids).toEqual([11]));
		old.cancel(); manager.setCancellationSignal(null);
		const next = manager.client.getSubject(13); release();
		expect((await cancelled).every(value => value.status === 'rejected')).toBe(true);
		expect(await next).toMatchObject({ id: 13 }); expect(ids).toEqual([11, 13]);
	});
	it('uses one full subject request for a minimal template and retains path author/year information', async () => {
		const { urls, output, result } = await sync('---\nid: {{id}}\n---\n{{summary}}', subject(SubjectType.Book, '小说'));
		expect(result.completion).toBe('success');
		expect(urls).toEqual(['/v0/subjects/1']);
		expect(output?.[0]).toBe('ACGN/Writer/2026-1.md'); expect(output?.[1]).toContain('Full summary');
	});

	it('preserves characters, persons fallback and watched episode output when the template requests them', async () => {
		const template = '---\nid: {{id}}\n---\n{{character1|Missing}} {{characterCV1}} {{characterPhoto1}} {{#if animeMake}}{{animeMake}}{{/if}} {{episodes}}';
		const { output, urls, result } = await sync(template, subject(SubjectType.Anime, 'TV'));
		expect(result.completion).toBe('success');
		expect(urls).toContain('/v0/subjects/1/characters'); expect(urls).toContain('/v0/subjects/1/persons');
		expect(urls).not.toContain('/v0/subjects/1/subjects');
		expect(output?.[1]).toContain('Hero-主角'); expect(output?.[1]).toContain('CV: Actor');
		expect(output?.[1]).toContain('Fallback Studio'); expect(output?.[1]).toContain('ep-box watched');
	});

	it('loads novel volumes and their watched status through a conditional/default template', async () => {
		const { output, urls } = await sync('---\nid: {{id}}\n---\n{{#if volumes_display}}{{volumes_display|Empty}}{{/if}}', subject(SubjectType.Book, '小说'));
		expect(output?.[1]).toContain('ep-box watched'); expect(urls).toHaveLength(3);
	});

	it('still updates external backlinks when the enabled feature is absent from the template', async () => {
		const { urls, vault, result } = await sync('---\nid: {{id}}\n---\n{{summary}}', subject(SubjectType.Music, ''), true);
		expect(result.warnings).toEqual([]); expect(urls).toContain('/v0/subjects/1/subjects');
		expect(vault.contents.get('ACGN/Related.md')).toContain('[[ACGN/2026-1.md|2026-1]]');
	});

	it('keeps episode display when user status is unavailable', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { result, output } = await sync('---\nid: {{id}}\n---\n{{episodes}}', subject(SubjectType.Anime, 'TV'), false, true);
		expect(result.completion).toBe('success'); expect(output?.[1]).toContain('ep-box'); expect(output?.[1]).not.toContain('ep-box watched');
	});

	it('does not fetch user status when no episodes are returned', async () => {
		const { urls, result } = await sync('---\nid: {{id}}\n---\n{{episodes|Empty}}', subject(SubjectType.Anime, 'TV'), false, false, true);
		expect(result.completion).toBe('success'); expect(urls).toEqual(['/v0/subjects/1', '/v0/episodes']);
	});
});
