import { PlatformFieldDiff, PlatformFieldKey } from './statusSyncTypes';

export function createCloudPlatformFieldDiff(
	key: PlatformFieldKey,
	label: string,
	localValue: string | null,
	cloudValue: string | null,
): PlatformFieldDiff {
	return {
		key,
		label,
		localValue,
		cloudValue,
		hasDiff: true,
		decision: 'cloud',
	};
}
