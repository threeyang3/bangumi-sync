import { App, TFile } from 'obsidian';
import { UserCollection } from '../../common/api/types';
import { SubjectDocumentService } from './subjectDocumentService';
import { LocalSubjectSnapshot } from './types';

interface LocalSubjectPathInfo {
	path: string;
}

interface WarmupOptions {
	concurrency?: number;
	onComplete?: (count: number) => void;
	onError?: (error: unknown) => void;
}

export class LocalSubjectSnapshotSession {
	private app: App;
	private documentService: SubjectDocumentService;
	private snapshotsById = new Map<number, LocalSubjectSnapshot>();
	private subjectIdByPath = new Map<string, number>();
	private warmupGeneration = 0;
	private warmupPromise: Promise<void> | null = null;

	constructor(app: App, documentService: SubjectDocumentService) {
		this.app = app;
		this.documentService = documentService;
	}

	get currentWarmup(): Promise<void> | null {
		return this.warmupPromise;
	}

	cancelWarmup(): void {
		this.warmupGeneration++;
		this.warmupPromise = null;
	}

	clear(): void {
		this.snapshotsById.clear();
		this.subjectIdByPath.clear();
	}

	warm(
		collections: UserCollection[],
		localSubjects: Map<number, LocalSubjectPathInfo>,
		options: WarmupOptions = {},
	): Promise<void> | null {
		const generation = ++this.warmupGeneration;
		this.clear();

		if (collections.length === 0) {
			this.warmupPromise = null;
			return null;
		}

		this.warmupPromise = this.mapWithConcurrency(collections, options.concurrency ?? 4, async (collection) => {
			if (generation !== this.warmupGeneration) {
				return;
			}

			const localInfo = localSubjects.get(collection.subject_id);
			if (!localInfo) {
				return;
			}

			const file = this.app.vault.getAbstractFileByPath(localInfo.path);
			if (!(file instanceof TFile)) {
				return;
			}

			const snapshot = await this.documentService.readSnapshot(file, collection.subject_type);
			if (generation !== this.warmupGeneration) {
				return;
			}

			this.set(collection.subject_id, {
				...snapshot,
				file,
				path: localInfo.path,
				mtime: file.stat.mtime,
			});
		}).then(() => {
			if (generation === this.warmupGeneration) {
				options.onComplete?.(this.snapshotsById.size);
			}
		}).catch(error => {
			if (generation === this.warmupGeneration) {
				options.onError?.(error);
			}
		});

		return this.warmupPromise;
	}

	get(subjectId: number, path: string, mtime: number): LocalSubjectSnapshot | null {
		const snapshot = this.snapshotsById.get(subjectId);
		if (!snapshot) {
			return null;
		}

		if (snapshot.path !== path || snapshot.mtime !== mtime) {
			this.delete(subjectId);
			return null;
		}

		return snapshot;
	}

	getByPath(path: string): LocalSubjectSnapshot | null {
		const subjectId = this.subjectIdByPath.get(path);
		if (subjectId === undefined) {
			return null;
		}

		const snapshot = this.snapshotsById.get(subjectId);
		if (!snapshot || snapshot.path !== path) {
			this.delete(subjectId);
			return null;
		}

		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || snapshot.mtime !== file.stat.mtime) {
			this.delete(subjectId);
			return null;
		}

		return snapshot;
	}

	invalidatePath(path: string): void {
		const subjectId = this.subjectIdByPath.get(path);
		if (subjectId !== undefined) {
			this.delete(subjectId);
		}
	}

	private set(subjectId: number, snapshot: LocalSubjectSnapshot): void {
		this.snapshotsById.set(subjectId, snapshot);
		if (snapshot.path) {
			this.subjectIdByPath.set(snapshot.path, subjectId);
		}
	}

	private delete(subjectId: number): void {
		const snapshot = this.snapshotsById.get(subjectId);
		if (snapshot?.path) {
			this.subjectIdByPath.delete(snapshot.path);
		}
		this.snapshotsById.delete(subjectId);
	}

	private async mapWithConcurrency<T, R>(
		items: T[],
		concurrency: number,
		task: (item: T, index: number) => Promise<R>,
	): Promise<R[]> {
		const results = new Array<R>(items.length);
		let nextIndex = 0;
		const workerCount = Math.max(1, Math.min(concurrency, items.length));
		const workers = Array.from({ length: workerCount }, async () => {
			while (nextIndex < items.length) {
				const currentIndex = nextIndex++;
				results[currentIndex] = await task(items[currentIndex], currentIndex);
			}
		});
		await Promise.all(workers);
		return results;
	}
}
