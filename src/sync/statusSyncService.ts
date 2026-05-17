import { App, TFile } from 'obsidian';
import { CollectionType, Subject, SubjectType, UserCollection } from '../../common/api/types';
import { parseInfoByType } from '../../common/parser/infoboxParser';
import { parseEpisodes } from '../../common/parser/episodeParser';
import { BangumiClient } from '../api/client';
import { SubjectDocumentService } from '../document/subjectDocumentService';
import { LocalSubjectSnapshot } from '../document/types';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import { tn } from '../i18n';
import { createCloudPlatformFieldDiff } from './platformSyncLogic';
import { buildUserStatusSyncDiff } from './statusSyncLogic';
import {
        CloudCollectionUpdates,
        FieldDecision,
        FieldDiff,
        PlatformFieldDiff,
        PlatformSyncPayload,
        StatusSyncBuildContext,
        StatusSyncDiff,
        StatusSyncExecutionSummary,
        StatusSyncFieldSelection,
        StatusSyncLocalSubjectInfo,
        StatusSyncSnapshot,
        getStatusSyncScope,
        hasSelectedPlatformFields,
        hasSelectedUserFields,
} from './statusSyncTypes';

interface BuildDiffSessionOptions {
        selection: StatusSyncFieldSelection;
        collections: UserCollection[];
        localSubjects: Map<number, StatusSyncLocalSubjectInfo>;
        getCachedSnapshot?: (subjectId: number, path: string, mtime: number) => LocalSubjectSnapshot | null;
	onProgress?: (current: number, total: number) => void;
	concurrency?: number;
	onPrefetchHit?: () => void;
	onPrefetchMiss?: () => void;
}

interface BackgroundUpdateCallbacks {
	isDisposed: () => boolean;
	updateDiff: (subjectId: number, patch: Partial<StatusSyncDiff>) => void;
	updateBackgroundProgress: (completed: number, total: number) => void;
}

export class StatusSyncService {
	private app: App;
	private client: BangumiClient;
	private documentService: SubjectDocumentService;
	private episodeStatusManager: EpisodeStatusManager | null;

	constructor(
		app: App,
		client: BangumiClient,
		documentService: SubjectDocumentService,
		episodeStatusManager?: EpisodeStatusManager | null,
	) {
		this.app = app;
		this.client = client;
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

	applyDecisionPreset(diffs: StatusSyncDiff[], decision: FieldDecision | 'smart'): void {
		if (decision === 'smart') {
			this.applySmartMerge(diffs);
			return;
		}

		diffs.forEach(diff => {
			diff.rate.decision = decision;
			diff.comment.decision = decision;
			diff.tags.decision = decision;
			diff.status.decision = decision;
			diff.episodeStatus.decision = decision === 'merge' ? 'skip' : decision;
			diff.platformFields.forEach(field => {
				field.decision = decision === 'cloud' || decision === 'merge' ? 'cloud' : 'skip';
			});
		});
	}

	async executeSync(diffs: StatusSyncDiff[]): Promise<StatusSyncExecutionSummary> {
		let successCount = 0;
		let failCount = 0;
		const actionableDiffs = diffs.filter(diff => diff.hasAnyDiff);

		for (const diff of actionableDiffs) {
			try {
				await this.syncItem(diff);
				successCount++;
			} catch (error) {
				failCount++;
				console.error(`[Bangumi Sync] 同步失败: ${diff.name_cn}`, error);
			}
		}

		return { successCount, failCount };
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

	private hasPendingBackgroundLoad(diff: StatusSyncDiff): boolean {
		return diff.episodeStatusLoadState !== 'ready' || diff.platformLoadState !== 'ready';
	}

	private applySmartMerge(diffs: StatusSyncDiff[]): void {
		diffs.forEach(diff => {
			if (diff.rate.hasDiff) {
				diff.rate.decision = diff.rate.localValue && !diff.rate.cloudValue ? 'local'
					: !diff.rate.localValue && diff.rate.cloudValue ? 'cloud'
						: 'local';
			}

			if (diff.comment.hasDiff) {
				if (diff.comment.localValue && !diff.comment.cloudValue) {
					diff.comment.decision = 'local';
				} else if (!diff.comment.localValue && diff.comment.cloudValue) {
					diff.comment.decision = 'cloud';
				} else if (diff.comment.localValue && diff.comment.cloudValue) {
					diff.comment.decision = diff.comment.localValue.length >= diff.comment.cloudValue.length ? 'local' : 'cloud';
				}
			}

			if (diff.tags.hasDiff) {
				diff.tags.decision = 'merge';
			}

			if (diff.status.hasDiff) {
				diff.status.decision = diff.status.localValue && !diff.status.cloudValue ? 'local'
					: !diff.status.localValue && diff.status.cloudValue ? 'cloud'
						: 'local';
			}

			if (diff.episodeStatus.hasDiff) {
				diff.episodeStatus.decision = diff.episodeStatus.localValue && !diff.episodeStatus.cloudValue ? 'local'
					: !diff.episodeStatus.localValue && diff.episodeStatus.cloudValue ? 'cloud'
						: 'local';
			}

			diff.platformFields.forEach(field => {
				if (field.hasDiff) {
					field.decision = 'cloud';
				}
			});
		});
	}

	private async syncItem(diff: StatusSyncDiff): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(diff.localPath);
		if (!(file instanceof TFile)) {
			throw new Error('File not found');
		}

		const originalContent = await this.app.vault.read(file);
		let content = originalContent;
		const cloudUpdates: CloudCollectionUpdates = {};

		if (diff.rate.hasDiff && diff.rate.decision !== 'skip') {
			if (diff.rate.decision === 'local') {
				cloudUpdates.rate = diff.rate.localValue || undefined;
			} else if (diff.rate.decision === 'cloud') {
				content = this.documentService.updateRate(content, diff.rate.cloudValue);
			}
		}

		if (diff.comment.hasDiff && diff.comment.decision !== 'skip') {
			if (diff.comment.decision === 'local') {
				cloudUpdates.comment = diff.comment.localValue || '';
			} else if (diff.comment.decision === 'cloud') {
				content = diff.comment.cloudValue
					? this.documentService.updateComment(content, diff.comment.cloudValue)
					: this.documentService.removeComment(content);
			}
		}

		if (diff.tags.hasDiff && diff.tags.decision !== 'skip') {
			if (diff.tags.decision === 'local') {
				cloudUpdates.tags = this.documentService.normalizeTags(diff.tags.localValue);
			} else if (diff.tags.decision === 'cloud') {
				content = diff.tags.cloudValue && diff.tags.cloudValue.length > 0
					? this.documentService.updateTags(content, this.documentService.normalizeTags(diff.tags.cloudValue))
					: this.documentService.removeTags(content);
			} else if (diff.tags.decision === 'merge') {
				const mergedTags = new Set<string>();
				diff.tags.localValue?.forEach(tag => mergedTags.add(tag));
				diff.tags.cloudValue?.forEach(tag => mergedTags.add(tag));
				const mergedArray = this.documentService.normalizeTags(Array.from(mergedTags));
				content = this.documentService.updateTags(content, mergedArray);
				cloudUpdates.tags = mergedArray;
			}
		}

		if (diff.status.hasDiff && diff.status.decision !== 'skip') {
			if (diff.status.decision === 'local') {
				const localStatus = this.toValidCollectionType(diff.status.localValue);
				if (localStatus !== null) {
					cloudUpdates.type = localStatus;
				}
			} else if (diff.status.decision === 'cloud') {
				content = this.documentService.updateStatus(content, diff.status.cloudValue as CollectionType, diff.statusFieldName);
			}
		}

		if (Object.keys(cloudUpdates).length > 0) {
			const fallbackType = this.toValidCollectionType(diff.collection.type);
			const finalUpdates = {
				...cloudUpdates,
				type: cloudUpdates.type ?? fallbackType ?? undefined,
			};
			await this.syncCloudUpdates(diff.subjectId, finalUpdates);
		}

		if (diff.episodeStatus.hasDiff && diff.episodeStatus.decision !== 'skip' && this.episodeStatusManager) {
			if (content !== originalContent) {
				await this.app.vault.process(file, () => content);
				content = await this.app.vault.read(file);
			}

			if (diff.episodeStatus.decision === 'local') {
				const result = await this.episodeStatusManager.syncStatusToCloud(file);
				if (result.failed > 0 && result.success === 0) {
					throw new Error(`单集状态同步到云端全部失败 (${result.failed}集)`);
				}
			} else if (diff.episodeStatus.decision === 'cloud') {
				const synced = await this.episodeStatusManager.syncStatusFromCloud(file, diff.subjectId);
				if (!synced) {
					throw new Error('单集状态从云端同步失败');
				}
				content = await this.app.vault.read(file);
			}
		}

		if (diff.hasPlatformDiff && diff.platformFields.some(field => field.hasDiff && field.decision === 'cloud')) {
			content = await this.applyPlatformSync(diff, file, content);
		}

		if (content !== originalContent) {
			await this.app.vault.process(file, () => content);
		}
	}

        private async applyPlatformSync(diff: StatusSyncDiff, file: TFile, content: string): Promise<string> {
                if (!diff.platformSyncPayload) {
                        return content;
                }

                const selectedPayload = this.buildSelectedPlatformSyncPayload(diff);
                const nextContent = this.documentService.updatePlatformMetadata(content, selectedPayload);
                if (diff.collection.subject_type !== SubjectType.Anime && diff.collection.subject_type !== SubjectType.Real) {
                        return nextContent;
                }

		const shouldRefreshEpisodeSection = diff.platformFields.some(field =>
			field.decision === 'cloud' && field.key === 'episodeCount',
		);
		if (!shouldRefreshEpisodeSection) {
			return nextContent;
		}

		const episodesResult = await this.client.getEpisodes(diff.subjectId);
		const episodes = episodesResult?.data ?? [];
		if (episodes.length === 0) {
			return nextContent;
		}

		const statusMap = new Map<number, number>();
		if (this.episodeStatusManager) {
			const localStatuses = await this.episodeStatusManager.getEpisodeStatusMap(file);
			for (const entry of localStatuses.values()) {
				statusMap.set(entry.episodeId, entry.status);
			}
		}

		const renderedEpisodes = parseEpisodes(episodes, statusMap);
		if (!renderedEpisodes) {
			return nextContent;
		}

                return this.documentService.updateEpisodeSection(nextContent, renderedEpisodes);
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

        private buildSelectedPlatformSyncPayload(diff: StatusSyncDiff): PlatformSyncPayload {
                const payload: PlatformSyncPayload = {};
                for (const field of diff.platformFields) {
                        if (!field.hasDiff || field.decision !== 'cloud' || !diff.platformSyncPayload) {
                                continue;
                        }

                        switch (field.key) {
                                case 'episodeCount':
                                        payload.episodeCount = diff.platformSyncPayload.episodeCount ?? null;
                                        break;
                                case 'chapterCount':
                                        payload.chapterCount = diff.platformSyncPayload.chapterCount ?? null;
                                        break;
                                case 'volumeCount':
                                        payload.volumeCount = diff.platformSyncPayload.volumeCount ?? null;
                                        break;
                                case 'start':
                                        payload.start = diff.platformSyncPayload.start ?? null;
                                        break;
                                case 'end':
                                        payload.end = diff.platformSyncPayload.end ?? null;
                                        break;
                                case 'progress':
                                        payload.progress = diff.platformSyncPayload.progress ?? null;
                                        break;
                        }
                }
                return payload;
        }

	private toValidCollectionType(value: number | null | undefined): CollectionType | null {
		if (value === CollectionType.Wish ||
			value === CollectionType.Done ||
			value === CollectionType.Doing ||
			value === CollectionType.OnHold ||
			value === CollectionType.Dropped) {
			return value;
		}
		return null;
	}

	private async syncCloudUpdates(subjectId: number, updates: CloudCollectionUpdates): Promise<void> {
		const hasUpdates = Object.values(updates).some(value => value !== undefined);
		if (!hasUpdates) {
			return;
		}

		try {
			await this.client.updateCollection(subjectId, updates);
		} catch (error) {
			console.error('[Bangumi Sync] 云端字段同步失败:', {
				subjectId,
				payload: updates,
				error,
			});
			throw new Error('云端用户数据更新失败');
		}
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
