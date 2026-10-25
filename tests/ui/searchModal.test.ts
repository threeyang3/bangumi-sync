import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', async importOriginal => ({
	...await importOriginal<Record<string, unknown>>(),
	Modal: class {
		contentEl = { empty: vi.fn(), querySelectorAll: () => [] };
		close = vi.fn();
	},
}));
import { SearchModal } from '../../src/ui/searchModal';
import { AddToCollectionModal, type AddToCollectionInput } from '../../src/ui/addToCollectionModal';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
	return { promise, resolve, reject };
}

function fixture() {
	const modal = Object.assign(Object.create(SearchModal.prototype), {
		requestGeneration: 0, isLoading: false, currentKeyword: 'fixture', currentType: 0,
		currentSort: 'match', searchResults: [], nextOffset: 0, paginationEnded: false,
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
		nextOffset: number; paginationEnded: boolean; currentKeyword: string;
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
		modal.nextOffset = 1;
		modal.client.searchSubjects.mockReturnValueOnce(result.promise).mockResolvedValueOnce({ data: [{ id: 2 }], total: 2 });
		const first = modal.loadMore(); await modal.loadMore();
		expect(modal.client.searchSubjects).toHaveBeenCalledTimes(1);
		result.reject(new Error('offline')); await first; await modal.loadMore();
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

describe('pagination progress and request ordering', () => {
 it('stops an empty page even if total claims more results', async () => {
  const m=fixture(); m.client.searchSubjects.mockResolvedValue({data:[],total:100});
  await m.search(true); await m.loadMore(); await m.loadMore();
  expect(m.paginationEnded).toBe(true); expect(m.client.searchSubjects).toHaveBeenCalledTimes(1);
 });
 it('advances short pages by raw rows and deduplicates IDs', async () => {
  const m=fixture();m.client.getCollectionStatus.mockResolvedValue(null);
  m.client.searchSubjects.mockResolvedValueOnce({data:[{id:1},{id:1}],total:5})
   .mockResolvedValueOnce({data:[{id:1},{id:2}],total:5})
   .mockResolvedValueOnce({data:[{id:2}],total:20});
  await m.search(true);await m.loadMore();await m.loadMore();await m.loadMore();
  [0,2,4].forEach((offset,index)=>expect(m.client.searchSubjects).toHaveBeenNthCalledWith(index+1,'fixture',expect.objectContaining({offset})));
  expect(m.client.searchSubjects).toHaveBeenCalledTimes(3);
  expect(m.searchResults).toEqual([{id:1},{id:2}]);expect(m.paginationEnded).toBe(true);
  expect(m.client.getCollectionStatus).toHaveBeenCalledTimes(2);
 });
 it('honors a shrinking total and resets termination on a new search', async () => {
  const m=fixture();m.client.getCollectionStatus.mockResolvedValue(null);
  m.client.searchSubjects.mockResolvedValueOnce({data:[{id:1}],total:20})
   .mockResolvedValueOnce({data:[{id:2}],total:2}).mockResolvedValueOnce({data:[{id:3}],total:10});
  await m.search(true);await m.loadMore();expect(m.paginationEnded).toBe(true);
  await m.search(true);expect(m.paginationEnded).toBe(false);expect(m.nextOffset).toBe(1);
 });
 it('keeps B when B finishes before A using actual search entry points', async () => {
  const m=fixture(),a=deferred<unknown>(),b=deferred<unknown>();
  m.client.searchSubjects.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  m.client.getCollectionStatus.mockResolvedValue(null);
  m.currentKeyword='A';const first=m.search(true);m.currentKeyword='B';const second=m.search(true);
  b.resolve({data:[{id:2}],total:1});await second;
  a.resolve({data:[{id:1}],total:100});await first;
  expect(m.searchResults).toEqual([{id:2}]);expect(m.nextOffset).toBe(1);expect(m.paginationEnded).toBe(true);
  expect(m.client.getCollectionStatus).toHaveBeenCalledTimes(1);
 });
});

describe('collection submission guard', () => {
 it.each(['timeout','401','403','429'])('does not report %s as success and allows deliberate retry', async error => {
  type Args = ConstructorParameters<typeof AddToCollectionModal>;
  const pending=deferred<{success:boolean;error?:string}>();
  const syncSingleSubject=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce({success:true});
  const complete=vi.fn();
  const editor=new AddToCollectionModal({} as Args[0],{} as Args[1],{} as Args[2],
   {getCustomTemplates:()=>[],syncSingleSubject} as unknown as Args[3],
   {id:1,type:2,name:'fixture'} as Args[4],complete);
  const controller=editor as unknown as {confirm():Promise<void>};
  Object.assign(editor, { tagInputEl: { value: 'pending-tag' } });
  const close=vi.fn();editor.close=close;
  const first=controller.confirm();await controller.confirm();
  expect(syncSingleSubject).toHaveBeenCalledTimes(1);
  expect(syncSingleSubject).toHaveBeenCalledWith(1, expect.objectContaining({ tags: ['pending-tag'] }));
  if(error==='timeout')pending.reject(new Error(error));else pending.resolve({success:false,error});
  await first;expect(complete).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  await controller.confirm();expect(syncSingleSubject).toHaveBeenCalledTimes(2);expect(complete).toHaveBeenCalledOnce();
 });
});
