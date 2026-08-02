import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestUrl } = vi.hoisted(() => ({ requestUrl: vi.fn() }));

vi.mock('obsidian', () => ({ requestUrl }));

import { BangumiClient } from '../../src/api/client';

describe('BangumiClient retry policy', () => {
	beforeEach(() => {
		requestUrl.mockReset();
		vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('does not retry non-retryable HTTP responses such as 401', async () => {
		requestUrl.mockResolvedValue({
			status: 401,
			json: { title: 'Unauthorized', description: 'Expired token' },
		});

		await expect(new BangumiClient('expired').getSubject(2789))
			.rejects.toThrow('HTTP 401: Unauthorized: Expired token');
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});
});
