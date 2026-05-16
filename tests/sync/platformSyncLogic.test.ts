import { describe, expect, it } from 'vitest';
import { createCloudPlatformFieldDiff } from '../../src/sync/platformSyncLogic';

describe('platformSyncLogic', () => {
	it('defaults platform diffs to cloud authority', () => {
		const diff = createCloudPlatformFieldDiff('episodeCount', '集数', '12', '13');

		expect(diff).toEqual({
			key: 'episodeCount',
			label: '集数',
			localValue: '12',
			cloudValue: '13',
			hasDiff: true,
			decision: 'cloud',
		});
	});
});
