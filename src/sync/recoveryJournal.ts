import type { App } from 'obsidian';
import type { SubjectPathState } from './localSubjectRegistry';
import type { RecoveryAttempt, RecoveryRequiredState } from './syncManager';
import type { RecoveryCreatedFileExpectation, RecoveryRenameExpectation } from './syncTransaction';
import type { SyncResultWithRollback } from './syncStatus';
import { hashRecoveryContent } from './recoveryContent';

export const RECOVERY_JOURNAL_PATH = '.bangumi-sync-recovery.json';
export const RECOVERY_JOURNAL_TEMP_PATH = '.bangumi-sync-recovery.tmp.json';
export const RECOVERY_JOURNAL_PREVIOUS_PATH = '.bangumi-sync-recovery.previous.json';
export const RECOVERY_JOURNAL_MIGRATION_TEMP_PATH = '.bangumi-sync-recovery.migration.tmp.json';

export interface RecoveryBinaryContentExpectation {
	path: string;
	originalByteLength: number;
	originalSha256: string;
	originalContentBase64: string;
}

export type PersistentConfigurationValue = null | boolean | number | string | PersistentConfigurationValue[] | { [key: string]: PersistentConfigurationValue };
export type PersistentConfigurationSnapshot = { [key: string]: PersistentConfigurationValue };

export interface RuntimeConfigurationRecoveryFacts {
	previousSettings: Record<string, unknown>;
	candidateSettings: Record<string, unknown>;
	currentSettings: Record<string, unknown>;
	diskSettings: Record<string, unknown>;
	managerConfig: Record<string, unknown>;
}

export interface PersistentConfigurationRecoveryFacts {
	previousSettings: PersistentConfigurationSnapshot;
	candidateSettings: PersistentConfigurationSnapshot;
	currentSettings: PersistentConfigurationSnapshot;
	diskSettings: PersistentConfigurationSnapshot;
	managerConfig: PersistentConfigurationSnapshot;
	accessTokenChanged: boolean;
	previousAccessTokenSha256?: string;
	candidateAccessTokenSha256?: string;
}

/** Compatibility name retained for runtime callers; only persistent facts are journaled. */
export type ConfigurationRecoveryFacts = PersistentConfigurationRecoveryFacts;

function isSecretKey(key: string): boolean {
	const normalized = key.replace(/[\s_-]/gu, '').toLowerCase();
	return normalized === 'token' || normalized === 'accesstoken' || normalized === 'refreshtoken'
		|| normalized === 'authtoken' || normalized === 'bearertoken' || normalized === 'authorization'
		|| normalized === 'apikey' || normalized === 'secret' || normalized === 'clientsecret' || normalized === 'password'
		|| normalized.endsWith('token') || normalized.endsWith('secret');
}

function collectLegacySecrets(value: unknown, secrets = new Set<string>()): Set<string> {
	if (Array.isArray(value)) {
		for (const item of value) collectLegacySecrets(item, secrets);
		return secrets;
	}
	if (!isRecord(value)) return secrets;
	for (const [key, child] of Object.entries(value)) {
		if (isSecretKey(key) && typeof child === 'string' && child.length > 0) secrets.add(child);
		collectLegacySecrets(child, secrets);
	}
	return secrets;
}

function redactLegacyJournalStrings(value: unknown, secrets: readonly string[]): unknown {
	if (typeof value === 'string') {
		let redacted = value;
		for (const secret of secrets) redacted = redacted.split(secret).join('[REDACTED]');
		return redacted.replace(/Bearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]');
	}
	if (Array.isArray(value)) return value.map(item => redactLegacyJournalStrings(item, secrets));
	if (isRecord(value)) {
		const result: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value)) result[key] = redactLegacyJournalStrings(child, secrets);
		return result;
	}
	return value;
}

function serializedContainsSecret(serialized: string, secrets: readonly string[]): boolean {
	return secrets.some(secret => secret.length > 0 && serialized.includes(secret));
}

function sanitizePersistentValue(value: unknown, key?: string): PersistentConfigurationValue | undefined {
	if (key !== undefined && isSecretKey(key)) return undefined;
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (Array.isArray(value)) return value.map(item => sanitizePersistentValue(item)).filter((item): item is PersistentConfigurationValue => item !== undefined);
	if (isRecord(value)) {
		const result: PersistentConfigurationSnapshot = {};
		for (const [childKey, childValue] of Object.entries(value)) {
			const sanitized = sanitizePersistentValue(childValue, childKey);
			if (sanitized !== undefined) result[childKey] = sanitized;
		}
		return result;
	}
	return undefined;
}

export function sanitizeConfigurationRecoveryFacts(
	runtime: RuntimeConfigurationRecoveryFacts,
	hashes: { previousAccessTokenSha256?: string; candidateAccessTokenSha256?: string } = {},
): PersistentConfigurationRecoveryFacts {
	const snapshot = (value: Record<string, unknown>): PersistentConfigurationSnapshot => sanitizePersistentValue(value) as PersistentConfigurationSnapshot;
	return {
		previousSettings: snapshot(runtime.previousSettings), candidateSettings: snapshot(runtime.candidateSettings),
		currentSettings: snapshot(runtime.currentSettings), diskSettings: snapshot(runtime.diskSettings),
		managerConfig: snapshot(runtime.managerConfig),
		accessTokenChanged: runtime.previousSettings.accessToken !== runtime.candidateSettings.accessToken,
		...hashes,
	};
}

export function detectLegacyConfigurationJournal(value: unknown): value is Record<string, unknown> & {
	configurationFacts: Record<string, unknown>;
} {
	if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.configurationFacts)) return false;
	const configurationFacts = value.configurationFacts;
	return !Object.prototype.hasOwnProperty.call(configurationFacts, 'accessTokenChanged')
		&& ['previousSettings', 'candidateSettings', 'currentSettings', 'diskSettings', 'managerConfig']
			.every(field => isRecord(configurationFacts[field]));
}

/** Migrate the known 6.11.1 configuration-facts shape without creating a secret-bearing backup. */
export async function migrateLegacyConfigurationJournal(value: unknown): Promise<PersistentRecoveryJournal | null> {
	if (!detectLegacyConfigurationJournal(value)) return null;
	const legacy = value.configurationFacts;
	const runtime = legacy as unknown as RuntimeConfigurationRecoveryFacts;
	const secrets = Array.from(collectLegacySecrets(value)).sort((left, right) => right.length - left.length);
	const redactedJournal = redactLegacyJournalStrings(value, secrets) as Record<string, unknown>;
	const previousToken = typeof runtime.previousSettings.accessToken === 'string' ? runtime.previousSettings.accessToken : undefined;
	const candidateToken = typeof runtime.candidateSettings.accessToken === 'string' ? runtime.candidateSettings.accessToken : undefined;
	const facts = sanitizeConfigurationRecoveryFacts(runtime, {
		previousAccessTokenSha256: previousToken !== undefined ? await hashRecoveryContent(previousToken) : undefined,
		candidateAccessTokenSha256: candidateToken !== undefined ? await hashRecoveryContent(candidateToken) : undefined,
	});
	return { ...redactedJournal, configurationFacts: facts } as unknown as PersistentRecoveryJournal;
}

export async function selectPreviousAccessToken(options: {
	accessTokenChanged: boolean;
	previousAccessTokenSha256?: string;
	diskToken?: string;
	runtimeToken?: string;
	runtimePreviousToken?: string;
}): Promise<string | undefined> {
	const matchesPrevious = async (token: string | undefined): Promise<boolean> => token !== undefined
		&& (options.previousAccessTokenSha256 === undefined
			? !options.accessTokenChanged
			: await hashRecoveryContent(token) === options.previousAccessTokenSha256);
	if (options.accessTokenChanged) {
		if (await matchesPrevious(options.runtimePreviousToken)) return options.runtimePreviousToken;
		if (await matchesPrevious(options.diskToken)) return options.diskToken;
		return undefined;
	}
	if (await matchesPrevious(options.diskToken)) return options.diskToken;
	if (await matchesPrevious(options.runtimeToken)) return options.runtimeToken;
	return undefined;
}

export function redactConfigurationRecoveryMessage(message: string, runtime: RuntimeConfigurationRecoveryFacts, additionalSecrets: readonly string[] = []): string {
	const secrets = new Set(additionalSecrets.filter(value => value.length > 0));
	const visit = (value: unknown, key?: string): void => {
		if (key !== undefined && isSecretKey(key) && typeof value === 'string' && value.length > 0) secrets.add(value);
		if (Array.isArray(value)) value.forEach(item => visit(item));
		else if (isRecord(value)) Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
	};
	visit(runtime);
	let redacted = message;
	for (const secret of Array.from(secrets).sort((left, right) => right.length - left.length)) redacted = redacted.split(secret).join('[REDACTED]');
	return redacted.replace(/Bearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]');
}

export interface PersistentRecoveryJournal {
	schemaVersion: 1;
	journalId: string;
	pluginVersion: string;
	state: 'active' | 'awaiting-decision' | 'rolling-back' | 'rollback-failed' | 'recovery-required' | 'committed-cleanup-pending' | 'rolled-back-cleanup-pending';
	createdAt: number;
	updatedAt: number;
	scanRoot: string;
	affectedSubjectIds: number[];
	originalPathStates: Record<string, SubjectPathState>;
	subjectExpectations: RecoveryRequiredState['subjectExpectations'];
	contentExpectations: RecoveryRequiredState['contentExpectations'];
	createdPathExpectations: RecoveryCreatedFileExpectation[];
	renameExpectations: RecoveryRenameExpectation[];
	createdResourcePaths: string[];
	updatedResourceExpectations: RecoveryBinaryContentExpectation[];
	orphanTemporaryPaths: string[];
	configurationFacts?: ConfigurationRecoveryFacts;
	resultSnapshot: SyncResultWithRollback;
	attempts: RecoveryAttempt[];
	blockingIssue?: string;
}

export type RecoveryJournalLoadResult =
	| { status: 'none' }
	| { status: 'loaded'; journal: PersistentRecoveryJournal; recoveredFromPrevious: boolean; temporaryFilePresent: boolean }
	| { status: 'corrupt'; message: string; backupPath: string; backupPaths?: string[] }
	| { status: 'unsupported'; schemaVersion: unknown; backupPath: string; backupPaths?: string[] }
	| { status: 'migration-failed'; message: string; sourcePath: string };

export type PersistentRecoveryJournalValidation =
	| { valid: true; journal: PersistentRecoveryJournal }
	| { valid: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object') return false;
	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function finiteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
	return finiteNumber(value) && Number.isInteger(value) && value >= 0;
}

function positiveSubjectId(value: unknown): value is number {
	return finiteNumber(value) && Number.isInteger(value) && value > 0;
}

function validateString(value: unknown, path: string, errors: string[], nonEmpty = false): value is string {
	if (typeof value !== 'string' || (nonEmpty && value.trim().length === 0)) {
		errors.push(`${path} must be ${nonEmpty ? 'a non-empty ' : 'a '}string.`);
		return false;
	}
	return true;
}

function validateArray(value: unknown, path: string, errors: string[]): value is unknown[] {
	if (!Array.isArray(value)) {
		errors.push(`${path} must be an array.`);
		return false;
	}
	return true;
}

function validatePathState(value: unknown, path: string, errors: string[]): void {
	if (!isRecord(value)) { errors.push(`${path} must be a plain object.`); return; }
	if (!positiveSubjectId(value.subjectId)) errors.push(`${path}.subjectId must be a positive integer.`);
	validateString(value.currentPath, `${path}.currentPath`, errors);
	if (value.lastManagedPath !== undefined) validateString(value.lastManagedPath, `${path}.lastManagedPath`, errors);
	if (!['managed', 'user-renamed'].includes(String(value.namingState))) errors.push(`${path}.namingState is invalid.`);
}

function validateRollback(value: unknown, path: string, errors: string[]): void {
	if (!isRecord(value)) { errors.push(`${path} must be a plain object.`); return; }
	for (const field of ['attempted', 'changed']) if (typeof value[field] !== 'boolean') errors.push(`${path}.${field} must be boolean.`);
	for (const field of ['deletedCreatedFiles', 'restoredContents', 'restoredPaths', 'failed']) {
		if (!nonNegativeInteger(value[field])) errors.push(`${path}.${field} must be a non-negative integer.`);
	}
	if (value.failures !== undefined && validateArray(value.failures, `${path}.failures`, errors)) {
		value.failures.forEach((item, index) => {
			if (!isRecord(item)) { errors.push(`${path}.failures[${index}] must be a plain object.`); return; }
			if (!['delete-created', 'restore-content', 'stage-path', 'restore-path', 'rescan', 'restore-path-states', 'restore-binary', 'post-validation'].includes(String(item.operation))) errors.push(`${path}.failures[${index}].operation is invalid.`);
			validateString(item.path, `${path}.failures[${index}].path`, errors);
			validateString(item.message, `${path}.failures[${index}].message`, errors);
		});
	}
}

function validateResultSnapshot(value: unknown, errors: string[]): void {
	const path = 'resultSnapshot';
	if (!isRecord(value)) { errors.push(`${path} must be a plain object.`); return; }
	for (const field of ['total', 'added', 'skipped', 'errors', 'created', 'updated', 'unchanged', 'renamed', 'collisionResolved', 'failed', 'duration', 'rolledBack']) {
		if (!nonNegativeInteger(value[field])) errors.push(`${path}.${field} must be a non-negative integer.`);
	}
	if (typeof value.success !== 'boolean') errors.push(`${path}.success must be boolean.`);
	if (typeof value.wasCancelled !== 'boolean') errors.push(`${path}.wasCancelled must be boolean.`);
	if (typeof value.canRollback !== 'boolean') errors.push(`${path}.canRollback must be boolean.`);
	if (!['success', 'partial-success', 'failed', 'cancelled', 'rolled-back', 'rollback-failed'].includes(String(value.completion))) errors.push(`${path}.completion is invalid.`);
	for (const field of ['errorDetails', 'outcomes', 'warnings', 'batchFiles']) validateArray(value[field], `${path}.${field}`, errors);
	if (Array.isArray(value.errorDetails)) value.errorDetails.forEach((item, index) => validateString(item, `${path}.errorDetails[${index}]`, errors));
	for (const field of ['outcomes', 'warnings', 'batchFiles'] as const) {
		if (Array.isArray(value[field])) value[field].forEach((item, index) => {
			if (!isRecord(item)) errors.push(`${path}.${field}[${index}] must be a plain object.`);
		});
	}
	if (value.rollback !== undefined) validateRollback(value.rollback, `${path}.rollback`, errors);
}

function validateDiagnostics(value: unknown, path: string, errors: string[]): void {
	if (!validateArray(value, path, errors)) return;
	const allowedCodes = new Set([
		'rollback-step-failed', 'rescan-failed', 'state-restore-failed', 'persisted-state-mismatch',
		'incremental-state-mismatch', 'blocking-local-file', 'duplicate-subject-id', 'temporary-file',
		'unexpected-subject-file', 'missing-subject-file', 'subject-path-mismatch',
		'subject-identity-mismatch', 'content-mismatch', 'content-file-missing', 'unexpected-created-path',
	]);
	value.forEach((item, index) => {
		if (!isRecord(item)) { errors.push(`${path}[${index}] must be a plain object.`); return; }
		if (!validateString(item.code, `${path}[${index}].code`, errors, true) || !allowedCodes.has(item.code)) {
			errors.push(`${path}[${index}].code is invalid.`);
		}
		validateString(item.message, `${path}[${index}].message`, errors);
	});
}

function validateBase64(value: unknown, path: string, expectedByteLength: unknown, errors: string[]): void {
	if (!validateString(value, path, errors)) return;
	if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
		errors.push(`${path} must be canonical base64.`);
		return;
	}
	const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
	const decodedLength = value.length === 0 ? 0 : (value.length / 4) * 3 - padding;
	if (nonNegativeInteger(expectedByteLength) && decodedLength !== expectedByteLength) {
		errors.push(`${path} decoded length must equal originalByteLength.`);
	}
}

/** Validate every recovery fact consumed by startup, rollback, diagnostics, and the Recovery Center. */
export function validatePersistentRecoveryJournal(value: unknown): PersistentRecoveryJournalValidation {
	const errors: string[] = [];
	if (!isRecord(value)) return { valid: false, errors: ['journal must be a plain object.'] };
	if (value.schemaVersion !== 1) errors.push('schemaVersion must equal 1.');
	validateString(value.journalId, 'journalId', errors, true);
	validateString(value.pluginVersion, 'pluginVersion', errors);
	if (!['active', 'awaiting-decision', 'rolling-back', 'rollback-failed', 'recovery-required', 'committed-cleanup-pending', 'rolled-back-cleanup-pending'].includes(String(value.state))) errors.push('state is invalid.');
	for (const field of ['createdAt', 'updatedAt']) if (!finiteNumber(value[field])) errors.push(`${field} must be a finite number.`);
	validateString(value.scanRoot, 'scanRoot', errors);
	if (validateArray(value.affectedSubjectIds, 'affectedSubjectIds', errors)) value.affectedSubjectIds.forEach((id, index) => {
		if (!positiveSubjectId(id)) errors.push(`affectedSubjectIds[${index}] must be a positive integer.`);
	});
	if (!isRecord(value.originalPathStates)) errors.push('originalPathStates must be a plain object.');
	else Object.entries(value.originalPathStates).forEach(([key, state]) => validatePathState(state, `originalPathStates.${key}`, errors));
	if (validateArray(value.subjectExpectations, 'subjectExpectations', errors)) value.subjectExpectations.forEach((item, index) => {
		const path = `subjectExpectations[${index}]`;
		if (!isRecord(item)) { errors.push(`${path} must be a plain object.`); return; }
		if (!positiveSubjectId(item.subjectId)) errors.push(`${path}.subjectId must be a positive integer.`);
		if (typeof item.expectedToExist !== 'boolean') errors.push(`${path}.expectedToExist must be boolean.`);
		if (item.expectedPath !== undefined) validateString(item.expectedPath, `${path}.expectedPath`, errors);
		if (item.expectedSubjectId !== undefined && !positiveSubjectId(item.expectedSubjectId)) errors.push(`${path}.expectedSubjectId must be a positive integer.`);
	});
	if (validateArray(value.contentExpectations, 'contentExpectations', errors)) value.contentExpectations.forEach((item, index) => {
		const path = `contentExpectations[${index}]`;
		if (!isRecord(item)) { errors.push(`${path} must be a plain object.`); return; }
		if (!positiveSubjectId(item.subjectId)) errors.push(`${path}.subjectId must be a positive integer.`);
		validateString(item.path, `${path}.path`, errors);
		if (typeof item.expectedContentHash !== 'string' || !/^[a-f0-9]{64}$/iu.test(item.expectedContentHash)) errors.push(`${path}.expectedContentHash must be a 64-character SHA-256 hex string.`);
		if (!nonNegativeInteger(item.originalContentLength)) errors.push(`${path}.originalContentLength must be a non-negative integer.`);
		if (validateString(item.originalContent, `${path}.originalContent`, errors)
			&& nonNegativeInteger(item.originalContentLength)
			&& item.originalContent.length !== item.originalContentLength) {
			errors.push(`${path}.originalContentLength must equal originalContent.length.`);
		}
	});
	if (validateArray(value.createdPathExpectations, 'createdPathExpectations', errors)) value.createdPathExpectations.forEach((item, index) => {
		const path = `createdPathExpectations[${index}]`;
		if (!isRecord(item)) { errors.push(`${path} must be a plain object.`); return; }
		if (!(positiveSubjectId(item.subjectId) || item.subjectId === -1)) errors.push(`${path}.subjectId must be positive or the internal -1 sentinel.`);
		validateString(item.createdPath, `${path}.createdPath`, errors);
		if (item.expectedToExistAfterRollback !== false) errors.push(`${path}.expectedToExistAfterRollback must be false.`);
	});
	if (validateArray(value.renameExpectations, 'renameExpectations', errors)) value.renameExpectations.forEach((item, index) => {
		const path = `renameExpectations[${index}]`;
		if (!isRecord(item)) { errors.push(`${path} must be a plain object.`); return; }
		if (!positiveSubjectId(item.subjectId)) errors.push(`${path}.subjectId must be a positive integer.`);
		for (const field of ['originalPath', 'finalPath', 'expectedTerminalPath']) validateString(item[field], `${path}.${field}`, errors);
		if (item.temporaryPath !== undefined) validateString(item.temporaryPath, `${path}.temporaryPath`, errors);
	});
	if (validateArray(value.createdResourcePaths, 'createdResourcePaths', errors)) value.createdResourcePaths.forEach((item, index) => validateString(item, `createdResourcePaths[${index}]`, errors));
	const updatedResources = value.updatedResourceExpectations ?? [];
	if (validateArray(updatedResources, 'updatedResourceExpectations', errors)) updatedResources.forEach((item, index) => {
		const path = `updatedResourceExpectations[${index}]`;
		if (!isRecord(item)) { errors.push(`${path} must be a plain object.`); return; }
		validateString(item.path, `${path}.path`, errors);
		if (!nonNegativeInteger(item.originalByteLength)) errors.push(`${path}.originalByteLength must be a non-negative integer.`);
		if (typeof item.originalSha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(item.originalSha256)) errors.push(`${path}.originalSha256 must be a 64-character SHA-256 hex string.`);
		validateBase64(item.originalContentBase64, `${path}.originalContentBase64`, item.originalByteLength, errors);
	});
	const orphanPaths = value.orphanTemporaryPaths ?? [];
	if (validateArray(orphanPaths, 'orphanTemporaryPaths', errors)) orphanPaths.forEach((item, index) => validateString(item, `orphanTemporaryPaths[${index}]`, errors));
	if (value.configurationFacts !== undefined) {
		if (!isRecord(value.configurationFacts)) errors.push('configurationFacts must be a plain object.');
		else {
			for (const field of ['previousSettings', 'candidateSettings', 'currentSettings', 'diskSettings', 'managerConfig']) {
				if (!isRecord(value.configurationFacts[field])) errors.push(`configurationFacts.${field} must be a plain object.`);
			}
			if (typeof value.configurationFacts.accessTokenChanged !== 'boolean') errors.push('configurationFacts.accessTokenChanged must be boolean.');
			for (const field of ['previousAccessTokenSha256', 'candidateAccessTokenSha256']) {
				const hash = value.configurationFacts[field];
				if (hash !== undefined && (typeof hash !== 'string' || !/^[a-f0-9]{64}$/iu.test(hash))) {
					errors.push(`configurationFacts.${field} must be a SHA-256 hex string.`);
				}
			}
			const visit = (candidate: unknown, path: string): void => {
				if (Array.isArray(candidate)) {
					candidate.forEach((child, index) => visit(child, `${path}[${index}]`));
					return;
				}
				if (!isRecord(candidate)) return;
				for (const [key, child] of Object.entries(candidate)) {
					if (isSecretKey(key)) errors.push(`${path}.${key} is not allowed in a persistent recovery journal.`);
					visit(child, `${path}.${key}`);
				}
			};
			visit(value.configurationFacts, 'configurationFacts');
		}
	}
	validateResultSnapshot(value.resultSnapshot, errors);
	if (validateArray(value.attempts, 'attempts', errors)) value.attempts.forEach((item, index) => {
		const path = `attempts[${index}]`;
		if (!isRecord(item)) { errors.push(`${path} must be a plain object.`); return; }
		if (!['automatic-rollback', 'retry-rollback', 'retry-cleanup', 'retry-migration', 'confirm-manual', 'rescan'].includes(String(item.action))) errors.push(`${path}.action is invalid.`);
		if (!['rolled-back', 'rollback-failed', 'recovered', 'blocked', 'failed', 'no-recovery'].includes(String(item.status))) errors.push(`${path}.status is invalid.`);
		for (const field of ['startedAt', 'finishedAt']) if (!finiteNumber(item[field])) errors.push(`${path}.${field} must be a finite number.`);
		validateDiagnostics(item.diagnostics, `${path}.diagnostics`, errors);
		if (item.rollback !== undefined) validateRollback(item.rollback, `${path}.rollback`, errors);
		if (item.error !== undefined) validateString(item.error, `${path}.error`, errors);
	});
	if (value.blockingIssue !== undefined) validateString(value.blockingIssue, 'blockingIssue', errors);
	if (errors.length > 0) return { valid: false, errors };
	return {
		valid: true,
		journal: {
			...(value as unknown as PersistentRecoveryJournal),
			updatedResourceExpectations: updatedResources as RecoveryBinaryContentExpectation[],
			orphanTemporaryPaths: orphanPaths as string[],
		},
	};
}

export class RecoveryJournalStore {
	private writeQueue: Promise<void> = Promise.resolve();
	constructor(private readonly app: App) {}

	write(journal: PersistentRecoveryJournal): Promise<void> {
		const run = this.writeQueue.then(() => this.writeNow(journal));
		this.writeQueue = run.then(() => undefined, () => undefined);
		return run;
	}

	private async writeNow(journal: PersistentRecoveryJournal): Promise<void> {
		const adapter = this.app.vault.adapter;
		const serialized = JSON.stringify({ ...journal, updatedAt: Date.now() }, null, 2);
		await adapter.write(RECOVERY_JOURNAL_TEMP_PATH, serialized);
		const currentExists = await adapter.exists(RECOVERY_JOURNAL_PATH);
		const previousExists = await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH);
		if (currentExists) {
			if (previousExists) await adapter.remove(RECOVERY_JOURNAL_PREVIOUS_PATH);
			await adapter.rename(RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH);
		}
		try {
			await adapter.rename(RECOVERY_JOURNAL_TEMP_PATH, RECOVERY_JOURNAL_PATH);
		} catch (error) {
			if (!await adapter.exists(RECOVERY_JOURNAL_PATH) && await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH)) {
				await adapter.rename(RECOVERY_JOURNAL_PREVIOUS_PATH, RECOVERY_JOURNAL_PATH);
			}
			throw error;
		}
		if (await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH)) await adapter.remove(RECOVERY_JOURNAL_PREVIOUS_PATH);
	}

	private async removeMigrationStaging(): Promise<void> {
		try {
			if (await this.app.vault.adapter.exists(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH)) {
				await this.app.vault.adapter.remove(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH);
			}
		} catch {
			// A complete sanitized staging candidate is safer than copying the legacy source.
		}
	}

	private async restoreLegacySource(sourcePath: string, original: string, sanitized: string): Promise<void> {
		const adapter = this.app.vault.adapter;
		try {
			await adapter.write(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, sanitized);
			const staged = validatePersistentRecoveryJournal(JSON.parse(
				await adapter.read(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH),
			));
			if (!staged.valid) return;
		} catch {
			// The promoted source remains the last complete candidate when staging cannot be recreated.
			return;
		}
		try {
			if (await adapter.exists(sourcePath)) await adapter.remove(sourcePath);
			await adapter.write(sourcePath, original);
			await this.removeMigrationStaging();
		} catch {
			// Keep the verified sanitized staging candidate when the legacy source cannot be restored.
		}
	}

	private async migrateCandidate(sourcePath: string, parsed: unknown): Promise<PersistentRecoveryJournal | null> {
		const migrated = await migrateLegacyConfigurationJournal(parsed);
		if (!migrated) return null;
		const validation = validatePersistentRecoveryJournal(migrated);
		if (!validation.valid) throw new Error('Migrated legacy recovery journal is invalid.');
		const serialized = JSON.stringify(validation.journal, null, 2);
		const secrets = Array.from(collectLegacySecrets(parsed)).sort((left, right) => right.length - left.length);
		if (serializedContainsSecret(serialized, secrets)) throw new Error('Migrated legacy recovery journal still contains a secret.');
		const adapter = this.app.vault.adapter;
		const original = await adapter.read(sourcePath);
		await this.removeMigrationStaging();
		try {
			await adapter.write(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, serialized);
			const stagedText = await adapter.read(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH);
			const staged = validatePersistentRecoveryJournal(JSON.parse(stagedText));
			if (!staged.valid || serializedContainsSecret(stagedText, secrets)) throw new Error('Migration staging validation failed.');
		} catch {
			await this.removeMigrationStaging();
			throw new Error('Legacy recovery journal migration staging failed.');
		}
		try {
			await adapter.remove(sourcePath);
		} catch {
			await this.removeMigrationStaging();
			throw new Error('Legacy recovery journal source could not be replaced.');
		}
		try {
			await adapter.rename(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, sourcePath);
		} catch {
			await this.restoreLegacySource(sourcePath, original, serialized);
			throw new Error('Legacy recovery journal migration promotion failed.');
		}
		try {
			const persistedText = await adapter.read(sourcePath);
			const persisted = validatePersistentRecoveryJournal(JSON.parse(persistedText));
			if (!persisted.valid || serializedContainsSecret(persistedText, secrets)) throw new Error('Migration promotion validation failed.');
			return persisted.journal;
		} catch {
			await this.restoreLegacySource(sourcePath, original, serialized);
			throw new Error('Legacy recovery journal migration could not be verified.');
		}
	}

	private async sanitizeLegacyTemporaryCandidate(sourcePath: string): Promise<'not-legacy' | 'sanitized' | 'migration-failed'> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(await this.app.vault.adapter.read(sourcePath));
		} catch {
			return 'not-legacy';
		}
		if (!detectLegacyConfigurationJournal(parsed)) return 'not-legacy';
		try {
			const migrated = await this.migrateCandidate(sourcePath, parsed);
			if (!migrated) return 'not-legacy';
			return 'sanitized';
		} catch {
			return 'migration-failed';
		}
	}

	async load(): Promise<RecoveryJournalLoadResult> {
		const adapter = this.app.vault.adapter;
		let hasCurrent = await adapter.exists(RECOVERY_JOURNAL_PATH);
		const hasPrevious = await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH);
		let temporaryFilePresent = await adapter.exists(RECOVERY_JOURNAL_TEMP_PATH);
		const migrationStagingPresent = await adapter.exists(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH);
		if (migrationStagingPresent && !hasCurrent && !hasPrevious && !temporaryFilePresent) {
			try {
				const stagedText = await adapter.read(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH);
				const staged = validatePersistentRecoveryJournal(JSON.parse(stagedText));
				if (!staged.valid) throw new Error('Migration staging journal is invalid.');
				await adapter.rename(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, RECOVERY_JOURNAL_PATH);
				hasCurrent = true;
			} catch {
				if (await adapter.exists(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH)) {
					const backupPath = `.bangumi-sync-recovery.corrupt-migration-${Date.now()}.json`;
					try {
						await adapter.rename(RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, backupPath);
						return { status: 'corrupt', message: 'Recovery journal migration staging was invalid.', backupPath };
					} catch {
						return { status: 'migration-failed', sourcePath: RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, message: 'Recovery journal migration staging could not be preserved as a backup.' };
					}
				}
				return { status: 'migration-failed', sourcePath: RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, message: 'Recovery journal migration staging could not be promoted.' };
			}
		}
		let temporaryMigration: 'not-legacy' | 'sanitized' | 'migration-failed' = 'not-legacy';
		if (temporaryFilePresent) {
			temporaryMigration = await this.sanitizeLegacyTemporaryCandidate(RECOVERY_JOURNAL_TEMP_PATH);
			if (temporaryMigration === 'migration-failed') {
				return { status: 'migration-failed', sourcePath: RECOVERY_JOURNAL_TEMP_PATH, message: 'Legacy temporary configuration journal migration failed.' };
			}
		}
		temporaryFilePresent = await adapter.exists(RECOVERY_JOURNAL_TEMP_PATH);
		if (temporaryMigration === 'sanitized' && !hasCurrent && !hasPrevious && temporaryFilePresent) {
			try {
				const sanitized = validatePersistentRecoveryJournal(JSON.parse(await adapter.read(RECOVERY_JOURNAL_TEMP_PATH)));
				if (!sanitized.valid) throw new Error('Sanitized temporary journal is invalid.');
				await adapter.rename(RECOVERY_JOURNAL_TEMP_PATH, RECOVERY_JOURNAL_PATH);
				hasCurrent = true;
				temporaryFilePresent = false;
			} catch {
				return { status: 'migration-failed', sourcePath: RECOVERY_JOURNAL_TEMP_PATH, message: 'Sanitized temporary recovery journal could not be promoted.' };
			}
		}
		if (!hasCurrent && !hasPrevious && temporaryFilePresent) {
			const backupPath = `.bangumi-sync-recovery.corrupt-temp-${Date.now()}.json`;
			await adapter.rename(RECOVERY_JOURNAL_TEMP_PATH, backupPath);
			return { status: 'corrupt', message: 'Only an interrupted temporary recovery journal remained.', backupPath };
		}
		if (!hasCurrent && !hasPrevious) return { status: 'none' };
		if (temporaryFilePresent) {
			const interruptedPath = `.bangumi-sync-recovery.interrupted-${Date.now()}.json`;
			await adapter.rename(RECOVERY_JOURNAL_TEMP_PATH, interruptedPath);
		}
		const invalid: Array<{ status: 'corrupt' | 'unsupported'; message?: string; schemaVersion?: unknown; backupPath: string }> = [];
		const valid: Array<{ path: string; journal: PersistentRecoveryJournal }> = [];
		for (const sourcePath of [RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH]) {
			if (!await adapter.exists(sourcePath)) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(await adapter.read(sourcePath));
			} catch (error) {
				const backupPath = `.bangumi-sync-recovery.corrupt-${sourcePath === RECOVERY_JOURNAL_PATH ? 'current' : 'previous'}-${Date.now()}.json`;
				await adapter.rename(sourcePath, backupPath);
				invalid.push({ status: 'corrupt', message: error instanceof Error ? error.message : 'Invalid JSON.', backupPath });
				continue;
			}
			const schemaVersion = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
			if (schemaVersion !== 1) {
				const backupPath = `.bangumi-sync-recovery.unsupported-${sourcePath === RECOVERY_JOURNAL_PATH ? 'current' : 'previous'}-${Date.now()}.json`;
				await adapter.rename(sourcePath, backupPath);
				invalid.push({ status: 'unsupported', schemaVersion, backupPath });
				continue;
			}
			let candidate = parsed;
			if (detectLegacyConfigurationJournal(parsed)) {
				try {
					const migrated = await this.migrateCandidate(sourcePath, parsed);
					if (migrated) candidate = migrated;
				} catch {
					return { status: 'migration-failed', sourcePath, message: 'Legacy configuration journal migration failed.' };
				}
			}
			const validation = validatePersistentRecoveryJournal(candidate);
			if (!validation.valid) {
				const backupPath = `.bangumi-sync-recovery.corrupt-structure-${sourcePath === RECOVERY_JOURNAL_PATH ? 'current' : 'previous'}-${Date.now()}.json`;
				await adapter.rename(sourcePath, backupPath);
				invalid.push({ status: 'corrupt', message: validation.errors.slice(0, 8).join(' '), backupPath });
				continue;
			}
			valid.push({ path: sourcePath, journal: validation.journal });
		}
		if (valid.length > 0) {
			const selected = valid.find(item => item.path === RECOVERY_JOURNAL_PATH) ?? valid[0];
			return { status: 'loaded', journal: selected.journal, recoveredFromPrevious: selected.path === RECOVERY_JOURNAL_PREVIOUS_PATH, temporaryFilePresent };
		}
		const first = invalid[0];
		if (first?.status === 'unsupported') return { status: 'unsupported', schemaVersion: first.schemaVersion, backupPath: first.backupPath, backupPaths: invalid.map(item => item.backupPath) };
		return { status: 'corrupt', message: invalid.length > 1 ? `No valid recovery journal candidate remained. ${invalid.map(item => item.message).filter(Boolean).join(' ')}` : (first?.message ?? 'Recovery journal is unavailable.'), backupPath: first?.backupPath ?? '', backupPaths: invalid.map(item => item.backupPath) };
	}

	async clear(): Promise<void> {
		await this.writeQueue;
		for (const path of [RECOVERY_JOURNAL_PREVIOUS_PATH, RECOVERY_JOURNAL_TEMP_PATH, RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, RECOVERY_JOURNAL_PATH]) {
			if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
		}
		for (const path of [RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_TEMP_PATH, RECOVERY_JOURNAL_MIGRATION_TEMP_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH]) {
			if (await this.app.vault.adapter.exists(path)) throw new Error(`Recovery journal cleanup incomplete: ${path}`);
		}
	}
}
