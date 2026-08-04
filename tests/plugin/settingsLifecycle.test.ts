import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, BangumiPluginSettings } from '../../src/settings/settings';
import { persistStableManagerSettings, SettingsPersistenceCoordinator } from '../../src/settings/settingsLifecycle';
import { ConfigurationChangeBlockedError, SyncManagerConfig } from '../../src/sync/syncManager';

function cloneSettings(): BangumiPluginSettings {
	return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as BangumiPluginSettings;
}

function config(scanFolderPath = 'ACGN', accessToken = 'old-token'): SyncManagerConfig {
	return {
		accessToken,
		pathTemplate: 'ACGN/{{type}}/{{name_cn_with_type}}.md',
		imagePathTemplate: 'ACGN/assets/{{name_cn}}.jpg',
		downloadImages: false,
		scanFolderPath,
	};
}

describe('plugin settings manager lifecycle', () => {
	function managerLease(options: { beginError?: Error; commitError?: Error } = {}) {
		const lease = {
			commit: vi.fn(() => options.commitError ? Promise.reject(options.commitError) : Promise.resolve()),
			rollback: vi.fn().mockResolvedValue(undefined),
			release: vi.fn(),
		};
		return {
			lease,
			manager: {
				beginConfigurationUpdate: vi.fn(() => {
					if (options.beginError) throw options.beginError;
					return lease;
				}),
			},
		};
	}

	it('updates the existing manager after a safe persisted setting change', async () => {
		const settings = cloneSettings();
		settings.accessToken = 'new-token';
		const previousSettings = cloneSettings();
		const { manager, lease } = managerLease();
		const save = vi.fn().mockResolvedValue(undefined);

		const result = await persistStableManagerSettings({
			settings, previousSettings, nextConfig: config('ACGN', 'new-token'), changedFields: ['accessToken'], manager,
			save, restore: snapshot => Object.assign(settings, snapshot),
		});

		expect(result).toEqual({ applied: true });
		expect(save).toHaveBeenCalledOnce();
		expect(lease.commit).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'new-token' }));
		expect(lease.release).toHaveBeenCalledOnce();
	});

	it('restores settings memory and skips persistence when recovery blocks a dangerous field', async () => {
		const settings = cloneSettings();
		const previousSettings = cloneSettings();
		settings.scanFolderPath = 'Archive';
		const { manager, lease } = managerLease({ beginError: new ConfigurationChangeBlockedError(['scanFolderPath']) });
		const save = vi.fn().mockResolvedValue(undefined);

		const result = await persistStableManagerSettings({
			settings, previousSettings, nextConfig: config('Archive'), changedFields: ['scanFolderPath'], manager,
			save, restore: snapshot => Object.assign(settings, snapshot),
		});

		expect(result.applied).toBe(false);
		if (!result.applied) expect(result.error).toBeInstanceOf(ConfigurationChangeBlockedError);
		expect(settings.scanFolderPath).toBe(DEFAULT_SETTINGS.scanFolderPath);
		expect(save).not.toHaveBeenCalled();
		expect(lease.commit).not.toHaveBeenCalled();
	});

	it('restores disk, manager, memory, and dependent services after manager apply fails', async () => {
		const previousSettings = cloneSettings();
		const settings = cloneSettings();
		settings.scanFolderPath = 'Archive';
		const { manager, lease } = managerLease({ commitError: new Error('apply failed') });
		const save = vi.fn().mockResolvedValue(undefined);
		const restore = vi.fn((snapshot: BangumiPluginSettings) => Object.assign(settings, snapshot));
		const restoreServices = vi.fn();

		const result = await persistStableManagerSettings({
			settings, previousSettings, nextConfig: config('Archive'), changedFields: ['scanFolderPath'], manager,
			save, restore, restoreDependentServices: restoreServices,
		});

		expect(result.applied).toBe(false);
		expect(save).toHaveBeenNthCalledWith(1, settings);
		expect(save).toHaveBeenNthCalledWith(2, previousSettings);
		expect(lease.rollback).toHaveBeenCalledOnce();
		expect(restoreServices).toHaveBeenCalledWith(previousSettings);
		expect(settings.scanFolderPath).toBe(previousSettings.scanFolderPath);
	});

	it('enters recovery when restoring the previous persisted settings also fails', async () => {
		const previousSettings = cloneSettings();
		const settings = cloneSettings();
		settings.scanFolderPath = 'Archive';
		const { manager } = managerLease({ commitError: new Error('apply failed') });
		const save = vi.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('rollback write failed'));
		let recoveryError: unknown;
		const onRollbackFailure = vi.fn((error: unknown) => {
			recoveryError = error;
			return Promise.resolve();
		});

		const result = await persistStableManagerSettings({
			settings, previousSettings, nextConfig: config('Archive'), changedFields: ['scanFolderPath'], manager,
			save, restore: snapshot => Object.assign(settings, snapshot), onRollbackFailure,
		});

		expect(result.applied).toBe(false);
		expect(onRollbackFailure).toHaveBeenCalledOnce();
		expect(recoveryError).toBeInstanceOf(Error);
	});

	it('serializes concurrent settings writes without poisoning later work after a failure', async () => {
		const coordinator = new SettingsPersistenceCoordinator();
		const order: string[] = [];
		let releaseFirst!: () => void;
		const first = coordinator.enqueue(async () => {
			order.push('first-start');
			await new Promise<void>(resolve => { releaseFirst = resolve; });
			order.push('first-end');
			throw new Error('expected');
		});
		const second = coordinator.enqueue(() => { order.push('second'); return Promise.resolve(); });
		expect(order).toEqual([]);
		await Promise.resolve();
		expect(order).toEqual(['first-start']);
		releaseFirst();
		await expect(first).rejects.toThrow('expected');
		await second;
		expect(order).toEqual(['first-start', 'first-end', 'second']);
	});
});
