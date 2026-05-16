import { describe, expect, it } from 'vitest';
import { createCloudPlatformFieldDiff } from '../../src/sync/platformSyncLogic';

describe('platformSyncLogic', () => {
	it('defaults platform diffs to cloud authority', () => {
		const diff = createCloudPlatformFieldDiff('serialState', '连载状态修正', '连载中', '已完结');

		expect(diff).toEqual({
			key: 'serialState',
			label: '连载状态修正',
			localValue: '连载中',
			cloudValue: '已完结',
			hasDiff: true,
			decision: 'cloud',
		});
	});
});
