import { describe, expect, it, vi } from 'vitest';
import type { RuntimeConfigurationRecoveryFacts } from '../../src/sync/recoveryJournal';
import { RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH, RECOVERY_JOURNAL_TEMP_PATH, selectPreviousAccessToken } from '../../src/sync/recoveryJournal';
import { hashRecoveryContent } from '../../src/sync/recoveryContent';
import type { SyncManagerConfig } from '../../src/sync/syncManager';
import { RecoveryRequiredError, SyncManager } from '../../src/sync/syncManager';
import { InMemoryVault } from '../mocks/inMemoryVault';

function config(
	recoverConfiguration?: SyncManagerConfig['recoverConfiguration'],
	onConfigurationRecovered?: SyncManagerConfig['onConfigurationRecovered'],
): SyncManagerConfig {
	return {
		accessToken: 'old-token', pathTemplate: 'ACGN/{{id}}.md', imagePathTemplate: 'assets/{{id}}.jpg',
		downloadImages: false, imageQuality: 'large', imageUpdateExisting: false, scanFolderPath: 'ACGN',
		subjectPathStates: {}, recoverConfiguration, onConfigurationRecovered,
	};
}

function facts(): RuntimeConfigurationRecoveryFacts {
	return {
		previousSettings: { accessToken: 'old-token' },
		candidateSettings: { accessToken: 'new-token' },
		currentSettings: { accessToken: 'new-token' },
		diskSettings: { accessToken: 'new-token' },
		managerConfig: { accessToken: 'old-token' },
	};
}

function legacyConfigurationJournal(): Record<string, unknown> {
	return {
		schemaVersion: 1, journalId: 'legacy-configuration', pluginVersion: '6.11.1', state: 'recovery-required', createdAt: 1, updatedAt: 1,
		scanRoot: 'ACGN', affectedSubjectIds: [], originalPathStates: {}, subjectExpectations: [], contentExpectations: [],
		createdPathExpectations: [], renameExpectations: [], createdResourcePaths: [], updatedResourceExpectations: [], orphanTemporaryPaths: [], attempts: [],
		resultSnapshot: {
			total: 0, added: 0, skipped: 0, errors: 0, created: 0, updated: 0, unchanged: 0, renamed: 0, collisionResolved: 0,
			failed: 0, duration: 0, errorDetails: [], outcomes: [], warnings: [], rolledBack: 0, success: false, completion: 'failed', batchFiles: [], wasCancelled: false, canRollback: false,
		},
		configurationFacts: {
			previousSettings: { accessToken: 'legacy-old', scanFolderPath: 'Before' },
			candidateSettings: { accessToken: 'legacy-new', scanFolderPath: 'After' },
			currentSettings: { accessToken: 'legacy-new' }, diskSettings: { accessToken: 'legacy-new' }, managerConfig: { accessToken: 'legacy-old' },
		},
	};
}

describe('configuration rollback recovery', () => {
	it('rejects Retry without clearing the configuration recovery gate', async () => {
		const vault = new InMemoryVault();
		const recoverConfiguration = vi.fn().mockResolvedValue(config());
		const manager = new SyncManager(vault.app, config(recoverConfiguration));
		await manager.requireConfigurationRecovery(new Error('rollback write failed'), facts());

		expect(await manager.retryRecovery()).toMatchObject({ status: 'blocked', recovered: false });
		expect(recoverConfiguration).not.toHaveBeenCalled();
		expect(manager.getRecoveryRequired()?.reason).toBe('configuration-rollback-failed');
		expect(() => manager.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(true);
	});

	it('blocks manual reconciliation when persisted recovery facts are missing', async () => {
		const vault = new InMemoryVault();
		const recoverConfiguration = vi.fn().mockResolvedValue(config());
		const manager = new SyncManager(vault.app, config(recoverConfiguration));
		await manager.requireConfigurationRecovery(new Error('rollback write failed'));

		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'blocked', recovered: false });
		expect(recoverConfiguration).not.toHaveBeenCalled();
		expect(manager.getRecoveryRequired()).not.toBeNull();
	});

	it('reconciles disk, memory, manager configuration, then clears the gate', async () => {
		const vault = new InMemoryVault();
		const dependentRefresh = vi.fn().mockResolvedValue(undefined);
		const reconciled = config(undefined, dependentRefresh);
		const recoverConfiguration = vi.fn().mockResolvedValue(reconciled);
		const manager = new SyncManager(vault.app, config(recoverConfiguration));
		const recoveryFacts = facts();
		await manager.requireConfigurationRecovery(new Error('rollback write failed'), recoveryFacts);

		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'recovered', recovered: true });
		expect(recoverConfiguration).toHaveBeenCalledWith(expect.objectContaining({
			previousSettings: {}, candidateSettings: {}, currentSettings: {}, diskSettings: {}, managerConfig: {}, accessTokenChanged: true,
			previousAccessTokenSha256: await hashRecoveryContent('old-token'),
			candidateAccessTokenSha256: await hashRecoveryContent('new-token'),
		}));
		expect(dependentRefresh).toHaveBeenCalledOnce();
		expect(manager.getRecoveryRequired()).toBeNull();
		expect(() => manager.ensureCanStartSync()).not.toThrow();
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
	});

	it('never persists or reports a configuration token canary', async () => {
		const secret = 'SECRET_TOKEN_MUST_NEVER_REACH_JOURNAL_6_11_2';
		const vault = new InMemoryVault();
		const manager = new SyncManager(vault.app, config());
		await manager.requireConfigurationRecovery(new Error(`rollback failed for Bearer ${secret}`), {
			previousSettings: { accessToken: secret, scanFolderPath: 'Before' },
			candidateSettings: { accessToken: `${secret}-next`, scanFolderPath: 'After' },
			currentSettings: { accessToken: secret }, diskSettings: { authorization: `Bearer ${secret}` },
			managerConfig: { accessToken: secret, pathTemplate: 'ACGN/{{id}}.md' },
		});

		const serialized = vault.contents.get(RECOVERY_JOURNAL_PATH) ?? '';
		expect(serialized).not.toContain(secret);
		expect(serialized).not.toContain('Bearer ');
		expect(manager.getRecoveryRequired()?.journalIssue).not.toContain(secret);
		expect(JSON.parse(serialized)).toMatchObject({
			configurationFacts: { previousSettings: { scanFolderPath: 'Before' }, candidateSettings: { scanFolderPath: 'After' }, accessTokenChanged: true },
		});
	});

	it('retains the gate when dependent services cannot be refreshed after manager apply', async () => {
		const vault = new InMemoryVault();
		const dependentRefresh = vi.fn().mockRejectedValue(new Error('dependent refresh failed'));
		const recoverConfiguration = vi.fn().mockResolvedValue(config(undefined, dependentRefresh));
		const manager = new SyncManager(vault.app, config(recoverConfiguration));
		await manager.requireConfigurationRecovery(new Error('rollback write failed'), facts());

		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'failed', recovered: false });
		expect(dependentRefresh).toHaveBeenCalledOnce();
		expect(manager.getRecoveryRequired()).not.toBeNull();
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(true);
	});

	it('retains the gate when configuration reconciliation fails', async () => {
		const vault = new InMemoryVault();
		const recoverConfiguration = vi.fn().mockRejectedValue(new Error('disk verification failed'));
		const manager = new SyncManager(vault.app, config(recoverConfiguration));
		await manager.requireConfigurationRecovery(new Error('rollback write failed'), facts());

		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'failed', recovered: false });
		expect(manager.getRecoveryRequired()).not.toBeNull();
		expect(() => manager.ensureCanStartSync()).toThrow(RecoveryRequiredError);
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(true);
	});

	it('requires explicit risk acceptance before a corrupt journal can be manually cleared', async () => {
		const vault = new InMemoryVault();
		await vault.app.vault.adapter.write(RECOVERY_JOURNAL_PATH, JSON.stringify({ schemaVersion: 1 }));
		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();

		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'blocked', recovered: false });
		expect(await manager.confirmManualRecovery({ acceptUnverifiableJournalRisk: true }))
			.toMatchObject({ status: 'recovered', recovered: true });
		expect(manager.getRecoveryRequired()).toBeNull();
	});

	it('selects only a token that can represent the previous configuration', async () => {
		const previousHash = await hashRecoveryContent('old-token');
		expect(await selectPreviousAccessToken({ accessTokenChanged: false, previousAccessTokenSha256: previousHash, diskToken: 'old-token' })).toBe('old-token');
		expect(await selectPreviousAccessToken({ accessTokenChanged: true, previousAccessTokenSha256: previousHash, diskToken: 'new-token', runtimePreviousToken: 'old-token' })).toBe('old-token');
		expect(await selectPreviousAccessToken({ accessTokenChanged: true, previousAccessTokenSha256: previousHash, diskToken: 'old-token' })).toBe('old-token');
		expect(await selectPreviousAccessToken({ accessTokenChanged: true, previousAccessTokenSha256: previousHash, diskToken: 'new-token' })).toBeUndefined();
		expect(await selectPreviousAccessToken({ accessTokenChanged: true, previousAccessTokenSha256: previousHash, diskToken: 'wrong-token' })).toBeUndefined();
		expect(await selectPreviousAccessToken({ accessTokenChanged: true, diskToken: 'new-token', runtimePreviousToken: 'old-token' })).toBeUndefined();
	});

	it('selects an empty previous token only when its hash proves the source', async () => {
		const previousHash = await hashRecoveryContent('');
		expect(await selectPreviousAccessToken({ accessTokenChanged: true, previousAccessTokenSha256: previousHash, runtimePreviousToken: '', diskToken: 'new-token' })).toBe('');
		expect(await selectPreviousAccessToken({ accessTokenChanged: true, previousAccessTokenSha256: previousHash, diskToken: '' })).toBe('');
		expect(await selectPreviousAccessToken({ accessTokenChanged: true, previousAccessTokenSha256: previousHash, diskToken: 'new-token' })).toBeUndefined();
	});

	it('persists the hash for an empty previous token during runtime recovery', async () => {
		const vault = new InMemoryVault();
		const manager = new SyncManager(vault.app, config());
		const recoveryFacts = facts();
		recoveryFacts.previousSettings.accessToken = '';
		await manager.requireConfigurationRecovery(new Error('rollback write failed'), recoveryFacts);

		const persisted = JSON.parse(vault.contents.get(RECOVERY_JOURNAL_PATH) ?? '{}') as {
			configurationFacts?: { previousAccessTokenSha256?: string };
		};
		expect(persisted.configurationFacts?.previousAccessTokenSha256).toBe(await hashRecoveryContent(''));
	});

	it('keeps legacy migration failure migration-only across retry and reload', async () => {
		const vault = new InMemoryVault();
		const original = JSON.stringify(legacyConfigurationJournal());
		vault.addFile(RECOVERY_JOURNAL_PATH, original);
		const adapter = vault.app.vault.adapter;
		const originalWrite = adapter.write.bind(adapter);
		adapter.write = (path, data) => path === RECOVERY_JOURNAL_MIGRATION_TEMP_PATH
			? Promise.reject(new Error('injected migration write failure'))
			: originalWrite(path, data);

		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();
		expect(manager.getRecoveryRequired()).toMatchObject({ reason: 'legacy-journal-migration-failed', legacyMigration: { sourcePath: RECOVERY_JOURNAL_PATH } });
		expect(manager.getRecoveryActionPolicy()).toMatchObject({ allowRetryMigration: true, allowRetryRollback: false, allowRetryCleanup: false, allowManualConfirmation: false });
		expect(await manager.retryRollbackRecovery()).toMatchObject({ status: 'blocked', recovered: false });
		expect(await manager.retryJournalCleanup()).toMatchObject({ status: 'blocked', recovered: false });
		expect(await manager.confirmManualRecovery()).toMatchObject({ status: 'blocked', recovered: false });
		const failedMigration = await manager.retryLegacyJournalMigration();
		expect(failedMigration).toMatchObject({ status: 'failed', recovered: false });
		expect(vault.contents.get(RECOVERY_JOURNAL_PATH)).toBe(original);

		const reloaded = new SyncManager(vault.app, config());
		await reloaded.initializeRecovery();
		expect(reloaded.getRecoveryRequired()?.reason).toBe('legacy-journal-migration-failed');

		adapter.write = originalWrite;
		const migrated = await reloaded.retryLegacyJournalMigration();
		expect(migrated).toMatchObject({ action: 'retry-migration', status: 'recovered', recovered: true });
		expect(reloaded.getRecoveryRequired()?.reason).toBe('configuration-rollback-failed');
		expect(vault.contents.get(RECOVERY_JOURNAL_PATH)).not.toContain('legacy-old');
		expect(vault.contents.get(RECOVERY_JOURNAL_PREVIOUS_PATH) ?? '').not.toContain('legacy-old');
	});

	it('promotes a temp-only legacy journal after migration retry into configuration recovery', async () => {
		const vault = new InMemoryVault();
		const original = JSON.stringify(legacyConfigurationJournal());
		vault.addFile(RECOVERY_JOURNAL_TEMP_PATH, original);
		const adapter = vault.app.vault.adapter;
		const originalWrite = adapter.write.bind(adapter);
		adapter.write = (path, data) => path === RECOVERY_JOURNAL_MIGRATION_TEMP_PATH
			? Promise.reject(new Error('injected first migration failure'))
			: originalWrite(path, data);

		const manager = new SyncManager(vault.app, config());
		await manager.initializeRecovery();
		expect(manager.getRecoveryRequired()?.reason).toBe('legacy-journal-migration-failed');
		expect(vault.files.has(RECOVERY_JOURNAL_TEMP_PATH)).toBe(true);

		adapter.write = originalWrite;
		const retried = await manager.retryLegacyJournalMigration();
		expect(retried).toMatchObject({ action: 'retry-migration', status: 'recovered', recovered: true });
		expect(manager.getRecoveryRequired()?.reason).toBe('configuration-rollback-failed');
		expect(vault.files.has(RECOVERY_JOURNAL_TEMP_PATH)).toBe(false);
		expect(vault.files.has(RECOVERY_JOURNAL_PATH)).toBe(true);
	});
});
