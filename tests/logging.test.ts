import { afterEach, describe, expect, it, vi } from 'vitest';
import { debugLog, registerDiagnosticLogging, reportSyncSummary } from '../common/logging';

afterEach(() => {
	registerDiagnosticLogging(() => false);
	vi.restoreAllMocks();
});

describe('diagnostic logging', () => {
	it('does not construct or emit per-item details while disabled, including after a live toggle', () => {
		let enabled = false;
		registerDiagnosticLogging(() => enabled);
		const build = vi.fn(() => '[Bangumi Sync] detail');
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		for (let index = 0; index < 1303; index++) debugLog(build);
		expect(build).not.toHaveBeenCalled();
		expect(debug).not.toHaveBeenCalled();
		enabled = true;
		debugLog(build);
		expect(debug).toHaveBeenCalledExactlyOnceWith('[Bangumi Sync] detail');
		enabled = false;
		debugLog(build);
		expect(build).toHaveBeenCalledTimes(1);
	});

	it('does not let unloading an old instance disable the current instance', () => {
		const detachOld = registerDiagnosticLogging(() => false);
		const detachCurrent = registerDiagnosticLogging(() => true);
		const build = vi.fn(() => '[Bangumi Sync] detail');
		vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		detachOld();
		debugLog(build);
		expect(build).toHaveBeenCalledTimes(1);
		detachCurrent();
		debugLog(build);
		expect(build).toHaveBeenCalledTimes(1);
	});

	it('keeps summaries visible without serializing private result fields', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const result = {
			created: 1, updated: 0, unchanged: 0, skipped: 0, failed: 1, completion: 'partial-success', duration: 123,
			errorDetails: ['PRIVATE-BODY'], accessToken: 'PRIVATE-TOKEN', journal: 'PRIVATE-JOURNAL',
		};
		reportSyncSummary(result);
		expect(info).toHaveBeenCalledExactlyOnceWith('[Bangumi Sync] Sync summary', {
			created: 1, updated: 0, unchanged: 0, skipped: 0, failed: 1, completion: 'partial-success', durationMs: 123,
		});
		expect(JSON.stringify(info.mock.calls)).not.toContain('PRIVATE');
	});
});
