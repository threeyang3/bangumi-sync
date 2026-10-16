import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { requestUrl } = vi.hoisted(() => ({ requestUrl: vi.fn() }));
vi.mock('obsidian', () => ({ requestUrl }));
import { BangumiClient } from '../../src/api/client';
import { bangumiRequestScheduler, RequestScheduler } from '../../src/api/requestScheduler';
import { SubjectDetailSession } from '../../src/api/subjectDetailSession';

const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
beforeEach(() => { requestUrl.mockReset(); bangumiRequestScheduler.setConcurrency(3); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('shared actual HTTP request scheduling', () => {
	it('releases scoped limits without overwriting a newer configured budget', async () => {
		const scheduler = new RequestScheduler(); scheduler.setConcurrency(3);
		const release = scheduler.acquireConcurrency(1);
		const held = Array.from({ length: 3 }, gate), started: number[] = [];
		const work = held.map((entry, index) => scheduler.run(async () => { started.push(index); await entry.promise; }));
		try {
			await vi.waitFor(() => expect(started).toEqual([0]));
			scheduler.setConcurrency(2); expect(started).toEqual([0]);
			release(); release();
			await vi.waitFor(() => expect(started).toEqual([0, 1]));
			held[0].release(); await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
		} finally { release(); for (const entry of held) entry.release(); }
		await Promise.all(work);
	});
	it('does not start another request after lowering the limit until existing requests fall below it', async () => {
		const scheduler = new RequestScheduler(); scheduler.setConcurrency(3);
		const held = Array.from({ length: 4 }, gate), started: number[] = [];
		const work = held.map((entry, index) => scheduler.run(async () => { started.push(index); await entry.promise; return index; }));
		try {
			await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
			scheduler.setConcurrency(1); held[0].release(); held[1].release();
			await Promise.all(work.slice(0, 2)); expect(started).toEqual([0, 1, 2]);
			held[2].release(); await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]));
		} finally { for (const entry of held) entry.release(); }
		await Promise.all(work);
	});
	it('bounds all endpoint families across clients, including full-info fanout and direct auth/collection probes', async () => {
		const held = gate(); let active = 0, maximum = 0;
		requestUrl.mockImplementation(async () => { maximum = Math.max(maximum, ++active); await held.promise; active--; return { status: 200, json: { username: 'synthetic' } }; });
		const first = new BangumiClient('test'), second = new BangumiClient('test');
		first.setRequestConcurrency(2);
		const run = Promise.all([first.getFullSubjectInfo(1), second.validateToken(), second.getCollectionStatus(2), second.hasCollection(3)]);
		await vi.waitFor(() => expect(requestUrl).toHaveBeenCalledTimes(2));
		expect(maximum).toBe(2); held.release(); await run;
		expect(requestUrl).toHaveBeenCalledTimes(9); expect(maximum).toBe(2); expect(active).toBe(0);
	});

	it('does not issue queued requests or retry when the operation is cancelled', async () => {
		const held = gate(); const client = new BangumiClient(); client.setRequestConcurrency(1);
		let cancelled = false; client.setRequestCancellationChecker(() => cancelled);
		requestUrl.mockImplementation(async () => { await held.promise; return { status: 200, json: {} }; });
		const run = Promise.allSettled([client.getSubject(1), client.getSubject(2)]);
		await vi.waitFor(() => expect(requestUrl).toHaveBeenCalledTimes(1));
		cancelled = true; held.release();
		expect((await run).every(value => value.status === 'rejected')).toBe(true);
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('rejects stale account responses and queued credentials without issuing a second request', async () => {
		const held = gate(); const client = new BangumiClient('first'); client.setRequestConcurrency(1);
		requestUrl.mockImplementation(async () => { await held.promise; return { status: 200, json: {} }; });
		const run = Promise.allSettled([client.getSubject(1), client.getSubject(2)]);
		await vi.waitFor(() => expect(requestUrl).toHaveBeenCalledTimes(1));
		client.setAccessToken('second'); held.release();
		expect((await run).every(value => value.status === 'rejected')).toBe(true);
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('releases slots during retry backoff and retains retry/error behavior', async () => {
		vi.useFakeTimers(); vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const client = new BangumiClient(); client.setRequestConcurrency(1);
		let first = true;
		requestUrl.mockImplementation(({ url }: { url: string }) => {
			if (url.endsWith('/1') && first) { first = false; return Promise.resolve({ status: 429, json: {} }); }
			return Promise.resolve({ status: 200, json: { id: 1 } });
		});
		const retry = client.getSubject(1); await vi.advanceTimersByTimeAsync(0);
		await client.getSubject(2);
		expect(requestUrl).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1000); await retry;
		expect(requestUrl).toHaveBeenCalledTimes(3);
	});

	it('retains the real HTTP slot when a preview timeout expires', async () => {
		vi.useFakeTimers(); vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
		const held = gate();
		requestUrl.mockImplementation(async ({ url }: { url: string }) => {
			if (url.endsWith('/1')) await held.promise;
			return { status: 200, json: { id: Number(url.split('/').pop()) } };
		});
		const first = new BangumiClient(), second = new BangumiClient();
		const session = new SubjectDetailSession(first, 1, undefined, 1000);
		const expired = expect(session.getSubject(1)).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(1000); await expired;
		const next = second.getSubject(2); await vi.advanceTimersByTimeAsync(0);
		expect(requestUrl).toHaveBeenCalledTimes(1);
		held.release(); await next;
		expect(requestUrl).toHaveBeenCalledTimes(2); session.dispose();
	});

	it('does not retry with another account after credentials change during backoff', async () => {
		vi.useFakeTimers(); vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		requestUrl.mockResolvedValue({ status: 500, json: {} });
		const client = new BangumiClient('first');
		const outcome = expect(client.getSubject(1)).rejects.toThrow('cancelled');
		await vi.advanceTimersByTimeAsync(0); client.setAccessToken('second');
		await vi.advanceTimersByTimeAsync(1000); await outcome;
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('does not revive old queued requests when a new cancellation context replaces the cancelled one', async () => {
		const held = gate(), client = new BangumiClient(); client.setRequestConcurrency(1);
		let cancelled = false; client.setRequestCancellationChecker(() => cancelled);
		requestUrl.mockImplementation(async () => { await held.promise; return { status: 200, json: {} }; });
		const old = Promise.allSettled([client.getSubject(1), client.getSubject(2)]);
		await vi.waitFor(() => expect(requestUrl).toHaveBeenCalledTimes(1));
		cancelled = true; client.setRequestCancellationChecker(() => false);
		const next = client.getSubject(3); held.release();
		const outcomes = await old; await next;
		expect(outcomes.every(value => value.status === 'rejected')).toBe(true);
		expect(requestUrl.mock.calls.map(([options]) => String((options as { url: string }).url))).toEqual([
			'https://api.bgm.tv/v0/subjects/1', 'https://api.bgm.tv/v0/subjects/3',
		]);
	});

	it('does not send a preview request that expired while waiting for the shared HTTP budget', async () => {
		vi.useFakeTimers(); vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
		const held = gate(), client = new BangumiClient(); client.setRequestConcurrency(1);
		requestUrl.mockImplementation(async () => { await held.promise; return { status: 200, json: { id: 2 } }; });
		const blocking = client.getSubject(1); await vi.advanceTimersByTimeAsync(0);
		const session = new SubjectDetailSession(client, 1, undefined, 1000);
		const expired = expect(session.getSubject(2)).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(1000); await expired; session.dispose();
		held.release(); await blocking; await vi.advanceTimersByTimeAsync(0);
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('does not attach earlier background requests to a later operation cancellation', async () => {
		const held = gate(), client = new BangumiClient(); client.setRequestConcurrency(1);
		requestUrl.mockImplementation(async () => { await held.promise; return { status: 200, json: {} }; });
		const background = Promise.all([client.getSubject(1), client.getSubject(2)]);
		await vi.waitFor(() => expect(requestUrl).toHaveBeenCalledTimes(1));
		client.setRequestCancellationChecker(() => true);
		const cancelled = expect(client.getSubject(3)).rejects.toThrow('cancelled');
		held.release(); await background; await cancelled;
		expect(requestUrl).toHaveBeenCalledTimes(2);
	});
});
