import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, BangumiPluginSettings } from '../../src/settings/settings';
import { persistStableManagerSettings } from '../../src/settings/settingsLifecycle';
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
	it('updates the existing manager after a safe persisted setting change', async () => {
		const settings = cloneSettings();
		settings.accessToken = 'new-token';
		const previousSettings = cloneSettings();
		const manager = {
			assertConfigurationChangeAllowed: vi.fn(),
			updateConfig: vi.fn(),
		};
		const save = vi.fn().mockResolvedValue(undefined);

		const result = await persistStableManagerSettings({
			settings, previousSettings, nextConfig: config('ACGN', 'new-token'), changedFields: ['accessToken'], manager,
			save, restore: snapshot => Object.assign(settings, snapshot),
		});

		expect(result).toEqual({ applied: true });
		expect(save).toHaveBeenCalledOnce();
		expect(manager.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'new-token' }), ['accessToken']);
	});

	it('restores settings memory and skips persistence when recovery blocks a dangerous field', async () => {
		const settings = cloneSettings();
		const previousSettings = cloneSettings();
		settings.scanFolderPath = 'Archive';
		const manager = {
			assertConfigurationChangeAllowed: vi.fn(() => { throw new ConfigurationChangeBlockedError(['scanFolderPath']); }),
			updateConfig: vi.fn(),
		};
		const save = vi.fn().mockResolvedValue(undefined);

		const result = await persistStableManagerSettings({
			settings, previousSettings, nextConfig: config('Archive'), changedFields: ['scanFolderPath'], manager,
			save, restore: snapshot => Object.assign(settings, snapshot),
		});

		expect(result.applied).toBe(false);
		if (!result.applied) expect(result.error).toBeInstanceOf(ConfigurationChangeBlockedError);
		expect(settings.scanFolderPath).toBe(DEFAULT_SETTINGS.scanFolderPath);
		expect(save).not.toHaveBeenCalled();
		expect(manager.updateConfig).not.toHaveBeenCalled();
	});
});
