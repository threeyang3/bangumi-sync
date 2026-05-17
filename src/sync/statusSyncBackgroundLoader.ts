import { Subject, SubjectType } from '../../common/api/types';
import { parseInfoByType } from '../../common/parser/infoboxParser';
import { BangumiClient } from '../api/client';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import { tn } from '../i18n';
import { createCloudPlatformFieldDiff } from './platformSyncLogic';
import {
	FieldDiff,
	PlatformFieldDiff,
	PlatformSyncPayload,
	StatusSyncBuildContext,
	StatusSyncDiff,
	StatusSyncFieldSelection,
	StatusSyncSnapshot,
	hasSelectedPlatformFields,
} from './statusSyncTypes';

export interface BackgroundUpdateCallbacks {
	isDisposed: () => boolean;
	updateDiff: (subjectId: number, patch: Partial<StatusSyncDiff>) => void;
	updateBackgroundProgress: (completed: number, total: number) => void;
}

export class StatusSyncBackgroundLoader {
	private client: BangumiClient;
	private episodeStatusManager: EpisodeStatusManager | null;

	constructor(client: BangumiClient, episodeStatusManager?: EpisodeStatusManager | null) {
		this.client = client;
		this.episodeStatusManager = episodeStatusManager ?? null;
	}

	async loadBackgroundDiffs(
		selection: StatusSyncFieldSelection,
		snapshots: StatusSyncSnapshot[],
		callbacks: BackgroundUpdateCallbacks,
		onProgress?: (completed: number, total: number) => void,
		concurrency = 4,
	): Promise<void> {
		const context: StatusSyncBuildContext = {
			subjectCache: new Map(),
			cloudEpisodeStatusCache: new Map(),
			platformDiffCache: new Map(),
		};
		const candidates = snapshots.filter(snapshot =>
			(selection.user.episodeStatus && snapshot.localSnapshot.shouldLoadEpisodeStatus) ||
			(hasSelectedPlatformFields(selection) && snapshot.localSnapshot.shouldLoadPlatformData)
		);
		let completed = 0;
		callbacks.updateBackgroundProgress(completed, candidates.length);

		await this.mapWithConcurrency(candidates, concurrency, async (snapshot) => {
			if (callbacks.isDisposed()) {
				return;
			}

			const loadingPatch: Partial<StatusSyncDiff> = {};
			if (selection.user.episodeStatus && snapshot.localSnapshot.shouldLoadEpisodeStatus) {
				loadingPatch.episodeStatusLoadState = 'loading';
			}
			if (hasSelectedPlatformFields(selection) && snapshot.localSnapshot.shouldLoadPlatformData) {
				loadingPatch.platformLoadState = 'loading';
			}
			callbacks.updateDiff(snapshot.subjectId, loadingPatch);

			try {
				const [episodeStatus, platformResult] = await Promise.all([
					selection.user.episodeStatus && snapshot.localSnapshot.shouldLoadEpisodeStatus
						? this.buildEpisodeStatusDiff(snapshot, context)
						: Promise.resolve(null),
					hasSelectedPlatformFields(selection) && snapshot.localSnapshot.shouldLoadPlatformData
						? this.buildPlatformFieldDiffs(snapshot, context, selection)
						: Promise.resolve(null),
				]);

				if (callbacks.isDisposed()) {
					return;
				}

				const patch: Partial<StatusSyncDiff> = { backgroundError: null };
				if (episodeStatus) {
					patch.episodeStatus = episodeStatus;
					patch.episodeStatusLoadState = 'ready';
				}
				if (platformResult) {
					patch.platformFields = platformResult.fields;
					patch.platformSyncPayload = platformResult.payload;
					patch.platformLoadState = 'ready';
				}
				callbacks.updateDiff(snapshot.subjectId, patch);
			} catch (error) {
				if (callbacks.isDisposed()) {
					return;
				}

				const errorMessage = error instanceof Error ? error.message : String(error);
				callbacks.updateDiff(snapshot.subjectId, {
					episodeStatusLoadState: selection.user.episodeStatus && snapshot.localSnapshot.shouldLoadEpisodeStatus ? 'failed' : 'ready',
					platformLoadState: hasSelectedPlatformFields(selection) && snapshot.localSnapshot.shouldLoadPlatformData ? 'failed' : 'ready',
					backgroundError: errorMessage,
				});
			} finally {
				completed++;
				callbacks.updateBackgroundProgress(completed, candidates.length);
				onProgress?.(completed, candidates.length);
			}
		});
	}

	private async buildPlatformFieldDiffs(
		snapshot: StatusSyncSnapshot,
		context: StatusSyncBuildContext,
		selection: StatusSyncFieldSelection,
	): Promise<{ fields: PlatformFieldDiff[]; payload?: PlatformSyncPayload }> {
		return this.getOrCreateCachedPromise(
			context.platformDiffCache,
			snapshot.subjectId,
			async () => {
				const collection = snapshot.collection;
				if (
					collection.subject_type !== SubjectType.Anime &&
					collection.subject_type !== SubjectType.Real &&
					collection.subject_type !== SubjectType.Book
				) {
					return { fields: [] };
				}

				if (!snapshot.localSnapshot.shouldLoadPlatformData) {
					return { fields: [] };
				}

				const subject = await this.getOrCreateCachedPromise(
					context.subjectCache,
					snapshot.subjectId,
					() => this.client.getSubject(snapshot.subjectId),
				);
				const parsedInfo = parseInfoByType(subject.infobox, subject.type, subject.platform);
				const cloudPayload = this.buildPlatformSyncPayload(subject, parsedInfo);
				const fields: PlatformFieldDiff[] = [];
				const localContext = snapshot.localSnapshot.platform;

				if (collection.subject_type === SubjectType.Anime || collection.subject_type === SubjectType.Real) {
					const cloudValue = cloudPayload.episodeCount;
					if (
						selection.platform.episodeCount &&
						cloudValue !== undefined &&
						cloudValue !== null &&
						localContext.episodeCount !== cloudValue
					) {
						fields.push(createCloudPlatformFieldDiff(
							'episodeCount',
							tn('statusSyncModal', 'fieldEpisodeCount'),
							localContext.episodeCount !== null ? String(localContext.episodeCount) : null,
							String(cloudValue),
						));
					}
				}

				if (collection.subject_type === SubjectType.Book) {
					const isComic = (parsedInfo.category || '').includes('漫画') || localContext.chapterCount !== null;
					if (isComic) {
						if (
							selection.platform.chapterCount &&
							cloudPayload.chapterCount !== undefined &&
							cloudPayload.chapterCount !== null &&
							localContext.chapterCount !== cloudPayload.chapterCount
						) {
							fields.push(createCloudPlatformFieldDiff(
								'chapterCount',
								tn('statusSyncModal', 'fieldChapterCount'),
								localContext.chapterCount !== null ? String(localContext.chapterCount) : null,
								String(cloudPayload.chapterCount),
							));
						}
						if (
							selection.platform.volumeCount &&
							cloudPayload.volumeCount !== undefined &&
							cloudPayload.volumeCount !== null &&
							localContext.volumeCount !== cloudPayload.volumeCount
						) {
							fields.push(createCloudPlatformFieldDiff(
								'volumeCount',
								tn('statusSyncModal', 'fieldVolumeCount'),
								localContext.volumeCount !== null ? String(localContext.volumeCount) : null,
								String(cloudPayload.volumeCount),
							));
						}
					} else if (
						selection.platform.volumeCount &&
						cloudPayload.volumeCount !== undefined &&
						cloudPayload.volumeCount !== null &&
						localContext.volumeCount !== cloudPayload.volumeCount
					) {
						fields.push(createCloudPlatformFieldDiff(
							'volumeCount',
							tn('statusSyncModal', 'fieldVolumeCount'),
							localContext.volumeCount !== null ? String(localContext.volumeCount) : null,
							String(cloudPayload.volumeCount),
						));
					}
				}

				this.appendTextPlatformFieldDiff(
					fields,
					selection.platform.start,
					'start',
					tn('statusSyncModal', 'fieldStart'),
					localContext.start,
					cloudPayload.start,
				);
				this.appendTextPlatformFieldDiff(
					fields,
					selection.platform.end,
					'end',
					tn('statusSyncModal', 'fieldEnd'),
					localContext.end,
					cloudPayload.end,
				);
				this.appendTextPlatformFieldDiff(
					fields,
					selection.platform.progress,
					'progress',
					tn('statusSyncModal', 'fieldProgress'),
					localContext.progress,
					cloudPayload.progress,
				);

				return fields.length > 0 ? { fields, payload: cloudPayload } : { fields: [] };
			},
		);
	}

	private buildPlatformSyncPayload(subject: Subject, parsedInfo: ReturnType<typeof parseInfoByType>): PlatformSyncPayload {
		const episodeCount = subject.total_episodes || subject.eps || parsedInfo.episode || null;
		const volumeCount = subject.volumes || parsedInfo.volumes || null;
		const start = parsedInfo.start || null;
		const end = parsedInfo.end || null;
		const progress = parsedInfo.progress || null;

		return {
			progress,
			start,
			end,
			episodeCount,
			chapterCount: parsedInfo.episode || null,
			volumeCount,
		};
	}

	private async buildEpisodeStatusDiff(
		snapshot: StatusSyncSnapshot,
		context: StatusSyncBuildContext,
	): Promise<FieldDiff<string>> {
		if (!this.episodeStatusManager || !snapshot.localSnapshot.shouldLoadEpisodeStatus) {
			return {
				localValue: this.episodeStatusManager
					? this.episodeStatusManager.summarizeEpisodeStatuses(snapshot.localSnapshot.episodeStatusMap)
					: null,
				cloudValue: null,
				hasDiff: false,
				decision: 'skip',
			};
		}

		const cloudMap = await this.getOrCreateCachedPromise(
			context.cloudEpisodeStatusCache,
			snapshot.subjectId,
			() => this.episodeStatusManager!.getCloudEpisodeStatusMap(snapshot.subjectId),
		);

		const localValue = this.episodeStatusManager.summarizeEpisodeStatuses(snapshot.localSnapshot.episodeStatusMap);
		const cloudValue = this.episodeStatusManager.summarizeEpisodeStatuses(cloudMap);
		const hasDiff = this.episodeStatusManager.serializeEpisodeStatuses(snapshot.localSnapshot.episodeStatusMap) !==
			this.episodeStatusManager.serializeEpisodeStatuses(cloudMap);

		return {
			localValue,
			cloudValue,
			hasDiff,
			decision: 'skip',
		};
	}

	private appendTextPlatformFieldDiff(
		fields: PlatformFieldDiff[],
		enabled: boolean,
		key: 'start' | 'end' | 'progress',
		label: string,
		localValue: string | null,
		cloudValue: string | null | undefined,
	): void {
		if (!enabled) {
			return;
		}

		const normalizedCloudValue = cloudValue ?? null;
		if ((localValue ?? null) === normalizedCloudValue) {
			return;
		}

		fields.push(createCloudPlatformFieldDiff(
			key,
			label,
			localValue,
			normalizedCloudValue,
		));
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

	private getOrCreateCachedPromise<T>(
		cache: Map<number, Promise<T>>,
		key: number,
		factory: () => Promise<T>,
	): Promise<T> {
		const existing = cache.get(key);
		if (existing) {
			return existing;
		}

		const promise = factory().catch(error => {
			cache.delete(key);
			throw error;
		});
		cache.set(key, promise);
		return promise;
	}
}
