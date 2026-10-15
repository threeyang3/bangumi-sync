import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RelatedSubject } from '../../common/api/types';
import { SyncManager } from '../../src/sync/syncManager';
import { IncrementalSync } from '../../src/sync/incrementalSync';
import { createCancellationSignal } from '../../src/sync/syncStatus';
import type { SyncWarning } from '../../src/sync/syncStatus';
import { InMemoryVault } from '../mocks/inMemoryVault';

type BatchItem = { subjectId: number; filePath: string; relations: RelatedSubject[] };
interface RelationMethods {
	incrementalSync: IncrementalSync;
	postProcessBatchRelations(items: BatchItem[]): Promise<SyncWarning[]>;
	resolveRelatedLocalPath(subjectId: number): string | undefined;
}
const path = (id: number) => `ACGN/${id}.md`;
const link = (id: number) => `[[${path(id)}|${id}]]`;
const content = (id: number, related: string[] = []) => `---\nid: ${id}\ncustom: keep\n相关:\n${related.map(value => `  - "${value}"`).join('\n')}\n---\nUser body ${id}`;
const item = (id: number, relations: number[]): BatchItem => ({ subjectId: id, filePath: path(id),
	relations: relations.map(id => ({ id, type: 3, name: `${id}`, name_cn: `${id}`, relation: '关联' })),
});
async function setup(ids = [1, 2, 9]) {
	const vault = new InMemoryVault();
	for (const id of ids) vault.addFile(path(id), content(id));
	const manager = new SyncManager(vault.app, {
		accessToken: '', pathTemplate: 'ACGN/{{id}}.md', scanFolderPath: 'ACGN', imagePathTemplate: 'assets/{{id}}',
		downloadImages: false, imageQuality: 'large', imageUpdateExisting: false, enableRelatedLinks: true,
	});
	const internal = manager as unknown as RelationMethods;
	await internal.incrementalSync.scanLocalFolder('ACGN');
	return { vault, manager, internal };
}
afterEach(() => vi.restoreAllMocks());

describe('batch related link updates', () => {
	it('aggregates external backlinks and batch forward/reverse links before one read and at most one process per target', async () => {
		const { vault, internal } = await setup();
		vault.contents.set(path(9), content(9, ['[[Manual|Keep]]']));
		const read = vi.spyOn(vault.app.vault, 'read');
		const process = vi.spyOn(vault.app.vault, 'process');
		const resolve = vi.spyOn(internal, 'resolveRelatedLocalPath');
		expect(await internal.postProcessBatchRelations([item(1, [2, 9, 9, 99]), item(2, [1, 9, 99])])).toEqual([]);
		for (const id of [1, 2, 9]) {
			expect(read.mock.calls.filter(([file]) => file.path === path(id))).toHaveLength(1);
			expect(process.mock.calls.filter(([file]) => file.path === path(id))).toHaveLength(1);
			expect(vault.contents.get(path(id))).toContain(`User body ${id}`);
			expect(vault.contents.get(path(id))).toContain('custom: keep');
		}
		expect(internal.incrementalSync.extractRelated(vault.contents.get(path(9))!)).toEqual(['[[Manual|Keep]]', link(1), link(2)]);
		expect(internal.incrementalSync.extractRelated(vault.contents.get(path(1))!)).toEqual([link(2)]);
		expect(internal.incrementalSync.extractRelated(vault.contents.get(path(2))!)).toEqual([link(1)]);
		expect(resolve.mock.calls.filter(([id]) => id === 9)).toHaveLength(1);
		expect(resolve.mock.calls.filter(([id]) => id === 99)).toHaveLength(1);
	});

	it('preserves exact bytes and avoids process when all requested links already exist', async () => {
		const { vault, internal } = await setup();
		const original = content(9, [link(2), link(1)]).replace('custom: keep', 'custom: "keep" # formatting');
		vault.contents.set(path(9), original);
		const process = vi.spyOn(vault.app.vault, 'process');
		expect(await internal.postProcessBatchRelations([item(1, [9, 9]), item(2, [9])])).toEqual([]);
		expect(process).not.toHaveBeenCalled();
		expect(vault.contents.get(path(9))).toBe(original);
	});

	it('merges against latest content so edits made after the preflight read survive', async () => {
		const { vault, internal } = await setup();
		const process = vault.app.vault.process.bind(vault.app.vault);
		vault.app.vault.process = (file, updater) => {
			vault.contents.set(file.path, content(9, ['[[Manual|Late link]]']).replace('custom: keep', 'custom: edited') + '\nLate user edit');
			return process(file, updater);
		};
		expect(await internal.postProcessBatchRelations([item(1, [9])])).toEqual([]);
		const updated = vault.contents.get(path(9))!;
		expect(internal.incrementalSync.extractRelated(updated)).toEqual(['[[Manual|Late link]]', link(1)]);
		expect(updated).toContain('custom: edited');
		expect(updated).toContain('Late user edit');
	});

	it.each(['preflight', 'atomic'] as const)('rejects an identity change at %s and continues updating independent targets', async stage => {
		const { vault, internal } = await setup();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const changed = content(99);
		if (stage === 'preflight') vault.contents.set(path(9), changed);
		else {
			const process = vault.app.vault.process.bind(vault.app.vault);
			vault.app.vault.process = (file, updater) => {
				if (file.path === path(9)) vault.contents.set(file.path, changed);
				return process(file, updater);
			};
		}
		const warnings = await internal.postProcessBatchRelations([item(1, [9, 2, 9])]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({ subjectId: 9, operation: 'related-link-update' });
		expect(vault.contents.get(path(9))).toBe(changed);
		expect(vault.contents.get(path(2))).toContain(link(1));
	});

	it('reports one warning per failed target and still updates the rest', async () => {
		const { vault, internal } = await setup();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const process = vault.app.vault.process.bind(vault.app.vault);
		const attempts = vi.spyOn(vault.app.vault, 'process').mockImplementation((file, updater) =>
			file.path === path(9) ? Promise.reject(new Error('Injected process failure')) : process(file, updater));
		const warnings = await internal.postProcessBatchRelations([item(1, [9, 2]), item(2, [9])]);
		expect(warnings).toEqual([{ subjectId: 9, operation: 'related-link-update', message: 'Injected process failure' }]);
		expect(attempts.mock.calls.filter(([file]) => file.path === path(9))).toHaveLength(1);
		expect(vault.contents.get(path(1))).toContain(link(2));
		expect(vault.contents.get(path(2))).toContain(link(1));
	});

	it('does not merge different identities mapped to the same target path', async () => {
		const { vault, internal } = await setup();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(internal, 'resolveRelatedLocalPath').mockReturnValue(path(9));
		const process = vi.spyOn(vault.app.vault, 'process');
		const warnings = await internal.postProcessBatchRelations([item(1, [2, 9])]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0].message).toContain('Conflicting subject IDs');
		expect(process).not.toHaveBeenCalled();
		expect(vault.contents.get(path(9))).toBe(content(9));
	});

	it('stops between targets after cancellation', async () => {
		const { vault, internal, manager } = await setup();
		const signal = createCancellationSignal(); manager.setCancellationSignal(signal);
		const process = vault.app.vault.process.bind(vault.app.vault);
		const attempts = vi.spyOn(vault.app.vault, 'process').mockImplementation(async (file, updater) => {
			const updated = await process(file, updater); signal.cancel(); return updated;
		});
		expect(await internal.postProcessBatchRelations([item(1, [9, 2])])).toEqual([]);
		expect(attempts).toHaveBeenCalledTimes(1);
		expect(vault.contents.get(path(9))).toContain(link(1));
		expect(vault.contents.get(path(2))).toBe(content(2));
	});

	it('does not start an update if cancelled during preflight reading', async () => {
		const { vault, internal, manager } = await setup();
		const signal = createCancellationSignal(); manager.setCancellationSignal(signal);
		const read = vault.app.vault.read.bind(vault.app.vault);
		vi.spyOn(vault.app.vault, 'read').mockImplementation(async file => { const value = await read(file); signal.cancel(); return value; });
		const process = vi.spyOn(vault.app.vault, 'process');
		expect(await internal.postProcessBatchRelations([item(1, [9])])).toEqual([]);
		expect(process).not.toHaveBeenCalled();
	});

	it.each(['cancel', 'shutdown'] as const)('keeps latest content if %s occurs before an already queued process callback', async action => {
		const { vault, internal, manager } = await setup();
		const signal = createCancellationSignal(); manager.setCancellationSignal(signal);
		const process = vault.app.vault.process.bind(vault.app.vault);
		vault.app.vault.process = (file, updater) => {
			if (action === 'shutdown') manager.shutdown(); else signal.cancel();
			return process(file, updater);
		};
		expect(await internal.postProcessBatchRelations([item(1, [9, 2])])).toEqual([]);
		expect(vault.contents.get(path(9))).toBe(content(9));
		expect(vault.contents.get(path(2))).toBe(content(2));
	});

	it('does not touch files when links are disabled or there are no resolvable relations', async () => {
		const { vault, internal, manager } = await setup();
		const read = vi.spyOn(vault.app.vault, 'read');
		const process = vi.spyOn(vault.app.vault, 'process');
		expect(await internal.postProcessBatchRelations([item(1, [99])])).toEqual([]);
		manager.updateConfig({ enableRelatedLinks: false });
		expect(await internal.postProcessBatchRelations([item(1, [9])])).toEqual([]);
		expect(read).not.toHaveBeenCalled(); expect(process).not.toHaveBeenCalled();
	});

	it('preserves link normalization, existing order and duplicate cleanup', async () => {
		const { internal } = await setup();
		const original = content(9, [link(1), link(1)]);
		const updated = internal.incrementalSync.updateRelated(original, [`"${link(1)}"`, link(2), link(2)]);
		expect(internal.incrementalSync.extractRelated(updated)).toEqual([link(1), link(2)]);
		expect(internal.incrementalSync.updateRelated(updated, [link(1), link(2)])).toBe(updated);
	});
});
