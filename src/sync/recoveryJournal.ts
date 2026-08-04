import type { App } from 'obsidian';
import type { SubjectPathState } from './localSubjectRegistry';
import type { RecoveryAttempt, RecoveryRequiredState } from './syncManager';
import type { RecoveryCreatedFileExpectation, RecoveryRenameExpectation } from './syncTransaction';
import type { SyncResultWithRollback } from './syncStatus';

export const RECOVERY_JOURNAL_PATH = '.bangumi-sync-recovery.json';
export const RECOVERY_JOURNAL_TEMP_PATH = '.bangumi-sync-recovery.tmp.json';
export const RECOVERY_JOURNAL_PREVIOUS_PATH = '.bangumi-sync-recovery.previous.json';

export interface PersistentRecoveryJournal {
	schemaVersion: 1;
	journalId: string;
	pluginVersion: string;
	state: 'active' | 'awaiting-decision' | 'rolling-back' | 'rollback-failed' | 'recovery-required';
	createdAt: number;
	updatedAt: number;
	scanRoot: string;
	affectedSubjectIds: number[];
	originalPathStates: Record<string, SubjectPathState>;
	subjectExpectations: RecoveryRequiredState['subjectExpectations'];
	contentExpectations: RecoveryRequiredState['contentExpectations'];
	createdPathExpectations: RecoveryCreatedFileExpectation[];
	renameExpectations: RecoveryRenameExpectation[];
	createdResourcePaths: string[];
	resultSnapshot: SyncResultWithRollback;
	attempts: RecoveryAttempt[];
	blockingIssue?: string;
}

export type RecoveryJournalLoadResult =
	| { status: 'none' }
	| { status: 'loaded'; journal: PersistentRecoveryJournal; recoveredFromPrevious: boolean; temporaryFilePresent: boolean }
	| { status: 'corrupt'; message: string; backupPath: string }
	| { status: 'unsupported'; schemaVersion: unknown; backupPath: string };

export class RecoveryJournalStore {
	private writeQueue: Promise<void> = Promise.resolve();
	constructor(private readonly app: App) {}

	write(journal: PersistentRecoveryJournal): Promise<void> {
		const run = this.writeQueue.then(() => this.writeNow(journal));
		this.writeQueue = run.then(() => undefined, () => undefined);
		return run;
	}

	private async writeNow(journal: PersistentRecoveryJournal): Promise<void> {
		const adapter = this.app.vault.adapter;
		const serialized = JSON.stringify({ ...journal, updatedAt: Date.now() }, null, 2);
		await adapter.write(RECOVERY_JOURNAL_TEMP_PATH, serialized);
		if (await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH)) await adapter.remove(RECOVERY_JOURNAL_PREVIOUS_PATH);
		if (await adapter.exists(RECOVERY_JOURNAL_PATH)) await adapter.rename(RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH);
		try {
			await adapter.rename(RECOVERY_JOURNAL_TEMP_PATH, RECOVERY_JOURNAL_PATH);
		} catch (error) {
			if (!await adapter.exists(RECOVERY_JOURNAL_PATH) && await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH)) {
				await adapter.rename(RECOVERY_JOURNAL_PREVIOUS_PATH, RECOVERY_JOURNAL_PATH);
			}
			throw error;
		}
		if (await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH)) await adapter.remove(RECOVERY_JOURNAL_PREVIOUS_PATH);
	}

	async load(): Promise<RecoveryJournalLoadResult> {
		const adapter = this.app.vault.adapter;
		const hasCurrent = await adapter.exists(RECOVERY_JOURNAL_PATH);
		const hasPrevious = await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH);
		const temporaryFilePresent = await adapter.exists(RECOVERY_JOURNAL_TEMP_PATH);
		if (!hasCurrent && !hasPrevious && temporaryFilePresent) {
			const backupPath = `.bangumi-sync-recovery.corrupt-temp-${Date.now()}.json`;
			await adapter.rename(RECOVERY_JOURNAL_TEMP_PATH, backupPath);
			return { status: 'corrupt', message: 'Only an interrupted temporary recovery journal remained.', backupPath };
		}
		if (!hasCurrent && !hasPrevious) return { status: 'none' };
		if (temporaryFilePresent) {
			const interruptedPath = `.bangumi-sync-recovery.interrupted-${Date.now()}.json`;
			await adapter.rename(RECOVERY_JOURNAL_TEMP_PATH, interruptedPath);
		}
		const sourcePath = hasCurrent ? RECOVERY_JOURNAL_PATH : RECOVERY_JOURNAL_PREVIOUS_PATH;
		let parsed: unknown;
		try {
			parsed = JSON.parse(await adapter.read(sourcePath));
		} catch (error) {
			const backupPath = `.bangumi-sync-recovery.corrupt-${Date.now()}.json`;
			await adapter.rename(sourcePath, backupPath);
			return { status: 'corrupt', message: error instanceof Error ? error.message : String(error), backupPath };
		}
		const schemaVersion = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
		if (schemaVersion !== 1) {
			const backupPath = `.bangumi-sync-recovery.unsupported-${Date.now()}.json`;
			await adapter.rename(sourcePath, backupPath);
			return { status: 'unsupported', schemaVersion, backupPath };
		}
		return { status: 'loaded', journal: parsed as PersistentRecoveryJournal, recoveredFromPrevious: !hasCurrent, temporaryFilePresent };
	}

	async clear(): Promise<void> {
		await this.writeQueue;
		for (const path of [RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_TEMP_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH]) {
			if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
		}
	}
}
