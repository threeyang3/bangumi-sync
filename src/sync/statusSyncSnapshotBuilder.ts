import { App, TFile } from 'obsidian';
import { UserCollection } from '../../common/api/types';
import { SubjectDocumentService } from '../document/subjectDocumentService';
import { LocalSubjectSnapshot } from '../document/types';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import { buildUserStatusSyncDiff } from './statusSyncLogic';
import {
	FieldDiff,
	StatusSyncDiff,
	StatusSyncFieldSelection,
	StatusSyncLocalSubjectInfo,
	StatusSyncSnapshot,
	getStatusSyncScope,
	hasSelectedPlatformFields,
	hasSelectedUserFields,
} from './statusSyncTypes';

export interface BuildDiffSessionOptions {
	selection: StatusSyncFieldSelection;
	collections: UserCollection[];
	localSubjects: Map<number, StatusSyncLocalSubjectInfo>;
	getCachedSnapshot?: (subjectId: number, path: string, mtime: number) => LocalSubjectSnapshot | null;
	onProgress?: (current: number, total: number) => void;
	concurrency?: number;
	onPrefetchHit?: () => void;
	onPrefetchMiss?: () => void;
}

export class StatusSyncSnapshotBuilder {
	private app: App;
	private documentService: SubjectDocumentService;
	private episodeStatusManager: EpisodeStatusManager | null;

	constructor(
		app: App,
		documentService: SubjectDocumentService,
		episodeStatusManager?: EpisodeStatusManager | null,
	) {
		this.app = app;
		this.documentService = documentService;
		this.episodeStatusManager = episodeStatusManager ?? null;
	}

	async buildDiffSession(options: BuildDiffSessionOptions): Promise<{
		snapshots: StatusSyncSnapshot[];
		diffs: StatusSyncDiff[];
	}> {
		const snapshots = (await this.mapWithConcurrency(
			options.collections,
			options.concurrency ?? 6,
			async (collection, index) => {
				options.onProgress?.(index + 1, options.collections.length);
				return this.buildSnapshot(collection, options.localSubjects, options.getCachedSnapshot, options.onPrefetchHit, options.onPrefetchMiss);
			},
		)).filter((snapshot): snapshot is StatusSyncSnapshot => snapshot !== null);

		const diffs = snapshots
			.map(snapshot => this.buildStatusSyncDiff(snapshot, options.selection))
			.filter(diff => diff.hasAnyDiff || this.hasPendingBackgroundLoad(diff));

		return { snapshots, diffs };
	}

	private async buildSnapshot(
		collection: UserCollection,
		localSubjects: Map<number, StatusSyncLocalSubjectInfo>,
		getCachedSnapshot?: (subjectId: number, path: string, mtime: number) => LocalSubjectSnapshot | null,
		onPrefetchHit?: () => void,
		onPrefetchMiss?: () => void,
	): Promise<StatusSyncSnapshot | null> {
		const localInfo = localSubjects.get(collection.subject_id);
		if (!localInfo) {
			return null;
		}

		const file = this.app.vault.getAbstractFileByPath(localInfo.path);
		if (!(file instanceof TFile)) {
			return null;
		}

		const cachedSnapshot = getCachedSnapshot?.(collection.subject_id, localInfo.path, file.stat.mtime) ?? null;
		if (cachedSnapshot) {
			onPrefetchHit?.();
			return {
				subjectId: collection.subject_id,
				collection,
				localInfo,
				file,
				localSnapshot: {
					...cachedSnapshot,
					file,
					path: localInfo.path,
					mtime: file.stat.mtime,
					episodeStatusMap: new Map(cachedSnapshot.episodeStatusMap),
				},
			};
		}

		onPrefetchMiss?.();
		const localSnapshot = await this.documentService.readSnapshot(file, collection.subject_type);
		return {
			subjectId: collection.subject_id,
			collection,
			localInfo,
			file,
			localSnapshot,
		};
	}

	private buildStatusSyncDiff(snapshot: StatusSyncSnapshot, selection: StatusSyncFieldSelection): StatusSyncDiff {
		const { collection, localInfo } = snapshot;
		const userDiffs = buildUserStatusSyncDiff({
			localRate: snapshot.localSnapshot.user.rate,
			cloudRate: collection.rate || null,
			localComment: snapshot.localSnapshot.user.comment,
			cloudComment: collection.comment || null,
			localTags: snapshot.localSnapshot.user.tags,
			cloudTags: collection.tags && collection.tags.length > 0
				? this.documentService.normalizeTags(collection.tags)
				: null,
			localStatus: snapshot.localSnapshot.user.status,
			cloudStatus: collection.type || null,
		});
		const scope = getStatusSyncScope(selection);

		const episodeStatus: FieldDiff<string> = {
			localValue: this.episodeStatusManager
				? this.episodeStatusManager.summarizeEpisodeStatuses(snapshot.localSnapshot.episodeStatusMap)
				: null,
			cloudValue: null,
			hasDiff: false,
			decision: 'skip',
		};

		const rateDiff = {
			...userDiffs.rate,
			hasDiff: selection.user.rate ? userDiffs.rate.hasDiff : false,
			decision: 'skip' as const,
		};
		const commentDiff = {
			...userDiffs.comment,
			hasDiff: selection.user.comment ? userDiffs.comment.hasDiff : false,
			decision: 'skip' as const,
		};
		const tagsDiff = {
			...userDiffs.tags,
			hasDiff: selection.user.tags ? userDiffs.tags.hasDiff : false,
			decision: 'skip' as const,
		};
		const statusDiff = {
			...userDiffs.status,
			hasDiff: selection.user.status ? userDiffs.status.hasDiff : false,
			decision: 'skip' as const,
		};
		const hasUserDiff = hasSelectedUserFields(selection) && (
			rateDiff.hasDiff ||
			commentDiff.hasDiff ||
			tagsDiff.hasDiff ||
			statusDiff.hasDiff
		);

		return {
			scope,
			subjectId: collection.subject_id,
			name_cn: collection.subject.name_cn || '',
			name: collection.subject.name || '',
			localPath: localInfo.path,
			collection,
			statusFieldName: snapshot.localSnapshot.user.statusFieldName,
			rate: rateDiff,
			comment: commentDiff,
			tags: tagsDiff,
			status: statusDiff,
			episodeStatus,
			platformFields: [],
			hasUserDiff,
			hasPlatformDiff: false,
			hasAnyDiff: hasUserDiff,
			expanded: false,
			episodeStatusLoadState: selection.user.episodeStatus && snapshot.localSnapshot.shouldLoadEpisodeStatus ? 'pending' : 'ready',
			platformLoadState: hasSelectedPlatformFields(selection) && snapshot.localSnapshot.shouldLoadPlatformData ? 'pending' : 'ready',
			backgroundError: null,
		};
	}

	private hasPendingBackgroundLoad(diff: StatusSyncDiff): boolean {
		return diff.episodeStatusLoadState !== 'ready' || diff.platformLoadState !== 'ready';
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
