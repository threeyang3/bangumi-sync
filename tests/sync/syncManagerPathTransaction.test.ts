import { Vault } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { BangumiClient } from '../../src/api/client';
import { CollectionType, Subject, SubjectType, UserCollection } from '../../common/api/types';
import { SyncManager, SyncManagerConfig } from '../../src/sync/syncManager';
import { SubjectPathState } from '../../src/sync/localSubjectRegistry';
import { InMemoryVault } from '../mocks/inMemoryVault';

function makeSubject(id: number, date: string, name = '乱马'): Subject {
	return {
		id, type: SubjectType.Music, name, name_cn: name, summary: `${name} summary`, date,
		platform: '音乐', images: {}, infobox: [], rating: { rank: 0, total: 0, count: {}, score: 0 },
		collection: { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 },
		tags: [], nsfw: false, locked: false, series: false, volumes: 0, eps: 0,
		total_episodes: 0, meta_tags: [],
	};
}

function makeCollection(subject: Subject): UserCollection {
	return {
		subject_id: subject.id, subject_type: subject.type, type: CollectionType.Done,
		rate: 0, comment: '', tags: [], private: false, ep_status: 0, vol_status: 0,
		updated_at: '2026-08-02T00:00:00.000Z',
		subject: {
			id: subject.id, type: subject.type, name: subject.name, name_cn: subject.name_cn,
			short_summary: '', date: subject.date, images: {}, volumes: 0, eps: 0,
			collection_total: 0, score: 0, rank: 0, tags: [],
		},
	};
}

function fakeClient(subjects: Subject[], failures = new Set<number>()): BangumiClient {
	const byId = new Map(subjects.map(subject => [subject.id, subject]));
	return {
		getSubject: (id: number) => Promise.resolve(byId.get(id) ?? Promise.reject(new Error(`Missing ${id}`))),
		getFullSubjectInfo: (id: number) => {
			if (failures.has(id)) return Promise.reject(new Error(`Injected preparation failure for ${id}`));
			const subject = byId.get(id);
			if (!subject) return Promise.reject(new Error(`Missing ${id}`));
			return Promise.resolve({ subject, characters: [], relations: [], persons: [] });
		},
		createOrUpdateCollection: () => Promise.resolve(),
		setAccessToken: () => undefined,
		validateToken: () => Promise.resolve({ valid: true, username: 'tester' }),
		getAllUserCollections: () => Promise.resolve(subjects.map(makeCollection)),
	} as unknown as BangumiClient;
}

function createManager(vault: InMemoryVault, subjects: Subject[], options: {
	failures?: Set<number>;
	onStates?: (states: Record<string, SubjectPathState>) => void;
} = {}): SyncManager {
	const config: SyncManagerConfig = {
		accessToken: 'test-token', pathTemplate: 'ACGN/music/{{name_cn}}.md',
		imagePathTemplate: 'assets/{{id}}', downloadImages: false, scanFolderPath: 'ACGN',
		enableRelatedLinks: false, subjectPathStates: {},
		customTemplates: { musicTemplateConfig: '---\nid: {{id}}\n中文名: "{{name_cn}}"\n---\n{{summary}}' },
		onPathStatesChanged: options.onStates
			? states => { options.onStates?.(states); return Promise.resolve(); }
			: undefined,
	};
	const manager = new SyncManager(vault.app, config);
	manager.client = fakeClient(subjects, options.failures);
	return manager;
}

describe('SyncManager path transaction integration', () => {
	it('runs the normal bulk entry through the shared planner and transaction', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2022-01-01', '普通同步');
		const manager = createManager(vault, [subject]);

		const result = await manager.sync({
			subjectTypes: [SubjectType.Music], collectionTypes: [CollectionType.Done], limit: 0, force: false,
		}, 1);

		expect(result.completion).toBe('success');
		expect(result.outcomes[0]).toMatchObject({
			subjectId: 20, pathAction: 'unchanged', writeAction: 'created', actualPath: 'ACGN/music/普通同步.md',
		});
		expect(result.canRollback).toBe(false);
	});

	it('infers a legacy template path only for the colliding owner and commits symmetric names', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/music/乱马.md', '---\nid: 1\n中文名: "乱马"\n---\nlegacy');
		const oldSubject = makeSubject(1, '1989-04-15');
		const newSubject = makeSubject(2, '2024-10-06');
		let states: Record<string, SubjectPathState> = {};
		const manager = createManager(vault, [oldSubject, newSubject], { onStates: value => { states = value; } });

		const result = await manager.syncByCollections([makeCollection(newSubject)], { concurrency: 1 });

		expect(result.completion).toBe('success');
		expect(result.canRollback).toBe(false);
		expect(Array.from(vault.files.keys()).sort()).toEqual([
			'ACGN/music/乱马（1989）.md', 'ACGN/music/乱马（2024）.md',
		]);
		expect(states['1']?.namingState).toBe('managed');
		expect(states['2']?.namingState).toBe('managed');
	});

	it('protects an unknown custom path and does not fetch it as collision context', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/music/我的旧版乱马.md', '---\nid: 1\n中文名: "乱马"\n---\ncustom');
		const newSubject = makeSubject(2, '2024-10-06');
		const manager = createManager(vault, [newSubject]);

		const result = await manager.syncByCollections([makeCollection(newSubject)], { concurrency: 1 });

		expect(result.completion).toBe('success');
		expect(vault.files.has('ACGN/music/我的旧版乱马.md')).toBe(true);
		expect(vault.files.has('ACGN/music/乱马.md')).toBe(true);
	});

	it('does not rename when content preparation fails', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/music/乱马.md', '---\nid: 1\n中文名: "乱马"\n---\nlegacy');
		const oldSubject = makeSubject(1, '1989-04-15');
		const newSubject = makeSubject(2, '2024-10-06');
		const manager = createManager(vault, [oldSubject, newSubject], { failures: new Set([2]) });

		const result = await manager.syncByCollections([makeCollection(newSubject)], { concurrency: 1 });

		expect(result.completion).toBe('failed');
		expect(Array.from(vault.files.keys())).toEqual(['ACGN/music/乱马.md']);
	});

	it('keeps the legacy path when rendered-content preparation fails after path planning', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/music/乱马.md', '---\nid: 1\n中文名: "乱马"\n---\nlegacy');
		const oldSubject = makeSubject(1, '1989-04-15');
		const newSubject = makeSubject(2, '2024-10-06');
		const manager = createManager(vault, [oldSubject, newSubject]);
		const injectable = manager as unknown as {
			userDataExtractor: { extractFromFileAsync(): Promise<never> };
		};
		injectable.userDataExtractor = {
			extractFromFileAsync: () => Promise.reject(new Error('Injected content preparation failure')),
		};

		const result = await manager.syncByCollections(
			[makeCollection(oldSubject), makeCollection(newSubject)],
			{ overwrite: true, concurrency: 1 },
		);

		expect(result.completion).toBe('failed');
		expect(Array.from(vault.files.keys())).toEqual(['ACGN/music/乱马.md']);
		expect(vault.contents.get('ACGN/music/乱马.md')).toContain('legacy');
	});

	it('automatically restores paths when the write fails after collision renames', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/music/乱马.md', '---\nid: 1\n中文名: "乱马"\n---\nlegacy');
		const writableVault = vault.app.vault as Vault & { create(path: string, content: string): Promise<never> };
		writableVault.create = () => Promise.reject(new Error('Injected write failure'));
		const oldSubject = makeSubject(1, '1989-04-15');
		const newSubject = makeSubject(2, '2024-10-06');
		const manager = createManager(vault, [oldSubject, newSubject]);

		const result = await manager.syncByCollections([makeCollection(newSubject)], { concurrency: 1 });

		expect(result.completion).toBe('rolled-back');
		expect(result.rollback).toEqual({ deletedCreatedFiles: 0, restoredContents: 0, restoredPaths: 1, failed: 0 });
		expect(Array.from(vault.files.keys())).toEqual(['ACGN/music/乱马.md']);
		expect(vault.contents.get('ACGN/music/乱马.md')).toContain('legacy');
	});

	it('reports rollback-failed when restoring a renamed path is injected to fail', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/music/乱马.md', '---\nid: 1\n中文名: "乱马"\n---\nlegacy');
		const writableVault = vault.app.vault as Vault & { create(path: string, content: string): Promise<never> };
		writableVault.create = () => Promise.reject(new Error('Injected write failure'));
		const fileManager = vault.app.fileManager;
		const renameFile = fileManager.renameFile.bind(fileManager);
		fileManager.renameFile = (file, newPath) => newPath === 'ACGN/music/乱马.md'
			? Promise.reject(new Error('Injected rollback path failure'))
			: renameFile(file, newPath);
		const oldSubject = makeSubject(1, '1989-04-15');
		const newSubject = makeSubject(2, '2024-10-06');
		const manager = createManager(vault, [oldSubject, newSubject]);

		const result = await manager.syncByCollections([makeCollection(newSubject)], { concurrency: 1 });

		expect(result.completion).toBe('rollback-failed');
		expect(result.rollback?.failed).toBe(1);
		expect(result.rollback?.restoredPaths).toBe(0);
	});

	it('keeps a partial batch rollbackable and makes rollback idempotent', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });

		const result = await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		expect(result.completion).toBe('partial-success');
		expect(result.added).toBe(1);
		expect(result.canRollback).toBe(true);
		const rollback = await manager.rollbackBatch();
		expect(rollback.deletedCreatedFiles).toBe(1);
		expect((await manager.rollbackBatch()).deletedCreatedFiles).toBe(0);
	});

	it('routes search sync through the same collision planner and clears a successful transaction', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/music/乱马.md', '---\nid: 1\n中文名: "乱马"\n---\nlegacy');
		const oldSubject = makeSubject(1, '1989-04-15');
		const newSubject = makeSubject(2, '2024-10-06');
		const manager = createManager(vault, [oldSubject, newSubject]);

		const result = await manager.syncSingleSubject(2, {
			type: CollectionType.Done, rate: 0, comment: '', tags: [], private: false,
			syncToCloud: false, createLocal: true,
		});

		expect(result.success).toBe(true);
		expect(result.filePath).toBe('ACGN/music/乱马（2024）.md');
		expect((await manager.rollbackBatch()).deletedCreatedFiles).toBe(0);
	});
});
