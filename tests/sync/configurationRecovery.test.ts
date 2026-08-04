import { describe, expect, it, vi } from 'vitest';
import type { ConfigurationRecoveryFacts } from '../../src/sync/recoveryJournal';
import { RECOVERY_JOURNAL_PATH } from '../../src/sync/recoveryJournal';
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

function facts(): ConfigurationRecoveryFacts {
	return {
		previousSettings: { accessToken: 'old-token' },
		candidateSettings: { accessToken: 'new-token' },
		currentSettings: { accessToken: 'new-token' },
		diskSettings: { accessToken: 'new-token' },
		managerConfig: { accessToken: 'old-token' },
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
		expect(recoverConfiguration).toHaveBeenCalledWith(recoveryFacts);
		expect(dependentRefresh).toHaveBeenCalledOnce();
		expect(manager.getRecoveryRequired()).toBeNull();
		expect(() => manager.ensureCanStartSync()).not.toThrow();
		expect(await vault.app.vault.adapter.exists(RECOVERY_JOURNAL_PATH)).toBe(false);
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
});
