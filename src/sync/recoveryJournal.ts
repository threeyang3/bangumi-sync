import type { App } from 'obsidian';
import type { SubjectPathState } from './localSubjectRegistry';
import type { RecoveryAttempt, RecoveryRequiredState } from './syncManager';
import type { RecoveryCreatedFileExpectation, RecoveryRenameExpectation } from './syncTransaction';
import type { SyncResultWithRollback } from './syncStatus';

export const RECOVERY_JOURNAL_PATH = '.bangumi-sync-recovery.json';
export const RECOVERY_JOURNAL_TEMP_PATH = '.bangumi-sync-recovery.tmp.json';
export const RECOVERY_JOURNAL_PREVIOUS_PATH = '.bangumi-sync-recovery.previous.json';

export interface RecoveryBinaryContentExpectation {
	path: string;
	originalByteLength: number;
	originalSha256: string;
	originalContentBase64: string;
}

export interface ConfigurationRecoveryFacts {
	previousSettings: unknown;
	candidateSettings: unknown;
	currentSettings: unknown;
	diskSettings: unknown;
	managerConfig: unknown;
}

export interface PersistentRecoveryJournal {
	schemaVersion: 1;
	journalId: string;
	pluginVersion: string;
	state: 'active' | 'awaiting-decision' | 'rolling-back' | 'rollback-failed' | 'recovery-required';
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
	| { status: 'corrupt'; message: string; backupPath: string }
	| { status: 'unsupported'; schemaVersion: unknown; backupPath: string };

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
	if (!['active', 'awaiting-decision', 'rolling-back', 'rollback-failed', 'recovery-required'].includes(String(value.state))) errors.push('state is invalid.');
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
		else for (const field of ['previousSettings', 'candidateSettings', 'currentSettings', 'diskSettings', 'managerConfig']) {
			if (!isRecord(value.configurationFacts[field])) errors.push(`configurationFacts.${field} must be a plain object.`);
		}
	}
	validateResultSnapshot(value.resultSnapshot, errors);
	if (validateArray(value.attempts, 'attempts', errors)) value.attempts.forEach((item, index) => {
		const path = `attempts[${index}]`;
		if (!isRecord(item)) { errors.push(`${path} must be a plain object.`); return; }
		if (!['automatic-rollback', 'retry-rollback', 'confirm-manual', 'rescan'].includes(String(item.action))) errors.push(`${path}.action is invalid.`);
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
		if (await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH)) await adapter.remove(RECOVERY_JOURNAL_PREVIOUS_PATH);
		if (await adapter.exists(RECOVERY_JOURNAL_PATH)) await adapter.rename(RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH);
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

	async load(): Promise<RecoveryJournalLoadResult> {
		const adapter = this.app.vault.adapter;
		const hasCurrent = await adapter.exists(RECOVERY_JOURNAL_PATH);
		const hasPrevious = await adapter.exists(RECOVERY_JOURNAL_PREVIOUS_PATH);
		const temporaryFilePresent = await adapter.exists(RECOVERY_JOURNAL_TEMP_PATH);
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
		const sourcePath = hasCurrent ? RECOVERY_JOURNAL_PATH : RECOVERY_JOURNAL_PREVIOUS_PATH;
		let parsed: unknown;
		try {
			parsed = JSON.parse(await adapter.read(sourcePath));
		} catch (error) {
			const backupPath = `.bangumi-sync-recovery.corrupt-${Date.now()}.json`;
			await adapter.rename(sourcePath, backupPath);
			return { status: 'corrupt', message: error instanceof Error ? error.message : String(error), backupPath };
		}
		const schemaVersion = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
		if (schemaVersion !== 1) {
			const backupPath = `.bangumi-sync-recovery.unsupported-${Date.now()}.json`;
			await adapter.rename(sourcePath, backupPath);
			return { status: 'unsupported', schemaVersion, backupPath };
		}
		const validation = validatePersistentRecoveryJournal(parsed);
		if (!validation.valid) {
			const backupPath = `.bangumi-sync-recovery.corrupt-structure-${Date.now()}.json`;
			await adapter.rename(sourcePath, backupPath);
			return { status: 'corrupt', message: validation.errors.slice(0, 8).join(' '), backupPath };
		}
		return { status: 'loaded', journal: validation.journal, recoveredFromPrevious: !hasCurrent, temporaryFilePresent };
	}

	async clear(): Promise<void> {
		await this.writeQueue;
		for (const path of [RECOVERY_JOURNAL_PATH, RECOVERY_JOURNAL_TEMP_PATH, RECOVERY_JOURNAL_PREVIOUS_PATH]) {
			if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
		}
	}
}
