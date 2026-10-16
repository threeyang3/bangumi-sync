import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestUrl } = vi.hoisted(() => ({ requestUrl: vi.fn() }));

vi.mock('obsidian', () => ({ requestUrl }));

import { BangumiClient } from '../../src/api/client';
import { registerDiagnosticLogging } from '../../common/logging';

describe('BangumiClient retry policy', () => {
	beforeEach(() => {
		requestUrl.mockReset();
		vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		registerDiagnosticLogging(() => false);
		vi.restoreAllMocks();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it.each([429, 500])('retries HTTP %s when the SDK honors its throw option', async status => {
		vi.useFakeTimers(); vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		let first = true;
		requestUrl.mockImplementation((options: { throw?: boolean }) => {
			if (!first) return Promise.resolve({ status: 200, json: { id: 1 } });
			first = false;
			return options.throw === false ? Promise.resolve({ status, json: {} }) : Promise.reject(new Error(`HTTP ${status}`));
		});
		const run = new BangumiClient().getSubject(1);
		const expected = expect(run).resolves.toMatchObject({ id: 1 });
		await vi.advanceTimersByTimeAsync(1000); await expected;
		expect(requestUrl).toHaveBeenCalledTimes(2);
	});

	it.each([false, true])('keeps request bodies and tokens out of logs with diagnostics=%s', async enabled => {
		registerDiagnosticLogging(() => enabled);
		requestUrl.mockResolvedValue({ status: 200, json: {} });
		const client = new BangumiClient('PRIVATE-TOKEN');
		await client.createOrUpdateCollection(2789, { type: 2, comment: 'PRIVATE-COMMENT', private: true });
		const debug = vi.mocked(console.debug);
		if (enabled) expect(debug).toHaveBeenCalled();
		else expect(debug).not.toHaveBeenCalled();
		expect(JSON.stringify(debug.mock.calls)).not.toContain('PRIVATE');
		requestUrl.mockResolvedValue({ status: 401, json: { title: 'Unauthorized' } });
		await expect(client.createOrUpdateCollection(2789, { type: 2, comment: 'PRIVATE-COMMENT' }))
			.rejects.toThrow('HTTP 401: Unauthorized');
		expect(console.error).toHaveBeenCalled();
		expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('PRIVATE');
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
