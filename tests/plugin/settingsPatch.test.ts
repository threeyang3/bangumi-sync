import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, BangumiPluginSettings } from '../../src/settings/settings';
import { applySettingsPatch, createSettingsPatch, reconcileSettingsDraft } from '../../src/settings/settingsPatch';
import { SettingsPersistenceCoordinator } from '../../src/settings/settingsLifecycle';

function settings(): BangumiPluginSettings {
	return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as BangumiPluginSettings;
}

describe('settings field patches', () => {
	it('rerenders a failed save from the latest official settings instead of the page-open snapshot', () => {
		const official = settings();
		official.panelFilters = { ...official.panelFilters, keyword: 'external-B' };
		official.lastSyncCount = 99;
		const reconciled = reconcileSettingsDraft({ applied: false, settings: official });
		expect(reconciled.shouldRerender).toBe(true);
		expect(reconciled.draft.panelFilters.keyword).toBe('external-B');
		expect(reconciled.draft.lastSyncCount).toBe(99);
		expect(reconciled.draft).not.toBe(official);
		expect(reconciled.submitted).not.toBe(reconciled.draft);
	});

	it.each(['panelFilters', 'lastSyncTime', 'lastSyncCount', 'subjectPathStates'] as const)('preserves an external %s update when the settings page only changes the token', field => {
		const opened = settings();
		const draft = settings();
		draft.accessToken = 'new-token';
		const patch = createSettingsPatch(opened, draft);
		const current = settings();
		if (field === 'panelFilters') current.panelFilters = { ...current.panelFilters, keyword: 'B' };
		else if (field === 'subjectPathStates') current.subjectPathStates = { '1': { subjectId: 1, currentPath: 'B.md', namingState: 'managed' } };
		else if (field === 'lastSyncTime') current.lastSyncTime = '2026-08-04T00:00:00.000Z';
		else current.lastSyncCount = 42;
		const candidate = applySettingsPatch(current, patch);
		expect(candidate.accessToken).toBe('new-token');
		expect(candidate[field]).toEqual(current[field]);
	});

	it.each(['dataProtection', 'pathTemplateByType'] as const)('replaces the changed nested %s object without submitting unrelated stale fields', field => {
		const opened = settings();
		const draft = settings();
		if (field === 'dataProtection') draft.dataProtection = { ...draft.dataProtection, preserveRecord: !draft.dataProtection.preserveRecord };
		else draft.pathTemplateByType = { ...draft.pathTemplateByType, anime: 'Anime/{{id}}.md' };
		const patch = createSettingsPatch(opened, draft);
		expect(patch.changedFields).toEqual([field]);
		const current = settings();
		current.lastSyncTime = '2026-08-04T00:00:00.000Z';
		const candidate = applySettingsPatch(current, patch);
		expect(candidate[field]).toEqual(draft[field]);
		expect(candidate.lastSyncTime).toBe('2026-08-04T00:00:00.000Z');
	});

	it('serializes two rapid control saves and an external path-state persistence operation', async () => {
		const coordinator = new SettingsPersistenceCoordinator();
		const order: string[] = [];
		const first = coordinator.enqueue(async () => { order.push('token:start'); await Promise.resolve(); order.push('token:end'); });
		const second = coordinator.enqueue(() => { order.push('quality'); return Promise.resolve(); });
		const third = coordinator.enqueue(() => { order.push('path-state'); return Promise.resolve(); });
		await Promise.all([first, second, third]);
		expect(order).toEqual(['token:start', 'token:end', 'quality', 'path-state']);
	});

	it('rejects a patch that declares a field without a value', () => {
		expect(() => applySettingsPatch(settings(), { changedFields: ['accessToken'], values: {} })).toThrow('accessToken');
	});
});
