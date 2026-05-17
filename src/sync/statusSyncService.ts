import { App } from 'obsidian';
import { BangumiClient } from '../api/client';
import { SubjectDocumentService } from '../document/subjectDocumentService';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import { StatusSyncBackgroundLoader, BackgroundUpdateCallbacks } from './statusSyncBackgroundLoader';
import { StatusSyncExecutor } from './statusSyncExecutor';
import { BuildDiffSessionOptions, StatusSyncSnapshotBuilder } from './statusSyncSnapshotBuilder';
import {
	FieldDecision,
	StatusSyncDiff,
	StatusSyncExecutionSummary,
	StatusSyncFieldSelection,
	StatusSyncSnapshot,
} from './statusSyncTypes';

export class StatusSyncService {
	private snapshotBuilder: StatusSyncSnapshotBuilder;
	private backgroundLoader: StatusSyncBackgroundLoader;
	private executor: StatusSyncExecutor;

	constructor(
		app: App,
		client: BangumiClient,
		documentService: SubjectDocumentService,
		episodeStatusManager?: EpisodeStatusManager | null,
	) {
		this.snapshotBuilder = new StatusSyncSnapshotBuilder(app, documentService, episodeStatusManager);
		this.backgroundLoader = new StatusSyncBackgroundLoader(client, episodeStatusManager);
		this.executor = new StatusSyncExecutor(app, client, documentService, episodeStatusManager);
	}

	async buildDiffSession(options: BuildDiffSessionOptions): Promise<{
		snapshots: StatusSyncSnapshot[];
		diffs: StatusSyncDiff[];
	}> {
		return await this.snapshotBuilder.buildDiffSession(options);
	}

	async loadBackgroundDiffs(
		selection: StatusSyncFieldSelection,
		snapshots: StatusSyncSnapshot[],
		callbacks: BackgroundUpdateCallbacks,
		onProgress?: (completed: number, total: number) => void,
		concurrency = 4,
	): Promise<void> {
		await this.backgroundLoader.loadBackgroundDiffs(selection, snapshots, callbacks, onProgress, concurrency);
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
		return await this.executor.executeSync(diffs);
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
}
