import { afterEach, describe, expect, it, vi } from 'vitest';
const { requestUrl } = vi.hoisted(() => ({ requestUrl: vi.fn() }));
vi.mock('obsidian', () => ({ requestUrl }));
import { BangumiClient } from '../../src/api/client';

const episode = (id: number) => ({ id, subject_id: 1, type: id % 3, sort: id, name: `Episode ${id}`, name_cn: '', airdate: '', duration: '' });
const page = (data: unknown[], total = data.length, offset = 0) => ({ status: 200, json: { data, total, offset, limit: 200 } });
afterEach(() => { vi.restoreAllMocks(); requestUrl.mockReset(); });

describe('combined chapter and status loading', () => {
	it('retains uncollected and special episodes from one complete response', async () => {
		requestUrl.mockResolvedValue(page([0, 1, 2, 3].map((type, index) => ({ episode: episode(index + 1), type }))));
		const data = await new BangumiClient('synthetic').getEpisodeData(1);
		expect(data.episodes).toEqual([1, 2, 3, 4].map(episode));
		expect(data.userStatus.map(item => item.type)).toEqual([0, 1, 2, 3]); expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('follows actual page lengths through all chapters without a public duplicate', async () => {
		const offsets: number[] = [];
		requestUrl.mockImplementation(({ url }: { url: string }) => {
			const parsed = new URL(url), offset = Number(parsed.searchParams.get('offset')); offsets.push(offset);
			expect(parsed.pathname).toContain('/users/-/collections/1/episodes');
			return Promise.resolve(page(Array.from({ length: Math.min(100, 235 - offset) }, (_, i) => ({ episode: episode(offset + i + 1), type: 2 })), 235, offset));
		});
		const data = await new BangumiClient('synthetic').getEpisodeData(1);
		expect(offsets).toEqual([0, 100, 200]); expect(data.episodes).toHaveLength(235); expect(data.userStatus).toHaveLength(235);
	});

	it('accepts the server null-data representation for an empty collection', async () => {
		requestUrl.mockResolvedValue({ status: 200, json: { data: null, total: 0, offset: 0 } });
		expect(await new BangumiClient('synthetic').getEpisodeData(1)).toEqual({ episodes: [], userStatus: [] });
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it.each(['unauthorized', 'incomplete', 'wrong-subject', 'duplicate', 'missing-field'])('falls back once to public chapters for %s', async kind => {
		const paths: string[] = [];
		requestUrl.mockImplementation(({ url }: { url: string }) => {
			paths.push(new URL(url).pathname);
			if (url.includes('/users/')) {
				if (kind === 'unauthorized') return Promise.resolve({ status: 401, json: {} });
				if (kind === 'incomplete') return Promise.resolve(page([], 10));
				if (kind === 'duplicate') return Promise.resolve(page([1, 1].map(id => ({ episode: episode(id), type: 2 }))));
				return Promise.resolve(page([{ episode: kind === 'wrong-subject' ? { ...episode(1), subject_id: 9 } : { id: 1 }, type: 2 }]));
			}
			return Promise.resolve(page([episode(1)]));
		});
		expect(await new BangumiClient('synthetic').getEpisodeData(1)).toEqual({ episodes: [episode(1)], userStatus: [] });
		expect(paths).toEqual(['/v0/users/-/collections/1/episodes', '/v0/episodes']);
	});

	it('uses paginated public chapters without an authentication probe for anonymous clients', async () => {
		requestUrl.mockImplementation(({ url }: { url: string }) => {
			const parsed = new URL(url), offset = Number(parsed.searchParams.get('offset'));
			expect(parsed.pathname).toBe('/v0/episodes');
			return Promise.resolve(page([episode(offset + 1)], 2, offset));
		});
		expect(await new BangumiClient().getEpisodeData(1)).toEqual({ episodes: [episode(1), episode(2)], userStatus: [] });
		expect(requestUrl).toHaveBeenCalledTimes(2);
	});

	it.each(['cancel', 'credentials'])('does not fall back or request another page after %s changes', async mode => {
		const client = new BangumiClient('synthetic'); let cancelled = false;
		client.setRequestCancellationChecker(() => cancelled);
		requestUrl.mockImplementation(() => {
			if (mode === 'cancel') cancelled = true; else client.setAccessToken('changed');
			return Promise.resolve(page([{ episode: episode(1), type: 2 }], 2));
		});
		await expect(client.getEpisodeData(1)).rejects.toThrow('Request context cancelled'); expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('rejects a truncated public response instead of treating it as complete', async () => {
		requestUrl.mockResolvedValue(page([], 2));
		await expect(new BangumiClient().getEpisodeData(1)).rejects.toThrow('Incomplete episode page');
	});
});
