import { describe, expect, it } from 'vitest';
import { getSyncProgressPresentation, SyncProgressThrottle } from '../../src/sync/syncProgressPresentation';
import type { SyncProgress } from '../../src/sync/syncStatus';

const progress = (current: number, total: number): SyncProgress => ({ status: 'processing', phase: 'rendering', current, total });

describe('sync phase progress', () => {
	it('labels a phase rather than presenting its percentage as overall completion', () => {
		const presentation = getSyncProgressPresentation(progress(2, 4));
		expect(presentation.percent).toBe(50);
		expect(presentation.text).toContain('2/4 (50%)');
		expect(getSyncProgressPresentation({ ...progress(2, 4), phase: 'writing' }).text).not.toBe(presentation.text);
	});

	it('clears percentages for finalization, linking, and pending decisions with unknown totals', () => {
		expect(getSyncProgressPresentation(progress(4, 4)).percent).toBe(100);
		for (const phase of ['finalizing', 'linking', 'awaiting-decision'] as const) {
			const presentation = getSyncProgressPresentation({ status: 'processing', phase, current: 0, total: 0 });
			expect(presentation.percent).toBeNull();
			expect(presentation.text).not.toContain('%');
		}
	});

	it('handles zero, invalid, negative and excessive counters without invalid percentages', () => {
		expect(getSyncProgressPresentation(progress(0, 0)).percent).toBeNull();
		expect(getSyncProgressPresentation(progress(NaN, Infinity)).percent).toBeNull();
		expect(getSyncProgressPresentation(progress(-2, 4)).percent).toBe(0);
		expect(getSyncProgressPresentation(progress(8, 4)).percent).toBe(100);
		expect(getSyncProgressPresentation({ status: 'error', message: 'Failure', current: 0, total: 0 }).text).toBe('Failure');
	});

	it('throttles DOM work but never suppresses phase transitions or the last count', () => {
		const throttle = new SyncProgressThrottle();
		expect(throttle.shouldUpdate(progress(0, 1303), 0)).toBe(true);
		for (let count = 1; count < 100; count++) expect(throttle.shouldUpdate(progress(count, 1303), count)).toBe(false);
		expect(throttle.shouldUpdate(progress(100, 1303), 100)).toBe(true);
		expect(throttle.shouldUpdate(progress(1303, 1303), 101)).toBe(true);
		expect(throttle.shouldUpdate({ status: 'processing', phase: 'finalizing', current: 0, total: 0 }, 102)).toBe(true);
		expect(throttle.shouldUpdate({ status: 'completed', current: 0, total: 0 }, 103)).toBe(true);
	});
});
