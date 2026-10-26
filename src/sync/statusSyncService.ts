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
	StatusSyncOutcome,
} from './statusSyncTypes';
import { withWriteOperation, WriteOperationLease } from './writeOperationGate';
import { collectionSnapshot, cloudSnapshot } from './cloudSnapshots';
import { hasSelectedStatusChanges } from './statusSyncTypes';

export class StatusSyncService {
	private snapshotBuilder: StatusSyncSnapshotBuilder;
	private backgroundLoader: StatusSyncBackgroundLoader;
	private executor: StatusSyncExecutor;
	private readonly client: BangumiClient;

	constructor(
		app: App,
		client: BangumiClient,
		documentService: SubjectDocumentService,
		episodeStatusManager?: EpisodeStatusManager | null,
	) {
		this.client = client;
		this.snapshotBuilder = new StatusSyncSnapshotBuilder(app, documentService, episodeStatusManager);
		this.backgroundLoader = new StatusSyncBackgroundLoader(client, episodeStatusManager);
		this.executor = new StatusSyncExecutor(app, client, documentService, episodeStatusManager);
	}

	async buildDiffSession(options: BuildDiffSessionOptions): Promise<{
		snapshots: StatusSyncSnapshot[];
		diffs: StatusSyncDiff[];
	}> {
		const revision = this.client.subjectDetailRevision;
		const session = await this.snapshotBuilder.buildDiffSession(options);
		if (revision !== this.client.subjectDetailRevision) throw new Error('Account changed. Compare again before syncing.');
		for (const diff of session.diffs) diff.credentialRevision = revision;
		return session;
	}

	async loadBackgroundDiffs(
		selection: StatusSyncFieldSelection,
		snapshots: StatusSyncSnapshot[],
		callbacks: BackgroundUpdateCallbacks,
		onProgress?: (completed: number, total: number) => void,
		concurrency = 4,
		captureCloudSnapshots = true,
	): Promise<void> {
		await this.backgroundLoader.loadBackgroundDiffs(selection, snapshots, callbacks, onProgress, concurrency, captureCloudSnapshots);
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

	async executeSync(diffs: StatusSyncDiff[], lease?: WriteOperationLease, onOutcome?: (outcome: StatusSyncOutcome) => void): Promise<StatusSyncExecutionSummary> {
		const confirmed = structuredClone(diffs);
		return withWriteOperation('status-sync', async owned => {
			// The comprehensive coordinator already validates all targets under its lease.
			if (!lease) await this.validatePreview(confirmed.filter(hasSelectedStatusChanges));
			return this.executor.executeSync(confirmed, owned, onOutcome);
		}, lease);
	}

	private async validatePreview(diffs: StatusSyncDiff[]): Promise<void> {
		const revision = this.client.subjectDetailRevision;
		let next = 0;
		let failure: Error | undefined;
		await Promise.all(Array.from({ length: Math.min(3, diffs.length) }, async () => {
			while (next < diffs.length && !failure) {
				const diff = diffs[next++];
				try {
					if (diff.credentialRevision !== undefined && diff.credentialRevision !== revision) throw new Error('Account changed. Compare again before syncing.');
					const collection = await this.client.getCollectionStatus(diff.subjectId);
					if (!collection || collectionSnapshot(collection) !== collectionSnapshot(diff.collection)) {
						throw new Error('Cloud collection changed or could not be verified. Compare again before syncing.');
					}
					const selected = (field: { hasDiff: boolean; decision: string }) => field.hasDiff && field.decision !== 'skip';
					const selection: StatusSyncFieldSelection = {
						user: { rate: selected(diff.rate), comment: selected(diff.comment), tags: selected(diff.tags), status: selected(diff.status), episodeStatus: selected(diff.episodeStatus) },
						platform: { episodeCount: false, chapterCount: false, volumeCount: false, start: false, end: false, progress: false },
					};
					for (const field of diff.platformFields) if (selected(field)) selection.platform[field.key] = true;
					const session = await this.buildDiffSession({ selection, collections: [collection], includeUnchanged: true,
						localSubjects: new Map([[diff.subjectId, { id: diff.subjectId, path: diff.localPath, name_cn: diff.name_cn }]]) });
					const fresh = session.diffs[0];
					if (!fresh || fresh.localContentSnapshot !== diff.localContentSnapshot) throw new Error('Note changed since preview. Compare again before syncing.');
					await this.loadBackgroundDiffs(selection, session.snapshots, {
						isDisposed: () => false, updateBackgroundProgress: () => undefined,
						updateDiff: (_id, patch) => Object.assign(fresh, patch),
					}, undefined, 1, true);
					if (fresh.backgroundError || fresh.episodeStatusLoadState !== 'ready' || fresh.platformLoadState !== 'ready') throw new Error('Cloud data could not be verified. Compare again before syncing.');
					if (selection.user.episodeStatus && (diff.episodeStatus.cloudSnapshot === undefined || fresh.episodeStatus.cloudSnapshot !== diff.episodeStatus.cloudSnapshot)) throw new Error('Cloud episode status changed. Compare again before syncing.');
					for (const field of diff.platformFields.filter(selected)) {
						if (!diff.platformSyncPayload || cloudSnapshot(fresh.platformSyncPayload?.[field.key]) !== cloudSnapshot(diff.platformSyncPayload[field.key])) throw new Error('Cloud platform data changed. Compare again before syncing.');
					}
					if (selection.platform.episodeCount && (diff.cloudEpisodesSnapshot === undefined || fresh.cloudEpisodesSnapshot !== diff.cloudEpisodesSnapshot)) throw new Error('Cloud episode catalog changed. Compare again before syncing.');
				} catch (error) { failure = error instanceof Error ? error : new Error('Cloud data could not be verified. Compare again before syncing.'); }
			}
		}));
		if (failure) throw failure;
		if (revision !== this.client.subjectDetailRevision) throw new Error('Account changed. Compare again before syncing.');
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
