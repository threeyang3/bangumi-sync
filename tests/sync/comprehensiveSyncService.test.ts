import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subject, SubjectType, UserCollection } from '../../common/api/types';
import { SubjectDocumentService } from '../../src/document/subjectDocumentService';
import { ComprehensiveSyncService } from '../../src/sync/comprehensiveSyncService';
import { StatusSyncService } from '../../src/sync/statusSyncService';
import { SyncManager } from '../../src/sync/syncManager';
import { createDefaultStatusSyncFieldSelection } from '../../src/sync/statusSyncTypes';
import { withWriteOperation } from '../../src/sync/writeOperationGate';
import { InMemoryVault } from '../mocks/inMemoryVault';

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
	vi.spyOn(manager.client, 'getSubject').mockImplementation(id => Promise.resolve(subject(id)));
	vi.spyOn(manager.client, 'getFullSubjectInfo').mockImplementation(id => Promise.resolve({ subject: subject(id), characters: [], persons: [], relations: [] }));
	const status = new StatusSyncService(vault.app, manager.client, new SubjectDocumentService(vault.app));
	const service = new ComprehensiveSyncService(manager, status);
	const selection = createDefaultStatusSyncFieldSelection();
	selection.user.comment = selection.user.tags = selection.user.status = selection.user.episodeStatus = false;
	return { vault, one, two, manager, status, service, selection, readCloud };
}

describe('comprehensive sync invariants', () => {
	it('partitions one shared account/local snapshot and preserves local-only data', async () => {
		const { vault, service, selection, readCloud } = setup();
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
		plan.diffs[0].rate.decision = 'cloud'; const before = new Map(vault.contents);
		manager.updateConfig({ pathTemplate: 'different/{{id}}.md' });
		await expect(service.execute(plan, new Set([3]))).rejects.toThrow('expired');
		expect(vault.contents).toEqual(before);
	});

	it('does not overwrite a note created after preview', async () => {
		const { vault, service, selection } = setup(); const plan = await service.prepare(selection);
		const manual = '---\nid: 3\n---\nCreated manually after preview'; vault.addFile('ACGN/manual.md', manual);
		const result = await service.execute(plan, new Set([3]));
		expect(result.outcomes.find(item => item.subjectId === 3)?.status).toBe('failed');
		expect(vault.contents.get('ACGN/manual.md')).toBe(manual); expect(vault.files.has('ACGN/3.md')).toBe(false);
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

	it('preserves preview edits and reports their failure while importing independent items', async () => {
		const { vault, two, service, selection } = setup(); const plan = await service.prepare(selection);
		plan.diffs[0].rate.decision = 'cloud'; const edited = (vault.contents.get(two.path) ?? '') + '\nNew edit'; vault.contents.set(two.path, edited);
		const result = await service.execute(plan, new Set([3]));
		expect(result.outcomes.find(item => item.subjectId === 2)?.status).toBe('failed');
		expect(result.outcomes.find(item => item.subjectId === 3)?.status).toBe('created');
		expect(vault.contents.get(two.path)).toBe(edited);
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
