import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', async importOriginal => ({
	...await importOriginal<Record<string, unknown>>(),
	Modal: class { contentEl = { empty: vi.fn() }; },
}));
import { SearchModal } from '../../src/ui/searchModal';
import { AddToCollectionModal, type AddToCollectionInput } from '../../src/ui/addToCollectionModal';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}

function fixture() {
	const modal = Object.assign(Object.create(SearchModal.prototype), {
		requestGeneration: 0, isLoading: false, currentKeyword: 'fixture', currentType: 0,
		currentSort: 'match', searchResults: [],
		syncedSubjectIds: new Set(), collectionStatuses: new Map(), resolvedStatusIds: new Set(),
		failedStatusIds: new Set(), resultElements: new Map(),
		resultsContainer: { empty: vi.fn() }, statusEl: { setText: vi.fn() },
		loadMoreBtn: { addClass: vi.fn(), removeClass: vi.fn() },
		client: { searchSubjects: vi.fn(), getCollectionStatus: vi.fn() },
		checkLocalSyncStatus: vi.fn(() => null), renderResultItem: vi.fn(),
		contentEl: { isConnected: true, empty: vi.fn() }, onComplete: vi.fn(),
	}) as SearchModal & {
		// Test the actual async controller without requiring an Obsidian DOM.
	};
	return modal as unknown as {
		search(isNew: boolean): Promise<void>; loadMore(): Promise<void>;
		changeSearchOptions(type: number, sort: string): Promise<void>;
		handleAddComplete(input: AddToCollectionInput): Promise<void>;
		onClose(): void;
		resultElements: Map<number, unknown>;
		requestGeneration: number; isLoading: boolean; searchResults: { id: number }[];
		resolvedStatusIds: Set<number>; renderResultItem: ReturnType<typeof vi.fn>;
		collectionStatuses: Map<number, { rate: number }>;
		failedStatusIds: Set<number>;
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

const savedInput: AddToCollectionInput = {
	subjectId: 1, subjectName: 'fixture', type: 3, rate: 9, comment: 'new',
	tags: ['new'], private: false, localPropertyValues: {}, syncToCloud: true, createLocal: false,
};

describe('search edit snapshots and query changes', () => {
	it('does not repeat requests for unchanged search options', async () => {
		const modal = fixture();
		await modal.changeSearchOptions(0, 'match');
		expect(modal.client.searchSubjects).not.toHaveBeenCalled();
	});
	it('releases result references on close and ignores in-flight status responses', async () => {
		const modal = fixture();
		const status = deferred<null>();
		modal.client.searchSubjects.mockResolvedValue({ data: [{ id: 1 }], total: 1 });
		modal.client.getCollectionStatus.mockReturnValue(status.promise);
		await modal.search(true);
		modal.resultElements.set(1, {});
		modal.collectionStatuses.set(1, { rate: 8 });
		modal.onClose();
		status.resolve(null); await Promise.resolve();
		expect(modal.searchResults).toEqual([]);
		expect(modal.resultElements.size).toBe(0);
		expect(modal.collectionStatuses.size).toBe(0);
		expect(modal.resolvedStatusIds.size).toBe(0);
	});
	it('discards tag edits when the editor is cancelled', () => {
		type Args = ConstructorParameters<typeof AddToCollectionModal>;
		const existing = { type: 3, rate: 8, tags: ['original'] };
		const complete = vi.fn();
		const editor = new AddToCollectionModal(
			{} as Args[0], {} as Args[1], {} as Args[2],
			{ getCustomTemplates: () => [] } as unknown as Args[3],
			{ id: 1, type: 2, name: 'fixture' } as Args[4], complete, existing as Args[6],
		);
		const draft = editor as unknown as { tags: string[] };
		draft.tags.splice(0, 1, 'cancelled');
		editor.onClose();
		expect(existing.tags).toEqual(['original']);
		expect(complete).not.toHaveBeenCalled();
	});
	it('replaces saved collection data before the next edit', async () => {
		const modal = fixture();
		modal.searchResults = [{ id: 1 }];
		modal.collectionStatuses.set(1, { rate: 8 });
		modal.resolvedStatusIds.add(1);
		const refreshed = deferred<{ rate: number }>();
		modal.client.getCollectionStatus.mockReturnValue(refreshed.promise);
		const save = modal.handleAddComplete(savedInput);
		expect(modal.resolvedStatusIds.has(1)).toBe(false);
		expect(modal.collectionStatuses.has(1)).toBe(false);
		refreshed.resolve({ rate: 9 }); await save;
		expect(modal.collectionStatuses.get(1)?.rate).toBe(9);
		expect(modal.resolvedStatusIds.has(1)).toBe(true);
	});
	it('keeps stale data unavailable if the refresh fails', async () => {
		const modal = fixture();
		modal.searchResults = [{ id: 1 }];
		modal.collectionStatuses.set(1, { rate: 8 });
		modal.resolvedStatusIds.add(1);
		modal.client.getCollectionStatus.mockRejectedValue(new Error('offline'));
		await modal.handleAddComplete(savedInput);
		expect(modal.collectionStatuses.has(1)).toBe(false);
		expect(modal.resolvedStatusIds.has(1)).toBe(false);
		expect(modal.failedStatusIds.has(1)).toBe(true);
	});
	it('preserves cloud data when saving local properties only', async () => {
		const modal = fixture();
		modal.searchResults = [{ id: 1 }];
		modal.collectionStatuses.set(1, { rate: 8 });
		await modal.handleAddComplete({ ...savedInput, syncToCloud: false });
		expect(modal.collectionStatuses.get(1)?.rate).toBe(8);
		expect(modal.client.getCollectionStatus).not.toHaveBeenCalled();
	});
	it.each([[4, 'match'], [2, 'score']] as const)('restarts pagination for type %s, sort %s', async (type, sort) => {
		const modal = fixture();
		modal.searchResults = Array.from({ length: 20 }, (_, id) => ({ id }));
		modal.client.searchSubjects.mockResolvedValue({ data: [{ id: 99 }], total: 1 });
		modal.client.getCollectionStatus.mockResolvedValue(null);
		await modal.changeSearchOptions(type, sort);
		expect(modal.client.searchSubjects).toHaveBeenCalledWith('fixture', expect.objectContaining({
			offset: 0, sort, filter: { type: [type] },
		}));
		expect(modal.searchResults).toEqual([{ id: 99 }]);
	});
});
