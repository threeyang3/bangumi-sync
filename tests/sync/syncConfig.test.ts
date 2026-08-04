import { describe, expect, it } from 'vitest';
import type { SyncManagerConfig } from '../../src/sync/syncManager';
import { cloneSyncManagerConfig, deepFreezeSyncManagerConfig } from '../../src/sync/syncConfig';

function config(): SyncManagerConfig {
	return {
		accessToken: 'token', pathTemplate: 'A/{{id}}.md', imagePathTemplate: 'A/{{id}}.jpg',
		downloadImages: true, scanFolderPath: 'A', pathTemplateByType: { anime: 'Anime/{{id}}.md' },
		customTemplates: { anime: '{{id}}' },
		dataProtection: { preserveRatingDetails: true, preserveCustomProperties: true, preserveRecord: true, preserveThoughts: true },
		subjectPathStates: { '1': { subjectId: 1, currentPath: 'A/1.md', namingState: 'managed' } },
	};
}

describe('immutable sync configuration snapshots', () => {
	it('deep-clones every mutable configuration field', () => {
		const original = config();
		const snapshot = cloneSyncManagerConfig(original);
		expect(snapshot.pathTemplateByType).not.toBe(original.pathTemplateByType);
		expect(snapshot.customTemplates).not.toBe(original.customTemplates);
		expect(snapshot.dataProtection).not.toBe(original.dataProtection);
		expect(snapshot.subjectPathStates).not.toBe(original.subjectPathStates);
		expect(snapshot.subjectPathStates?.['1']).not.toBe(original.subjectPathStates?.['1']);
		original.pathTemplateByType!.anime = 'mutated';
		expect(snapshot.pathTemplateByType?.anime).toBe('Anime/{{id}}.md');
	});

	it('can freeze owned snapshots in development and tests', () => {
		const frozen = deepFreezeSyncManagerConfig(cloneSyncManagerConfig(config()));
		expect(Object.isFrozen(frozen)).toBe(true);
		expect(Object.isFrozen(frozen.subjectPathStates?.['1'])).toBe(true);
	});
});
