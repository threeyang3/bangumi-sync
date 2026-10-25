import { UserCollection } from '../../common/api/types';
import { LocalPropertyValueMap } from '../ui/localPropertyModal';
import { StatusSyncService } from './statusSyncService';
import { SyncManager } from './syncManager';
import { SyncResultWithRollback } from './syncStatus';
import { StatusSyncDiff, StatusSyncFieldSelection, hasSelectedStatusChanges } from './statusSyncTypes';
import { withWriteOperation } from './writeOperationGate';
import { cloudSnapshot, collectionSnapshot } from './cloudSnapshots';

export interface ComprehensiveSyncFailure {
	subjectId: number;
	name: string;
	error: string;
}

export interface ComprehensiveSyncPlan {
	selection: StatusSyncFieldSelection;
	additions: UserCollection[];
	diffs: StatusSyncDiff[];
	unchanged: UserCollection[];
	failures: ComprehensiveSyncFailure[];
	localOnlyCount: number;
}

export interface ComprehensiveSyncOutcome {
	subjectId: number;
	name: string;
	status: 'created' | 'updated' | 'unchanged' | 'skipped' | 'failed' | 'pending' | 'rolled-back';
	error?: string;
}

export interface ComprehensiveSyncResult {
	outcomes: ComprehensiveSyncOutcome[];
	importResult?: SyncResultWithRollback;
}

/** Coordinates existing engines; a preview never owns a long-lived write lease. */
export class ComprehensiveSyncService {
	private readonly contexts = new WeakMap<ComprehensiveSyncPlan, () => boolean>();
	private readonly consumed = new WeakSet<ComprehensiveSyncPlan>();
	private readonly cloudBaselines = new WeakMap<ComprehensiveSyncPlan, {
		collections: Map<number, string>; fields: Map<number, string>;
	}>();

	constructor(private readonly manager: SyncManager, readonly statusService: StatusSyncService, private readonly concurrency = 3) {}

	async prepare(selection: StatusSyncFieldSelection, cancelled = () => false, onProgress?: (current: number, total: number) => void): Promise<ComprehensiveSyncPlan> {
		return withWriteOperation('comprehensive-sync', async lease => {
			const contextIsValid = this.manager.createSyncContextValidator();
			const assertCurrent = () => {
				if (cancelled() || !contextIsValid()) throw new Error('Preview cancelled or settings changed. Refresh and retry.');
			};
			assertCurrent();
			const data = await this.manager.prepareComprehensiveSync(lease, cancelled);
			assertCurrent();
			const ids = new Set<number>();
			for (const item of data.collections) {
				if (!Number.isSafeInteger(item.subject_id) || item.subject_id <= 0 || ids.has(item.subject_id)) {
					throw new Error('Incomplete collection snapshot: invalid or duplicate subject ID. Refresh and retry.');
				}
				ids.add(item.subject_id);
			}
			const plan: ComprehensiveSyncPlan = {
				selection,
				additions: [], diffs: [], unchanged: [], failures: [],
				localOnlyCount: Array.from(data.localSubjects.keys()).filter(id => !ids.has(id)).length,
			};
			const existing: UserCollection[] = [];
			const names = new Map(data.collections.map(item => [item.subject_id, item.subject.name_cn || item.subject.name]));
			const failedIds = new Set<number>();
			const fail = (subjectId: number, error: unknown) => {
				if (failedIds.has(subjectId)) return;
				failedIds.add(subjectId);
				plan.failures.push({ subjectId, name: names.get(subjectId) ?? String(subjectId), error: error instanceof Error ? error.message : String(error) });
			};
			for (const collection of data.collections) {
				if (data.blockedSubjectIds.has(collection.subject_id)) fail(collection.subject_id, 'Local identity is ambiguous. Resolve duplicate or conflicting IDs first.');
				else if (data.localSubjects.has(collection.subject_id)) existing.push(collection);
				else plan.additions.push(collection);
			}
			const { snapshots, diffs } = await this.statusService.buildDiffSession({
				selection, collections: existing, localSubjects: data.localSubjects,
				includeUnchanged: true, onError: fail,
				concurrency: this.concurrency,
				onProgress,
				cancelled,
			});
			assertCurrent();
			const snapshotIds = new Set(snapshots.map(snapshot => snapshot.subjectId));
			for (const item of existing) {
				if (!snapshotIds.has(item.subject_id) && !failedIds.has(item.subject_id)) {
					fail(item.subject_id, 'Local file moved or disappeared. Refresh and retry.');
				}
			}
			const byId = new Map(diffs.map(diff => [diff.subjectId, diff]));
			await this.statusService.loadBackgroundDiffs(selection, snapshots, {
				isDisposed: cancelled,
				updateBackgroundProgress: (current, total) => onProgress?.(current, total),
				updateDiff: (id, patch) => { const diff = byId.get(id); if (diff) Object.assign(diff, patch); },
			}, undefined, this.concurrency, true);
			assertCurrent();
			const collectionsById = new Map(existing.map(item => [item.subject_id, item]));
			for (const diff of diffs) {
				if (diff.backgroundError || diff.episodeStatusLoadState !== 'ready' || diff.platformLoadState !== 'ready') {
					fail(diff.subjectId, diff.backgroundError ?? 'Comparison incomplete. Refresh and retry.');
					continue;
				}
				diff.hasUserDiff = [diff.rate, diff.comment, diff.tags, diff.status, diff.episodeStatus].some(field => field.hasDiff);
				diff.hasPlatformDiff = diff.platformFields.some(field => field.hasDiff);
				diff.hasAnyDiff = diff.hasUserDiff || diff.hasPlatformDiff;
				if (diff.hasAnyDiff) plan.diffs.push(diff);
				else plan.unchanged.push(collectionsById.get(diff.subjectId)!);
			}
			this.contexts.set(plan, contextIsValid);
			this.cloudBaselines.set(plan, {
				collections: new Map(data.collections.map(item => [item.subject_id, collectionSnapshot(item)])),
				fields: new Map(diffs.map(diff => [diff.subjectId, this.fieldSnapshot(diff)])),
			});
			return plan;
		});
	}

	async execute(plan: ComprehensiveSyncPlan, selectedAdditions: ReadonlySet<number>, properties?: Map<number, LocalPropertyValueMap>): Promise<ComprehensiveSyncResult> {
		return withWriteOperation('comprehensive-sync', async lease => {
			if (!this.contexts.get(plan)?.() || this.consumed.has(plan)) throw new Error('Preview expired or already executed. Refresh and retry.');
			this.manager.ensureCanStartSync(lease);
			this.consumed.add(plan);
			// Read every selected cloud target before allowing either engine to mutate.
			await this.validateCloud(plan, plan.diffs.filter(hasSelectedStatusChanges), plan.additions.filter(item => selectedAdditions.has(item.subject_id)));
			if (!this.contexts.get(plan)?.()) throw new Error('Preview expired. Refresh and retry.');
			const outcomes: ComprehensiveSyncOutcome[] = [
				...plan.unchanged.map(item => ({ subjectId: item.subject_id, name: item.subject.name_cn || item.subject.name, status: 'unchanged' as const })),
				...plan.failures.map(item => ({ ...item, status: 'failed' as const })),
			];
			const names = new Map(plan.diffs.map(diff => [diff.subjectId, diff.name_cn || diff.name]));
			const selectedDiffs = plan.diffs.filter(diff => {
				if (hasSelectedStatusChanges(diff)) return true;
				outcomes.push({ subjectId: diff.subjectId, name: names.get(diff.subjectId)!, status: 'skipped' });
				return false;
			});
			// Existing-note writes precede path planning: imports may rename collision peers.
			await this.statusService.executeSync(selectedDiffs, lease, outcome => outcomes.push({ ...outcome, name: names.get(outcome.subjectId)! }));
			const additions = plan.additions.filter(item => {
				if (selectedAdditions.has(item.subject_id)) return true;
				outcomes.push({ subjectId: item.subject_id, name: item.subject.name_cn || item.subject.name, status: 'skipped' });
				return false;
			});
			if (additions.length === 0) return { outcomes };
			try {
				const importResult = await this.manager.syncByCollections(additions, {
					localPropertyValuesBySubjectId: properties, onlyCreateMissing: true, concurrency: this.concurrency,
				}, undefined, lease);
				const importedById = new Map(importResult.outcomes.map(row => [row.subjectId, row]));
				for (const item of additions) {
					const outcome = importedById.get(item.subject_id);
					const action = outcome?.writeAction;
					const status = action === 'created' ? (importResult.canRollback ? 'pending' : 'created')
						: action === 'rolled-back' ? 'rolled-back' : action === 'unchanged' || action === 'skipped' ? 'skipped' : 'failed';
					outcomes.push({ subjectId: item.subject_id, name: item.subject.name_cn || item.subject.name, status,
						error: outcome?.error ?? (status === 'failed' ? importResult.errorDetails[0] ?? 'Import did not complete.' : undefined) });
				}
				return { outcomes, importResult };
			} catch (error) {
				for (const item of additions) outcomes.push({ subjectId: item.subject_id, name: item.subject.name_cn || item.subject.name,
					status: 'failed', error: error instanceof Error ? error.message : String(error) });
				return { outcomes };
			}
		});
	}

	private fieldSnapshot(diff: StatusSyncDiff): string {
		return cloudSnapshot({ episode: diff.episodeStatus.cloudSnapshot, platform: diff.cloudPlatformSnapshot, catalog: diff.cloudEpisodesSnapshot });
	}

	private async validateCloud(plan: ComprehensiveSyncPlan, diffs: StatusSyncDiff[], additions: UserCollection[]): Promise<void> {
		const baseline = this.cloudBaselines.get(plan);
		if (!baseline) throw new Error('Preview expired. Refresh and retry.');
		const targets = [...diffs.map(diff => diff.collection), ...additions];
		const fresh = new Map<number, UserCollection>();
		let next = 0;
		let error: Error | undefined;
		await Promise.all(Array.from({ length: Math.min(this.concurrency, targets.length) }, async () => {
			while (next < targets.length && !error) {
				const target = targets[next++];
				try {
					const collection = await this.manager.client.getCollectionStatus(target.subject_id);
					if (!collection || collectionSnapshot(collection) !== baseline.collections.get(target.subject_id)) throw new Error('Cloud collection changed since preview. Compare again before syncing.');
					fresh.set(target.subject_id, collection);
				} catch (cause) { error = cause instanceof Error ? cause : new Error('Cloud collection could not be verified. Compare again before syncing.'); }
			}
		}));
		if (error) throw error;
		if (diffs.length === 0) return;
		const { snapshots, diffs: freshDiffs } = await this.statusService.buildDiffSession({
			selection: plan.selection, collections: diffs.map(diff => fresh.get(diff.subjectId)!), includeUnchanged: true, concurrency: this.concurrency,
			localSubjects: new Map(diffs.map(diff => [diff.subjectId, { id: diff.subjectId, path: diff.localPath, name_cn: diff.name_cn }])),
		});
		if (snapshots.length !== diffs.length) throw new Error('Local preview changed. Compare again before syncing.');
		const originals = new Map(diffs.map(diff => [diff.subjectId, diff]));
		for (const snapshot of snapshots) {
			if (snapshot.localSnapshot.content !== originals.get(snapshot.subjectId)?.localContentSnapshot) throw new Error('Note changed since preview. Compare again before syncing.');
		}
		const freshById = new Map(freshDiffs.map(diff => [diff.subjectId, diff]));
		await this.statusService.loadBackgroundDiffs(plan.selection, snapshots, {
			isDisposed: () => false, updateBackgroundProgress: () => undefined,
			updateDiff: (id, patch) => { const diff = freshById.get(id); if (diff) Object.assign(diff, patch); },
		}, undefined, this.concurrency, true);
		for (const diff of freshDiffs) {
			if (diff.backgroundError || diff.episodeStatusLoadState !== 'ready' || diff.platformLoadState !== 'ready'
				|| this.fieldSnapshot(diff) !== baseline.fields.get(diff.subjectId)) {
				throw new Error('Cloud episode or platform data changed or could not be verified. Compare again before syncing.');
			}
		}
	}
}
