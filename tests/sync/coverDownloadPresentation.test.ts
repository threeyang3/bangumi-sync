import { describe, expect, it } from 'vitest';
import { determineCoverDownloadNotice } from '../../src/sync/syncStatus';

describe('batch cover download notice selection', () => {
	it.each([
		[[0, 0, 1, false], 'failed'],
		[[0, 0, 1, true], 'recovery'],
		[[0, 0, 0, false], 'empty'],
		[[2, 1, 0, false], 'complete'],
	] as const)('selects %s', ([downloaded, skipped, failed, recovery], expected) => {
		expect(determineCoverDownloadNotice(downloaded, skipped, failed, recovery)).toBe(expected);
	});
});
