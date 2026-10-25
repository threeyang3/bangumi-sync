import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subject, SubjectType, UserCollection } from '../../common/api/types';
import { SubjectDocumentService } from '../../src/document/subjectDocumentService';
import { ComprehensiveSyncService } from '../../src/sync/comprehensiveSyncService';
import { StatusSyncService } from '../../src/sync/statusSyncService';
import { SyncManager } from '../../src/sync/syncManager';
import { createDefaultStatusSyncFieldSelection } from '../../src/sync/statusSyncTypes';
import { withWriteOperation } from '../../src/sync/writeOperationGate';
import { InMemoryVault } from '../mocks/inMemoryVault';
import { EpisodeStatusManager } from '../../src/episode/episodeStatusManager';
import { LocalEpisodeStatus } from '../../src/episode/types';

afterEach(() => vi.restoreAllMocks());

function subject(id: number): Subject {
	return { id, type: SubjectType.Music, name: `Subject ${id}`, name_cn: '', summary: 'Synthetic summary',
		platform: '音乐', images: {}, infobox: [], rating: { rank: 0, total: 0, count: {}, score: 0 },
		collection: { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 }, tags: [],
		nsfw: false, locked: false, series: false, volumes: 0, eps: 0, total_episodes: 0, meta_tags: [] };
}

function collection(id: number, rate = 5): UserCollection {
	return { subject_id: id, subject_type: SubjectType.Music, type: 2, rate, comment: '', tags: [], private: false,
		ep_status: 0, vol_status: 0, updated_at: '', subject: { ...subject(id), short_summary: '', collection_total: 0, score: 0, rank: 0 } };
}

function setup() {
	const vault = new InMemoryVault();
	const one = vault.addFile('ACGN/one.md', '---\nid: 1\n评分: 5\n---\nKeep one');
	const two = vault.addFile('ACGN/two.md', '---\nid: 2\n评分: 2\n---\nKeep two');
	vault.addFile('ACGN/local-only.md', '---\nid: 99\n---\nLocal-only body');
	const manager = new SyncManager(vault.app, { accessToken: 'fixture', pathTemplate: 'ACGN/{{id}}.md', scanFolderPath: 'ACGN',
		imagePathTemplate: 'assets/{{id}}', downloadImages: false, imageQuality: 'large', imageUpdateExisting: false, enableRelatedLinks: false,
		customTemplates: { musicTemplateConfig: '---\nid: {{id}}\n---\n{{summary}}' } });
	vi.spyOn(manager.client, 'validateToken').mockResolvedValue({ valid: true, username: 'fixture' });
	const readCloud = vi.spyOn(manager.client, 'getAllUserCollections').mockResolvedValue([collection(1), collection(2, 8), collection(3)]);
	const remote = new Map([collection(1), collection(2, 8), collection(3), collection(4)].map(item => [item.subject_id, item]));
	const readSelected = vi.spyOn(manager.client, 'getCollectionStatus').mockImplementation(id => Promise.resolve(remote.get(id) ?? null));
	vi.spyOn(manager.client, 'getSubject').mockImplementation(id => Promise.resolve(subject(id)));
	vi.spyOn(manager.client, 'getFullSubjectInfo').mockImplementation(id => Promise.resolve({ subject: subject(id), characters: [], persons: [], relations: [] }));
	const status = new StatusSyncService(vault.app, manager.client, new SubjectDocumentService(vault.app));
	const service = new ComprehensiveSyncService(manager, status);
	const selection = createDefaultStatusSyncFieldSelection();
	selection.user.comment = selection.user.tags = selection.user.status = selection.user.episodeStatus = false;
	return { vault, one, two, manager, status, service, selection, readCloud, remote, readSelected };
}

describe('comprehensive sync invariants', () => {
	it('finds renamed existing notes under an inferred custom template root and creates no duplicate', async () => {
		const { vault, manager, service, selection, one, two } = setup();
		vault.addFolder('Media/Music');
		await vault.app.fileManager.renameFile(one, 'Media/Music/renamed-one.md');
		await vault.app.fileManager.renameFile(two, 'Media/Music/renamed-two.md');
		manager.updateConfig({ scanFolderPath: '', pathTemplate: 'Media/{{type}}/{{id}}.md' });
		const plan = await service.prepare(selection);
		expect(manager.getScanRoot()).toBe('Media');
		expect(plan.additions.map(item => item.subject_id)).toEqual([3]);
		expect(plan.diffs.map(item => item.subjectId)).toEqual([2]);
		expect(plan.unchanged.map(item => item.subject_id)).toEqual([1]);
		plan.diffs[0].rate.decision = 'cloud'; await service.execute(plan, new Set());
		expect(vault.contents.get(two.path)).toContain('评分: 8');
		expect(vault.files.has('Media/音乐/2.md')).toBe(false);
	});

	it('refuses missing scan roots instead of misclassifying existing notes as additions', async () => {
		const { vault, manager, service, selection } = setup();
		manager.updateConfig({ scanFolderPath: '', pathTemplate: 'Moved/{{id}}.md' });
		const before = new Map(vault.contents);
		await expect(service.prepare(selection)).rejects.toThrow('unavailable');
		expect(vault.contents).toEqual(before); expect(manager.getManagerState()).toBe('idle');
	});

	it('aborts before writes if the scanned folder is moved after preview', async () => {
		const { vault, manager, service, selection, one, two } = setup();
		const plan = await service.prepare(selection);
		await vault.app.fileManager.renameFile(one, 'Moved/one.md');
		await vault.app.fileManager.renameFile(two, 'Moved/two.md');
		const localOnly = vault.files.get('ACGN/local-only.md')!;
		await vault.app.fileManager.renameFile(localOnly, 'Moved/local-only.md'); vault.folders.delete('ACGN');
		const before = new Map(vault.contents);
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('unavailable');
		expect(vault.contents).toEqual(before); expect(manager.getManagerState()).toBe('idle');
	});

	it('partitions one shared account/local snapshot and preserves local-only data', async () => {
		const { vault, service, selection, readCloud, readSelected } = setup();
		const plan = await service.prepare(selection);
		expect(plan.additions.map(item => item.subject_id)).toEqual([3]);
		expect(plan.diffs.map(item => item.subjectId)).toEqual([2]);
		expect(plan.unchanged.map(item => item.subject_id)).toEqual([1]);
		expect(plan.localOnlyCount).toBe(1); expect(plan.failures).toEqual([]);
		plan.diffs[0].rate.decision = 'cloud';
		const result = await service.execute(plan, new Set([3]));
		expect(result.outcomes).toEqual(expect.arrayContaining([
			expect.objectContaining({ subjectId: 1, status: 'unchanged' }),
			expect.objectContaining({ subjectId: 2, status: 'updated' }),
			expect.objectContaining({ subjectId: 3, status: 'created' }),
		]));
		expect(readCloud).toHaveBeenCalledTimes(1);
		expect(readSelected.mock.calls.map(([id]) => id).sort()).toEqual([2, 3]);
		expect(vault.contents.get('ACGN/local-only.md')).toContain('Local-only body');
		expect(vault.contents.get('ACGN/two.md')).toContain('评分: 8');
		const again = await service.prepare(selection);
		expect(again.additions).toEqual([]); expect(again.diffs).toEqual([]);
	});

	it('leaves unselected fields and new notes untouched and cannot replay a consumed preview', async () => {
		const { vault, service, selection } = setup(); const before = new Map(vault.contents);
		const plan = await service.prepare(selection); const result = await service.execute(plan, new Set());
		expect(result.outcomes.filter(item => item.status === 'skipped')).toHaveLength(2);
		expect(vault.contents).toEqual(before);
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('already executed');
	});

	it('rejects stale settings before any selected status or import writes', async () => {
		const { manager, service, selection, vault } = setup(); const plan = await service.prepare(selection);
		expect(service.isPlanUsable(plan)).toBe(true);
		plan.diffs[0].rate.decision = 'cloud'; const before = new Map(vault.contents);
		manager.updateConfig({ pathTemplate: 'different/{{id}}.md' });
		expect(service.isPlanUsable(plan)).toBe(false);
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('expired');
		expect(vault.contents).toEqual(before);
	});

	it('does not overwrite a note created after preview', async () => {
		const { vault, service, selection } = setup(); const plan = await service.prepare(selection);
		const manual = '---\nid: 3\n---\nCreated manually after preview'; vault.addFile('ACGN/manual.md', manual);
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('now exists locally');
		expect(vault.contents.get('ACGN/manual.md')).toBe(manual); expect(vault.files.has('ACGN/3.md')).toBe(false);
	});

	it.each(['existing', 'duplicate', 'conflicting'] as const)('aborts all writes for a new %s addition identity before a cloud update', async kind => {
		const { vault, service, selection, manager } = setup();
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = 'local';
		const write = vi.spyOn(manager.client, 'updateCollection').mockResolvedValue(undefined);
		vault.addFile('ACGN/manual.md', kind === 'conflicting' ? '---\nid: 4\nBangumiID: 3\n---\nManual' : '---\nid: 3\n---\nManual');
		if (kind === 'duplicate') vault.addFile('ACGN/duplicate.md', '---\nid: 3\n---\nDuplicate');
		const before = new Map(vault.contents);
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('identity conflict');
		expect(write).not.toHaveBeenCalled(); expect(vault.contents).toEqual(before);
		expect(manager.getManagerState()).toBe('idle');
	});

	it('rechecks addition identities after cloud reads and before an existing-note update', async () => {
		const { vault, service, selection, readSelected } = setup();
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = 'cloud';
		const before = vault.contents.get('ACGN/two.md');
		readSelected.mockImplementation(id => {
			if (id === 3) vault.addFile('ACGN/manual.md', '---\nid: 3\n---\nCreated during cloud check');
			return Promise.resolve(collection(id, id === 2 ? 8 : 5));
		});
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('now exists locally');
		expect(vault.contents.get('ACGN/two.md')).toBe(before);
	});

	it('does not block an existing-note update for an unselected new-note conflict', async () => {
		const { vault, service, selection } = setup();
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = 'cloud';
		const manual = '---\nid: 3\n---\nUnselected'; vault.addFile('ACGN/manual.md', manual);
		const result = await service.execute(plan, new Set());
		expect(result.outcomes.find(item => item.subjectId === 2)?.status).toBe('updated');
		expect(vault.contents.get('ACGN/manual.md')).toBe(manual);
	});

	it('preserves a note appearing at the target while import details are loading', async () => {
		const { vault, manager, service, selection } = setup(); const plan = await service.prepare(selection);
		const manual = '---\nid: 3\n---\nCreated while loading details';
		vi.spyOn(manager.client, 'getFullSubjectInfo').mockImplementation(id => {
			vault.addFile('ACGN/3.md', manual);
			return Promise.resolve({ subject: subject(id), characters: [], persons: [], relations: [] });
		});
		const result = await service.execute(plan, new Set([3]));
		expect(vault.contents.get('ACGN/3.md')).toBe(manual);
		expect(result.outcomes.find(item => item.subjectId === 3)?.status).toBe('skipped');
	});

	it('rejects preview edits before importing independent items', async () => {
		const { vault, two, service, selection } = setup(); const plan = await service.prepare(selection);
		plan.diffs[0].rate.decision = 'cloud'; const edited = (vault.contents.get(two.path) ?? '') + '\nNew edit'; vault.contents.set(two.path, edited);
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('Note changed');
		expect(vault.files.has('ACGN/3.md')).toBe(false);
		expect(vault.contents.get(two.path)).toBe(edited);
	});

	it.each(['cloud', 'local'] as const)('rejects a stale cloud rating before any %s decision or import writes', async decision => {
		const { vault, manager, service, selection, remote } = setup();
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = decision;
		const before = new Map(vault.contents);
		const write = vi.spyOn(manager.client, 'updateCollection');
		remote.set(2, collection(2, 9));
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('Cloud collection changed');
		expect(vault.contents).toEqual(before); expect(write).not.toHaveBeenCalled();
	});

	it('rejects a removed import target before applying an earlier existing-note decision', async () => {
		const { vault, service, selection, remote } = setup();
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = 'cloud';
		const before = new Map(vault.contents); remote.delete(3);
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('could not be verified');
		expect(vault.contents).toEqual(before);
	});

	it('explains an inaccessible NSFW collection without bypassing verification', async () => {
		const { vault, service, selection, manager, readCloud, remote, readSelected } = setup();
		const restricted = { ...collection(3), subject: { ...collection(3).subject, nsfw: true } };
		readCloud.mockResolvedValue([collection(2, 8), restricted]); remote.delete(3);
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = 'local';
		const write = vi.spyOn(manager.client, 'updateCollection').mockResolvedValue(undefined);
		const importNotes = vi.spyOn(manager, 'syncByCollections'); const before = new Map(vault.contents);
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow(/could not be verified.*NSFW visibility/);
		expect(readSelected).toHaveBeenCalledWith(3); expect(write).not.toHaveBeenCalled();
		expect(importNotes).not.toHaveBeenCalled(); expect(vault.contents).toEqual(before);
	});

	it.each(['401', '429', 'Incomplete response'])('fails closed on a selected cloud read error: %s', async message => {
		const { vault, service, selection, readSelected } = setup();
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = 'cloud';
		const before = new Map(vault.contents);
		readSelected.mockImplementation(id => id === 3 ? Promise.reject(new Error(message)) : Promise.resolve(collection(id, 8)));
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow();
		expect(vault.contents).toEqual(before);
	});

	it('detects private/tag changes without relying on updated_at', async () => {
		const { vault, service, selection, remote } = setup();
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = 'cloud';
		const before = new Map(vault.contents);
		remote.set(2, { ...collection(2, 8), private: true, tags: ['new'] });
		await expect(service.execute(plan, new Set())).rejects.toThrow('Cloud collection changed');
		expect(vault.contents).toEqual(before);
	});

	it('only revalidates selected targets and rejects token revisions', async () => {
		const { service, selection, readSelected, manager } = setup();
		const plan = await service.prepare(selection);
		await service.execute(plan, new Set()); expect(readSelected).not.toHaveBeenCalled();
		const again = await service.prepare(selection); manager.client.setAccessToken('different-fixture');
		await expect(service.execute(again, new Set([3]))).rejects.toThrow('expired');
		expect(readSelected).not.toHaveBeenCalled();
	});

	it('detects episode changes beyond the visible summary before writing another selected field', async () => {
		const { vault, manager, selection, remote, readCloud } = setup();
		const anime = { ...collection(2, 8), subject_type: SubjectType.Anime };
		remote.set(2, anime); readCloud.mockResolvedValue([anime]); selection.user.episodeStatus = true;
		const episodes = new EpisodeStatusManager(vault.app, manager.client);
		const status = new StatusSyncService(vault.app, manager.client, new SubjectDocumentService(vault.app, episodes), episodes);
		const service = new ComprehensiveSyncService(manager, status);
		const cloudMap = new Map<number, LocalEpisodeStatus>(Array.from({ length: 12 }, (_, i) => [i + 1, { episodeId: i + 1, epNumber: i + 1, status: 2, updatedAt: 0 }]));
		vi.spyOn(episodes, 'getCloudEpisodeStatusMap').mockImplementation(() => Promise.resolve(new Map(cloudMap)));
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = 'cloud';
		const before = new Map(vault.contents);
		cloudMap.set(12, { episodeId: 12, epNumber: 12, status: 1, updatedAt: 0 });
		// Review normalization may omit display-only snapshot properties.
		delete plan.diffs[0].episodeStatus.cloudSnapshot;
		await expect(service.execute(plan, new Set())).rejects.toThrow('Cloud episode or platform');
		expect(vault.contents).toEqual(before);
	});

	it('detects a same-count chapter catalog change before replacing episode markup', async () => {
		const { vault, manager, selection, remote, readCloud } = setup();
		const anime = { ...collection(2, 8), subject_type: SubjectType.Anime };
		remote.set(2, anime); readCloud.mockResolvedValue([anime]); selection.platform.episodeCount = true;
		vi.spyOn(manager.client, 'getSubject').mockResolvedValue({ ...subject(2), type: SubjectType.Anime, eps: 2, total_episodes: 2 });
		const episode = { id: 11, type: 0, name: 'Original', name_cn: '', ep: 1, sort: 1, duration: '', airdate: '', comment: 0, desc: '', disc: 0 };
		const catalog = vi.spyOn(manager.client, 'getEpisodes').mockResolvedValue({ total: 1, limit: 100, offset: 0, data: [episode] });
		const service = new ComprehensiveSyncService(manager, new StatusSyncService(vault.app, manager.client, new SubjectDocumentService(vault.app)));
		const plan = await service.prepare(selection); plan.diffs[0].rate.decision = 'cloud';
		const before = new Map(vault.contents);
		// Same platform episode count, different catalog content.
		catalog.mockResolvedValue({ total: 1, limit: 100, offset: 0, data: [{ ...episode, name: 'Changed' }] });
		await expect(service.execute(plan, new Set())).rejects.toThrow('Cloud episode or platform');
		expect(vault.contents).toEqual(before);
	});

	it('does not treat duplicate IDs as missing imports', async () => {
		const { vault, service, selection } = setup(); vault.addFile('ACGN/duplicate.md', '---\nid: 2\n---\n');
		const plan = await service.prepare(selection);
		expect(plan.failures.map(item => item.subjectId)).toEqual([2]);
		expect(plan.additions.map(item => item.subject_id)).toEqual([3]);
	});

	it('blocks every identity mentioned by a conflicting local note', async () => {
		const { vault, service, selection } = setup();
		vault.addFile('ACGN/conflict.md', '---\nid: 2\nBangumiID: 3\n---\n');
		const plan = await service.prepare(selection);
		expect(plan.failures.map(item => item.subjectId)).toEqual([2, 3]);
		expect(plan.additions).toEqual([]);
	});

	it('keeps a failed platform comparison out of unchanged and write candidates', async () => {
		const { manager, service, selection, readCloud } = setup();
		const anime = collection(2); anime.subject_type = SubjectType.Anime;
		readCloud.mockResolvedValue([anime]); selection.platform.episodeCount = true;
		vi.spyOn(manager.client, 'getSubject').mockRejectedValue(new Error('Incomplete platform snapshot'));
		const plan = await service.prepare(selection);
		expect(plan.failures).toHaveLength(1); expect(plan.diffs).toEqual([]); expect(plan.unchanged).toEqual([]);
	});

	it('keeps one write lease until both engines finish', async () => {
		const { manager, service, selection } = setup(); const plan = await service.prepare(selection);
		let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
		const load = vi.spyOn(manager.client, 'getFullSubjectInfo').mockImplementation(async id => {
			await held; return { subject: subject(id), characters: [], persons: [], relations: [] };
		});
		const running = service.execute(plan, new Set([3]));
		await vi.waitFor(() => expect(load).toHaveBeenCalled());
		await expect(withWriteOperation('episode-status', () => Promise.resolve())).rejects.toThrow('in progress');
		release(); await running;
		await expect(withWriteOperation('episode-status', () => Promise.resolve('released'))).resolves.toBe('released');
	});

	it('cancels read-only preparation without offering a partial plan', async () => {
		const { service, selection, readCloud } = setup(); await expect(service.prepare(selection, () => true)).rejects.toThrow('cancelled');
		expect(readCloud).not.toHaveBeenCalled();
	});

	it('reports pending imports until a partial batch is kept or rolled back', async () => {
		const { manager, service, selection, readCloud, vault } = setup();
		readCloud.mockResolvedValue([collection(3), collection(4)]);
		vi.spyOn(manager.client, 'getFullSubjectInfo').mockImplementation(id => id === 4
			? Promise.reject(new Error('Injected detail failure')) : Promise.resolve({ subject: subject(id), characters: [], persons: [], relations: [] }));
		const plan = await service.prepare(selection);
		const result = await service.execute(plan, new Set([3, 4]));
		expect(result.outcomes.find(row => row.subjectId === 3)?.status).toBe('pending');
		expect(result.outcomes.find(row => row.subjectId === 4)?.status).toBe('failed');
		expect(result.importResult?.canRollback).toBe(true);
		expect(manager.getManagerState()).toBe('awaiting-decision');
		expect((await manager.rollbackBatch()).status).toBe('rolled-back');
		expect(vault.files.has('ACGN/3.md')).toBe(false);
	});
});
