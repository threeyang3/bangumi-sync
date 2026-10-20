import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', async importOriginal => ({
	...await importOriginal<Record<string, unknown>>(),
	Modal: class {},
}));
import { SearchModal } from '../../src/ui/searchModal';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}

function fixture() {
	const modal = Object.assign(Object.create(SearchModal.prototype), {
		requestGeneration: 0, isLoading: false, currentKeyword: 'fixture', currentType: 0,
		currentSort: 'match', searchResults: [], currentOffset: 0,
		syncedSubjectIds: new Set(), collectionStatuses: new Map(), resolvedStatusIds: new Set(),
		failedStatusIds: new Set(), resultElements: new Map(),
		resultsContainer: { empty: vi.fn() }, statusEl: { setText: vi.fn() },
		loadMoreBtn: { addClass: vi.fn(), removeClass: vi.fn() },
		client: { searchSubjects: vi.fn(), getCollectionStatus: vi.fn() },
		checkLocalSyncStatus: vi.fn(() => null), renderResultItem: vi.fn(),
	}) as SearchModal & {
		// Test the actual async controller without requiring an Obsidian DOM.
	};
	return modal as unknown as {
		search(isNew: boolean): Promise<void>; loadMore(): Promise<void>;
		requestGeneration: number; isLoading: boolean; searchResults: { id: number }[];
		resolvedStatusIds: Set<number>; renderResultItem: ReturnType<typeof vi.fn>;
		client: { searchSubjects: ReturnType<typeof vi.fn>; getCollectionStatus: ReturnType<typeof vi.fn> };
	};
}

describe('search presentation concurrency', () => {
	it('renders results before collection status finishes', async () => {
		const modal = fixture(); const status = deferred<null>();
		modal.client.searchSubjects.mockResolvedValue({ data: [{ id: 1 }], total: 1 });
		modal.client.getCollectionStatus.mockReturnValue(status.promise);
		await modal.search(true);
		expect(modal.renderResultItem).toHaveBeenCalledOnce();
		expect(modal.resolvedStatusIds.size).toBe(0);
		status.resolve(null); await Promise.resolve();
		expect(modal.resolvedStatusIds.has(1)).toBe(true);
	});
	it('ignores an old result after clear or replacement', async () => {
		const modal = fixture(); const result = deferred<unknown>();
		modal.client.searchSubjects.mockReturnValue(result.promise);
		const search = modal.search(true);
		modal.requestGeneration++; modal.isLoading = false;
		result.resolve({ data: [{ id: 1 }], total: 1 }); await search;
		expect(modal.searchResults).toEqual([]);
		expect(modal.renderResultItem).not.toHaveBeenCalled();
	});
	it('does not skip a page after duplicate clicks or a failed request', async () => {
		const modal = fixture(); const result = deferred<unknown>();
		modal.searchResults = [{ id: 1 }];
		modal.client.searchSubjects.mockReturnValueOnce(result.promise).mockRejectedValueOnce(new Error('offline'));
		const first = modal.loadMore(); await modal.loadMore();
		expect(modal.client.searchSubjects).toHaveBeenCalledTimes(1);
		result.resolve({ data: [], total: 5 }); await first; await modal.loadMore();
		expect(modal.client.searchSubjects).toHaveBeenNthCalledWith(1, 'fixture', expect.objectContaining({ offset: 1 }));
		expect(modal.client.searchSubjects).toHaveBeenNthCalledWith(2, 'fixture', expect.objectContaining({ offset: 1 }));
	});
	it('ignores late status responses from an invalidated search', async () => {
		const modal = fixture(); const status = deferred<null>();
		modal.client.searchSubjects.mockResolvedValue({ data: [{ id: 1 }], total: 1 });
		modal.client.getCollectionStatus.mockReturnValue(status.promise);
		await modal.search(true); modal.requestGeneration++;
		status.resolve(null); await Promise.resolve();
		expect(modal.resolvedStatusIds.size).toBe(0);
		expect(modal.renderResultItem).toHaveBeenCalledOnce();
	});
});
