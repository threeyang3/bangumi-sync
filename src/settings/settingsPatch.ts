import type { BangumiPluginSettings } from './settings';

export type SettingsField = keyof BangumiPluginSettings;

export interface SettingsPatch {
	changedFields: readonly SettingsField[];
	values: Partial<BangumiPluginSettings>;
}

export interface SettingsSaveOutcome {
	applied: boolean;
	settings: BangumiPluginSettings;
}

export interface ReconciledSettingsDraft {
	draft: BangumiPluginSettings;
	submitted: BangumiPluginSettings;
	shouldRerender: boolean;
}

/** Refresh a long-lived settings UI from the latest official snapshot after every save attempt. */
export function reconcileSettingsDraft(outcome: SettingsSaveOutcome): ReconciledSettingsDraft {
	const draft = cloneValue(outcome.settings);
	return { draft, submitted: cloneValue(outcome.settings), shouldRerender: !outcome.applied };
}

function cloneValue<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function valuesEqual(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		return Array.isArray(left) && Array.isArray(right)
			&& left.length === right.length
			&& left.every((item, index) => valuesEqual(item, right[index]));
	}
	if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
	const leftRecord = left as Record<string, unknown>;
	const rightRecord = right as Record<string, unknown>;
	const leftKeys = Object.keys(leftRecord).sort();
	const rightKeys = Object.keys(rightRecord).sort();
	return leftKeys.length === rightKeys.length
		&& leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(leftRecord[key], rightRecord[key]));
}

export function createSettingsPatch(base: BangumiPluginSettings, draft: BangumiPluginSettings): SettingsPatch {
	const changedFields = (Object.keys(draft) as SettingsField[]).filter(field => !valuesEqual(base[field], draft[field]));
	const values: Partial<BangumiPluginSettings> = {};
	for (const field of changedFields) Object.assign(values, { [field]: cloneValue(draft[field]) });
	return { changedFields, values };
}

export function applySettingsPatch(current: BangumiPluginSettings, patch: SettingsPatch): BangumiPluginSettings {
	const candidate = cloneValue(current);
	for (const field of patch.changedFields) {
		if (!Object.prototype.hasOwnProperty.call(patch.values, field)) throw new Error(`Settings patch is missing ${field}.`);
		Object.assign(candidate, { [field]: cloneValue(patch.values[field]) });
	}
	return candidate;
}
