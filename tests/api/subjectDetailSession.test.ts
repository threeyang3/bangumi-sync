import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BangumiClient } from '../../src/api/client';
import { SubjectDetailSession } from '../../src/api/subjectDetailSession';
import type { Subject } from '../../common/api/types';

const subject = (id: number) => ({ id, summary: 'Full summary', infobox: [{ key: 'date', value: '2026' }] } as Subject);
const deferred = () => {
	let resolve!: (value: Subject) => void;
	const promise = new Promise<Subject>(done => { resolve = done; });
	return { promise, resolve };
};
beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('operation scoped subject details', () => {
	it('deduplicates pending and successful details and bypasses only the subject endpoint in full loading', async () => {
		const client = new BangumiClient();
		const gate = deferred();
		const fetch = vi.spyOn(client, 'getSubject').mockReturnValue(gate.promise);
		const characters = vi.spyOn(client, 'getSubjectCharacters').mockResolvedValue([]);
		vi.spyOn(client, 'getSubjectPersons').mockResolvedValue([]);
		vi.spyOn(client, 'getSubjectRelations').mockResolvedValue([]);
		const session = new SubjectDetailSession(client);
		const one = session.getSubject(1), duplicate = session.getSubject(1);
		expect(one).toBe(duplicate);
		await vi.advanceTimersByTimeAsync(0);
		expect(fetch).toHaveBeenCalledTimes(1);
		gate.resolve(subject(1));
		await one;
		const full = await client.getFullSubjectInfo(1, session.getSubject(1));
		expect(full.subject).toMatchObject({ summary: 'Full summary' });
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(characters).toHaveBeenCalledTimes(1);
		session.dispose();
	});

	it('keeps physical slots after timeouts, ignores late successes and allows a later retry', async () => {
		const client = new BangumiClient();
		const gate = deferred();
		const fetch = vi.spyOn(client, 'getSubject').mockReturnValueOnce(gate.promise).mockResolvedValue(subject(1));
		const session = new SubjectDetailSession(client, 1, undefined, 1000);
		const first = session.getSubject(1);
		const firstCheck = expect(first).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(1000);
		await firstCheck;
		const queued = session.getSubject(2);
		const queueCheck = expect(queued).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(1000);
		await queueCheck;
		expect(fetch).toHaveBeenCalledTimes(1);
		gate.resolve(subject(1));
		await vi.advanceTimersByTimeAsync(0);
		expect(fetch).toHaveBeenCalledTimes(1); // expired queued work never starts
		expect(await session.getSubject(1)).toEqual(subject(1));
		expect(fetch).toHaveBeenCalledTimes(2); // late response was not cached
		session.dispose();
	});

	it('does not cache failures or identity mismatches', async () => {
		const client = new BangumiClient();
		const fetch = vi.spyOn(client, 'getSubject').mockRejectedValueOnce(new Error('Temporary'))
			.mockResolvedValueOnce(subject(2)).mockResolvedValue(subject(1));
		const session = new SubjectDetailSession(client);
		await expect(session.getSubject(1)).rejects.toThrow('Temporary');
		await expect(session.getSubject(1)).rejects.toThrow('identity mismatch');
		expect(await session.getSubject(1)).toEqual(subject(1));
		expect(fetch).toHaveBeenCalledTimes(3);
		session.dispose();
	});

	it('cancels queued work, settles waiters and does not start requests after disposal', async () => {
		const client = new BangumiClient();
		const gate = deferred();
		const fetch = vi.spyOn(client, 'getSubject').mockReturnValue(gate.promise);
		const session = new SubjectDetailSession(client, 1);
		const pending = Promise.allSettled([session.getSubject(1), session.getSubject(2)]);
		await vi.advanceTimersByTimeAsync(0);
		session.dispose();
		expect((await pending).every(result => result.status === 'rejected')).toBe(true);
		gate.resolve(subject(1));
		await vi.advanceTimersByTimeAsync(0);
		expect(fetch).toHaveBeenCalledTimes(1);
		await expect(session.getSubject(1)).rejects.toThrow('invalidated');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('invalidates successful responses after account changes and observes cancellation while requests hang', async () => {
		const client = new BangumiClient('one');
		vi.spyOn(client, 'getSubject').mockResolvedValueOnce(subject(1)).mockReturnValue(deferred().promise);
		const session = new SubjectDetailSession(client);
		await session.getSubject(1);
		client.setAccessToken('two');
		await expect(session.getSubject(1)).rejects.toThrow('invalidated');
		session.dispose();
		let cancelled = false;
		const next = new SubjectDetailSession(client, 3, () => cancelled);
		const waiting = expect(next.getSubject(2)).rejects.toThrow('cancelled');
		cancelled = true;
		await vi.advanceTimersByTimeAsync(100);
		await waiting;
		next.dispose();
		expect(vi.getTimerCount()).toBe(0);
	});
});
