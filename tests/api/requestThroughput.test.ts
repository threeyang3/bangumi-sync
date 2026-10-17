import { afterEach, describe, expect, it, vi } from 'vitest';
const { requestUrl } = vi.hoisted(() => ({ requestUrl: vi.fn() }));
vi.mock('obsidian', () => ({ requestUrl }));
import { BangumiClient } from '../../src/api/client';
import { requestBudgetForItems } from '../../src/api/requestScheduler';
import { SubjectDetailSession } from '../../src/api/subjectDetailSession';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); new BangumiClient().setRequestConcurrency(12); });

describe('formal execution throughput with a live preview session', () => {
	it('keeps uncached full details complete while reducing scheduler waits', async () => {
		vi.useFakeTimers(); vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
		const elapsed: number[] = [];
		for (const budget of [5, requestBudgetForItems(5)]) {
			const client = new BangumiClient(); client.setRequestConcurrency(budget);
			let requests = 0, next = 1;
			requestUrl.mockImplementation(async ({ url }: { url: string }) => {
				requests++;
				await new Promise(resolve => activeWindow.setTimeout(resolve, 100));
				return { status: 200, json: /\/subjects\/\d+$/.test(url) ? { id: Number(url.split('/').pop()) } : [] };
			});
			const start = Date.now();
			const work = Promise.all(Array.from({ length: 5 }, async () => {
				while (next <= 50) {
					const id = next++;
					const data = await client.getFullSubjectInfo(id, undefined, () => ({ characters: true, persons: true, relations: true }));
					expect(data.subject.id).toBe(id);
				}
			}));
			await vi.runAllTimersAsync(); await work;
			expect(requests).toBe(200); elapsed.push(Date.now() - start);
		}
		expect(elapsed).toEqual([4000, 2000]);
	});

	it.each([false, true])('compares HTTP budgets on identical cached rich subjects, rich=%s', async rich => {
		vi.useFakeTimers();
		vi.stubGlobal('activeWindow', { setTimeout, clearTimeout });
		const results: Array<{ budget: number; elapsed: number; requests: number; peak: number }> = [];
		for (const budget of [5, 10, 15, requestBudgetForItems(5)]) {
			const client = new BangumiClient(); client.setRequestConcurrency(budget);
			let active = 0, peak = 0, requests = 0;
			requestUrl.mockImplementation(async ({ url }: { url: string }) => {
				requests++; peak = Math.max(peak, ++active);
				await new Promise(resolve => activeWindow.setTimeout(resolve, 100)); active--;
				return { status: 200, json: /\/subjects\/\d+$/.test(url) ? { id: Number(url.split('/').pop()) } : [] };
			});
			const session = new SubjectDetailSession(client, 5);
			try {
				const preview = Promise.all(Array.from({ length: 50 }, (_, i) => session.getSubject(i + 1)));
				await vi.runAllTimersAsync(); await preview;
				expect(peak).toBe(5); // Preview remains limited to five items.
				requests = 0; peak = 0;
				let next = 1, completed = 0;
				const start = Date.now();
				const work = Promise.all(Array.from({ length: 5 }, async () => {
					while (next <= 50) {
						const id = next++;
						const data = await client.getFullSubjectInfo(id, session.getSubject(id), () => ({ characters: rich, persons: rich, relations: true }));
						expect(data.subject.id).toBe(id); completed++;
					}
				}));
				await vi.runAllTimersAsync(); await work;
				expect(completed).toBe(50); expect(active).toBe(0);
				expect(requests).toBe(rich ? 150 : 50);
				expect(peak).toBeLessThanOrEqual(budget);
				results.push({ budget, elapsed: Date.now() - start, requests, peak });
			} finally { session.dispose(); }
		}
		expect(results.map(row => row.elapsed)).toEqual(rich ? [3000, 1500, 1000, 1000] : [1000, 1000, 1000, 1000]);
	});
});
