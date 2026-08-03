import type { SyncConfigField, SyncManager, SyncManagerConfig } from '../sync/syncManager';

export interface StableManagerSettingsUpdate<TSettings> {
	settings: TSettings;
	previousSettings: TSettings;
	nextConfig: SyncManagerConfig;
	changedFields: readonly SyncConfigField[];
	manager: Pick<SyncManager, 'assertConfigurationChangeAllowed' | 'updateConfig'> | null;
	save: (settings: TSettings) => Promise<void>;
	restore: (snapshot: TSettings) => void;
}

export async function persistStableManagerSettings<TSettings>(
	update: StableManagerSettingsUpdate<TSettings>,
): Promise<{ applied: true } | { applied: false; error: unknown }> {
	try {
		update.manager?.assertConfigurationChangeAllowed(update.changedFields);
	} catch (error) {
		update.restore(update.previousSettings);
		return { applied: false, error };
	}
	try {
		await update.save(update.settings);
		update.manager?.updateConfig(update.nextConfig, update.changedFields);
		return { applied: true };
	} catch (error) {
		update.restore(update.previousSettings);
		throw error;
	}
}
