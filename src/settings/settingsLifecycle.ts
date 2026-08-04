import type { ConfigurationUpdateLease, SyncConfigField, SyncManager, SyncManagerConfig } from '../sync/syncManager';

export class SettingsPersistenceCoordinator {
	private queue: Promise<void> = Promise.resolve();

	enqueue(task: () => Promise<void>): Promise<void> {
		const run = this.queue.then(task);
		this.queue = run.then(() => undefined, () => undefined);
		return run;
	}
}

export class SettingsRollbackError extends Error {
	constructor(readonly applyError: unknown, readonly rollbackError: unknown) {
		super('Settings update failed and the previous persisted state could not be fully restored.');
		this.name = 'SettingsRollbackError';
	}
}

export interface StableManagerSettingsUpdate<TSettings> {
	settings: TSettings;
	previousSettings: TSettings;
	nextConfig: SyncManagerConfig;
	changedFields: readonly SyncConfigField[];
	manager: Pick<SyncManager, 'beginConfigurationUpdate'> | null;
	save: (settings: TSettings) => Promise<void>;
	restore: (snapshot: TSettings) => void;
	applyDependentServices?: (settings: TSettings) => Promise<void> | void;
	restoreDependentServices?: (settings: TSettings) => Promise<void> | void;
	onRollbackFailure?: (error: SettingsRollbackError) => Promise<void> | void;
}

export async function persistStableManagerSettings<TSettings>(
	update: StableManagerSettingsUpdate<TSettings>,
): Promise<{ applied: true } | { applied: false; error: unknown }> {
	let lease: ConfigurationUpdateLease | null = null;
	let persistedCandidate = false;
	try {
		lease = update.manager?.beginConfigurationUpdate(update.changedFields) ?? null;
		await update.save(update.settings);
		persistedCandidate = true;
		await lease?.commit(update.nextConfig);
		await update.applyDependentServices?.(update.settings);
		update.restore(update.settings);
		lease?.release();
		return { applied: true };
	} catch (error) {
		try {
			if (persistedCandidate) await update.save(update.previousSettings);
			await lease?.rollback();
			update.restore(update.previousSettings);
			await update.restoreDependentServices?.(update.previousSettings);
		} catch (rollbackError) {
			const settingsError = new SettingsRollbackError(error, rollbackError);
			try {
				await update.onRollbackFailure?.(settingsError);
			} catch (recoveryError) {
				console.error('Failed to persist the settings recovery gate.', recoveryError);
			}
			return { applied: false, error: settingsError };
		} finally {
			lease?.release();
		}
		return { applied: false, error };
	}
}
