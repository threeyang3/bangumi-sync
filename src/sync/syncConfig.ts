import type { SyncManagerConfig } from './syncManager';
import type { SyncConfigField } from './syncManager';
import { pathStatesEqual } from './recoveryValidation';

function cloneRecord<T>(value: Readonly<Record<string, T>> | undefined): Record<string, T> | undefined {
	return value ? { ...value } : undefined;
}

/** Create an ownership-isolated snapshot of all mutable manager configuration. */
export function cloneSyncManagerConfig(config: SyncManagerConfig): SyncManagerConfig {
	return {
		...config,
		pathTemplateByType: cloneRecord(config.pathTemplateByType),
		customTemplates: cloneRecord(config.customTemplates),
		dataProtection: config.dataProtection ? { ...config.dataProtection } : undefined,
		subjectPathStates: config.subjectPathStates
			? Object.fromEntries(Object.entries(config.subjectPathStates).map(([key, state]) => [key, { ...state }]))
			: undefined,
	};
}

/** Freeze a configuration snapshot in tests/development so aliases fail loudly. */
export function deepFreezeSyncManagerConfig(config: SyncManagerConfig): Readonly<SyncManagerConfig> {
	const freeze = (value: unknown): void => {
		if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
		for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
		Object.freeze(value);
	};
	freeze(config);
	return config;
}

function recordsEqual<T>(left: Readonly<Record<string, T>> | undefined, right: Readonly<Record<string, T>> | undefined): boolean {
	if (left === right) return true;
	if (!left || !right) return false;
	const leftKeys = Object.keys(left).sort();
	const rightKeys = Object.keys(right).sort();
	return leftKeys.length === rightKeys.length
		&& leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

export function syncConfigFieldEqual(left: SyncManagerConfig, right: SyncManagerConfig, field: SyncConfigField): boolean {
	switch (field) {
		case 'pathTemplateByType':
		case 'customTemplates':
			return recordsEqual(left[field], right[field]);
		case 'subjectPathStates':
			return pathStatesEqual(left.subjectPathStates ?? {}, right.subjectPathStates ?? {});
		case 'dataProtection': {
			const a = left.dataProtection;
			const b = right.dataProtection;
			return a === b || Boolean(a && b
				&& a.preserveRatingDetails === b.preserveRatingDetails
				&& a.preserveCustomProperties === b.preserveCustomProperties
				&& a.preserveRecord === b.preserveRecord
				&& a.preserveThoughts === b.preserveThoughts);
		}
		default:
			return left[field] === right[field];
	}
}
