import { App, TFile } from 'obsidian';
import { CollectionType, SubjectType } from '../../common/api/types';
import { parseEpisodes } from '../../common/parser/episodeParser';
import { BangumiClient } from '../api/client';
import { SubjectDocumentService } from '../document/subjectDocumentService';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import {
	CloudCollectionUpdates,
	PlatformSyncPayload,
	StatusSyncDiff,
	StatusSyncExecutionSummary,
} from './statusSyncTypes';

export class StatusSyncExecutor {
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
}
