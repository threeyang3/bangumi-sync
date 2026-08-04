import { describe, expect, it } from 'vitest';
import { determineSyncCompletion } from '../../src/sync/syncStatus';

describe('sync completion', () => {
	it('distinguishes success, partial success, total failure and cancellation', () => {
		expect(determineSyncCompletion(2, 0, false)).toBe('success');
		expect(determineSyncCompletion(1, 1, false)).toBe('partial-success');
		expect(determineSyncCompletion(0, 2, false)).toBe('failed');
		expect(determineSyncCompletion(2, 0, true)).toBe('cancelled');
	});
});
