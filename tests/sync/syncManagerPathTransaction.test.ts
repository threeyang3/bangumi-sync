import { Vault } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { BangumiClient } from '../../src/api/client';
import { CollectionType, Subject, SubjectType, UserCollection } from '../../common/api/types';
import { ConfigurationChangeBlockedError, ConfigurationUpdateInProgressError, ManagerReinitializationBlockedError, PendingSyncTransactionError, RecoveryRequiredError, SyncManager, SyncManagerConfig } from '../../src/sync/syncManager';
import { SubjectPathState } from '../../src/sync/localSubjectRegistry';
import { InMemoryVault } from '../mocks/inMemoryVault';
import { RECOVERY_JOURNAL_PATH } from '../../src/sync/recoveryJournal';
import { setRequestUrlHandler } from '../mocks/obsidian';

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

function fakeClient(subjects: Subject[], failures = new Set<number>(), relationsById = new Map<number, Array<{ id: number; type: SubjectType; name: string; name_cn: string; relation: string }>>()): BangumiClient {
	const byId = new Map(subjects.map(subject => [subject.id, subject]));
	return {
		getSubject: (id: number) => Promise.resolve(byId.get(id) ?? Promise.reject(new Error(`Missing ${id}`))),
		getFullSubjectInfo: (id: number) => {
			if (failures.has(id)) return Promise.reject(new Error(`Injected preparation failure for ${id}`));
			const subject = byId.get(id);
			if (!subject) return Promise.reject(new Error(`Missing ${id}`));
			return Promise.resolve({ subject, characters: [], relations: relationsById.get(id) ?? [], persons: [] });
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
	pathStateHandler?: (states: Record<string, SubjectPathState>) => Promise<void>;
	relationsById?: Map<number, Array<{ id: number; type: SubjectType; name: string; name_cn: string; relation: string }>>;
} = {}): SyncManager {
	const config: SyncManagerConfig = {
		accessToken: 'test-token', pathTemplate: 'ACGN/music/{{name_cn}}.md',
		imagePathTemplate: 'assets/{{id}}', downloadImages: false, imageQuality: 'large', imageUpdateExisting: false, scanFolderPath: 'ACGN',
		enableRelatedLinks: false, subjectPathStates: {},
		customTemplates: { musicTemplateConfig: '---\nid: {{id}}\n中文名: "{{name_cn}}"\n---\n{{summary}}' },
		onPathStatesChanged: options.pathStateHandler ?? (options.onStates
			? states => { options.onStates?.(states); return Promise.resolve(); }
			: undefined),
	};
	const manager = new SyncManager(vault.app, config);
	manager.client = fakeClient(subjects, options.failures, options.relationsById);
	return manager;
}

interface CoverHandlerProbe {
	beforeCreate: ((path: string) => Promise<void>) | null;
	beforeUpdate: ((path: string, originalContent: ArrayBuffer) => Promise<void>) | null;
	getCoverTargetPath: () => string;
	downloadCoverWithResult: () => Promise<{ path: string; status: 'created' | 'updated' }>;
}

describe('SyncManager path transaction integration', () => {
	it('journals and removes an unreferenced cover when the Markdown update fails', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2024-01-01', '封面回滚');
		const originalContent = '---\nid: 20\n中文名: "封面回滚"\n封面: "https://example.com/20.jpg"\n---\n![](https://example.com/20.jpg)';
		vault.addFile('ACGN/music/封面回滚.md', originalContent);
		const manager = createManager(vault, [subject]);
		const imageHandler = (manager as unknown as { imageHandler: CoverHandlerProbe }).imageHandler;
		imageHandler.getCoverTargetPath = () => 'assets/20.jpg';
		imageHandler.downloadCoverWithResult = async () => {
			await imageHandler.beforeCreate?.('assets/20.jpg');
			vault.addFile('assets/20.jpg', 'binary');
			return { path: 'assets/20.jpg', status: 'created' };
		};
		const originalProcess = vault.app.vault.process.bind(vault.app.vault);
		let failOnce = true;
		vault.app.vault.process = (file, updater) => {
			if (failOnce) {
				failOnce = false;
				return Promise.reject(new Error('Injected Markdown cover update failure'));
			}
			return originalProcess(file, updater);
		};

		const result = await manager.batchDownloadCovers();

		expect(result).toMatchObject({ downloaded: 0, failed: 1 });
		expect(vault.files.has('assets/20.jpg')).toBe(false);
		expect(vault.contents.get('ACGN/music/封面回滚.md')).toBe(originalContent);
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
		expect(manager.getRecoveryRequired()).toBeNull();
	});

	it('persists a recovery journal before the first Markdown Vault mutation', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2024-01-01', '写前日志');
		const manager = createManager(vault, [subject]);
		const originalCreate = vault.app.vault.create.bind(vault.app.vault);
		let journalExistedBeforeWrite = false;
		vault.app.vault.create = async (path, content) => {
			journalExistedBeforeWrite = await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH);
			return originalCreate(path, content);
		};

		await manager.syncByCollections([makeCollection(subject)], { concurrency: 1 });

		expect(journalExistedBeforeWrite).toBe(true);
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
	});

	it('publishes configuration-updating state and blocks Vault work for the full lease', async () => {
		const vault = new InMemoryVault();
		const manager = createManager(vault, []);
		const states: string[] = [];
		const unsubscribe = manager.subscribeManagerState(state => states.push(state));
		const lease = manager.beginConfigurationUpdate(['accessToken']);
		expect(manager.getManagerState()).toBe('configuration-updating');
		expect(() => manager.ensureCanStartSync()).toThrow(ConfigurationUpdateInProgressError);
		await lease.commit({
			accessToken: 'next', pathTemplate: 'ACGN/{{id}}.md', imagePathTemplate: 'assets/{{id}}.jpg',
			downloadImages: false, imageQuality: 'large', imageUpdateExisting: false, scanFolderPath: 'ACGN',
		});
		lease.release();
		unsubscribe();
		expect(states).toEqual(['idle', 'configuration-updating', 'idle']);
	});

	it('reloads an awaiting journal, blocks writes, and rolls persistent facts back', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(20, '2024-01-01', '重载成功项');
		const failed = makeSubject(21, '2024-01-02', '重载失败项');
		const manager = createManager(vault, [first, failed], { failures: new Set([21]) });
		await manager.syncByCollections([makeCollection(first), makeCollection(failed)], { concurrency: 1 });
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(true);

		const reloaded = createManager(vault, []);
		await reloaded.initializeRecovery();
		expect(() => reloaded.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		const recovered = await reloaded.retryRecovery();

		expect(recovered).toMatchObject({ status: 'rolled-back', recovered: true });
		expect(Array.from(vault.files.keys()).filter(path => path.endsWith('.md'))).toEqual([]);
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
	});

	it('validates concrete recovery paths outside the fixed scan root', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(30, '2024-01-01', '根外文件');
		const failed = makeSubject(31, '2024-01-02', '失败项');
		const manager = createManager(vault, [first, failed], { failures: new Set([31]) });
		manager.updateConfig({ pathTemplate: 'Notes/{{name_cn}}.md' }, ['pathTemplate']);
		const originalTrash = vault.app.fileManager.trashFile.bind(vault.app.fileManager);
		vault.app.fileManager.trashFile = () => Promise.reject(new Error('injected delete failure'));

		await manager.syncByCollections([makeCollection(first), makeCollection(failed)], { concurrency: 1 });
		expect(await manager.rollbackBatch()).toMatchObject({ status: 'rollback-failed' });
		vault.app.fileManager.trashFile = originalTrash;
		const blocked = await manager.confirmManualRecovery();

		expect(blocked).toMatchObject({ status: 'blocked', recovered: false });
		expect(blocked.diagnostics).toEqual(expect.arrayContaining([
			expect.objectContaining({ code: 'unexpected-created-path', path: 'Notes/根外文件.md' }),
		]));
		await originalTrash(vault.files.get('Notes/根外文件.md')!);
		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'recovered', recovered: true });
	});

	it('blocks startup on a corrupt journal and preserves a diagnostic backup', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, '{broken');
		const manager = createManager(vault, []);
		await manager.initializeRecovery();

		expect(manager.getRecoveryRequired()).toMatchObject({ reason: 'journal-corrupt' });
		expect(() => manager.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		expect(Array.from(vault.files.keys()).some(path => path.startsWith('.bangumi-sync-recovery.corrupt-'))).toBe(true);
		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'blocked', recovered: false });
		expect(await manager.retryRecovery()).toMatchObject({ status: 'blocked', recovered: false });
		expect(manager.getRecoveryRequired()).toMatchObject({ reason: 'journal-corrupt' });
	});

	it('counts an existing cover as skipped and creates no journal when updates are disabled', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2024-01-01', '已有封面跳过');
		vault.addFile('ACGN/music/已有封面跳过.md', '---\nid: 20\n中文名: "已有封面跳过"\n封面: "https://example.com/20.jpg"\n---\n');
		vault.addBinaryFile('assets/20.jpg', new Uint8Array([1, 2, 3]));
		const manager = createManager(vault, [subject]);
		const imageHandler = (manager as unknown as { imageHandler: CoverHandlerProbe }).imageHandler;
		imageHandler.getCoverTargetPath = () => 'assets/20.jpg';
		imageHandler.downloadCoverWithResult = () => Promise.reject(new Error('download must not run for an existing disabled target'));

		expect(await manager.batchDownloadCovers()).toEqual({ downloaded: 0, skipped: 1, failed: 0 });
		expect(Array.from(vault.binaryContents.get('assets/20.jpg') ?? [])).toEqual([1, 2, 3]);
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
	});

	it('restores an existing cover binary when the following Markdown write fails', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2024-01-01', '已有封面回滚');
		const originalContent = '---\nid: 20\n中文名: "已有封面回滚"\n封面: "https://example.com/20.jpg"\n---\n';
		vault.addFile('ACGN/music/已有封面回滚.md', originalContent);
		vault.addBinaryFile('assets/20.jpg', new Uint8Array([1, 2, 3]));
		const manager = createManager(vault, [subject]);
		manager.updateConfig({ imageUpdateExisting: true }, ['imageUpdateExisting']);
		const imageHandler = (manager as unknown as { imageHandler: CoverHandlerProbe }).imageHandler;
		imageHandler.getCoverTargetPath = () => 'assets/20.jpg';
		imageHandler.downloadCoverWithResult = async () => {
			await imageHandler.beforeUpdate?.('assets/20.jpg', new Uint8Array([1, 2, 3]).buffer);
			vault.binaryContents.set('assets/20.jpg', new Uint8Array([9, 9, 9]));
			return { path: 'assets/20.jpg', status: 'updated' };
		};
		const originalProcess = vault.app.vault.process.bind(vault.app.vault);
		let failOnce = true;
		vault.app.vault.process = (file, updater) => failOnce
			? (failOnce = false, Promise.reject(new Error('Injected Markdown failure after modifyBinary')))
			: originalProcess(file, updater);

		const result = await manager.batchDownloadCovers();

		expect(result).toMatchObject({ downloaded: 0, failed: 1 });
		expect(Array.from(vault.binaryContents.get('assets/20.jpg') ?? [])).toEqual([1, 2, 3]);
		expect(vault.contents.get('ACGN/music/已有封面回滚.md')).toBe(originalContent);
		expect(manager.getRecoveryRequired()).toBeNull();
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
	});

	it('turns a parseable malformed schema-1 journal into a blocking recovery without throwing at startup', async () => {
		const vault = new InMemoryVault();
		vault.addFile(RECOVERY_JOURNAL_PATH, JSON.stringify({ schemaVersion: 1 }));
		const manager = createManager(vault, []);
		await expect(manager.initializeRecovery()).resolves.toBeUndefined();
		expect(manager.getRecoveryRequired()).toMatchObject({ reason: 'journal-corrupt' });
		expect(() => manager.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		expect(Array.from(vault.files.keys()).some(path => path.includes('corrupt-structure'))).toBe(true);
	});

	it('blocks an orphan temporary file without deleting it and clears after manual repair', async () => {
		const vault = new InMemoryVault();
		const orphan = vault.addFile('Outside/.bangumi-sync-9-0-0.tmp.md', '---\nid: 9\n---\n');
		const manager = createManager(vault, []);
		await manager.initializeRecovery();

		expect(manager.getRecoveryRequired()).toMatchObject({ reason: 'orphan-temporary' });
		expect(manager.getRecoveryRequired()?.orphanTemporaryPaths).toEqual([orphan.path]);
		expect(vault.files.has(orphan.path)).toBe(true);
		expect(await manager.retryRecovery()).toMatchObject({ status: 'blocked', recovered: false });
		expect(() => manager.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		await vault.app.fileManager.trashFile(orphan);
		expect(await manager.rescanRecovery()).toMatchObject({ status: 'blocked', recovered: false, diagnostics: [] });
		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'recovered', recovered: true });
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
	});
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
		expect(result.renamed).toBe(1);
		expect(result.outcomes).toContainEqual(expect.objectContaining({
			subjectId: 1, previousPath: 'ACGN/music/乱马.md', actualPath: 'ACGN/music/乱马（1989）.md',
			pathAction: 'renamed', writeAction: 'skipped',
		}));
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
		expect(result.rollback).toEqual({ attempted: true, changed: true, deletedCreatedFiles: 0, restoredContents: 0, restoredPaths: 1, failed: 0 });
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
		expect(manager.getRecoveryRequired()?.reason).toBe('rollback-failed');
		fileManager.renameFile = renameFile;
		expect(await manager.retryRecovery()).toMatchObject({ status: 'rolled-back' });
		expect(manager.getRecoveryRequired()).toBeNull();
		expect(Array.from(vault.files.keys())).toEqual(['ACGN/music/乱马.md']);
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
		expect(rollback.rollback?.deletedCreatedFiles).toBe(1);
		expect(rollback.status).toBe('rolled-back');
		expect(rollback.result).toMatchObject({ added: 0, rolledBack: 1, canRollback: false });
		expect((await manager.rollbackBatch()).status).toBe('no-pending');
	});

	it('blocks a new batch until partial success is explicitly committed', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });

		const partial = await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		expect(partial.canRollback).toBe(true);
		expect(manager.getBatchTransactionState()).toBe('awaiting-user-decision');
		await expect(manager.syncByCollections([makeCollection(first)], { concurrency: 1 }))
			.rejects.toBeInstanceOf(PendingSyncTransactionError);

		expect(await manager.commitPendingBatch()).toMatchObject({ status: 'committed' });
		expect(manager.getBatchTransactionState()).toBe('committed');
		expect(vault.files.has('ACGN/music/成功.md')).toBe(true);
	});

	it('clears batch lookups after manual rollback', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });
		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });

		await manager.rollbackBatch();
		const incremental = (manager as unknown as { incrementalSync: {
			getLocalPath(id: number): string | undefined;
			isSyncedIncludingBatch(id: number): boolean;
			getBatchSyncedFiles(): unknown[];
		} }).incrementalSync;
		expect(incremental.getLocalPath(10)).toBeUndefined();
		expect(incremental.isSyncedIncludingBatch(10)).toBe(false);
		expect(incremental.getBatchSyncedFiles()).toEqual([]);
	});

	it('rolls files and path state back when state persistence fails', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2022-01-01', '持久化失败');
		let calls = 0;
		const manager = createManager(vault, [subject], {
			pathStateHandler: () => ++calls === 1 ? Promise.reject(new Error('save failed')) : Promise.resolve(),
		});

		const result = await manager.syncByCollections([makeCollection(subject)], { concurrency: 1 });

		expect(result.completion).toBe('rolled-back');
		expect(vault.files.has('ACGN/music/持久化失败.md')).toBe(false);
		expect(manager.getBatchTransactionState()).toBe('rolled-back');
	});

	it('reports rollback-failed when old path state restoration also fails', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2022-01-01', '状态恢复失败');
		const manager = createManager(vault, [subject], {
			pathStateHandler: () => Promise.reject(new Error('settings unavailable')),
		});

		const result = await manager.syncByCollections([makeCollection(subject)], { concurrency: 1 });

		expect(result.completion).toBe('rollback-failed');
		expect(result.rollback?.failed).toBe(1);
	});

	it('isolates successful collision and normal groups from an unrelated write failure', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/music/乱马.md', '---\nid: 1\n中文名: "乱马"\n---\nlegacy');
		const oldSubject = makeSubject(1, '1989-04-15');
		const newSubject = makeSubject(2, '2024-10-06');
		const normal = makeSubject(3, '2023-01-01', '正常');
		const failing = makeSubject(4, '2024-01-01', '写入失败');
		const originalCreate = vault.app.vault.create.bind(vault.app.vault);
		vault.app.vault.create = (path, content) => path.includes('写入失败')
			? Promise.reject(new Error('injected independent failure'))
			: originalCreate(path, content);
		const manager = createManager(vault, [oldSubject, newSubject, normal, failing]);

		const result = await manager.syncByCollections(
			[makeCollection(newSubject), makeCollection(normal), makeCollection(failing)], { concurrency: 1 },
		);

		expect(result.completion).toBe('partial-success');
		expect(result.canRollback).toBe(true);
		expect(vault.files.has('ACGN/music/乱马（1989）.md')).toBe(true);
		expect(vault.files.has('ACGN/music/乱马（2024）.md')).toBe(true);
		expect(vault.files.has('ACGN/music/正常.md')).toBe(true);
		expect(vault.files.has('ACGN/music/写入失败.md')).toBe(false);
	});

	it('reports related-link postprocessing failures as warnings', async () => {
		const vault = new InMemoryVault();
		vault.addFile('ACGN/music/当前.md', '---\nid: 1\n中文名: "当前"\n---\n');
		vault.addFile('ACGN/music/相关.md', '---\nid: 2\n中文名: "相关"\n---\n');
		const manager = createManager(vault, []);
		manager.updateConfig({ enableRelatedLinks: true });
		const injectable = manager as unknown as {
			incrementalSync: { scanLocalFolder(path: string): Promise<number> };
			postProcessBatchRelations(items: unknown[]): Promise<Array<{ operation: string; subjectId?: number }>>;
		};
		await injectable.incrementalSync.scanLocalFolder('ACGN');
		vault.app.vault.process = () => Promise.reject(new Error('link write failed'));

		const warnings = await injectable.postProcessBatchRelations([{
			subjectId: 1, filePath: 'ACGN/music/当前.md',
			relations: [{ id: 2, type: SubjectType.Music, name: '相关', name_cn: '相关', relation: '关联' }],
		}]);

		expect(warnings).toContainEqual(expect.objectContaining({
			subjectId: 2, operation: 'related-link-update',
		}));
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
		expect((await manager.rollbackBatch()).status).toBe('no-pending');
	});

	it('shares one decision promise so commit wins a simultaneous rollback click', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		let release!: () => void;
		const persistenceGate = new Promise<void>(resolve => { release = resolve; });
		const manager = createManager(vault, [first, second], {
			failures: new Set([11]),
			pathStateHandler: () => persistenceGate,
		});
		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });

		const commit = manager.commitPendingBatch();
		const rollback = manager.rollbackBatch();
		expect(rollback).toBe(commit);
		expect(manager.getBatchTransactionState()).toBe('committing');
		release();
		expect(await commit).toMatchObject({ status: 'committed' });
		expect(vault.files.has('ACGN/music/成功.md')).toBe(true);
	});

	it('broadcasts the committed terminal idle state to every live subscriber', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });
		const firstStates: string[] = [];
		const secondStates: string[] = [];
		const closedStates: string[] = [];
		manager.subscribeManagerState(state => firstStates.push(state));
		manager.subscribeManagerState(state => secondStates.push(state));
		const close = manager.subscribeManagerState(state => closedStates.push(state));
		close();
		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		expect(await manager.commitPendingBatch()).toMatchObject({ status: 'committed' });
		await Promise.resolve();
		expect(firstStates).toEqual(['idle', 'running', 'awaiting-decision', 'committing', 'idle']);
		expect(secondStates).toEqual(firstStates);
		expect(closedStates).toEqual(['idle']);
		expect(manager.getManagerState()).toBe('idle');
	});

	it('broadcasts the successful rollback terminal idle state', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });
		const states: string[] = [];
		manager.subscribeManagerState(state => states.push(state));

		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		expect(await manager.rollbackBatch()).toMatchObject({ status: 'rolled-back' });
		await Promise.resolve();
		expect(states).toEqual(['idle', 'running', 'awaiting-decision', 'rolling-back', 'idle']);
	});

	it('broadcasts recovery-required as the terminal rollback-failure state', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		vault.app.fileManager.trashFile = () => Promise.reject(new Error('injected trash failure'));
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });
		const states: string[] = [];
		manager.subscribeManagerState(state => states.push(state));

		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		expect(await manager.rollbackBatch()).toMatchObject({ status: 'rollback-failed' });
		await Promise.resolve();
		expect(states).toEqual(['idle', 'running', 'awaiting-decision', 'rolling-back', 'recovery-required']);
	});

	it('defers related-link postprocessing until a partial batch is committed', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		const manager = createManager(vault, [first, second], {
			failures: new Set([11]),
			relationsById: new Map([[10, [{ id: 99, type: SubjectType.Music, name: '关联', name_cn: '关联', relation: '关联' }]]]),
		});
		manager.updateConfig({ enableRelatedLinks: true });
		const postProcess = vi.fn().mockResolvedValue([]);
		(manager as unknown as { postProcessBatchRelations: typeof postProcess }).postProcessBatchRelations = postProcess;

		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		expect(postProcess).not.toHaveBeenCalled();
		expect(await manager.commitPendingBatch()).toMatchObject({ status: 'committed' });
		expect(postProcess).toHaveBeenCalledOnce();
	});

	it('retains recovery context after rollback failure and retries only unresolved work', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		const originalTrash = vault.app.fileManager.trashFile.bind(vault.app.fileManager);
		vault.app.fileManager.trashFile = () => Promise.reject(new Error('injected trash failure'));
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });
		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });

		const failed = await manager.rollbackBatch();
		expect(failed.status).toBe('rollback-failed');
		expect(failed.result).toBeDefined();
		expect(failed.result?.outcomes).toHaveLength(2);
		const recovery = manager.getRecoveryRequired();
		expect(recovery?.reason).toBe('rollback-failed');
		expect(recovery?.subjectExpectations).toEqual(expect.arrayContaining([
			expect.objectContaining({ subjectId: 10, expectedToExist: false }),
		]));
		expect(recovery?.attempts).toHaveLength(1);
		expect(recovery?.latestAttempt?.status).toBe('rollback-failed');
		await expect(manager.syncByCollections([makeCollection(first)], { concurrency: 1 }))
			.rejects.toBeInstanceOf(RecoveryRequiredError);

		vault.app.fileManager.trashFile = originalTrash;
		const retried = await manager.retryRecovery();
		expect(retried.status).toBe('rolled-back');
		expect(manager.getRecoveryRequired()).toBeNull();
		expect(vault.files.has('ACGN/music/成功.md')).toBe(false);
	});

	it('serializes retry and manual confirmation through one recovery action promise', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		const originalTrash = vault.app.fileManager.trashFile.bind(vault.app.fileManager);
		vault.app.fileManager.trashFile = () => Promise.reject(new Error('injected trash failure'));
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });
		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		await manager.rollbackBatch();

		let release!: () => void;
		const held = new Promise<void>(resolve => { release = resolve; });
		vault.app.fileManager.trashFile = async file => {
			await held;
			return originalTrash(file);
		};
		const retry = manager.retryRecovery();
		const manual = manager.confirmManualRecovery();
		expect(manual).toBe(retry);
		release();
		expect(await retry).toMatchObject({ status: 'rolled-back', recovered: true });
		expect(manager.getRecoveryRequired()).toBeNull();
	});

	it('keeps manual recovery blocked until the pre-batch absence expectation is restored', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		vault.app.fileManager.trashFile = () => Promise.reject(new Error('injected trash failure'));
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });
		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		await manager.rollbackBatch();

		const blocked = await manager.confirmManualRecovery();
		expect(blocked).toMatchObject({ status: 'blocked', recovered: false });
		expect(blocked.diagnostics).toEqual(expect.arrayContaining([
			expect.objectContaining({ code: 'unexpected-subject-file', subjectId: 10 }),
		]));
		expect(manager.getRecoveryRequired()?.latestAttempt?.diagnostics).toEqual(blocked.diagnostics);

		vault.files.delete('ACGN/music/成功.md');
		const recovered = await manager.confirmManualRecovery();
		expect(recovered).toMatchObject({ status: 'recovered', recovered: true });
		expect(manager.getRecoveryRequired()).toBeNull();
	});

	it('updates safe configuration in place but freezes recovery-sensitive fields', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		vault.app.fileManager.trashFile = () => Promise.reject(new Error('injected trash failure'));
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });
		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		await manager.rollbackBatch();
		const before = manager.getRecoveryRequired();

		manager.updateConfig({ accessToken: 'replacement-token' }, ['accessToken']);
		expect(manager.getRecoveryRequired()).toEqual(before);
		expect(() => manager.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		expect(() => manager.updateConfig({ scanFolderPath: 'Archive' }, ['scanFolderPath']))
			.toThrow(ConfigurationChangeBlockedError);
		expect(() => manager.assertCanReinitialize()).toThrow(ManagerReinitializationBlockedError);
		expect(manager.getRecoveryRequired()).toEqual(before);
	});

	it('verifies original content, concrete created paths, fixed scan root, and fresh terminal stats', async () => {
		const vault = new InMemoryVault();
		const originalContent = '---\nid: 10\n---\noriginal\r\nbody';
		vault.addFile('ACGN/music/已有.md', originalContent);
		const existing = makeSubject(10, '2020-01-01', '已有');
		const created = makeSubject(12, '2022-01-01', '新建');
		const failed = makeSubject(11, '2021-01-01', '失败');
		const manager = createManager(vault, [existing, created, failed], { failures: new Set([11]) });
		await manager.syncByCollections([makeCollection(existing), makeCollection(created), makeCollection(failed)], { concurrency: 1, overwrite: true });

		const originalProcess = vault.app.vault.process.bind(vault.app.vault);
		const originalTrash = vault.app.fileManager.trashFile.bind(vault.app.fileManager);
		vault.app.vault.process = () => Promise.reject(new Error('injected content restore failure'));
		vault.app.fileManager.trashFile = () => Promise.reject(new Error('injected created delete failure'));
		const rollback = await manager.rollbackBatch();
		expect(rollback.status).toBe('rollback-failed');
		const recovery = manager.getRecoveryRequired();
		expect(recovery?.scanRoot).toBe('ACGN');
		expect(recovery?.contentExpectations).toHaveLength(1);
		expect(recovery?.forbiddenPathsAfterRollback).toContain('ACGN/music/新建.md');

		manager.updateConfig({ accessToken: 'safe-token' }, ['accessToken']);
		vault.app.vault.process = originalProcess;
		vault.app.fileManager.trashFile = originalTrash;
		vault.contents.set('ACGN/music/新建.md', '---\nid: 99\n---\nchanged identity');
		const blocked = await manager.confirmManualRecovery();
		expect(blocked.diagnostics).toEqual(expect.arrayContaining([
			expect.objectContaining({ code: 'content-mismatch', path: 'ACGN/music/已有.md' }),
			expect.objectContaining({ code: 'unexpected-created-path', path: 'ACGN/music/新建.md', actualSubjectId: 99 }),
		]));

		vault.contents.set('ACGN/music/已有.md', originalContent);
		vault.files.delete('ACGN/music/新建.md');
		vault.contents.delete('ACGN/music/新建.md');
		const recovered = await manager.confirmManualRecovery();
		expect(recovered.diagnostics).toEqual([]);
		expect(recovered).toMatchObject({ status: 'recovered', recovered: true });
		expect(recovered.rollback).toMatchObject({ failed: 0, failures: [] });
		expect(recovered.resolution).toMatchObject({
			method: 'manual-verification', currentFailed: 0,
			automaticallyRestoredContents: 0, automaticallyRestoredPaths: 0,
			manuallyVerifiedContents: 1, manuallyVerifiedAbsentPaths: 1,
		});
		expect(recovered.attempts?.some(attempt => (attempt.rollback?.failed ?? 0) > 0)).toBe(true);
		expect(recovered.attempts?.at(-1)).toMatchObject({ action: 'confirm-manual', status: 'recovered' });
	});

	it('notifies every recovery observer through creation, attempts, and resolution', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '成功');
		const second = makeSubject(11, '2021-01-01', '失败');
		vault.app.fileManager.trashFile = () => Promise.reject(new Error('injected trash failure'));
		const manager = createManager(vault, [first, second], { failures: new Set([11]) });
		const firstObserver = vi.fn();
		const secondObserver = vi.fn();
		const unsubscribeFirst = manager.subscribeRecoveryState(firstObserver);
		manager.subscribeRecoveryState(secondObserver);

		await manager.syncByCollections([makeCollection(first), makeCollection(second)], { concurrency: 1 });
		await manager.rollbackBatch();
		expect(firstObserver).toHaveBeenCalledWith(expect.objectContaining({ reason: 'rollback-failed' }));
		expect(secondObserver).toHaveBeenCalledWith(expect.objectContaining({ reason: 'rollback-failed' }));
		vault.files.delete('ACGN/music/成功.md');
		vault.contents.delete('ACGN/music/成功.md');
		await manager.confirmManualRecovery();
		expect(firstObserver).toHaveBeenLastCalledWith(null);
		expect(secondObserver).toHaveBeenLastCalledWith(null);
		unsubscribeFirst();
	});

	it('keeps the gate after commit cleanup failure and restarts in cleanup-only mode', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '提交保留');
		const failed = makeSubject(11, '2021-01-01', '失败');
		const manager = createManager(vault, [first, failed], { failures: new Set([11]) });
		const states: string[] = [];
		manager.subscribeManagerState(state => states.push(state));
		await manager.syncByCollections([makeCollection(first), makeCollection(failed)], { concurrency: 1 });
		const adapter = vault.app.vault.adapter;
		const originalRemove = adapter.remove.bind(adapter);
		adapter.remove = path => path === RECOVERY_JOURNAL_PATH
			? Promise.reject(new Error('injected journal cleanup failure')) : originalRemove(path);

		const committed = await manager.commitPendingBatch();

		expect(committed.status).toBe('cleanup-failed');
		expect(manager.getManagerState()).toBe('recovery-required');
		expect(manager.getRecoveryRequired()?.reason).toBe('journal-cleanup-failed');
		expect(() => manager.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		expect(states.at(-1)).toBe('recovery-required');
		expect(JSON.parse(vault.contents.get(RECOVERY_JOURNAL_PATH) ?? '{}')).toMatchObject({ state: 'committed-cleanup-pending' });
		expect(vault.files.has('ACGN/music/提交保留.md')).toBe(true);

		adapter.remove = originalRemove;
		const reloaded = createManager(vault, []);
		await reloaded.initializeRecovery();
		expect(reloaded.getRecoveryRequired()?.reason).toBe('journal-cleanup-failed');
		expect(await reloaded.retryRecovery()).toMatchObject({ status: 'recovered', recovered: true });
		expect(vault.files.has('ACGN/music/提交保留.md')).toBe(true);
		expect(reloaded.getManagerState()).toBe('idle');
	});

	it('keeps the gate after rollback cleanup failure and never restores rolled-back data on restart', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '回滚删除');
		const failed = makeSubject(11, '2021-01-01', '失败');
		const manager = createManager(vault, [first, failed], { failures: new Set([11]) });
		await manager.syncByCollections([makeCollection(first), makeCollection(failed)], { concurrency: 1 });
		const adapter = vault.app.vault.adapter;
		const originalRemove = adapter.remove.bind(adapter);
		adapter.remove = path => path === RECOVERY_JOURNAL_PATH
			? Promise.reject(new Error('injected rollback cleanup failure')) : originalRemove(path);

		expect(await manager.rollbackBatch()).toMatchObject({ status: 'cleanup-failed' });
		expect(manager.getRecoveryRequired()?.reason).toBe('journal-cleanup-failed');
		expect(vault.files.has('ACGN/music/回滚删除.md')).toBe(false);
		expect(JSON.parse(vault.contents.get(RECOVERY_JOURNAL_PATH) ?? '{}')).toMatchObject({ state: 'rolled-back-cleanup-pending' });

		adapter.remove = originalRemove;
		const reloaded = createManager(vault, []);
		await reloaded.initializeRecovery();
		expect(await reloaded.retryJournalCleanup()).toMatchObject({ status: 'recovered', recovered: true });
		expect(vault.files.has('ACGN/music/回滚删除.md')).toBe(false);
	});

	it('keeps manual recovery gated when its terminal journal cleanup fails', async () => {
		const vault = new InMemoryVault();
		const first = makeSubject(10, '2020-01-01', '手动恢复');
		const failed = makeSubject(11, '2021-01-01', '失败');
		const originalTrash = vault.app.fileManager.trashFile.bind(vault.app.fileManager);
		vault.app.fileManager.trashFile = () => Promise.reject(new Error('injected rollback failure'));
		const manager = createManager(vault, [first, failed], { failures: new Set([11]) });
		await manager.syncByCollections([makeCollection(first), makeCollection(failed)], { concurrency: 1 });
		await manager.rollbackBatch();
		vault.app.fileManager.trashFile = originalTrash;
		await originalTrash(vault.files.get('ACGN/music/手动恢复.md')!);
		const adapter = vault.app.vault.adapter;
		const originalRemove = adapter.remove.bind(adapter);
		adapter.remove = path => path === RECOVERY_JOURNAL_PATH
			? Promise.reject(new Error('injected manual cleanup failure')) : originalRemove(path);

		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'failed', recovered: false });
		expect(manager.getRecoveryRequired()?.reason).toBe('journal-cleanup-failed');
		expect(() => manager.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		adapter.remove = originalRemove;
		expect(await manager.retryJournalCleanup()).toMatchObject({ status: 'recovered', recovered: true });
	});

	it('restores an updated cover when modifyBinary writes and then rejects', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2024-01-01', '写后更新失败');
		vault.addFile('ACGN/music/写后更新失败.md', '---\nid: 20\n封面: "https://example.com/20.jpg"\n---\n');
		const cover = vault.addBinaryFile('assets/20.jpg', new Uint8Array([1, 2, 3]));
		const manager = createManager(vault, [subject]);
		manager.updateConfig({ downloadImages: true, imageUpdateExisting: true, imagePathTemplate: 'assets/{{id}}.jpg' }, ['downloadImages', 'imageUpdateExisting', 'imagePathTemplate']);
		setRequestUrlHandler(() => Promise.resolve({ status: 200, arrayBuffer: new Uint8Array([4, 5, 6]).buffer }));
		const originalModify = vault.app.vault.modifyBinary.bind(vault.app.vault);
		let firstMutation = true;
		vault.app.vault.modifyBinary = (file, content) => {
			if (!firstMutation) return originalModify(file, content);
			firstMutation = false;
			vault.binaryContents.set(cover.path, new Uint8Array(content).slice());
			return Promise.reject(new Error('injected post-modify failure'));
		};

		expect(await manager.batchDownloadCovers()).toMatchObject({ downloaded: 0, failed: 1 });
		expect(Array.from(vault.binaryContents.get('assets/20.jpg') ?? [])).toEqual([1, 2, 3]);
		expect(manager.getRecoveryRequired()).toBeNull();
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
	});

	it('deletes a created cover when createBinary writes and then rejects', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2024-01-01', '写后创建失败');
		vault.addFile('ACGN/music/写后创建失败.md', '---\nid: 20\n封面: "https://example.com/20.jpg"\n---\n');
		const manager = createManager(vault, [subject]);
		manager.updateConfig({ downloadImages: true, imagePathTemplate: 'assets/{{id}}.jpg' }, ['downloadImages', 'imagePathTemplate']);
		setRequestUrlHandler(() => Promise.resolve({ status: 200, arrayBuffer: new Uint8Array([7, 8, 9]).buffer }));
		vault.app.vault.createBinary = (path, content) => {
			vault.addBinaryFile(path, new Uint8Array(content));
			return Promise.reject(new Error('injected post-create failure'));
		};

		expect(await manager.batchDownloadCovers()).toMatchObject({ downloaded: 0, failed: 1 });
		expect(vault.files.has('assets/20.jpg')).toBe(false);
		expect(manager.getRecoveryRequired()).toBeNull();
	});

	it('rolls back a post-create cover failure during ordinary collection sync', async () => {
		const vault = new InMemoryVault();
		const subject = makeSubject(20, '2024-01-01', '普通封面不确定');
		subject.images = { large: 'https://example.com/20.jpg' };
		const manager = createManager(vault, [subject]);
		manager.updateConfig({ downloadImages: true, imagePathTemplate: 'assets/{{id}}.jpg' }, ['downloadImages', 'imagePathTemplate']);
		setRequestUrlHandler(() => Promise.resolve({ status: 200, arrayBuffer: new Uint8Array([7, 8, 9]).buffer }));
		vault.app.vault.createBinary = (path, content) => {
			vault.addBinaryFile(path, new Uint8Array(content));
			return Promise.reject(new Error('injected collection post-create failure'));
		};

		const result = await manager.syncByCollections([makeCollection(subject)], { concurrency: 1 });
		expect(result.failed).toBe(1);
		expect(vault.files.has('assets/20.jpg')).toBe(false);
		expect(manager.getRecoveryRequired()).toBeNull();
	});
});
