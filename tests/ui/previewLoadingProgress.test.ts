import { afterEach, describe, expect, it, vi } from 'vitest';
import { BangumiClient } from '../../src/api/client';
import type { UserCollection } from '../../common/api/types';

vi.mock('obsidian', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), Modal: class {} }));
import { loadSubjectsForCollections } from '../../src/ui/localPropertyModal';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const collection = (id: number): UserCollection => ({
	subject_id: id, subject_type: 3, type: 2, rate: 0, comment: '', tags: [], private: false,
	ep_status: 0, vol_status: 0, updated_at: '',
	subject: { id, type: 3, name: 'Synthetic', name_cn: '', short_summary: '', date: '', images: {},
		volumes: 0, eps: 0, collection_total: 0, score: 0, rank: 0, tags: [] },
});

describe('preview detail progress', () => {
	it('reports completed requests, including fallback, without counting a pending request as finished', async () => {
		vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const client = new BangumiClient();
		let release = () => undefined as void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		vi.spyOn(client, 'getSubject').mockImplementation(async id => {
			if (id === 1) await gate;
			throw new Error('Synthetic fallback');
		});
		const progress = vi.fn();
		const warning = vi.fn();
		const run = loadSubjectsForCollections([collection(1), collection(2)], client, warning, progress);
		expect(progress.mock.calls).toEqual([[0, 2]]);
		release();
		const subjects = await run;
		expect(progress.mock.calls).toEqual([[0, 2], [1, 2], [2, 2]]);
		expect(warning).toHaveBeenCalledTimes(1);
		expect([...subjects.keys()]).toEqual([1, 2]);
	});

	it('reports an empty preview without sending any requests', async () => {
		const client = new BangumiClient();
		const request = vi.spyOn(client, 'getSubject');
		const progress = vi.fn();
		expect((await loadSubjectsForCollections([], client, undefined, progress)).size).toBe(0);
		expect(progress.mock.calls).toEqual([[0, 0]]);
		expect(request).not.toHaveBeenCalled();
	});
});
