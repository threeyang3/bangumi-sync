import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), Modal: class {} }));
import { ComprehensiveSyncModal } from '../../src/ui/comprehensiveSyncModal';
import type { LocalPropertyModalResult } from '../../src/ui/localPropertyModal';

function fixture() {
	const release = vi.fn(); let consumed = false;
	const service = {
		isPlanUsable: vi.fn(() => !consumed),
		execute: vi.fn(() => { consumed = true; return Promise.reject(new Error('Cloud verification failed')); }),
	};
	const collectProperties = vi.fn<() => Promise<LocalPropertyModalResult | null>>().mockResolvedValue({ propertyValuesBySubjectId: new Map() });
	const plan = {};
	const modal = Object.assign(Object.create(ComprehensiveSyncModal.prototype), {
		service, plan, previewExpired: false, busy: false, executing: false, error: null, selected: new Set(),
		manager: { client: { subjectDetailRevision: 0, acquireRequestConcurrency: () => release } }, concurrency: 3,
		collectProperties, pages: new Map(), render: vi.fn(), onComplete: vi.fn(),
	}) as { execute(): Promise<void>; previewExpired: boolean; plan: object; busy: boolean; executing: boolean };
	return { modal, plan, service, collectProperties, release };
}

describe('comprehensive preview expiry', () => {
	it('requires refresh after the service consumed a failed preview and prevents another submit', async () => {
		const { modal, service, release } = fixture();
		await modal.execute(); expect(modal.previewExpired).toBe(true);
		await modal.execute(); expect(service.execute).toHaveBeenCalledTimes(1);
		expect(release).toHaveBeenCalledTimes(1); expect(modal.busy || modal.executing).toBe(false);
	});
	it('keeps an unconsumed preview retryable when the properties form fails', async () => {
		const { modal, plan, service, collectProperties } = fixture();
		collectProperties.mockRejectedValueOnce(new Error('Properties load failed'));
		await modal.execute(); expect(modal.previewExpired).toBe(false); expect(modal.plan).toBe(plan);
		expect(service.execute).not.toHaveBeenCalled();
		await modal.execute(); expect(service.execute).toHaveBeenCalledTimes(1);
	});
	it('keeps a preview after cancelling the pre-execution form', async () => {
		const { modal, service, collectProperties } = fixture();
		collectProperties.mockResolvedValueOnce(null);
		await modal.execute(); expect(modal.previewExpired).toBe(false); expect(service.execute).not.toHaveBeenCalled();
	});
});
