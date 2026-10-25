import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { requestUrl } = vi.hoisted(() => ({ requestUrl: vi.fn() }));
vi.mock('obsidian', () => ({ requestUrl }));
import { BangumiClient } from '../../src/api/client';

beforeEach(() => { requestUrl.mockReset(); vi.useFakeTimers(); vi.stubGlobal('activeWindow', { setTimeout, clearTimeout }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const page = (ids: number[], total: number) => ({ status: 200, json: { total, data: ids.map(subject_id => ({ subject_id })) } });

it('uses raw page length for offsets and returns a complete collection snapshot', async () => {
	requestUrl.mockResolvedValueOnce(page([1], 2)).mockResolvedValueOnce(page([2], 2));
	const run = new BangumiClient().getAllUserCollections('fixture');
	await vi.runAllTimersAsync(); expect(await run).toHaveLength(2);
	expect((requestUrl.mock.calls[1][0] as { url: string }).url).toContain('offset=1');
});

it.each(['empty', 'duplicate', 'total'])('rejects %s collection pages instead of exposing a partial account', async kind => {
	requestUrl.mockResolvedValueOnce(page([1], 2)).mockResolvedValueOnce(kind === 'empty' ? page([], 2) : kind === 'duplicate' ? page([1], 2) : page([2], 3));
	const result = expect(new BangumiClient().getAllUserCollections('fixture')).rejects.toThrow('Incomplete collection snapshot');
	await vi.runAllTimersAsync(); await result; expect(requestUrl).toHaveBeenCalledTimes(2);
});
