/**
 * 同步管理器
 * 核心同步逻辑
 *
 * 功能：
 * 1. 使用用户自己的标签
 * 2. 通过扫描本地文件夹检测已同步条目
 * 3. 智能数量限制：如果未同步数量不够，同步所有未同步的
 * 4. 支持预览确认（手动同步）和直接同步（自动同步）
 * 5. 支持相关条目双向链接
 */

import { Notice, App, TFile, normalizePath } from 'obsidian';
import { BangumiClient } from '../api/client';
import { Subject, UserCollection, Episode, UserEpisodeCollection, SubjectType, RelatedSubject } from '../../common/api/types';
import { FileManager, FileWriteStatus } from '../../common/file/fileManager';
import { ImageHandler, ImageQuality } from '../../common/file/imageHandler';
import { IncrementalSync } from './incrementalSync';
import { determineSyncCompletion, SyncOptions, SyncResult, SyncProgress, SyncCancellationSignal, SyncResultWithRollback, SyncWarning } from './syncStatus';
import { parseCharacters } from '../../common/parser/characterParser';
import { generateFilePath, extractPathVars } from '../../common/template/pathTemplate';
import { applyNamedPropertyValuesToContent, CustomTemplates, generateContentByType } from '../template/contentTemplate';
import { getTypeLabel } from '../../common/template/defaultTemplates';
import { SyncPreviewItem } from '../ui/syncPreviewModal';
import { CoverLinkType, PathNamingStrategy } from '../settings/settings';
import { UserDataExtractor } from '../userData/userDataExtractor';
import { UserDataMerger } from '../userData/userDataMerger';
import { DataProtectionSettings, DEFAULT_DATA_PROTECTION_SETTINGS } from '../userData/types';
import { LocalPropertyModalResult, LocalPropertyValueMap } from '../ui/localPropertyModal';
import { buildExtraTemplateVarsFromPropertyValues, getTemplatePropertyGroupsForSubject } from '../template/templateProperties';
import { tn, tnFormat } from '../i18n/translations';
import { SubjectPathAllocation, SubjectPathResolver } from './subjectPathResolver';
import { RecoveryContentExpectation, RecoveryRenameExpectation, RollbackFailure, SyncRollbackResult, SyncTransaction, TransactionRecoveryExpectations, TransactionRename } from './syncTransaction';
import { cloneSyncManagerConfig } from './syncConfig';
import { SubjectDocumentService } from '../document/subjectDocumentService';
import {
	ConfigurationRecoveryFacts,
	PersistentRecoveryJournal,
	RecoveryBinaryContentExpectation,
	RecoveryJournalStore,
} from './recoveryJournal';
import { SubjectPathState } from './localSubjectRegistry';
import {
	formatDiagnosticReport,
	LocalSubjectDiagnosticReport,
	PathDiagnosticIssue,
	PathMigrationPreview,
} from './pathDiagnostics';
import { normalizePathCollisionKey } from '../../common/file/pathUtils';
import {
	collectSubjectExpectationDiagnostics,
	pathStatesEqual,
	RecoveryDiagnostic,
	RecoverySubjectExpectation,
} from './recoveryValidation';
import { decodeRecoveryBase64, encodeRecoveryBase64, hashRecoveryBytes, hashRecoveryContent } from './recoveryContent';
import { getRecoveryActionPolicy, RecoveryActionPolicy } from './recoveryPolicy';
export type { RecoveryDiagnostic, RecoverySubjectExpectation } from './recoveryValidation';

const MAX_BINARY_RECOVERY_BYTES = 16 * 1024 * 1024;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

type FullSubjectInfo = Awaited<ReturnType<BangumiClient['getFullSubjectInfo']>>;

interface PreparedCollection {
	collection: UserCollection;
	fullInfo: FullSubjectInfo;
	allocation: SubjectPathAllocation;
}

interface PreparationFailure {
	collection: UserCollection;
	error: string;
}

interface PreparedCollectionBatch {
	prepared: PreparedCollection[];
	failures: PreparationFailure[];
	renamed: TransactionRename[];
	groupKeyBySubjectId: Map<number, string>;
}

interface RenderedCollection {
	prepared: PreparedCollection;
	subject: Subject;
	filePath: string;
	content: string;
	fileExisted: boolean;
	shouldOverwrite: boolean;
	relations: RelatedSubject[];
}

type DeferredRelation = { subjectId: number; filePath: string; relations: RelatedSubject[] };

interface ExecutedTransactionGroup {
	transaction: SyncTransaction;
	outcomeIndexes: number[];
}

/**
 * 同步管理器配置
 */
export interface SyncManagerConfig {
	accessToken: string;
	pathTemplate: string;
	imagePathTemplate: string;
	notePathTemplate?: string;  // 笔记链接路径模板
	downloadImages: boolean;
	imageQuality: ImageQuality;
	imageUpdateExisting: boolean;
	scanFolderPath: string;  // 扫描本地文件夹的路径
	coverLinkType?: CoverLinkType;  // 封面链接类型
	enableRelatedLinks?: boolean;  // 是否自动处理关联条目链接
	pathTemplateByType?: Record<string, string>;  // 各类型独立路径模板
	customTemplates?: Record<string, string | undefined>;  // 按 category 键索引的模板
	dataProtection?: DataProtectionSettings;  // 数据保护设置
	subjectPathStates?: Record<string, SubjectPathState>;
	onPathStatesChanged?: (states: Record<string, SubjectPathState>) => Promise<void>;
	pathNamingStrategy?: PathNamingStrategy;
	recoverConfiguration?: (facts: ConfigurationRecoveryFacts) => Promise<SyncManagerConfig>;
	onConfigurationRecovered?: () => Promise<void> | void;
}

export type SyncConfigField =
	| 'accessToken' | 'scanFolderPath' | 'pathTemplate' | 'pathTemplateByType'
	| 'pathNamingStrategy' | 'subjectPathStates' | 'imagePathTemplate'
	| 'notePathTemplate' | 'coverLinkType' | 'dataProtection' | 'downloadImages' | 'imageQuality' | 'imageUpdateExisting'
	| 'enableRelatedLinks' | 'customTemplates';

const TRANSACTION_SENSITIVE_CONFIG_FIELDS = new Set<SyncConfigField>([
	'scanFolderPath', 'pathTemplate', 'pathTemplateByType', 'pathNamingStrategy',
	'subjectPathStates', 'imagePathTemplate', 'notePathTemplate', 'coverLinkType',
	'dataProtection', 'enableRelatedLinks', 'customTemplates', 'imageQuality', 'imageUpdateExisting',
]);

export type PendingDecisionState = 'awaiting' | 'committing' | 'rolling-back' | 'committed' | 'rolled-back' | 'rollback-failed';
export type BatchTransactionState = 'none' | 'active' | 'awaiting-user-decision' | 'committing' | 'rolling-back' | 'committed' | 'rolled-back' | 'rollback-failed';

export type PendingDecisionStatus = 'committed' | 'rolled-back' | 'rollback-failed' | 'busy' | 'no-pending' | 'failed';

export interface PendingDecisionResult {
	status: PendingDecisionStatus;
	result?: SyncResultWithRollback;
	rollback?: SyncRollbackResult;
	warnings?: SyncWarning[];
	error?: string;
}

export interface RecoveryRequiredState {
	reason: 'rollback-failed' | 'rescan-failed' | 'state-restore-failed' | 'journal-recovered' | 'journal-corrupt' | 'orphan-temporary' | 'configuration-rollback-failed';
	rollback: SyncRollbackResult;
	affectedSubjectIds: number[];
	originalPathStates: Record<string, SubjectPathState>;
	subjectExpectations: RecoverySubjectExpectation[];
	scanRoot: string;
	contentExpectations: RecoveryContentExpectation[];
	forbiddenPathsAfterRollback: string[];
	resourcePathsAfterRollback: string[];
	updatedResourceExpectations: RecoveryBinaryContentExpectation[];
	orphanTemporaryPaths: string[];
	configurationFacts?: ConfigurationRecoveryFacts;
	renameExpectations: RecoveryRenameExpectation[];
	attempts: RecoveryAttempt[];
	latestAttempt?: RecoveryAttempt;
	detectedAt: number;
	journalIssue?: string;
}

export type RecoveryAction = 'automatic-rollback' | 'retry-rollback' | 'confirm-manual' | 'rescan';
export type RecoveryActionStatus = 'rolled-back' | 'rollback-failed' | 'recovered' | 'blocked' | 'failed' | 'no-recovery';

export interface RecoveryAttempt {
	action: RecoveryAction;
	status: RecoveryActionStatus;
	startedAt: number;
	finishedAt: number;
	diagnostics: RecoveryDiagnostic[];
	rollback?: SyncRollbackResult;
	error?: string;
}

export interface RecoveryActionResult {
	action: RecoveryAction;
	status: RecoveryActionStatus;
	recovered: boolean;
	diagnostics: RecoveryDiagnostic[];
	result?: SyncResultWithRollback;
	rollback?: SyncRollbackResult;
	error?: string;
	recovery?: RecoveryRequiredState;
	resolution?: RecoveryResolutionSummary;
	attempts?: RecoveryAttempt[];
}

export type RecoveryLifecycleState = 'none' | 'rollback-available' | 'manual-only' | 'diagnostic-only' | 'retrying' | 'validating' | 'recovered';

export interface ManualRecoveryOptions {
	acceptUnverifiableJournalRisk?: boolean;
}

export interface RecoveryResolutionSummary {
	method: 'automatic' | 'retry' | 'manual-verification';
	currentFailed: number;
	automaticallyDeletedCreatedFiles: number;
	automaticallyRestoredContents: number;
	automaticallyRestoredPaths: number;
	manuallyVerifiedSubjects: number;
	manuallyVerifiedContents: number;
	manuallyVerifiedAbsentPaths: number;
	manuallyVerifiedRenames: number;
	historicalFailedAttempts: number;
}

interface PendingSyncTransaction {
	transactions: SyncTransaction[];
	groups: ExecutedTransactionGroup[];
	previousPathStates: Record<string, SubjectPathState>;
	affectedSubjectIds: number[];
	subjectExpectations: RecoverySubjectExpectation[];
	scanRootAtBatchStart: string;
	contentExpectations: RecoveryContentExpectation[];
	forbiddenPathsAfterRollback: string[];
	resourcePathsAfterRollback: string[];
	updatedResourceExpectations: RecoveryBinaryContentExpectation[];
	orphanTemporaryPaths: string[];
	configurationFacts?: ConfigurationRecoveryFacts;
	renameExpectations: RecoveryRenameExpectation[];
	deferredRelations: DeferredRelation[];
	resultSnapshot: SyncResultWithRollback;
	createdAt: number;
	state: PendingDecisionState;
	journalIssue?: string;
}

export class PendingSyncTransactionError extends Error {
	constructor() {
		super('A previous sync batch is awaiting a keep or rollback decision.');
		this.name = 'PendingSyncTransactionError';
	}
}

export class PendingDecisionInProgressError extends Error {
	constructor() {
		super('A previous sync batch decision is still being processed.');
		this.name = 'PendingDecisionInProgressError';
	}
}

export class RecoveryRequiredError extends Error {
	constructor(readonly recovery: RecoveryRequiredState) {
		super('Bangumi Sync requires local recovery before another sync can start.');
		this.name = 'RecoveryRequiredError';
	}
}

export class ConfigurationChangeBlockedError extends Error {
	constructor(readonly changedFields: readonly SyncConfigField[]) {
		super(`Configuration changes are blocked while recovery state is active: ${changedFields.join(', ')}.`);
		this.name = 'ConfigurationChangeBlockedError';
	}
}

export class ConfigurationUpdateInProgressError extends Error {
	constructor() {
		super('A settings update is in progress. Vault writes and concurrent settings saves are temporarily blocked.');
		this.name = 'ConfigurationUpdateInProgressError';
	}
}

export interface ConfigurationUpdateLease {
	commit(config: SyncManagerConfig): Promise<void>;
	rollback(): Promise<void>;
	release(): void;
}

export class ManagerReinitializationBlockedError extends Error {
	constructor() {
		super('SyncManager cannot be reinitialized while transaction or recovery state is active.');
		this.name = 'ManagerReinitializationBlockedError';
	}
}

export type RecoveryStateListener = (recovery: RecoveryRequiredState | null) => void;
export type ManagerState = 'idle' | 'running' | 'awaiting-decision' | 'committing' | 'rolling-back' | 'recovery-required' | 'configuration-updating';
export type ManagerStateListener = (state: ManagerState) => void;

/**
 * 同步管理器
 */
export class SyncManager {
	private app: App;
	public client: BangumiClient;
	private fileManager: FileManager;
	private imageHandler: ImageHandler;
	private incrementalSync: IncrementalSync;
	private userDataExtractor: UserDataExtractor;
	private userDataMerger: UserDataMerger;
	private readonly documentService: SubjectDocumentService;
	private readonly recoveryJournalStore: RecoveryJournalStore;
	private activeRecoveryJournal: PersistentRecoveryJournal | null = null;
	private config: SyncManagerConfig;
	private onProgress?: (progress: SyncProgress) => void;
	private cancellationSignal: SyncCancellationSignal | null = null;
	private pathResolver = new SubjectPathResolver();
	private pendingTransaction: PendingSyncTransaction | null = null;
	private batchTransactionState: BatchTransactionState = 'none';
	private lastAutomaticRollback: SyncRollbackResult | undefined;
	private pendingDecisionPromise: Promise<PendingDecisionResult> | null = null;
	private recoveryActionPromise: Promise<RecoveryActionResult> | null = null;
	private recoveryLifecycleState: RecoveryLifecycleState = 'none';
	private recoveryRequired: RecoveryRequiredState | null = null;
	private readonly recoveryStateListeners = new Set<RecoveryStateListener>();
	private readonly managerStateListeners = new Set<ManagerStateListener>();
	private lastEmittedManagerState: ManagerState | null = null;
	private configurationUpdateState: 'idle' | 'persisting' | 'applying' | 'rolling-back' = 'idle';

	constructor(app: App, config: SyncManagerConfig) {
		this.app = app;
		this.config = cloneSyncManagerConfig(config);
		this.client = new BangumiClient(config.accessToken);
		this.fileManager = new FileManager(app);
		this.imageHandler = new ImageHandler(app, this.fileManager);
		this.imageHandler.setBeforeCreateHook(path => this.persistCreatedResourcePath(path));
		this.imageHandler.setBeforeUpdateHook((path, originalContent) => this.persistUpdatedResourceExpectation(path, originalContent));
		this.imageHandler.setDownloadEnabled(config.downloadImages);
		this.imageHandler.setImageQuality(config.imageQuality);
		this.imageHandler.setUpdateExisting(config.imageUpdateExisting);
		this.incrementalSync = new IncrementalSync(app);
		this.incrementalSync.setPathStates(config.subjectPathStates ?? {});
		this.userDataExtractor = new UserDataExtractor(app);
		this.userDataMerger = new UserDataMerger(app);
		this.documentService = new SubjectDocumentService(app);
		this.recoveryJournalStore = new RecoveryJournalStore(app);
	}

	async initializeRecovery(): Promise<void> {
		const loaded = await this.recoveryJournalStore.load();
		if (loaded.status === 'loaded') {
			this.restorePersistentJournal(loaded.journal);
			return;
		}
		if (loaded.status === 'corrupt' || loaded.status === 'unsupported') {
			const message = loaded.status === 'corrupt'
				? `Recovery journal was corrupt and was backed up to ${loaded.backupPath}: ${loaded.message}`
				: `Recovery journal schema ${String(loaded.schemaVersion)} is unsupported and was backed up to ${loaded.backupPath}.`;
			const journal = this.createEmptyRecoveryJournal('recovery-required', message);
			await this.recoveryJournalStore.write(journal);
			this.restorePersistentJournal(journal, 'journal-corrupt');
			return;
		}
		const orphanTemps = await this.findTransactionTemporaryPaths();
		if (orphanTemps.length > 0) {
			const journal = this.createEmptyRecoveryJournal('recovery-required');
			journal.orphanTemporaryPaths = [...orphanTemps];
			await this.recoveryJournalStore.write(journal);
			this.restorePersistentJournal(journal, 'orphan-temporary');
		}
	}

	private async findTransactionTemporaryPaths(): Promise<string[]> {
		const found: string[] = [];
		const visit = async (directory: string): Promise<void> => {
			const listed = await this.app.vault.adapter.list(directory);
			for (const path of listed.files) {
				if (/(^|\/)\.bangumi-sync-\d+-\d+-\d+\.tmp\.md$/u.test(path)) found.push(normalizePath(path));
			}
			for (const folder of listed.folders) {
				if (normalizePathCollisionKey(folder) === normalizePathCollisionKey(this.app.vault.configDir)) continue;
				await visit(folder);
			}
		};
		await visit('');
		return found;
	}

	async requireConfigurationRecovery(error: unknown, facts?: ConfigurationRecoveryFacts): Promise<void> {
		const message = `Settings persistence rollback failed: ${errorMessage(error)}`;
		const journal = this.createEmptyRecoveryJournal('recovery-required', message);
		journal.configurationFacts = facts;
		this.restorePersistentJournal(journal, 'configuration-rollback-failed');
		await this.recoveryJournalStore.write(journal);
	}

	private createEmptyRecoveryJournal(state: PersistentRecoveryJournal['state'], blockingIssue?: string): PersistentRecoveryJournal {
		const now = Date.now();
		return {
			schemaVersion: 1, journalId: `recovery-${now}`, pluginVersion: '6.11.1', state,
			createdAt: now, updatedAt: now, scanRoot: normalizePath(this.config.scanFolderPath || 'ACGN'),
			affectedSubjectIds: [], originalPathStates: this.clonePathStates(this.config.subjectPathStates ?? {}),
			subjectExpectations: [], contentExpectations: [], createdPathExpectations: [], renameExpectations: [], createdResourcePaths: [],
			updatedResourceExpectations: [], orphanTemporaryPaths: [],
			resultSnapshot: this.captureResultSnapshot(this.createSyncResult(), false), attempts: [], blockingIssue,
		};
	}

	private restorePersistentJournal(journal: PersistentRecoveryJournal, forcedReason: RecoveryRequiredState['reason'] = 'journal-recovered'): void {
		this.activeRecoveryJournal = journal;
		const pending: PendingSyncTransaction = {
			transactions: [], groups: [], previousPathStates: this.clonePathStates(journal.originalPathStates),
			affectedSubjectIds: [...journal.affectedSubjectIds], subjectExpectations: journal.subjectExpectations.map(item => ({ ...item })),
			scanRootAtBatchStart: journal.scanRoot, contentExpectations: journal.contentExpectations.map(item => ({ ...item })),
			forbiddenPathsAfterRollback: journal.createdPathExpectations.map(item => item.createdPath),
			resourcePathsAfterRollback: [...journal.createdResourcePaths],
			updatedResourceExpectations: journal.updatedResourceExpectations.map(item => ({ ...item })),
			orphanTemporaryPaths: [...journal.orphanTemporaryPaths],
			configurationFacts: journal.configurationFacts,
			renameExpectations: journal.renameExpectations.map(item => ({ ...item })), deferredRelations: [],
			resultSnapshot: journal.resultSnapshot, createdAt: journal.createdAt, state: 'rollback-failed', journalIssue: journal.blockingIssue,
		};
		this.pendingTransaction = pending;
		this.recoveryRequired = {
			reason: forcedReason, rollback: this.emptyRollbackResult(), affectedSubjectIds: [...journal.affectedSubjectIds],
			originalPathStates: this.clonePathStates(journal.originalPathStates), subjectExpectations: journal.subjectExpectations.map(item => ({ ...item })),
			scanRoot: journal.scanRoot, contentExpectations: journal.contentExpectations.map(item => ({ ...item })),
			forbiddenPathsAfterRollback: journal.createdPathExpectations.map(item => item.createdPath),
			resourcePathsAfterRollback: [...journal.createdResourcePaths],
			updatedResourceExpectations: journal.updatedResourceExpectations.map(item => ({ ...item })),
			orphanTemporaryPaths: [...journal.orphanTemporaryPaths],
			configurationFacts: journal.configurationFacts,
			renameExpectations: journal.renameExpectations.map(item => ({ ...item })), attempts: journal.attempts.map(item => this.cloneRecoveryAttempt(item)),
			detectedAt: Date.now(), journalIssue: journal.blockingIssue,
		};
		this.setBatchTransactionState('rollback-failed');
		this.notifyRecoveryStateChanged();
	}

	/**
	 * 设置进度回调
	 */
	setProgressCallback(callback: (progress: SyncProgress) => void): void {
		this.onProgress = callback;
	}

	/**
	 * 设置取消信号
	 */
	setCancellationSignal(signal: SyncCancellationSignal | null): void {
		this.cancellationSignal = signal;
	}

	/**
	 * 回滚本次批次新建的文件
	 */
	rollbackBatch(): Promise<PendingDecisionResult> {
		return this.resolvePendingBatch('rollback');
	}

	getBatchTransactionState(): BatchTransactionState {
		return this.batchTransactionState;
	}

	commitPendingBatch(): Promise<PendingDecisionResult> {
		return this.resolvePendingBatch('commit');
	}

	ensureCanStartSync(): void {
		if (this.configurationUpdateState !== 'idle') throw new ConfigurationUpdateInProgressError();
		if (this.recoveryRequired) throw new RecoveryRequiredError(this.recoveryRequired);
		if (this.pendingDecisionPromise || this.recoveryActionPromise || this.pendingTransaction?.state === 'committing' || this.pendingTransaction?.state === 'rolling-back') {
			throw new PendingDecisionInProgressError();
		}
		if (this.pendingTransaction) throw new PendingSyncTransactionError();
	}

	hasActiveTransactionState(): boolean {
		return this.batchTransactionState === 'active'
			|| this.pendingTransaction !== null
			|| this.pendingDecisionPromise !== null
			|| this.recoveryRequired !== null
			|| this.recoveryActionPromise !== null
			|| this.configurationUpdateState !== 'idle';
	}

	assertConfigurationChangeAllowed(changedFields: readonly SyncConfigField[]): void {
		if (this.configurationUpdateState !== 'idle') throw new ConfigurationUpdateInProgressError();
		if (changedFields.length === 0 || !this.hasActiveTransactionState()) return;
		const actionInProgress = this.batchTransactionState === 'active'
			|| this.pendingDecisionPromise !== null
			|| this.recoveryActionPromise !== null
			|| this.pendingTransaction?.state === 'committing'
			|| this.pendingTransaction?.state === 'rolling-back';
		const blocked = actionInProgress
			? changedFields
			: changedFields.filter(field => TRANSACTION_SENSITIVE_CONFIG_FIELDS.has(field));
		if (blocked.length > 0) throw new ConfigurationChangeBlockedError(blocked);
	}

	beginConfigurationUpdate(changedFields: readonly SyncConfigField[]): ConfigurationUpdateLease {
		this.assertConfigurationChangeAllowed(changedFields);
		const previousConfig = cloneSyncManagerConfig(this.config);
		this.configurationUpdateState = 'persisting';
		this.notifyManagerStateChanged();
		let active = true;
		return {
			commit: config => {
				if (!active) throw new Error('Configuration update lease has already been released.');
				this.configurationUpdateState = 'applying';
				this.notifyManagerStateChanged();
				this.applyConfigSnapshot(config);
				return Promise.resolve();
			},
			rollback: () => {
				if (!active) return Promise.resolve();
				this.configurationUpdateState = 'rolling-back';
				this.notifyManagerStateChanged();
				this.applyConfigSnapshot(previousConfig);
				return Promise.resolve();
			},
			release: () => {
				if (!active) return;
				active = false;
				this.configurationUpdateState = 'idle';
				this.notifyManagerStateChanged();
			},
		};
	}

	assertCanReinitialize(): void {
		if (this.hasActiveTransactionState()) throw new ManagerReinitializationBlockedError();
	}

	subscribeRecoveryState(listener: RecoveryStateListener): () => void {
		this.recoveryStateListeners.add(listener);
		return () => this.recoveryStateListeners.delete(listener);
	}

	getManagerState(): ManagerState {
		if (this.configurationUpdateState !== 'idle') return 'configuration-updating';
		if (this.recoveryRequired) return 'recovery-required';
		switch (this.batchTransactionState) {
			case 'active': return 'running';
			case 'awaiting-user-decision': return 'awaiting-decision';
			case 'committing': return 'committing';
			case 'rolling-back': return 'rolling-back';
			case 'rollback-failed': return 'recovery-required';
			default: return 'idle';
		}
	}

	subscribeManagerState(listener: ManagerStateListener): () => void {
		this.managerStateListeners.add(listener);
		listener(this.getManagerState());
		return () => this.managerStateListeners.delete(listener);
	}

	getRecoveryRequired(): RecoveryRequiredState | null {
		return this.recoveryRequired ? {
			...this.recoveryRequired,
			rollback: { ...this.recoveryRequired.rollback, failures: this.recoveryRequired.rollback.failures?.map(item => ({ ...item })) },
			originalPathStates: this.clonePathStates(this.recoveryRequired.originalPathStates),
			affectedSubjectIds: [...this.recoveryRequired.affectedSubjectIds],
			subjectExpectations: this.recoveryRequired.subjectExpectations.map(item => ({ ...item })),
			contentExpectations: this.recoveryRequired.contentExpectations.map(item => ({ ...item })),
			forbiddenPathsAfterRollback: [...this.recoveryRequired.forbiddenPathsAfterRollback],
			resourcePathsAfterRollback: [...this.recoveryRequired.resourcePathsAfterRollback],
			updatedResourceExpectations: this.recoveryRequired.updatedResourceExpectations.map(item => ({ ...item })),
			orphanTemporaryPaths: [...this.recoveryRequired.orphanTemporaryPaths],
			configurationFacts: this.recoveryRequired.configurationFacts,
			renameExpectations: this.recoveryRequired.renameExpectations.map(item => ({ ...item })),
			attempts: this.recoveryRequired.attempts.map(item => this.cloneRecoveryAttempt(item)),
			latestAttempt: this.recoveryRequired.latestAttempt ? this.cloneRecoveryAttempt(this.recoveryRequired.latestAttempt) : undefined,
		} : null;
	}

	retryRecovery(): Promise<RecoveryActionResult> {
		return this.resolveRecoveryAction('retry-rollback');
	}

	confirmManualRecovery(options: ManualRecoveryOptions = {}): Promise<RecoveryActionResult> {
		return this.resolveRecoveryAction('confirm-manual', options);
	}

	rescanRecovery(): Promise<RecoveryActionResult> {
		return this.resolveRecoveryAction('rescan');
	}

	getRecoveryActionPolicy(): RecoveryActionPolicy | null {
		return this.recoveryRequired ? getRecoveryActionPolicy(this.recoveryRequired) : null;
	}

	getRecoveryLifecycleState(): RecoveryLifecycleState {
		if (this.recoveryActionPromise) return this.recoveryLifecycleState;
		if (!this.recoveryRequired) return this.recoveryLifecycleState === 'recovered' ? 'recovered' : 'none';
		const policy = getRecoveryActionPolicy(this.recoveryRequired);
		if (policy.allowRetryRollback) return 'rollback-available';
		if (policy.allowManualConfirmation) return 'manual-only';
		return 'diagnostic-only';
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<SyncManagerConfig>, changedFields: readonly SyncConfigField[] = Object.keys(config) as SyncConfigField[]): void {
		this.assertConfigurationChangeAllowed(changedFields);
		this.applyConfigSnapshot({ ...this.config, ...config });
	}

	private applyConfigSnapshot(config: SyncManagerConfig): void {
		this.config = cloneSyncManagerConfig({
			...config,
			recoverConfiguration: config.recoverConfiguration ?? this.config.recoverConfiguration,
			onConfigurationRecovered: config.onConfigurationRecovered ?? this.config.onConfigurationRecovered,
		});
		if (Object.prototype.hasOwnProperty.call(config, 'accessToken')) this.client.setAccessToken(config.accessToken ?? '');
		if (Object.prototype.hasOwnProperty.call(config, 'downloadImages')) this.imageHandler.setDownloadEnabled(config.downloadImages ?? false);
		if (Object.prototype.hasOwnProperty.call(config, 'imageQuality')) this.imageHandler.setImageQuality(config.imageQuality);
		if (Object.prototype.hasOwnProperty.call(config, 'imageUpdateExisting')) this.imageHandler.setUpdateExisting(config.imageUpdateExisting);
		if (Object.prototype.hasOwnProperty.call(config, 'subjectPathStates') && config.subjectPathStates) {
			this.incrementalSync.setPathStates(config.subjectPathStates);
		}
	}

	private notifyRecoveryStateChanged(): void {
		const snapshot = this.getRecoveryRequired();
		for (const listener of this.recoveryStateListeners) {
			try {
				listener(snapshot);
			} catch {
				// A stale modal must not interrupt recovery state transitions.
			}
		}
		this.notifyManagerStateChanged();
	}

	private notifyManagerStateChanged(): void {
		const state = this.getManagerState();
		if (state === this.lastEmittedManagerState) return;
		this.lastEmittedManagerState = state;
		for (const listener of this.managerStateListeners) {
			try { listener(state); } catch { /* A stale view must not interrupt manager transitions. */ }
		}
	}

	private setBatchTransactionState(state: BatchTransactionState): void {
		if (this.batchTransactionState === state) return;
		this.batchTransactionState = state;
		this.notifyManagerStateChanged();
	}

	private async persistPathStates(): Promise<void> {
		const states = this.incrementalSync.exportPathStates();
		await this.persistSpecificPathStates(states);
	}

	private async persistSpecificPathStates(states: Record<string, SubjectPathState>): Promise<void> {
		await this.config.onPathStatesChanged?.(states);
		this.config = cloneSyncManagerConfig({ ...this.config, subjectPathStates: this.clonePathStates(states) });
		this.incrementalSync.setPathStates(states);
	}

	private clonePathStates(states: Readonly<Record<string, SubjectPathState>>): Record<string, SubjectPathState> {
		return Object.fromEntries(Object.entries(states).map(([id, state]) => [id, { ...state }]));
	}

	private cloneRecoveryAttempt(attempt: RecoveryAttempt): RecoveryAttempt {
		return {
			...attempt,
			diagnostics: attempt.diagnostics.map(item => ({ ...item })),
			rollback: attempt.rollback ? { ...attempt.rollback, failures: attempt.rollback.failures?.map(item => ({ ...item })) } : undefined,
		};
	}

	private async captureTransactionRecoveryFacts(transactions: readonly SyncTransaction[]): Promise<{
		contentExpectations: RecoveryContentExpectation[];
		forbiddenPathsAfterRollback: string[];
		resourcePathsAfterRollback: string[];
		updatedResourceExpectations: RecoveryBinaryContentExpectation[];
		orphanTemporaryPaths: string[];
		configurationFacts?: ConfigurationRecoveryFacts;
		renameExpectations: RecoveryRenameExpectation[];
	}> {
		const contentExpectations: RecoveryContentExpectation[] = [];
		const forbiddenPathsAfterRollback: string[] = [];
		const renameExpectations: RecoveryRenameExpectation[] = [];
		for (const transaction of transactions) {
			const expectations = await transaction.getRecoveryExpectations();
			contentExpectations.push(...expectations.updatedContents.map(item => ({ ...item })));
			forbiddenPathsAfterRollback.push(...expectations.createdFiles.map(item => item.createdPath));
			renameExpectations.push(...expectations.renames.map(item => ({ ...item })));
		}
		return {
			contentExpectations,
			forbiddenPathsAfterRollback: Array.from(new Set(forbiddenPathsAfterRollback.map(normalizePath))),
			resourcePathsAfterRollback: [...(this.activeRecoveryJournal?.createdResourcePaths ?? [])],
			updatedResourceExpectations: (this.activeRecoveryJournal?.updatedResourceExpectations ?? []).map(item => ({ ...item })),
			orphanTemporaryPaths: [...(this.activeRecoveryJournal?.orphanTemporaryPaths ?? [])],
			configurationFacts: this.activeRecoveryJournal?.configurationFacts,
			renameExpectations,
		};
	}

	private mergeActiveJournalFacts(facts: TransactionRecoveryExpectations): void {
		if (!this.activeRecoveryJournal) return;
		const byCreatedPath = new Map(this.activeRecoveryJournal.createdPathExpectations.map(item => [normalizePathCollisionKey(item.createdPath), item]));
		for (const item of facts.createdFiles) byCreatedPath.set(normalizePathCollisionKey(item.createdPath), { ...item });
		this.activeRecoveryJournal.createdPathExpectations = Array.from(byCreatedPath.values());
		const byContentPath = new Map(this.activeRecoveryJournal.contentExpectations.map(item => [normalizePathCollisionKey(item.path), item]));
		for (const item of facts.updatedContents) byContentPath.set(normalizePathCollisionKey(item.path), { ...item });
		this.activeRecoveryJournal.contentExpectations = Array.from(byContentPath.values());
		const byRename = new Map(this.activeRecoveryJournal.renameExpectations.map(item => [item.subjectId, item]));
		for (const item of facts.renames) byRename.set(item.subjectId, { ...item });
		this.activeRecoveryJournal.renameExpectations = Array.from(byRename.values());
	}

	private async persistBeforeVaultMutation(facts: TransactionRecoveryExpectations): Promise<void> {
		if (!this.activeRecoveryJournal) throw new Error('Recovery journal is not active before a Vault mutation.');
		this.mergeActiveJournalFacts(facts);
		await this.recoveryJournalStore.write(this.activeRecoveryJournal);
	}

	private async persistCreatedResourcePath(path: string): Promise<void> {
		if (!this.activeRecoveryJournal) return;
		const normalized = normalizePath(path);
		if (!this.activeRecoveryJournal.createdResourcePaths.some(item => normalizePathCollisionKey(item) === normalizePathCollisionKey(normalized))) {
			this.activeRecoveryJournal.createdResourcePaths.push(normalized);
		}
		await this.recoveryJournalStore.write(this.activeRecoveryJournal);
	}

	private async persistUpdatedResourceExpectation(path: string, originalContent: ArrayBuffer): Promise<void> {
		if (!this.activeRecoveryJournal) throw new Error('Cannot update an existing binary without an active recovery journal.');
		const normalized = normalizePath(path);
		if (this.activeRecoveryJournal.updatedResourceExpectations.some(item => normalizePathCollisionKey(item.path) === normalizePathCollisionKey(normalized))) return;
		const bytes = new Uint8Array(originalContent);
		if (bytes.byteLength > MAX_BINARY_RECOVERY_BYTES) {
			throw new Error(`Existing binary is ${bytes.byteLength} bytes; the transactional update limit is ${MAX_BINARY_RECOVERY_BYTES} bytes.`);
		}
		this.activeRecoveryJournal.updatedResourceExpectations.push({
			path: normalized,
			originalByteLength: bytes.byteLength,
			originalSha256: await hashRecoveryBytes(bytes),
			originalContentBase64: encodeRecoveryBase64(bytes),
		});
		await this.recoveryJournalStore.write(this.activeRecoveryJournal);
	}

	private async beginCoverUpdateJournal(subjectId: number, file: TFile, originalContent: string): Promise<void> {
		const now = Date.now();
		const journal: PersistentRecoveryJournal = {
			schemaVersion: 1,
			journalId: `cover-${subjectId}-${now}`,
			pluginVersion: '6.11.1',
			state: 'active',
			createdAt: now,
			updatedAt: now,
			scanRoot: normalizePath(this.config.scanFolderPath || 'ACGN'),
			affectedSubjectIds: [subjectId],
			originalPathStates: this.clonePathStates(this.config.subjectPathStates ?? {}),
			subjectExpectations: [{ subjectId, expectedToExist: true, expectedPath: file.path, expectedSubjectId: subjectId }],
			contentExpectations: [{
				subjectId,
				path: file.path,
				expectedContentHash: await hashRecoveryContent(originalContent),
				originalContentLength: originalContent.length,
				originalContent,
			}],
			createdPathExpectations: [],
			renameExpectations: [],
			createdResourcePaths: [],
			updatedResourceExpectations: [],
			orphanTemporaryPaths: [],
			resultSnapshot: this.captureResultSnapshot(this.createSyncResult(1), false),
			attempts: [],
		};
		this.activeRecoveryJournal = journal;
		await this.recoveryJournalStore.write(journal);
	}

	private journalFromPending(pending: PendingSyncTransaction, state: PersistentRecoveryJournal['state']): PersistentRecoveryJournal {
		const current = this.activeRecoveryJournal ?? this.createEmptyRecoveryJournal(state);
		return {
			...current, state, updatedAt: Date.now(), scanRoot: pending.scanRootAtBatchStart,
			affectedSubjectIds: [...pending.affectedSubjectIds], originalPathStates: this.clonePathStates(pending.previousPathStates),
			subjectExpectations: pending.subjectExpectations.map(item => ({ ...item })),
			contentExpectations: pending.contentExpectations.map(item => ({ ...item })),
			createdPathExpectations: pending.forbiddenPathsAfterRollback.map(path => current.createdPathExpectations
				.find(item => normalizePathCollisionKey(item.createdPath) === normalizePathCollisionKey(path))
				?? { subjectId: -1, createdPath: path, expectedToExistAfterRollback: false }),
			createdResourcePaths: [...pending.resourcePathsAfterRollback],
			updatedResourceExpectations: pending.updatedResourceExpectations.map(item => ({ ...item })),
			orphanTemporaryPaths: [...pending.orphanTemporaryPaths],
			configurationFacts: pending.configurationFacts,
			renameExpectations: pending.renameExpectations.map(item => ({ ...item })), resultSnapshot: pending.resultSnapshot,
			attempts: this.recoveryRequired?.attempts.map(item => this.cloneRecoveryAttempt(item)) ?? current.attempts,
			blockingIssue: pending.journalIssue,
		};
	}

	private async persistPendingJournal(pending: PendingSyncTransaction, state: PersistentRecoveryJournal['state']): Promise<void> {
		this.activeRecoveryJournal = this.journalFromPending(pending, state);
		await this.recoveryJournalStore.write(this.activeRecoveryJournal);
	}

	private resolveRecoveryAction(action: RecoveryAction, manualOptions: ManualRecoveryOptions = {}): Promise<RecoveryActionResult> {
		if (this.recoveryActionPromise) return this.recoveryActionPromise;
		if (!this.recoveryRequired || !this.pendingTransaction) {
			return Promise.resolve({ action, status: 'no-recovery', recovered: true, diagnostics: [] });
		}
		const policy = getRecoveryActionPolicy(this.recoveryRequired);
		const allowed = action === 'retry-rollback' ? policy.allowRetryRollback
			: action === 'confirm-manual' ? policy.allowManualConfirmation
				: action === 'rescan' ? policy.allowRescan : false;
		if (!allowed || (action === 'confirm-manual' && policy.requiresUnverifiableRiskAcceptance && !manualOptions.acceptUnverifiableJournalRisk)) {
			const message = !allowed
				? `${action} is not permitted for recovery reason ${this.recoveryRequired.reason}.`
				: 'Explicit acceptance of unverifiable journal risk is required.';
			return Promise.resolve({
				action, status: 'blocked', recovered: false,
				diagnostics: [{ code: 'blocking-local-file', path: '.bangumi-sync-recovery.json', message }],
				recovery: this.getRecoveryRequired() ?? undefined,
			});
		}
		const startedAt = Date.now();
		this.recoveryLifecycleState = action === 'rescan' ? 'validating' : 'retrying';
		const promise = this.performRecoveryAction(action, startedAt, manualOptions);
		this.recoveryActionPromise = promise;
		promise.then(
			() => { if (this.recoveryActionPromise === promise) this.recoveryActionPromise = null; },
			() => { if (this.recoveryActionPromise === promise) this.recoveryActionPromise = null; },
		);
		return promise;
	}

	private async performRecoveryAction(action: RecoveryAction, startedAt: number, manualOptions: ManualRecoveryOptions): Promise<RecoveryActionResult> {
		const recovery = this.recoveryRequired;
		const pending = this.pendingTransaction;
		if (!recovery || !pending) return { action, status: 'no-recovery', recovered: true, diagnostics: [] };
		let outcome: RecoveryActionResult;
		try {
			if (action === 'retry-rollback') {
				pending.state = 'rolling-back';
				this.setBatchTransactionState('rolling-back');
				const decision = await this.rollbackPendingTransaction(pending);
				const diagnostics = decision.status === 'rollback-failed'
					? this.rollbackFailureDiagnostics(decision.rollback)
					: [];
				outcome = {
					action,
					status: decision.status === 'rolled-back' ? 'rolled-back' : 'rollback-failed',
					recovered: decision.status === 'rolled-back',
					diagnostics,
					result: decision.result,
					rollback: decision.rollback,
					error: decision.error,
					recovery: this.getRecoveryRequired() ?? undefined,
				};
			} else if (action === 'confirm-manual') {
				outcome = await this.performManualRecovery(recovery, pending, manualOptions);
			} else {
				const diagnostics = await this.collectRecoveryDiagnostics(recovery);
				outcome = {
					action,
					status: 'blocked',
					recovered: false,
					diagnostics,
					recovery: this.getRecoveryRequired() ?? undefined,
				};
			}
		} catch (error) {
			outcome = {
				action,
				status: 'failed',
				recovered: false,
				diagnostics: [],
				error: errorMessage(error),
				recovery: this.getRecoveryRequired() ?? undefined,
			};
		}
		const attempt: RecoveryAttempt = {
			action,
			status: outcome.status,
			startedAt,
			finishedAt: Date.now(),
			diagnostics: outcome.diagnostics.map(item => ({ ...item })),
			rollback: outcome.rollback,
			error: outcome.error,
		};
		if (this.recoveryRequired) {
			this.recoveryRequired.attempts.push(attempt);
			this.recoveryRequired.latestAttempt = attempt;
			outcome.recovery = this.getRecoveryRequired() ?? undefined;
			this.notifyRecoveryStateChanged();
			await this.persistPendingJournal(pending, 'recovery-required');
		} else if (outcome.recovered) {
			outcome.attempts = [...recovery.attempts, attempt].map(item => this.cloneRecoveryAttempt(item));
		}
		return outcome;
	}

	private async performManualRecovery(recovery: RecoveryRequiredState, pending: PendingSyncTransaction, options: ManualRecoveryOptions): Promise<RecoveryActionResult> {
		let configurationReconciled = false;
		if (recovery.reason === 'configuration-rollback-failed') {
			if (!recovery.configurationFacts || !this.config.recoverConfiguration) {
				const diagnostics: RecoveryDiagnostic[] = [{ code: 'persisted-state-mismatch', message: 'Configuration recovery facts or reconciliation handler are unavailable.' }];
				return { action: 'confirm-manual', status: 'blocked', recovered: false, diagnostics, recovery: this.getRecoveryRequired() ?? undefined };
			}
			try {
				const reconciledConfig = await this.config.recoverConfiguration(recovery.configurationFacts);
				this.applyConfigSnapshot(reconciledConfig);
				await reconciledConfig.onConfigurationRecovered?.();
				configurationReconciled = true;
			} catch (error) {
				const diagnostics: RecoveryDiagnostic[] = [{ code: 'persisted-state-mismatch', message: errorMessage(error) }];
				return { action: 'confirm-manual', status: 'failed', recovered: false, diagnostics, error: errorMessage(error), recovery: this.getRecoveryRequired() ?? undefined };
			}
		}
		const ignoreJournalIssue = (recovery.reason === 'journal-corrupt' && options.acceptUnverifiableJournalRisk === true)
			|| configurationReconciled;
		let diagnostics = await this.collectRecoveryDiagnostics(recovery, { ignoreJournalIssue });
		if (diagnostics.length > 0) {
			return { action: 'confirm-manual', status: 'blocked', recovered: false, diagnostics, recovery: this.getRecoveryRequired() ?? undefined };
		}
		try {
			await this.persistSpecificPathStates(recovery.originalPathStates);
		} catch (error) {
			diagnostics = [{ code: 'state-restore-failed', message: errorMessage(error) }];
			return { action: 'confirm-manual', status: 'failed', recovered: false, diagnostics, error: errorMessage(error), recovery: this.getRecoveryRequired() ?? undefined };
		}
		if (!pathStatesEqual(this.config.subjectPathStates ?? {}, recovery.originalPathStates)) {
			diagnostics.push({ code: 'persisted-state-mismatch', message: 'Persisted subject path states differ from the pre-batch snapshot.' });
		}
		if (diagnostics.length === 0) diagnostics = await this.collectRecoveryDiagnostics(recovery, { ignoreJournalIssue });
		if (diagnostics.length === 0) this.incrementalSync.setPathStates(recovery.originalPathStates);
		if (diagnostics.length > 0) {
			return { action: 'confirm-manual', status: 'blocked', recovered: false, diagnostics, recovery: this.getRecoveryRequired() ?? undefined };
		}
		const finalRollback: SyncRollbackResult = {
			attempted: false,
			changed: false,
			deletedCreatedFiles: 0,
			restoredContents: 0,
			restoredPaths: 0,
			failed: 0,
			failures: [],
		};
		const result = this.snapshotAfterDecision(pending, 'rolled-back', finalRollback);
		this.recoveryRequired = null;
		this.pendingTransaction = null;
		this.pendingDecisionPromise = null;
		this.setBatchTransactionState('rolled-back');
		this.incrementalSync.clearBatch();
		await this.recoveryJournalStore.clear();
		this.activeRecoveryJournal = null;
		this.recoveryLifecycleState = 'recovered';
		this.notifyRecoveryStateChanged();
		return {
			action: 'confirm-manual', status: 'recovered', recovered: true, diagnostics: [], result, rollback: finalRollback,
			resolution: {
				method: 'manual-verification', currentFailed: 0,
				automaticallyDeletedCreatedFiles: 0,
				automaticallyRestoredContents: 0,
				automaticallyRestoredPaths: 0,
				manuallyVerifiedSubjects: recovery.subjectExpectations.length,
				manuallyVerifiedContents: recovery.contentExpectations.length,
				manuallyVerifiedAbsentPaths: recovery.forbiddenPathsAfterRollback.length + recovery.resourcePathsAfterRollback.length,
				manuallyVerifiedRenames: recovery.renameExpectations.length,
				historicalFailedAttempts: recovery.attempts.filter(attempt => attempt.status === 'rollback-failed' || attempt.status === 'failed').length,
			},
		};
	}

	private rollbackFailureDiagnostics(rollback?: SyncRollbackResult): RecoveryDiagnostic[] {
		return (rollback?.failures ?? []).map(failure => failure.operation === 'restore-path-states'
			? { code: 'state-restore-failed' as const, message: `${failure.path}: ${failure.message}` }
			: failure.operation === 'rescan'
				? { code: 'rescan-failed' as const, message: `${failure.path}: ${failure.message}` }
				: { code: 'rollback-step-failed' as const, operation: failure.operation, path: failure.path, message: failure.message });
	}

	private emptyRollbackResult(): SyncRollbackResult {
		return { attempted: false, changed: false, deletedCreatedFiles: 0, restoredContents: 0, restoredPaths: 0, failed: 0 };
	}

	private mergeRollbackResult(target: SyncRollbackResult, source: SyncRollbackResult): void {
		target.attempted = target.attempted || source.attempted;
		target.changed = target.changed || source.changed;
		target.deletedCreatedFiles += source.deletedCreatedFiles;
		target.restoredContents += source.restoredContents;
		target.restoredPaths += source.restoredPaths;
		target.failed += source.failed;
		if (source.failures?.length) target.failures = [...(target.failures ?? []), ...source.failures];
	}

	private assertNoPendingTransaction(): void {
		this.ensureCanStartSync();
	}

	private resolvePendingBatch(action: 'commit' | 'rollback'): Promise<PendingDecisionResult> {
		if (this.pendingDecisionPromise) return this.pendingDecisionPromise;
		const pending = this.pendingTransaction;
		if (!pending) return Promise.resolve({ status: 'no-pending' });
		if (pending.state !== 'awaiting') return Promise.resolve({ status: 'busy' });

		pending.state = action === 'commit' ? 'committing' : 'rolling-back';
		this.setBatchTransactionState(action === 'commit' ? 'committing' : 'rolling-back');
		const promise = action === 'commit'
			? this.commitPendingTransaction(pending)
			: this.rollbackPendingTransaction(pending);
		this.pendingDecisionPromise = promise;
		promise.then(
			() => {
				if (this.pendingDecisionPromise === promise) this.pendingDecisionPromise = null;
				this.notifyManagerStateChanged();
			},
			() => {
				if (this.pendingDecisionPromise === promise) this.pendingDecisionPromise = null;
				this.notifyManagerStateChanged();
			},
		);
		return promise;
	}

	private async commitPendingTransaction(pending: PendingSyncTransaction): Promise<PendingDecisionResult> {
		try {
			await this.persistPendingJournal(pending, 'awaiting-decision');
			await this.persistPathStates();
			for (const transaction of pending.transactions) transaction.commit();
		} catch (error) {
			pending.state = 'rolling-back';
			this.setBatchTransactionState('rolling-back');
			return this.rollbackPendingTransaction(pending, error);
		}
		let warnings: SyncWarning[] = [];
		try {
			warnings = pending.deferredRelations.length > 0
				? await this.postProcessBatchRelations(pending.deferredRelations)
				: [];
		} catch (error) {
			warnings = [{ operation: 'related-link-postprocess', message: errorMessage(error) }];
		}
		const result = this.snapshotAfterDecision(pending, 'committed', undefined, warnings);
		pending.state = 'committed';
		this.pendingTransaction = null;
		this.setBatchTransactionState('committed');
		this.incrementalSync.finishBatch();
		await this.recoveryJournalStore.clear();
		this.activeRecoveryJournal = null;
		return { status: 'committed', result, warnings };
	}

	private async rollbackPendingTransaction(pending: PendingSyncTransaction, cause?: unknown): Promise<PendingDecisionResult> {
		const result = this.emptyRollbackResult();
		await this.persistPendingJournal(pending, 'rolling-back');
		for (const transaction of [...pending.transactions].reverse()) {
			try {
				this.mergeRollbackResult(result, await transaction.rollback());
			} catch (error) {
				this.recordManagerRollbackFailure(result, 'restore-content', 'transaction', error);
			}
		}
		if (pending.transactions.length === 0) await this.rollbackPersistentFacts(pending, result);
		for (const path of [...pending.resourcePathsAfterRollback].reverse()) {
			try {
				if (!await this.app.vault.adapter.exists(path)) continue;
				const referenced = (await Promise.all(this.app.vault.getMarkdownFiles().map(file => this.app.vault.read(file))))
					.some(content => content.includes(path));
				if (referenced) continue;
				await this.app.vault.adapter.remove(path);
				result.attempted = true;
				result.changed = true;
				result.deletedCreatedFiles++;
			} catch (error) {
				this.recordManagerRollbackFailure(result, 'delete-created', path, error);
			}
		}
		try {
			this.incrementalSync.setPathStates(pending.previousPathStates);
			await this.persistSpecificPathStates(pending.previousPathStates);
		} catch (error) {
			this.recordManagerRollbackFailure(result, 'restore-path-states', 'subjectPathStates', error);
		}
		try {
			await this.incrementalSync.scanLocalFolder(pending.scanRootAtBatchStart);
		} catch (error) {
			this.recordManagerRollbackFailure(result, 'rescan', pending.scanRootAtBatchStart, error);
		}
		this.incrementalSync.clearBatch();
		this.markGroupsRolledBack(pending);
		this.lastAutomaticRollback = result;
		if (result.failed === 0) {
			const validationRecovery: RecoveryRequiredState = this.recoveryRequired ?? {
				reason: 'rollback-failed', rollback: result,
				affectedSubjectIds: [...pending.affectedSubjectIds], originalPathStates: this.clonePathStates(pending.previousPathStates),
				subjectExpectations: pending.subjectExpectations.map(item => ({ ...item })), scanRoot: pending.scanRootAtBatchStart,
				contentExpectations: pending.contentExpectations.map(item => ({ ...item })),
				forbiddenPathsAfterRollback: [...pending.forbiddenPathsAfterRollback], resourcePathsAfterRollback: [...pending.resourcePathsAfterRollback],
				updatedResourceExpectations: pending.updatedResourceExpectations.map(item => ({ ...item })),
				orphanTemporaryPaths: [...pending.orphanTemporaryPaths], configurationFacts: pending.configurationFacts,
				renameExpectations: pending.renameExpectations.map(item => ({ ...item })), attempts: [], detectedAt: Date.now(), journalIssue: pending.journalIssue,
			};
			this.recoveryLifecycleState = 'validating';
			const diagnostics = await this.collectRecoveryDiagnostics(validationRecovery);
			for (const diagnostic of diagnostics) this.recordManagerRollbackFailure(result, 'post-validation', 'recovery', new Error(diagnostic.message));
			if (diagnostics.length > 0) this.recoveryRequired = { ...validationRecovery, rollback: result };
		}
		const failed = result.failed > 0;
		const snapshot = this.snapshotAfterDecision(pending, failed ? 'rollback-failed' : 'rolled-back', result,
			cause ? [{ operation: 'commit', message: errorMessage(cause) }] : []);
		if (failed) {
			pending.state = 'rollback-failed';
			this.setBatchTransactionState('rollback-failed');
			const operations = new Set(result.failures?.map(item => item.operation));
			const existingRecovery = this.recoveryRequired;
			const automaticAttempt: RecoveryAttempt = {
				action: 'automatic-rollback', status: 'rollback-failed', startedAt: Date.now(), finishedAt: Date.now(),
				diagnostics: this.rollbackFailureDiagnostics(result), rollback: result,
			};
			this.recoveryRequired = {
				reason: operations.has('rescan') ? 'rescan-failed'
					: operations.has('restore-path-states') ? 'state-restore-failed'
						: 'rollback-failed',
				rollback: result,
				affectedSubjectIds: [...pending.affectedSubjectIds],
				originalPathStates: this.clonePathStates(pending.previousPathStates),
				subjectExpectations: pending.subjectExpectations.map(item => ({ ...item })),
				scanRoot: pending.scanRootAtBatchStart,
				contentExpectations: pending.contentExpectations.map(item => ({ ...item })),
				forbiddenPathsAfterRollback: [...pending.forbiddenPathsAfterRollback],
				resourcePathsAfterRollback: [...pending.resourcePathsAfterRollback],
				updatedResourceExpectations: pending.updatedResourceExpectations.map(item => ({ ...item })),
				orphanTemporaryPaths: [...pending.orphanTemporaryPaths],
				configurationFacts: pending.configurationFacts,
				renameExpectations: pending.renameExpectations.map(item => ({ ...item })),
				attempts: existingRecovery?.attempts.map(item => this.cloneRecoveryAttempt(item)) ?? [automaticAttempt],
				latestAttempt: existingRecovery?.latestAttempt ? this.cloneRecoveryAttempt(existingRecovery.latestAttempt) : automaticAttempt,
				detectedAt: existingRecovery?.detectedAt ?? Date.now(),
				journalIssue: pending.journalIssue,
			};
			await this.persistPendingJournal(pending, 'rollback-failed');
			this.notifyRecoveryStateChanged();
			return { status: 'rollback-failed', result: snapshot, rollback: result, error: cause ? errorMessage(cause) : undefined };
		}
		pending.state = 'rolled-back';
		this.pendingTransaction = null;
		this.recoveryRequired = null;
		this.setBatchTransactionState('rolled-back');
		await this.recoveryJournalStore.clear();
		this.activeRecoveryJournal = null;
		this.notifyRecoveryStateChanged();
		return { status: 'rolled-back', result: snapshot, rollback: result, error: cause ? errorMessage(cause) : undefined };
	}

	private async rollbackPersistentFacts(pending: PendingSyncTransaction, result: SyncRollbackResult): Promise<void> {
		for (const rename of [...pending.renameExpectations].reverse()) {
			const existingOriginal = this.findVaultFilesByCollisionPath(rename.originalPath)[0];
			if (existingOriginal) {
				try {
					const identity = this.documentService.getSubjectIdentityFromContent(await this.app.vault.read(existingOriginal));
					if (identity.subjectId !== rename.subjectId) throw new Error(`Original path belongs to subject ${String(identity.subjectId)}, expected ${rename.subjectId}.`);
				} catch (error) {
					this.recordManagerRollbackFailure(result, 'restore-path', rename.originalPath, error);
				}
				continue;
			}
			const sourceFile = (rename.temporaryPath ? this.findVaultFilesByCollisionPath(rename.temporaryPath)[0] : null)
				?? this.findVaultFilesByCollisionPath(rename.finalPath)[0];
			const hiddenTemporaryPath = !sourceFile && rename.temporaryPath && await this.app.vault.adapter.exists(rename.temporaryPath)
				? rename.temporaryPath
				: null;
			if (!sourceFile && !hiddenTemporaryPath) {
				this.recordManagerRollbackFailure(result, 'restore-path', rename.originalPath, new Error('No recorded rename path exists.'));
				continue;
			}
			try {
				const content = sourceFile ? await this.app.vault.read(sourceFile) : await this.app.vault.adapter.read(hiddenTemporaryPath!);
				const identity = this.documentService.getSubjectIdentityFromContent(content);
				if (identity.subjectId !== rename.subjectId) throw new Error(`Rename source belongs to subject ${String(identity.subjectId)}, expected ${rename.subjectId}.`);
				await this.fileManager.ensureDirectory(rename.originalPath);
				if (sourceFile) await this.app.fileManager.renameFile(sourceFile, rename.originalPath);
				else await this.app.vault.adapter.rename(hiddenTemporaryPath!, rename.originalPath);
				result.attempted = true;
				result.changed = true;
				result.restoredPaths++;
			} catch (error) {
				this.recordManagerRollbackFailure(result, 'restore-path', rename.originalPath, error);
			}
		}
		for (const path of [...pending.forbiddenPathsAfterRollback].reverse()) {
			const file = this.findVaultFilesByCollisionPath(path)[0];
			if (!file) continue;
			try {
				await this.app.fileManager.trashFile(file);
				result.attempted = true;
				result.changed = true;
				result.deletedCreatedFiles++;
			} catch (error) {
				this.recordManagerRollbackFailure(result, 'delete-created', path, error);
			}
		}
		for (const expectation of pending.contentExpectations) {
			const rename = pending.renameExpectations.find(item => item.subjectId === expectation.subjectId);
			const candidates = [expectation.path, rename?.expectedTerminalPath, rename?.temporaryPath, rename?.finalPath]
				.filter((path): path is string => Boolean(path));
			const file = candidates.flatMap(path => this.findVaultFilesByCollisionPath(path))[0];
			if (!file) {
				this.recordManagerRollbackFailure(result, 'restore-content', expectation.path, new Error('Original content file is missing.'));
				continue;
			}
			try {
				const identity = this.documentService.getSubjectIdentityFromContent(await this.app.vault.read(file));
				if (identity.subjectId !== expectation.subjectId) throw new Error(`File belongs to subject ${String(identity.subjectId)}, expected ${expectation.subjectId}.`);
				await this.app.vault.process(file, () => expectation.originalContent);
				result.attempted = true;
				result.changed = true;
				result.restoredContents++;
			} catch (error) {
				this.recordManagerRollbackFailure(result, 'restore-content', expectation.path, error);
			}
		}
		for (const expectation of pending.updatedResourceExpectations) {
			try {
				const file = this.findVaultFilesByAnyPath(expectation.path)[0];
				if (!file) throw new Error('Updated binary resource is missing.');
				const original = decodeRecoveryBase64(expectation.originalContentBase64);
				if (original.byteLength !== expectation.originalByteLength) throw new Error('Recorded binary length does not match its recovery content.');
				if (await hashRecoveryBytes(original) !== expectation.originalSha256) throw new Error('Recorded binary recovery content hash is invalid.');
				await this.app.vault.modifyBinary(file, original.slice().buffer);
				const restored = new Uint8Array(await this.app.vault.readBinary(file));
				if (restored.byteLength !== expectation.originalByteLength || await hashRecoveryBytes(restored) !== expectation.originalSha256) {
					throw new Error('Restored binary failed SHA-256 verification.');
				}
				result.attempted = true;
				result.changed = true;
				result.restoredContents++;
			} catch (error) {
				this.recordManagerRollbackFailure(result, 'restore-binary', expectation.path, error);
			}
		}
	}

	private findVaultFilesByAnyPath(path: string): TFile[] {
		const normalized = normalizePath(path);
		const exact = this.app.vault.getAbstractFileByPath(normalized);
		const matches = this.app.vault.getFiles().filter(file => normalizePathCollisionKey(file.path) === normalizePathCollisionKey(normalized));
		return exact instanceof TFile ? [exact, ...matches.filter(file => file !== exact)] : matches;
	}

	private recordManagerRollbackFailure(result: SyncRollbackResult, operation: RollbackFailure['operation'], path: string, error: unknown): void {
		result.attempted = true;
		result.failed++;
		result.failures = [...(result.failures ?? []), { operation, path, message: errorMessage(error) }];
	}

	private markGroupsRolledBack(pending: PendingSyncTransaction): void {
		const snapshot = pending.resultSnapshot;
		this.markOutcomeIndexesRolledBack(snapshot, pending.groups);
	}

	private markOutcomeIndexesRolledBack(result: SyncResult, groups: ExecutedTransactionGroup[]): void {
		for (const group of groups) {
			for (const index of group.outcomeIndexes) {
				const outcome = result.outcomes[index];
				if (!outcome) continue;
				if (outcome.pathAction !== 'rolled-back') outcome.attemptedPathAction = outcome.pathAction;
				if (outcome.writeAction !== 'rolled-back') outcome.attemptedWriteAction = outcome.writeAction;
				if (outcome.pathAction === 'renamed' || outcome.writeAction === 'created' || outcome.writeAction === 'updated') {
					outcome.pathAction = 'rolled-back';
					outcome.writeAction = 'rolled-back';
				}
			}
		}
	}

	private snapshotAfterDecision(
		pending: PendingSyncTransaction,
		completion: 'committed' | 'rolled-back' | 'rollback-failed',
		rollback?: SyncRollbackResult,
		warnings: SyncWarning[] = [],
	): SyncResultWithRollback {
		const snapshot = pending.resultSnapshot;
		snapshot.warnings.push(...warnings);
		snapshot.canRollback = false;
		if (rollback) snapshot.rollback = rollback;
		this.finalizeSyncResult(snapshot, snapshot.wasCancelled);
		if (completion !== 'committed') snapshot.completion = completion;
		snapshot.success = completion === 'committed' && snapshot.failed === 0;
		return snapshot;
	}

	private findVaultFilesByCollisionPath(path: string): TFile[] {
		const normalized = normalizePath(path);
		const exact = this.app.vault.getAbstractFileByPath(normalized);
		const matches = this.app.vault.getMarkdownFiles()
			.filter(file => normalizePathCollisionKey(file.path) === normalizePathCollisionKey(normalized));
		if (exact instanceof TFile) {
			return [exact, ...matches.filter(file => file !== exact)];
		}
		return matches;
	}

	private recordAmbiguousConcretePath(path: string, files: readonly TFile[], diagnostics: RecoveryDiagnostic[]): void {
		if (files.length <= 1) return;
		diagnostics.push({
			code: 'blocking-local-file', path,
			message: `Multiple case-equivalent files match the recovery path: ${files.map(file => file.path).join(', ')}.`,
		});
	}

	private async collectRecoveryDiagnostics(recovery: RecoveryRequiredState, options: { ignoreJournalIssue?: boolean } = {}): Promise<RecoveryDiagnostic[]> {
		const diagnostics: RecoveryDiagnostic[] = [];
		if (recovery.journalIssue && !options.ignoreJournalIssue) diagnostics.push({
			code: 'blocking-local-file', path: '.bangumi-sync-recovery.json', message: recovery.journalIssue,
		});
		try {
			await this.incrementalSync.scanLocalFolder(recovery.scanRoot);
		} catch (error) {
			diagnostics.push({ code: 'rescan-failed', message: errorMessage(error) });
			return diagnostics;
		}
		const registry = this.incrementalSync.getRegistry();
		for (const issue of registry.invalidFiles) {
			if (issue.severity === 'blocking-error') diagnostics.push({ code: 'blocking-local-file', path: issue.path, message: `${issue.code}: ${issue.message}` });
		}
		for (const [subjectId, paths] of registry.duplicateIds) diagnostics.push({
			code: 'duplicate-subject-id', subjectId, paths: [...paths], message: `Subject ${subjectId} appears in multiple files.`,
		});
		for (const path of await this.findTransactionTemporaryPaths()) diagnostics.push({
			code: 'temporary-file', path, message: 'Temporary transaction file remains in the vault.',
		});
		diagnostics.push(...collectSubjectExpectationDiagnostics(recovery.subjectExpectations, registry));
		for (const expectation of recovery.contentExpectations) {
			const matches = this.findVaultFilesByCollisionPath(expectation.path);
			this.recordAmbiguousConcretePath(expectation.path, matches, diagnostics);
			const file = matches[0];
			if (!file) {
				diagnostics.push({ code: 'content-file-missing', subjectId: expectation.subjectId, path: expectation.path, message: 'The pre-batch file is missing.' });
				continue;
			}
			const content = await this.app.vault.read(file);
			const actualHash = await hashRecoveryContent(content);
			if (actualHash !== expectation.expectedContentHash || content.length !== expectation.originalContentLength) diagnostics.push({
				code: 'content-mismatch', subjectId: expectation.subjectId, path: expectation.path,
				expectedHash: expectation.expectedContentHash, actualHash,
				message: `Original content hash ${expectation.expectedContentHash.slice(0, 8)} does not match ${actualHash.slice(0, 8)}.`,
			});
		}
		for (const path of recovery.forbiddenPathsAfterRollback) {
			const matches = this.findVaultFilesByCollisionPath(path);
			this.recordAmbiguousConcretePath(path, matches, diagnostics);
			const file = matches[0];
			if (!file) continue;
			const identity = this.documentService.getSubjectIdentityFromContent(await this.app.vault.read(file));
			diagnostics.push({
				code: 'unexpected-created-path', path,
				actualSubjectId: identity.subjectId ?? undefined,
				message: `The concrete path created by the failed batch still exists: ${file.path}.`,
			});
		}
		for (const path of recovery.resourcePathsAfterRollback) {
			if (await this.app.vault.adapter.exists(path)) diagnostics.push({
				code: 'unexpected-created-path', path, message: `A cover resource created by the failed batch still exists: ${path}.`,
			});
		}
		for (const expectation of recovery.updatedResourceExpectations) {
			const matches = this.findVaultFilesByAnyPath(expectation.path);
			this.recordAmbiguousConcretePath(expectation.path, matches, diagnostics);
			const file = matches[0];
			if (!file) {
				diagnostics.push({ code: 'content-file-missing', subjectId: -1, path: expectation.path, message: 'The pre-update binary resource is missing.' });
				continue;
			}
			const bytes = new Uint8Array(await this.app.vault.readBinary(file));
			const actualHash = await hashRecoveryBytes(bytes);
			if (bytes.byteLength !== expectation.originalByteLength || actualHash !== expectation.originalSha256) diagnostics.push({
				code: 'content-mismatch', subjectId: -1, path: expectation.path,
				expectedHash: expectation.originalSha256, actualHash,
				message: `Original binary hash ${expectation.originalSha256.slice(0, 8)} does not match ${actualHash.slice(0, 8)}.`,
			});
		}
		for (const rename of recovery.renameExpectations) {
			const originals = this.findVaultFilesByCollisionPath(rename.expectedTerminalPath);
			this.recordAmbiguousConcretePath(rename.expectedTerminalPath, originals, diagnostics);
			const original = originals[0];
			if (!original) {
				diagnostics.push({
					code: 'missing-subject-file', subjectId: rename.subjectId, expectedPath: rename.expectedTerminalPath,
					message: `Renamed subject ${rename.subjectId} is not at its expected recovery path.`,
				});
			} else {
				const identity = this.documentService.getSubjectIdentityFromContent(await this.app.vault.read(original));
				if (identity.subjectId !== rename.subjectId) diagnostics.push({
					code: 'subject-identity-mismatch', subjectId: rename.subjectId, expectedPath: rename.expectedTerminalPath,
					actualSubjectId: identity.subjectId ?? -1,
					message: `${original.path} does not belong to renamed subject ${rename.subjectId}.`,
				});
			}
			if (rename.temporaryPath) {
				if (await this.app.vault.adapter.exists(rename.temporaryPath)) diagnostics.push({
					code: 'temporary-file', path: rename.temporaryPath, message: 'A recorded rename temporary path still exists.',
				});
			}
			if (normalizePathCollisionKey(rename.finalPath) !== normalizePathCollisionKey(rename.expectedTerminalPath)) {
				for (const final of this.findVaultFilesByCollisionPath(rename.finalPath)) diagnostics.push({
					code: 'unexpected-created-path', path: final.path,
					actualSubjectId: this.documentService.getSubjectIdentityFromContent(await this.app.vault.read(final)).subjectId ?? undefined,
					message: 'The failed rename final path still exists.',
				});
			}
		}
		const seen = new Set<string>();
		return diagnostics.filter(item => {
			const key = JSON.stringify(item);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	async diagnoseLocalSubjects(): Promise<LocalSubjectDiagnosticReport> {
		const scanRoot = this.config.scanFolderPath || 'ACGN';
		await this.incrementalSync.scanLocalFolder(scanRoot);
		const registry = this.incrementalSync.getRegistry();
		const issues: PathDiagnosticIssue[] = registry.invalidFiles.map(problem => ({ ...problem }));
		const preferredGroups = new Map<string, Array<{ subjectId: number; path: string }>>();

		await this.processConcurrently(Array.from(registry.idToRecord.values()), 3, async record => {
			if (record.namingState !== 'managed') {
				issues.push({
					severity: 'needs-user-decision',
					code: record.namingState === 'user-renamed' ? 'user-renamed' : 'unknown-path-state',
					message: record.namingState === 'user-renamed'
						? 'The current filename is user-managed and will not be renamed automatically.'
						: 'No previous managed-path state exists; automatic rename is disabled.',
					subjectId: record.subjectId,
					path: record.path,
				});
			}
			try {
				const subject = await this.client.getSubject(record.subjectId);
				const preferredPath = this.generatePreferredPath(subject);
				const key = normalizePathCollisionKey(preferredPath);
				const group = preferredGroups.get(key) ?? [];
				group.push({ subjectId: record.subjectId, path: preferredPath });
				preferredGroups.set(key, group);
			} catch (error) {
				issues.push({
					severity: 'needs-user-decision',
					code: 'subject-lookup-failed',
					message: error instanceof Error ? error.message : String(error),
					subjectId: record.subjectId,
					path: record.path,
				});
			}
		});

		for (const group of preferredGroups.values()) {
			if (group.length < 2) continue;
			issues.push({
				severity: 'needs-user-decision',
				code: 'template-path-collision',
				message: `The current template maps ${group.length} subjects to the same normalized path.`,
				subjectId: group[0].subjectId,
				path: group[0].path,
				relatedPaths: group.map(item => `${item.subjectId}: ${item.path}`),
			});
		}

		return {
			generatedAt: new Date().toISOString(),
			scanRoot,
			validSubjects: registry.idToRecord.size,
			issues,
		};
	}

	async exportDiagnosticReport(report?: LocalSubjectDiagnosticReport): Promise<string> {
		const actualReport = report ?? await this.diagnoseLocalSubjects();
		const stamp = actualReport.generatedAt.replace(/[:.]/g, '-');
		const path = `Bangumi Sync/Diagnostics/diagnostic-${stamp}.md`;
		await this.fileManager.ensureDirectory(path);
		await this.app.vault.create(path, formatDiagnosticReport(actualReport));
		return path;
	}

	async previewPathMigration(options: { includeUnknown?: boolean; includeUserRenamed?: boolean } = {}): Promise<PathMigrationPreview> {
		await this.incrementalSync.scanLocalFolder(this.config.scanFolderPath || 'ACGN');
		const registry = this.incrementalSync.getRegistry();
		const selected = Array.from(registry.idToRecord.values()).filter(record =>
			record.namingState === 'managed'
			|| (record.namingState === 'unknown' && options.includeUnknown)
			|| (record.namingState === 'user-renamed' && options.includeUserRenamed)
		);
		const selectedIds = new Set(selected.map(record => record.subjectId));
		const occupied = new Map(registry.pathToId);
		for (const record of selected) occupied.delete(normalizePathCollisionKey(record.path));
		const details = new Map<number, Subject>();
		const failures = new Map<number, string>();
		await this.processConcurrently(selected, 3, async record => {
			try {
				details.set(record.subjectId, await this.client.getSubject(record.subjectId));
			} catch (error) {
				failures.set(record.subjectId, error instanceof Error ? error.message : String(error));
			}
		});
		const candidates = selected.flatMap(record => {
			const subject = details.get(record.subjectId);
			if (!subject) return [];
			return [{
				subjectId: record.subjectId,
				preferredPath: this.generatePreferredPath(subject),
				year: extractPathVars(subject).year,
				namingState: 'managed' as const,
			}];
		});
		const plan = this.pathResolver.plan(candidates, occupied);
		const entries = Array.from(registry.idToRecord.values()).map(record => {
			if (!selectedIds.has(record.subjectId)) {
				return {
					subjectId: record.subjectId,
					name: record.nameCn,
					from: record.path,
					to: record.path,
					namingState: record.namingState,
					status: 'protected' as const,
					reason: 'User-renamed or unknown paths require explicit inclusion.',
				};
			}
			const error = failures.get(record.subjectId);
			if (error) {
				return { subjectId: record.subjectId, name: record.nameCn, from: record.path, to: record.path, namingState: record.namingState, status: 'failed' as const, reason: error };
			}
			const allocation = plan.allocations.get(record.subjectId);
			const to = allocation?.finalPath ?? record.path;
			return {
				subjectId: record.subjectId,
				name: record.nameCn,
				from: record.path,
				to,
				namingState: record.namingState,
				status: normalizePathCollisionKey(record.path) === normalizePathCollisionKey(to) ? 'unchanged' as const : 'rename' as const,
			};
		});
		return { generatedAt: new Date().toISOString(), entries };
	}

	async applyPathMigration(preview: PathMigrationPreview): Promise<{ renamed: number; failed: number }> {
		this.ensureCanStartSync();
		const renames = preview.entries
			.filter(entry => entry.status === 'rename')
			.map(entry => ({ subjectId: entry.subjectId, from: entry.from, to: entry.to }));
		const transaction = new SyncTransaction(this.app, this.fileManager);
		try {
			await transaction.executeRenames(renames);
			for (const rename of renames) this.incrementalSync.renameLocalSubject(rename.subjectId, rename.to);
			await this.persistPathStates();
			transaction.commit();
			return { renamed: renames.length, failed: 0 };
		} catch {
			await transaction.rollback();
			await this.incrementalSync.scanLocalFolder(this.config.scanFolderPath || 'ACGN');
			return { renamed: 0, failed: renames.length };
		}
	}

	/**
	 * 检查取消/暂停信号
	 * @returns true 如果已取消
	 */
	private async checkCancellation(): Promise<boolean> {
		if (this.cancellationSignal?.cancelled) {
			return true;
		}
		while (this.cancellationSignal?.paused) {
			await new Promise(resolve => activeWindow.setTimeout(resolve, 200));
		}
		return this.cancellationSignal?.cancelled ?? false;
	}

	/**
	 * 创建带回滚能力的同步结果
	 */
	private createSyncResultWithRollback(base: SyncResult, wasCancelled: boolean): SyncResultWithRollback {
		if (this.pendingTransaction) {
			const snapshot = this.pendingTransaction.resultSnapshot;
			Object.assign(snapshot, base, {
				batchFiles: snapshot.batchFiles,
				wasCancelled,
				canRollback: this.pendingTransaction.state === 'awaiting'
					&& this.pendingTransaction.transactions.some(transaction => transaction.hasRecordedChanges()),
			});
			if (this.lastAutomaticRollback) snapshot.rollback = this.lastAutomaticRollback;
			return snapshot;
		}
		return this.captureResultSnapshot(base, wasCancelled);
	}

	private captureResultSnapshot(base: SyncResult, wasCancelled: boolean): SyncResultWithRollback {
		const batchFiles = this.incrementalSync.getBatchSyncedFiles();
		return {
			...base,
			batchFiles,
			wasCancelled,
			canRollback: false,
			...(this.lastAutomaticRollback ? { rollback: this.lastAutomaticRollback } : {}),
		};
	}

	private recoveryExpectationsFor(
		subjectIds: Iterable<number>,
		originalRecords: ReadonlyMap<number, { path: string }>,
	): RecoverySubjectExpectation[] {
		return Array.from(new Set(subjectIds), subjectId => {
			const record = originalRecords.get(subjectId);
			return {
				subjectId,
				expectedToExist: Boolean(record),
				expectedPath: record?.path,
				expectedSubjectId: subjectId,
			};
		});
	}

	private createSyncResult(total = 0): SyncResult {
		this.lastAutomaticRollback = undefined;
		return {
			success: false,
			completion: 'failed',
			total,
			added: 0,
			skipped: 0,
			errors: 0,
			created: 0,
			updated: 0,
			unchanged: 0,
			renamed: 0,
			collisionResolved: 0,
			failed: 0,
			duration: 0,
			errorDetails: [],
			outcomes: [],
			warnings: [],
			rolledBack: 0,
		};
	}

	private recordPreparedFailure(result: SyncResult, failure: PreparationFailure): void {
		const name = failure.collection.subject.name_cn || failure.collection.subject.name || String(failure.collection.subject_id);
		result.failed++;
		result.errorDetails.push(`[${failure.collection.subject_id}] ${name}: ${failure.error}`);
		result.outcomes.push({
			subjectId: failure.collection.subject_id,
			name,
			pathAction: 'failed',
			writeAction: 'failed',
			error: failure.error,
		});
	}

	private recordWriteOutcome(result: SyncResult, prepared: PreparedCollection, writeStatus: FileWriteStatus): void {
		if (writeStatus !== 'unchanged') result.added++;
		result[writeStatus]++;
		const pathAction = prepared.allocation.renameFrom
			? 'renamed' as const
			: prepared.allocation.collisionResolved
				? 'collision-resolved' as const
				: 'unchanged' as const;
		if (pathAction === 'collision-resolved') result.collisionResolved++;
		result.outcomes.push({
			subjectId: prepared.collection.subject_id,
			preferredPath: prepared.allocation.preferredPath,
			actualPath: prepared.allocation.finalPath,
			pathAction,
			writeAction: writeStatus,
		});
	}

	private recordProcessingFailure(result: SyncResult, prepared: PreparedCollection, error: unknown): void {
		const collection = prepared.collection;
		const errorMessage = error instanceof Error ? error.message : String(error);
		const name = collection.subject.name_cn || collection.subject.name || String(collection.subject_id);
		result.failed++;
		result.errorDetails.push(`[${collection.subject_id}] ${name}: ${errorMessage}`);
		result.outcomes.push({
			subjectId: collection.subject_id,
			name,
			preferredPath: prepared.allocation.preferredPath,
			actualPath: prepared.allocation.finalPath,
			pathAction: 'failed',
			writeAction: 'failed',
			error: errorMessage,
		});
	}

	private finalizeSyncResult(result: SyncResult, wasCancelled: boolean): void {
		result.created = result.outcomes.filter(outcome => outcome.writeAction === 'created').length;
		result.updated = result.outcomes.filter(outcome => outcome.writeAction === 'updated').length;
		result.unchanged = result.outcomes.filter(outcome => outcome.writeAction === 'unchanged').length;
		result.failed = result.outcomes.filter(outcome => outcome.writeAction === 'failed').length;
		result.renamed = result.outcomes.filter(outcome => outcome.pathAction === 'renamed').length;
		result.rolledBack = result.outcomes.filter(outcome => outcome.pathAction === 'rolled-back' || outcome.writeAction === 'rolled-back').length;
		result.collisionResolved = result.outcomes.filter(outcome => outcome.pathAction === 'collision-resolved').length;
		result.added = result.created + result.updated;
		result.errors = result.failed;
		result.completion = this.lastAutomaticRollback?.attempted
			? this.lastAutomaticRollback.failed > 0 ? 'rollback-failed' : 'rolled-back'
			: determineSyncCompletion(result.added, result.failed, wasCancelled);
		result.success = result.completion === 'success';
	}

	private async executePreparedCollectionBatch(
		batch: PreparedCollectionBatch,
		concurrency: number,
		result: SyncResult,
		optionsFor: (prepared: PreparedCollection) => { overwrite: boolean; localPropertyValues?: LocalPropertyValueMap; preserveUserDataOnOverwrite: boolean },
		onProgress?: (prepared: PreparedCollection, index: number) => void,
	): Promise<{ wasCancelled: boolean; relations: Array<{ subjectId: number; filePath: string; relations: RelatedSubject[] }> }> {
		this.lastAutomaticRollback = undefined;
		this.assertNoPendingTransaction();
		this.setBatchTransactionState('active');
		const scanRootAtBatchStart = normalizePath(this.config.scanFolderPath || 'ACGN');
		const previousPathStates = this.clonePathStates(this.config.subjectPathStates ?? {});
		const originalRecords = new Map(Array.from(this.incrementalSync.getRegistry().idToRecord, ([subjectId, record]) => [subjectId, { path: record.path }]));
		const plannedSubjectIds = new Set([
			...batch.prepared.map(item => item.collection.subject_id),
			...batch.renamed.map(item => item.subjectId),
		]);
		const now = Date.now();
		const journal: PersistentRecoveryJournal = {
			schemaVersion: 1, journalId: `sync-${now}`, pluginVersion: '6.11.1', state: 'active', createdAt: now, updatedAt: now,
			scanRoot: scanRootAtBatchStart, affectedSubjectIds: Array.from(plannedSubjectIds), originalPathStates: previousPathStates,
			subjectExpectations: this.recoveryExpectationsFor(plannedSubjectIds, originalRecords), contentExpectations: [],
			createdPathExpectations: [], renameExpectations: [], createdResourcePaths: [], updatedResourceExpectations: [],
			orphanTemporaryPaths: [], resultSnapshot: this.captureResultSnapshot(result, false), attempts: [],
		};
		this.activeRecoveryJournal = journal;
		await this.recoveryJournalStore.write(journal);
		for (const failure of batch.failures) this.recordPreparedFailure(result, failure);

		let wasCancelled = false;
		const renderedByGroup = new Map<string, RenderedCollection[]>();
		const failedGroups = new Set<string>();
		await this.processConcurrently(batch.prepared, concurrency, async (prepared, index) => {
			const groupKey = batch.groupKeyBySubjectId.get(prepared.collection.subject_id) ?? `subject:${prepared.collection.subject_id}`;
			if (await this.checkCancellation()) {
				wasCancelled = true;
				return;
			}
			onProgress?.(prepared, index);
			try {
				const rendered = await this.renderCollection(prepared.collection, optionsFor(prepared), prepared);
				const items = renderedByGroup.get(groupKey) ?? [];
				items.push(rendered);
				renderedByGroup.set(groupKey, items);
			} catch (error) {
				failedGroups.add(groupKey);
				this.recordProcessingFailure(result, prepared, error);
			}
		});

		const relations: Array<{ subjectId: number; filePath: string; relations: RelatedSubject[] }> = [];
		const successfulTransactions: SyncTransaction[] = [];
		const successfulGroups: ExecutedTransactionGroup[] = [];
		const affectedSubjectIds = new Set<number>();
		const automaticRollback = this.emptyRollbackResult();
		let hadAutomaticRollback = false;
		let fatalRollbackFailure = false;
		const groupKeys = new Set<string>([
			...batch.prepared.map(item => batch.groupKeyBySubjectId.get(item.collection.subject_id) ?? `subject:${item.collection.subject_id}`),
			...batch.renamed.map(rename => batch.groupKeyBySubjectId.get(rename.subjectId) ?? `subject:${rename.subjectId}`),
		]);

		for (const groupKey of groupKeys) {
			const items = renderedByGroup.get(groupKey) ?? [];
			if (failedGroups.has(groupKey)) {
				for (const item of items) this.recordProcessingFailure(result, item.prepared, new Error('The atomic collision group was skipped because another item in the group failed during preparation.'));
				continue;
			}
			if (wasCancelled) continue;
			const renames = batch.renamed.filter(rename => (batch.groupKeyBySubjectId.get(rename.subjectId) ?? `subject:${rename.subjectId}`) === groupKey);
			const transaction = new SyncTransaction(this.app, this.fileManager, facts => this.persistBeforeVaultMutation(facts));
			const groupOutcomeStart = result.outcomes.length;
			const written: Array<{ item: RenderedCollection; writeStatus: FileWriteStatus }> = [];
			const writeFailures = new Set<number>();
			try {
				await transaction.executeRenames(renames);
				await this.processConcurrently(items, Math.min(concurrency, Math.max(1, items.length)), async item => {
					try {
						const writeResult = await this.writeRenderedCollection(item, transaction);
						written.push({ item, writeStatus: writeResult.writeStatus });
					} catch (error) {
						writeFailures.add(item.prepared.collection.subject_id);
						this.recordProcessingFailure(result, item.prepared, error);
					}
				});
				if (writeFailures.size > 0) throw new Error('An item write failed inside the atomic transaction group.');
			} catch (error) {
				for (const item of items) {
					if (!writeFailures.has(item.prepared.collection.subject_id)) this.recordProcessingFailure(result, item.prepared, error);
				}
				const rollback = await transaction.rollback();
				hadAutomaticRollback = hadAutomaticRollback || rollback.attempted;
				this.mergeRollbackResult(automaticRollback, rollback);
				fatalRollbackFailure = fatalRollbackFailure || rollback.failed > 0;
				if (fatalRollbackFailure) {
					successfulTransactions.push(transaction);
					successfulGroups.push({
						transaction,
						outcomeIndexes: Array.from({ length: result.outcomes.length - groupOutcomeStart }, (_, index) => groupOutcomeStart + index),
					});
					for (const rename of renames) affectedSubjectIds.add(rename.subjectId);
					for (const item of items) affectedSubjectIds.add(item.subject.id);
					break;
				}
				continue;
			}

			for (const rename of renames) {
				this.incrementalSync.renameLocalSubject(rename.subjectId, rename.to);
				affectedSubjectIds.add(rename.subjectId);
				if (!items.some(item => item.prepared.collection.subject_id === rename.subjectId)) {
					result.outcomes.push({
						subjectId: rename.subjectId, previousPath: rename.from, actualPath: rename.to,
						pathAction: 'renamed', writeAction: 'skipped',
					});
				}
			}
			for (const { item, writeStatus } of written) {
				const { subject, filePath, fileExisted } = item;
				this.incrementalSync.addBatchSyncedItem(subject.id, filePath, subject.name_cn || subject.name, !fileExisted);
				affectedSubjectIds.add(subject.id);
				relations.push({ subjectId: subject.id, filePath, relations: item.relations });
				this.recordWriteOutcome(result, item.prepared, writeStatus);
			}
			successfulTransactions.push(transaction);
			successfulGroups.push({
				transaction,
				outcomeIndexes: Array.from({ length: result.outcomes.length - groupOutcomeStart }, (_, index) => groupOutcomeStart + index),
			});
		}

		if (fatalRollbackFailure) {
			this.finalizeSyncResult(result, wasCancelled);
			const subjectExpectations = this.recoveryExpectationsFor(affectedSubjectIds, originalRecords);
			const recoveryFacts = await this.captureTransactionRecoveryFacts(successfulTransactions);
			const pending: PendingSyncTransaction = {
				transactions: successfulTransactions,
				groups: successfulGroups,
				previousPathStates,
				affectedSubjectIds: Array.from(affectedSubjectIds),
				subjectExpectations,
				scanRootAtBatchStart,
				...recoveryFacts,
				deferredRelations: relations,
				resultSnapshot: this.captureResultSnapshot(result, wasCancelled),
				createdAt: Date.now(),
				state: 'rolling-back',
			};
			this.pendingTransaction = pending;
			await this.persistPendingJournal(pending, 'rolling-back');
			const decision = await this.rollbackPendingTransaction(pending);
			this.markOutcomeIndexesRolledBack(result, successfulGroups);
			this.lastAutomaticRollback = decision.rollback ?? automaticRollback;
			return { wasCancelled, relations: [] };
		}

		const hasPendingChanges = successfulTransactions.some(transaction => transaction.hasChanges());
		if (hasPendingChanges && (result.failed > 0 || wasCancelled)) {
			this.finalizeSyncResult(result, wasCancelled);
			const recoveryFacts = await this.captureTransactionRecoveryFacts(successfulTransactions);
			this.pendingTransaction = {
				transactions: successfulTransactions,
				groups: successfulGroups,
				previousPathStates,
				affectedSubjectIds: Array.from(affectedSubjectIds),
				subjectExpectations: this.recoveryExpectationsFor(affectedSubjectIds, originalRecords),
				scanRootAtBatchStart,
				...recoveryFacts,
				deferredRelations: relations,
				resultSnapshot: this.captureResultSnapshot(result, wasCancelled),
				createdAt: Date.now(),
				state: 'awaiting',
			};
			await this.persistPendingJournal(this.pendingTransaction, 'awaiting-decision');
			this.setBatchTransactionState('awaiting-user-decision');
			return { wasCancelled, relations: [] };
		}

		if (successfulTransactions.length > 0) {
			try {
				await this.persistPathStates();
				for (const transaction of successfulTransactions) transaction.commit();
				this.incrementalSync.finishBatch();
				this.setBatchTransactionState('committed');
				await this.recoveryJournalStore.clear();
				this.activeRecoveryJournal = null;
			} catch {
				this.finalizeSyncResult(result, wasCancelled);
				const recoveryFacts = await this.captureTransactionRecoveryFacts(successfulTransactions);
				const pending: PendingSyncTransaction = {
					transactions: successfulTransactions, groups: successfulGroups, previousPathStates,
					affectedSubjectIds: Array.from(affectedSubjectIds), deferredRelations: relations,
					subjectExpectations: this.recoveryExpectationsFor(affectedSubjectIds, originalRecords),
					scanRootAtBatchStart,
					...recoveryFacts,
					resultSnapshot: this.captureResultSnapshot(result, wasCancelled),
					createdAt: Date.now(), state: 'rolling-back',
				};
				this.pendingTransaction = pending;
				await this.persistPendingJournal(pending, 'rolling-back');
				const decision = await this.rollbackPendingTransaction(pending);
				this.lastAutomaticRollback = decision.rollback;
				this.markOutcomeIndexesRolledBack(result, successfulGroups);
			}
		} else {
			this.incrementalSync.clearBatch();
			this.setBatchTransactionState(hadAutomaticRollback
				? automaticRollback.failed > 0 ? 'rollback-failed' : 'rolled-back'
				: 'none');
			if (hadAutomaticRollback) this.lastAutomaticRollback = automaticRollback;
			await this.recoveryJournalStore.clear();
			this.activeRecoveryJournal = null;
		}
		return { wasCancelled, relations: result.failed === 0 ? relations : [] };
	}

	/**
	 * 执行同步
	 * 优化：支持并发处理多个条目，提高同步速度
	 */
	async sync(options: SyncOptions, concurrency: number = 3): Promise<SyncResultWithRollback> {
		this.ensureCanStartSync();
		const startTime = Date.now();
		let wasCancelled = false;
		const result = this.createSyncResult();

		try {
			const { diff } = await this.prepareSyncData(options);

			result.total = diff.toAdd.length;
			result.skipped = diff.toSkip.length;

			// 开始批次同步
			this.assertNoPendingTransaction();
			this.incrementalSync.startBatch();
			const batch = await this.prepareCollectionBatch(diff.toAdd, concurrency);
			const execution = await this.executePreparedCollectionBatch(
				batch,
				concurrency,
				result,
				() => ({ overwrite: false, preserveUserDataOnOverwrite: false }),
				(prepared, index) => this.reportProgress({
					status: 'processing', current: index + 1, total: diff.toAdd.length,
					currentItem: prepared.collection.subject.name_cn || prepared.collection.subject.name,
					message: `处理条目... (${index + 1}/${diff.toAdd.length})`,
				}),
			);
			wasCancelled = execution.wasCancelled;

			this.finalizeSyncResult(result, wasCancelled);

			if (!wasCancelled) {
				this.reportProgress({ status: 'completed', message: tn('notices', 'syncComplete') });
			} else {
				this.reportProgress({ status: 'error', message: tn('notices', 'syncCancelled') });
			}

		} catch (error: unknown) {
			if (error instanceof PendingSyncTransactionError) throw error;
			console.error('[Bangumi Sync] 同步失败:', error);
			this.reportProgress({ status: 'error', message: error instanceof Error ? error.message : String(error) });
			new Notice(`${tn('notices', 'syncFailed')}: ${error instanceof Error ? error.message : String(error)}`);
		}

		result.duration = Date.now() - startTime;
		return this.createSyncResultWithRollback(result, wasCancelled);
	}

	/**
	 * 并发处理数组中的元素
	 * @param items 要处理的数组
	 * @param concurrency 并发数
	 * @param processor 处理函数
	 */
	private async processConcurrently<T>(
		items: T[],
		concurrency: number,
		processor: (item: T, index: number) => Promise<void>
	): Promise<void> {
		const queue = [...items.map((item, index) => ({ item, index }))];
		const workers: Promise<void>[] = [];

		// 创建工作线程
		for (let i = 0; i < Math.min(concurrency, items.length); i++) {
			workers.push(this.processQueue(queue, processor));
		}

		// 等待所有工作线程完成
		await Promise.all(workers);
	}

	/**
	 * 处理队列中的任务
	 */
	private async processQueue<T>(
		queue: { item: T; index: number }[],
		processor: (item: T, index: number) => Promise<void>
	): Promise<void> {
		while (queue.length > 0) {
			const task = queue.shift();
			if (!task) break;

			await processor(task.item, task.index);
		}
	}

	private async prepareCollectionBatch(
		collections: UserCollection[],
		concurrency: number,
	): Promise<PreparedCollectionBatch> {
		await this.incrementalSync.scanLocalFolder(this.config.scanFolderPath || 'ACGN');
		const registry = this.incrementalSync.getRegistry();
		const details = new Map<number, FullSubjectInfo>();
		const failures: PreparationFailure[] = [];

		await this.processConcurrently(collections, concurrency, async collection => {
			if (registry.duplicateIds.has(collection.subject_id)) {
				failures.push({
					collection,
					error: `Subject ${collection.subject_id} appears in multiple local files.`,
				});
				return;
			}
			try {
				details.set(collection.subject_id, await this.client.getFullSubjectInfo(collection.subject_id));
			} catch (error) {
				failures.push({
					collection,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		});

		const candidates = collections.flatMap(collection => {
			const fullInfo = details.get(collection.subject_id);
			if (!fullInfo) return [];
			const existing = registry.getById(collection.subject_id);
			const preferredPath = this.generatePreferredPath(fullInfo.subject, collection);
			if (existing?.namingState === 'unknown') {
				registry.markInferredManaged(collection.subject_id, preferredPath);
			}
			const reconciled = registry.getById(collection.subject_id);
			return [{
				subjectId: collection.subject_id,
				preferredPath,
				year: extractPathVars(fullInfo.subject, collection).year,
				currentPath: reconciled?.path,
				namingState: reconciled?.namingState ?? 'managed' as const,
			}];
		});
		const contextIds = new Set<number>();
		for (const candidate of candidates) {
			const owner = registry.getPathOwner(candidate.preferredPath);
			if (owner !== undefined && !details.has(owner)) contextIds.add(owner);
		}
		const contextRecords = Array.from(contextIds).flatMap(subjectId => {
			const record = registry.getById(subjectId);
			return record ? [record] : [];
		});
		await this.processConcurrently(contextRecords, concurrency, async record => {
			try {
				const subject = await this.client.getSubject(record.subjectId);
				const preferredPath = this.generatePreferredPath(subject);
				if (record.namingState === 'unknown') {
					registry.markInferredManaged(record.subjectId, preferredPath);
				}
				const reconciled = registry.getById(record.subjectId) ?? record;
				candidates.push({
					subjectId: record.subjectId,
					preferredPath,
					year: extractPathVars(subject).year,
					currentPath: reconciled.path,
					namingState: reconciled.namingState,
				});
			} catch {
				// The existing subject remains protected by its current path if context lookup fails.
			}
		});
		const pathPlan = this.pathResolver.plan(candidates, registry.pathToId);

		const prepared: PreparedCollection[] = [];
		for (const collection of collections) {
			const fullInfo = details.get(collection.subject_id);
			const allocation = pathPlan.allocations.get(collection.subject_id);
			if (fullInfo && allocation) {
				prepared.push({ collection, fullInfo, allocation });
			}
		}
		const groupKeyBySubjectId = new Map<number, string>();
		for (const candidate of candidates) {
			const allocation = pathPlan.allocations.get(candidate.subjectId);
			groupKeyBySubjectId.set(candidate.subjectId, allocation?.collisionResolved
				? `collision:${normalizePathCollisionKey(candidate.preferredPath)}`
				: `subject:${candidate.subjectId}`);
		}
		return { prepared, failures, renamed: pathPlan.renamed, groupKeyBySubjectId };
	}

	/**
	 * 准备同步数据：验证 Token、获取收藏、扫描本地、计算差异
	 * sync() 和 prepareSync() 的共享逻辑
	 */
	private async prepareSyncData(options: SyncOptions): Promise<{
		username: string;
		collections: UserCollection[];
		diff: { toAdd: UserCollection[]; toSkip: UserCollection[] };
	}> {
		// 1. 验证 Access Token
		if (!this.config.accessToken) {
			throw new Error(tn('notices', 'configureTokenFirst'));
		}

		this.reportProgress({ status: 'preparing', message: tn('syncModal', 'validatingToken') });

		const tokenResult = await this.client.validateToken();
		if (!tokenResult.valid) {
			throw new Error(tnFormat('notices', 'tokenInvalid', { error: tokenResult.error || '' }));
		}

		const username = tokenResult.username;
		if (!username) {
			throw new Error(tn('notices', 'usernameNotFound'));
		}

		console.debug(`[Bangumi Sync] 用户: ${username}`);

		// 2. 获取远程收藏列表
		this.reportProgress({ status: 'fetching', message: tn('syncModal', 'fetchingCollections') });

		const collections = await this.client.getAllUserCollections(username, {
			subjectType: options.subjectTypes.length === 1 ? options.subjectTypes[0] : undefined,
			collectionType: options.collectionTypes.length === 1 ? options.collectionTypes[0] : undefined,
			onProgress: (current, total) => {
				this.reportProgress({
					status: 'fetching',
					current,
					total,
					message: `${tn('syncModal', 'fetchingCollections')} (${current}/${total})`,
				});
			},
		});

		console.debug(`[Bangumi Sync] 获取到 ${collections.length} 条收藏`);

		// 3. 扫描本地文件夹
		this.reportProgress({ status: 'scanning', message: tn('syncModal', 'scanningLocal') });

		const scanPath = this.config.scanFolderPath || 'ACGN';
		console.debug(`[Bangumi Sync] 扫描路径: ${scanPath}`);

		await this.incrementalSync.scanLocalFolder(scanPath, (current, total) => {
			this.reportProgress({
				status: 'scanning',
				current,
				total,
				message: `${tn('syncModal', 'scanningLocal')} (${current}/${total})`,
			});
		});

		// 4. 计算差异
		this.reportProgress({ status: 'preparing', message: tn('syncModal', 'computingDiff') });

		const filteredCollections = this.filterCollections(collections, options);
		console.debug(`[Bangumi Sync] 符合条件的收藏: ${filteredCollections.length}`);

		const diff = this.incrementalSync.computeDiff(filteredCollections, {
			limit: options.limit,
			force: options.force,
		});

		console.debug(`[Bangumi Sync] 需要同步: ${diff.toAdd.length}，已存在跳过: ${diff.toSkip.length}`);

		return { username, collections, diff };
	}

	/**
	 * 过滤符合条件的收藏
	 */
	private filterCollections(
		collections: UserCollection[],
		options: SyncOptions
	): UserCollection[] {
		return collections.filter(c => {
			// 检查条目类型
			if (options.subjectTypes.length > 0 && !options.subjectTypes.includes(c.subject_type)) {
				return false;
			}
			// 检查收藏类型
			if (options.collectionTypes.length > 0 && !options.collectionTypes.includes(c.type)) {
				return false;
			}
			return true;
		});
	}

	/**
	 * 从路径模板提取基础路径
	 * 例如: "ACGN/{{type}}/{{name_cn}}.md" -> "ACGN"
	 */
	private extractBasePath(pathTemplate: string): string {
		const match = pathTemplate.match(/^([^/{}]+)/);
		return match ? match[1] : '';
	}

	/**
	 * 根据条目类型解析路径模板
	 * 优先使用类型独立模板，回退到默认模板
	 */
	private resolvePathTemplate(subject: Subject): string {
		if (this.config.pathTemplateByType) {
			const vars = extractPathVars(subject);
			const typeTemplate = this.config.pathTemplateByType[vars.type];
			if (typeTemplate) return typeTemplate;
		}
		return this.config.pathTemplate;
	}

	private generatePreferredPath(subject: Subject, collection?: UserCollection): string {
		const basePath = generateFilePath(this.resolvePathTemplate(subject), subject, collection);
		const strategy = this.config.pathNamingStrategy ?? 'simple-until-collision';
		if (strategy === 'always-id') {
			return this.appendPathSuffix(basePath, `[bgm-${subject.id}]`);
		}
		if (strategy === 'always-year') {
			const year = extractPathVars(subject, collection).year;
			return this.appendPathSuffix(basePath, year ? `（${year}）` : `[bgm-${subject.id}]`);
		}
		return basePath;
	}

	private appendPathSuffix(path: string, suffix: string): string {
		return path.toLocaleLowerCase('en-US').endsWith('.md')
			? `${path.slice(0, -3)}${suffix}.md`
			: `${path}${suffix}.md`;
	}

	/**
	 * V4: 获取章节数据
	 * 仅对动画、小说、漫画类型获取
	 */
	private async fetchEpisodeData(subject: Subject): Promise<{
		episodes: Episode[];
		userStatus: UserEpisodeCollection[];
	} | null> {
		// 判断是否需要获取章节
		// 动画（type=2）始终获取
		// 书籍（type=1）需要检查 category 是否为小说或漫画
		// 三次元（type=6）始终获取
		if (subject.type !== SubjectType.Anime && subject.type !== SubjectType.Book && subject.type !== SubjectType.Real) {
			return null;
		}

		try {
			console.debug(`[Bangumi Sync] 获取章节信息: ${subject.name_cn}`);

			// 获取章节列表
			const episodesData = await this.client.getEpisodes(subject.id);
			const episodes = episodesData.data;

			if (!episodes || episodes.length === 0) {
				console.debug(`[Bangumi Sync] 无章节信息`);
				return null;
			}

			// 获取用户章节状态
			let userStatus: UserEpisodeCollection[] = [];
			try {
				userStatus = await this.client.getUserEpisodeStatus(subject.id);
			} catch {
				console.debug(`[Bangumi Sync] 获取用户章节状态失败，可能未收藏此条目`);
			}

			return { episodes, userStatus };
		} catch (error) {
			console.error(`[Bangumi Sync] 获取章节信息失败:`, error);
			return null;
		}
	}

	/**
	 * 从文件路径提取显示名称（不含扩展名）
	 * 例如: "ACGN/anime/金牌得主(动画).md" -> "金牌得主(动画)"
	 */
	private extractDisplayNameFromPath(path: string): string {
		const fileName = path.split('/').pop() || path;
		return fileName.replace(/\.md$/, '');
	}

	getCustomTemplates(): CustomTemplates | undefined {
		return this.config.customTemplates;
	}

	/**
	 * 下载并解析本地封面路径
	 */
	private async resolveLocalCoverPath(subject: Subject, typeLabel: string): Promise<string> {
		const coverUrl = this.imageHandler.selectImageUrlByQuality(subject.images);
		if (!this.config.downloadImages || !coverUrl) {
			return '';
		}

		console.debug(`[Bangumi Sync] 下载封面: ${coverUrl}`);
		const localPath = await this.imageHandler.downloadCover(
			coverUrl,
			subject.id,
			this.config.imagePathTemplate,
			{
				name_cn: subject.name_cn,
				name: subject.name,
				typeLabel,
			}
		);

		return localPath && !localPath.startsWith('http') ? localPath : '';
	}

	/**
	 * 生成相关条目链接
	 * 返回已同步条目的链接（包括本批次已同步的）
	 * 显示名称使用文件名（带类型后缀）
	 */
	private generateRelatedLinks(relations: { id: number; name_cn: string; name: string }[]): string[] {
		console.debug(`[Bangumi Sync] 处理 ${relations?.length || 0} 个相关条目`);
		if (!relations || relations.length === 0) {
			console.debug(`[Bangumi Sync] 无相关条目数据`);
			return [];
		}
		const links: string[] = [];
		for (const relation of relations) {
			console.debug(`[Bangumi Sync] 检查相关条目: ${relation.name_cn || relation.name} (ID: ${relation.id})`);
			const localPath = this.resolveRelatedLocalPath(relation.id);
			console.debug(`[Bangumi Sync] 本地路径: ${localPath || '未同步'}`);
			if (localPath) {
				// 使用文件名作为显示名称（带类型后缀）
				const displayName = this.extractDisplayNameFromPath(localPath);
				const link = `[[${localPath}|${displayName}]]`;
				links.push(link);
				console.debug(`[Bangumi Sync] 相关条目已同步: ${relation.name_cn} -> ${link}`);
			}
		}
		console.debug(`[Bangumi Sync] 生成了 ${links.length} 个相关链接`);
		return links;
	}

	private resolveRelatedLocalPath(subjectId: number): string | undefined {
		const indexedPath = this.incrementalSync.getLocalPath(subjectId);
		if (indexedPath) {
			return indexedPath;
		}

		// 使用优化的 metadataCache 查找方法
		const scanRoot = this.config.scanFolderPath || '';
		return this.incrementalSync.resolvePathByMetadataCache(subjectId, scanRoot);
	}

	/**
	 * 报告进度
	 */
	private reportProgress(progress: Partial<SyncProgress>): void {
		if (this.onProgress) {
			this.onProgress({
				current: 0,
				total: 0,
				status: 'preparing',
				...progress,
			});
		}
	}

	/**
	 * 按 UserCollection 列表同步条目
	 * 用于控制面板选中同步功能，保留用户数据（评分、状态、短评等）
	 */
	async syncByCollections(
		collections: UserCollection[],
		options?: {
			overwrite?: boolean;
			localPropertyValuesBySubjectId?: Map<number, LocalPropertyValueMap>;
			concurrency?: number;
		},
		onProgress?: (current: number, total: number, message: string) => void
	): Promise<SyncResultWithRollback> {
		this.ensureCanStartSync();
		const startTime = Date.now();
		let wasCancelled = false;
		const result = this.createSyncResult(collections.length);

		const overwrite = options?.overwrite ?? false;
		const localPropertyValuesBySubjectId = options?.localPropertyValuesBySubjectId;
		const concurrency = options?.concurrency ?? 3;

		try {
			console.debug(`[Bangumi Sync] 开始按收藏列表同步 ${collections.length} 个条目，覆盖模式: ${overwrite}，并发数: ${concurrency}`);

			// 开始批次同步
			this.assertNoPendingTransaction();
			this.incrementalSync.startBatch();
			const batch = await this.prepareCollectionBatch(collections, concurrency);
			const execution = await this.executePreparedCollectionBatch(
				batch,
				concurrency,
				result,
				prepared => ({
					overwrite,
					preserveUserDataOnOverwrite: true,
					localPropertyValues: localPropertyValuesBySubjectId?.get(prepared.collection.subject_id),
				}),
				(_prepared, index) => {
					onProgress?.(index + 1, collections.length, `正在同步条目 ${index + 1}/${collections.length}`);
					this.reportProgress({ status: 'processing', current: index + 1, total: collections.length, message: `同步条目... (${index + 1}/${collections.length})` });
				},
			);
			wasCancelled = execution.wasCancelled;
			const batchRelations = execution.relations;

			// 后处理：为同批次相关条目补充双向链接
			if (batchRelations.length > 0) {
				result.warnings.push(...await this.postProcessBatchRelations(batchRelations));
			}

			this.finalizeSyncResult(result, wasCancelled);

			if (!wasCancelled) {
				this.reportProgress({ status: 'completed', message: tn('notices', 'syncComplete') });
			} else {
				this.reportProgress({ status: 'error', message: tn('notices', 'syncCancelled') });
			}

		} catch (error) {
			if (error instanceof PendingSyncTransactionError) throw error;
			console.error('[Bangumi Sync] 按收藏列表同步失败:', error);
			this.reportProgress({ status: 'error', message: String(error) });
		}

		result.duration = Date.now() - startTime;
		return this.createSyncResultWithRollback(result, wasCancelled);
	}

	/**
	 * 重置同步状态
	 */
	resetSyncState(): void {
		this.incrementalSync.clear();
	}

	/**
	 * 准备同步：获取数据并计算差异，返回预览数据
	 * 用于手动同步模式，在显示预览弹窗前调用
	 */
	async prepareSync(options: SyncOptions): Promise<{
		success: boolean;
		previewItems?: SyncPreviewItem[];
		skipped: number;
		error?: string;
	}> {
		this.ensureCanStartSync();
		try {
			const { diff } = await this.prepareSyncData(options);

			// 创建预览数据
			const previewItems: SyncPreviewItem[] = diff.toAdd.map(collection => ({
				id: collection.subject_id,
				name_cn: collection.subject.name_cn || '',
				name: collection.subject.name || '',
				type: collection.subject_type,
				typeLabel: getTypeLabel(collection.subject_type),
				rating: collection.subject.score || 0,
				my_rate: collection.rate,
				collection,
				selected: true,
			}));

			return {
				success: true,
				previewItems,
				skipped: diff.toSkip.length,
			};

		} catch (error) {
			console.error('[Bangumi Sync] 准备同步失败:', error);
			this.reportProgress({ status: 'error', message: String(error) });
			return {
				success: false,
				skipped: 0,
				error: String(error),
			};
		}
	}

	/**
	 * 执行同步：根据预览数据执行实际导入
	 * 用于手动同步模式，在用户确认后调用
	 */
	async executeSync(
		previewItems: SyncPreviewItem[],
		action: 'all' | 'selected' | 'unselected',
		localPropertyResult?: LocalPropertyModalResult,
		concurrency: number = 3
	): Promise<SyncResultWithRollback> {
		this.ensureCanStartSync();
		const startTime = Date.now();
		let wasCancelled = false;
		const result = this.createSyncResult();

		try {
			// 根据用户选择过滤条目
			let itemsToSync: SyncPreviewItem[];
			if (action === 'all') {
				itemsToSync = previewItems;
			} else if (action === 'selected') {
				itemsToSync = previewItems.filter(item => item.selected);
			} else {
				itemsToSync = previewItems.filter(item => !item.selected);
			}

			result.total = itemsToSync.length;
			console.debug(`[Bangumi Sync] 开始同步 ${itemsToSync.length} 个条目，并发数: ${concurrency}`);

			// 开始批次同步
			this.assertNoPendingTransaction();
			this.incrementalSync.startBatch();
			const batch = await this.prepareCollectionBatch(
				itemsToSync.map(item => item.collection),
				concurrency,
			);
			const execution = await this.executePreparedCollectionBatch(
				batch,
				concurrency,
				result,
				prepared => ({
					overwrite: false,
					preserveUserDataOnOverwrite: false,
					localPropertyValues: localPropertyResult?.propertyValuesBySubjectId?.get(prepared.collection.subject_id),
				}),
				(prepared, index) => this.reportProgress({
					status: 'processing', current: index + 1, total: itemsToSync.length,
					currentItem: prepared.collection.subject.name_cn || prepared.collection.subject.name,
					message: `处理条目... (${index + 1}/${itemsToSync.length})`,
				}),
			);
			wasCancelled = execution.wasCancelled;
			const batchRelations = execution.relations;

			// 后处理：为同批次相关条目补充双向链接
			if (batchRelations.length > 0) {
				result.warnings.push(...await this.postProcessBatchRelations(batchRelations));
			}

			this.finalizeSyncResult(result, wasCancelled);

			if (!wasCancelled) {
				this.reportProgress({ status: 'completed', message: tn('notices', 'syncComplete') });
			} else {
				this.reportProgress({ status: 'error', message: tn('notices', 'syncCancelled') });
			}

		} catch (error: unknown) {
			if (error instanceof PendingSyncTransactionError) throw error;
			console.error('[Bangumi Sync] 执行同步失败:', error);
			this.reportProgress({ status: 'error', message: error instanceof Error ? error.message : String(error) });
			new Notice(`${tn('notices', 'syncFailed')}: ${error instanceof Error ? error.message : String(error)}`);
		}

		result.duration = Date.now() - startTime;
		return this.createSyncResultWithRollback(result, wasCancelled);
	}

	/**
	 * 处理单个收藏条目
	 * 统一处理：获取详情、生成内容、写入文件、更新双向链接
	 */
	private async renderCollection(
		collection: UserCollection,
		options: { overwrite: boolean; localPropertyValues?: LocalPropertyValueMap; preserveUserDataOnOverwrite: boolean },
		prepared: PreparedCollection,
	): Promise<RenderedCollection> {
		console.debug(`[Bangumi Sync] 处理条目: ${collection.subject.name_cn || collection.subject.name}`);

		// 获取完整条目信息
		const { subject, characters: relatedCharacters, relations, persons } = prepared.fullInfo;
		console.debug(`[Bangumi Sync] 获取到条目信息: ${subject.name_cn}`);

		// 解析角色信息
		const characters = parseCharacters(relatedCharacters, 9);

		// 获取类型标签
		const typeLabel = getTypeLabel(subject.type);

		// 下载封面图片
		const localCoverPath = await this.resolveLocalCoverPath(subject, typeLabel);

		// 生成文件路径
		const filePath = prepared.allocation.finalPath;

		// 获取章节信息
		const episodeData = await this.fetchEpisodeData(subject);

		// 构建额外模板变量（当有自定义属性或需要覆盖时才解析）
		let extraTemplateVars: Record<string, string> | undefined;
		if (options.localPropertyValues || options.overwrite) {
			const templateProperties = getTemplatePropertyGroupsForSubject(subject, this.config.customTemplates).customProperties;
			extraTemplateVars = buildExtraTemplateVarsFromPropertyValues(templateProperties, options.localPropertyValues);
		}

		// 生成相关条目链接
		const relatedLinks = this.config.enableRelatedLinks !== false
			? this.generateRelatedLinks(relations)
			: [];

		// 生成文件内容
		let content = generateContentByType(
			subject,
			collection,
			characters,
			this.config.customTemplates,
			undefined,
			episodeData?.episodes,
			episodeData?.userStatus,
			this.config.notePathTemplate,
			this.config.coverLinkType,
			localCoverPath,
			relatedLinks,
			extraTemplateVars,
			persons
		);

		// 应用自定义属性值
		const explicitLocalPropertyValues = options.localPropertyValues && Object.keys(options.localPropertyValues).length > 0
			? options.localPropertyValues
			: undefined;
		if (explicitLocalPropertyValues) {
			content = applyNamedPropertyValuesToContent(content, explicitLocalPropertyValues);
		}

		// 文件已存在时保护用户数据（记录、感想等）
		if (options.preserveUserDataOnOverwrite) {
			const existingPath = prepared.allocation.renameFrom ?? filePath;
			const existingFile = await this.fileManager.assertPathOwnership(existingPath, subject.id);
			if (existingFile) {
				const localUserData = await this.userDataExtractor.extractFromFileAsync(existingFile);
				if (localUserData) {
					const dataProtection = this.config.dataProtection || DEFAULT_DATA_PROTECTION_SETTINGS;
					content = this.userDataMerger.mergeUserData(existingFile, content, localUserData, dataProtection);
					console.debug(`[Bangumi Sync] 已保护用户数据: ${localUserData.identifier.name_cn}`);
				}
			}
			if (explicitLocalPropertyValues) {
				content = applyNamedPropertyValuesToContent(content, explicitLocalPropertyValues);
			}
		}

		// 判断文件是否已存在（用于回滚跟踪）
		const fileExisted = this.fileManager.getFile(prepared.allocation.renameFrom ?? filePath) !== null;

		// 创建或更新文件
		// 当 preserveUserDataOnOverwrite 为 true 且文件已存在时，使用 overwrite 确保 API 数据（如具体类型）更新
		const shouldOverwrite = options.overwrite || (options.preserveUserDataOnOverwrite && fileExisted);
		return { prepared, subject, filePath, content, fileExisted, shouldOverwrite, relations };
	}

	private async writeRenderedCollection(
		rendered: RenderedCollection,
		transaction: SyncTransaction,
	): Promise<{ subjectId: number; filePath: string; relations: RelatedSubject[]; writeStatus: FileWriteStatus }> {
		const { subject, filePath, content, shouldOverwrite, relations } = rendered;
		const writeOptions = { overwrite: shouldOverwrite, subjectId: subject.id };
		const writeResult = await transaction.createOrUpdateFile(filePath, content, writeOptions);
		console.debug(`[Bangumi Sync] 文件创建完成: ${filePath}`);

		return { subjectId: subject.id, filePath, relations, writeStatus: writeResult.status };
	}

	/**
	 * 更新已同步相关条目的链接（双向链接）
	 * 批量处理：先收集所有需要更新的关联关系，按目标文件分组，每个文件只读写一次
	 */
	private async updateRelatedItemsBidirectional(
		currentId: number,
		currentPath: string,
		currentName: string,
		relations: { id: number; name_cn: string; name: string }[]
	): Promise<SyncWarning[]> {
		const warnings: SyncWarning[] = [];
		const displayName = this.extractDisplayNameFromPath(currentPath);
		const currentLink = `[[${currentPath}|${displayName}]]`;

		// 收集需要更新的文件及其新增链接
		const updatesByFile = new Map<string, { subjectId: number; links: string[] }>();

		for (const relation of relations) {
			const relatedPath = this.resolveRelatedLocalPath(relation.id);
			if (relatedPath) {
				const existing = updatesByFile.get(relatedPath) ?? { subjectId: relation.id, links: [] };
				existing.links.push(currentLink);
				updatesByFile.set(relatedPath, existing);
			}
		}

		// 批量更新每个目标文件
		for (const [path, update] of updatesByFile) {
			try {
				await this.updateRelatedFile(path, update.subjectId, update.links);
			} catch (error) {
				console.error(`[Bangumi Sync] 更新相关条目链接失败: ${path}`, error);
				warnings.push({
					subjectId: update.subjectId,
					operation: 'related-link-update',
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}
		return warnings;
	}

	/**
	 * 后处理同批次相关条目的双向链接
	 * 解决并发同步时相关条目互相检测不到的问题
	 * 按目标文件分组，每个文件只读写一次
	 */
	private async postProcessBatchRelations(
		batchItems: { subjectId: number; filePath: string; relations: RelatedSubject[] }[]
	): Promise<SyncWarning[]> {
		const warnings: SyncWarning[] = [];
		if (this.config.enableRelatedLinks === false) return warnings;
		for (const item of batchItems) {
			warnings.push(...await this.updateRelatedItemsBidirectional(
				item.subjectId,
				item.filePath,
				this.extractDisplayNameFromPath(item.filePath),
				item.relations,
			));
		}

		const batchSubjectIds = new Set(batchItems.map(item => item.subjectId));
		const updatesByFile = new Map<string, { subjectId: number; links: string[] }>();

		for (const item of batchItems) {
			const batchRelations = item.relations.filter(r => batchSubjectIds.has(r.id));
			if (batchRelations.length === 0) continue;

			const currentDisplayName = this.extractDisplayNameFromPath(item.filePath);
			const currentLink = `[[${item.filePath}|${currentDisplayName}]]`;

			for (const relation of batchRelations) {
				const relatedPath = this.resolveRelatedLocalPath(relation.id);
				if (!relatedPath) continue;

				// 当前条目 → 相关条目
				const relatedDisplayName = this.extractDisplayNameFromPath(relatedPath);
				const relatedLink = `[[${relatedPath}|${relatedDisplayName}]]`;
				const existing1 = updatesByFile.get(item.filePath) ?? { subjectId: item.subjectId, links: [] };
				existing1.links.push(relatedLink);
				updatesByFile.set(item.filePath, existing1);

				// 相关条目 → 当前条目（反向）
				const existing2 = updatesByFile.get(relatedPath) ?? { subjectId: relation.id, links: [] };
				existing2.links.push(currentLink);
				updatesByFile.set(relatedPath, existing2);
			}
		}

		if (updatesByFile.size === 0) return warnings;

		console.debug(`[Bangumi Sync] 后处理同批次相关链接: ${updatesByFile.size} 个文件需要更新`);

		for (const [path, update] of updatesByFile) {
			try {
				await this.updateRelatedFile(path, update.subjectId, update.links);
			} catch (error) {
				console.error(`[Bangumi Sync] 后处理更新相关链接失败: ${path}`, error);
				warnings.push({
					subjectId: update.subjectId,
					operation: 'related-link-postprocess',
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}
		return warnings;
	}

	private async updateRelatedFile(path: string, subjectId: number, links: string[]): Promise<void> {
		const file = await this.fileManager.assertPathOwnership(path, subjectId);
		if (!file) return;
		const content = await this.app.vault.read(file);
		const updatedContent = this.incrementalSync.updateRelated(content, links);
		if (updatedContent === content) return;
		await this.documentService.processSubjectFile(file, subjectId, () => updatedContent);
		console.debug(`[Bangumi Sync] 已更新相关链接: ${path} (+${links.length})`);
	}

	/**
	 * 同步单个条目（用于搜索功能）
	 * @param subjectId 条目 ID
	 * @param input 用户输入的收藏信息
	 * @returns 是否成功
	 */
	async syncSingleSubject(
		subjectId: number,
		input: {
			type: number;
			rate: number;
			comment: string;
			tags: string[];
			private: boolean;
			localPropertyValues?: LocalPropertyValueMap;
			syncToCloud: boolean;
			createLocal: boolean;
		}
	): Promise<{ success: boolean; filePath?: string; writeStatus?: FileWriteStatus; error?: string }> {
		this.ensureCanStartSync();
		try {
			// 1. 同步到云端
			if (input.syncToCloud) {
				await this.client.createOrUpdateCollection(subjectId, {
					type: input.type,
					rate: input.rate,
					comment: input.comment,
					tags: input.tags,
					private: input.private,
				});
				console.debug(`[Bangumi Sync] 已同步到云端: ${subjectId}`);
			}

			// 2. 创建本地文件
			if (input.createLocal) {
				const subject = await this.client.getSubject(subjectId);
				const collection: UserCollection = {
					subject_id: subject.id,
					subject_type: subject.type,
					type: input.type,
					rate: input.rate,
					comment: input.comment,
					tags: input.tags,
					private: input.private,
					ep_status: 0,
					vol_status: 0,
					updated_at: new Date().toISOString(),
					subject: {
						id: subject.id,
						type: subject.type,
						name: subject.name,
						name_cn: subject.name_cn,
						short_summary: subject.summary?.substring(0, 100) || '',
						date: subject.date,
						images: subject.images,
						volumes: subject.volumes,
						eps: subject.eps,
						collection_total: subject.collection?.collect || 0,
						score: subject.rating?.score || 0,
						rank: subject.rating?.rank || 0,
						tags: subject.tags,
					},
				};
				const localProperties = input.localPropertyValues
					? new Map([[subjectId, input.localPropertyValues]])
					: undefined;
				const result = await this.syncByCollections([collection], {
					overwrite: false,
					localPropertyValuesBySubjectId: localProperties,
					concurrency: 1,
				});
				const outcome = result.outcomes.find(item => item.subjectId === subjectId);
				if (!outcome || !['created', 'updated', 'unchanged'].includes(outcome.writeAction)) {
					return { success: false, error: outcome?.error ?? result.errorDetails[0] ?? 'Local sync failed.' };
				}
				return {
					success: true,
					filePath: outcome.actualPath,
					writeStatus: outcome.writeAction as FileWriteStatus,
				};
			}

			return { success: true };

		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`[Bangumi Sync] 同步单个条目失败:`, error);
			return { success: false, error: errorMsg };
		}
	}

	/**
	 * 批量下载封面图片并替换链接
	 * 扫描所有本地条目，将网络封面下载到本地，并替换 frontmatter 和正文中的链接
	 */
	async batchDownloadCovers(): Promise<{ downloaded: number; skipped: number; failed: number }> {
		this.ensureCanStartSync();
		this.setBatchTransactionState('active');
		const scanPath = this.config.scanFolderPath || 'ACGN';
		try {
			await this.incrementalSync.scanLocalFolder(scanPath);

			const localSubjects = this.incrementalSync.getLocalSubjects();
			const result = { downloaded: 0, skipped: 0, failed: 0 };
			let processed = 0;

			for (const [subjectId, info] of Array.from(localSubjects)) {
			processed++;
			this.reportProgress({
				status: 'processing',
				current: processed,
				total: localSubjects.size,
				currentItem: info.name_cn || String(subjectId),
			});

			try {
				const file = this.app.vault.getAbstractFileByPath(info.path);
				if (!(file instanceof TFile)) {
					result.skipped++;
					continue;
				}

				const content = await this.app.vault.read(file);
				const coverValue = this.extractCoverValue(content);

				if (!coverValue || !coverValue.startsWith('http')) {
					result.skipped++;
					continue;
				}

				// 提取模板变量
				const name_cn = this.extractFrontmatterString(content, '中文名') || info.name_cn;
				const name = this.extractFrontmatterString(content, '原名') || '';
				const typeLabel = this.extractFrontmatterString(content, '作品大类') || '';

				const coverVars = { name_cn, name, typeLabel };
				const targetPath = this.imageHandler.getCoverTargetPath(coverValue, subjectId, this.config.imagePathTemplate, coverVars);
				if (this.fileManager.getFile(targetPath) && !this.config.imageUpdateExisting) {
					result.skipped++;
					continue;
				}
				await this.beginCoverUpdateJournal(subjectId, file, content);

				// 下载封面图片
				const coverDownload = await this.imageHandler.downloadCoverWithResult(
					coverValue, subjectId, this.config.imagePathTemplate,
					coverVars
				);
				const localPath = coverDownload.path;

				if (!localPath || localPath.startsWith('http')) {
					await this.recoveryJournalStore.clear();
					this.activeRecoveryJournal = null;
					result.failed++;
					continue;
				}
				if (coverDownload.status === 'unchanged') {
					await this.recoveryJournalStore.clear();
					this.activeRecoveryJournal = null;
					result.skipped++;
					continue;
				}

				// 更新文件内容
				let updatedContent = this.replaceCoverInFrontmatter(content, localPath);
				updatedContent = this.replaceCoverInBody(updatedContent, localPath);

				await this.documentService.processSubjectFile(file, subjectId, () => updatedContent);
				await this.recoveryJournalStore.clear();
				this.activeRecoveryJournal = null;
				result.downloaded++;
				console.debug(`[Bangumi Sync] 封面下载完成: ${info.name_cn} -> ${localPath}`);
			} catch (error) {
				console.error(`[Bangumi Sync] 封面下载失败: ${info.name_cn}`, error);
				result.failed++;
				if (this.activeRecoveryJournal) {
					this.restorePersistentJournal(this.activeRecoveryJournal);
					const recovery = await this.retryRecovery();
					if (!recovery.recovered) break;
				}
			}
			}

			this.reportProgress({
			status: 'completed',
			message: tnFormat('notices', 'coverDownloadComplete', {
				downloaded: result.downloaded,
				skipped: result.skipped,
				failed: result.failed,
			}),
			});

			return result;
		} finally {
			if (!this.recoveryRequired && this.batchTransactionState === 'active') {
				this.setBatchTransactionState('none');
			}
		}
	}

	/**
	 * 扫描所有本地已同步条目，为相关条目补充双向链接
	 * 使用并查集查找连通分量，确保同系列所有条目互相关联
	 */
	async scanAndLinkRelated(): Promise<{ checked: number; linked: number; skipped: number; failed: number; details: { name: string; addedLinks: string[] }[] }> {
		this.ensureCanStartSync();
		const scanPath = this.config.scanFolderPath || 'ACGN';
		console.debug(`[Bangumi Sync] 扫描关联条目，scanFolderPath: "${this.config.scanFolderPath}"，实际扫描路径: "${scanPath}"，pathTemplate: "${this.config.pathTemplate}"`);
		await this.incrementalSync.scanLocalFolder(scanPath);

		const localSubjects = this.incrementalSync.getLocalSubjects();
		console.debug(`[Bangumi Sync] 扫描到 ${localSubjects.size} 个本地条目`);

		if (localSubjects.size === 0) {
			console.warn(`[Bangumi Sync] 未扫描到任何本地条目，扫描路径: "${scanPath}"`);
		}

		const allIds = [...localSubjects.keys()];
		console.debug(`[Bangumi Sync] 本地条目 ID: ${allIds.join(', ')}`);

		const result = { checked: localSubjects.size, linked: 0, skipped: 0, failed: 0, details: [] as { name: string; addedLinks: string[] }[] };
		let processed = 0;

		// 构建 subjectId → path 映射
		const localPathMap = new Map<number, string>();
		for (const [id, info] of localSubjects) {
			if (info.path) {
				localPathMap.set(id, info.path);
			}
		}

		// === 第一阶段：获取所有本地条目的关联关系，用并查集构建连通分量 ===

		// 并查集
		const parent = new Map<number, number>();
		const find = (x: number): number => {
			if (!parent.has(x)) parent.set(x, x);
			if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
			return parent.get(x)!;
		};
		const union = (a: number, b: number) => {
			const ra = find(a), rb = find(b);
			if (ra !== rb) parent.set(ra, rb);
		};

		// 存储每个条目的本地关联 ID 列表（用于后续补全链接）
		const localRelationMap = new Map<number, number[]>();

		for (const [subjectId, info] of localSubjects) {
			processed++;
			this.reportProgress({
				status: 'scanning',
				current: processed,
				total: localSubjects.size,
				currentItem: info.name_cn || String(subjectId),
			});

			try {
				const relations = await this.client.getSubjectRelations(subjectId);
				console.debug(`[Bangumi Sync] [${processed}/${localSubjects.size}] ${info.name_cn || subjectId} (ID:${subjectId}): ${relations.length} 个关联`);

				const localRelatedIds: number[] = [];
				for (const relation of relations) {
					if (!localPathMap.has(relation.id) || relation.id === subjectId) continue;
					localRelatedIds.push(relation.id);
					union(subjectId, relation.id);
				}

				localRelationMap.set(subjectId, localRelatedIds);
				if (localRelatedIds.length > 0) {
					console.debug(`[Bangumi Sync]   本地关联: ${localRelatedIds.join(', ')}`);
				}
			} catch (error) {
				console.warn(`[Bangumi Sync] 获取关联关系失败: ${info.name_cn} (${subjectId})`, error);
				result.failed++;
				localRelationMap.set(subjectId, []);
			}
		}

		// === 第二阶段：按连通分量分组 ===

		const components = new Map<number, number[]>();
		for (const subjectId of localSubjects.keys()) {
			const root = find(subjectId);
			if (!components.has(root)) components.set(root, []);
			components.get(root)!.push(subjectId);
		}

		// 过滤出含 2+ 条目的分量（需要补全链接的组）
		const multiComponents = [...components.entries()].filter(([, ids]) => ids.length >= 2);
		console.debug(`[Bangumi Sync] 连通分量: ${components.size} 组，其中 ${multiComponents.length} 组含 2+ 条目`);

		for (const [root, ids] of multiComponents) {
			console.debug(`[Bangumi Sync] 分量 (root:${root}): ${ids.map(id => `${localSubjects.get(id)?.name_cn || id}(${id})`).join(', ')}`);
		}

		// === 第三阶段：为每组补全所有互链 ===

		const updatesByFile = new Map<string, { subjectId: number; links: string[] }>();
		let alreadyCorrect = 0;

		for (const [, componentIds] of multiComponents) {
			// 收集该组中所有条目的链接
			const allLinks: { subjectId: number; link: string }[] = [];
			for (const id of componentIds) {
				const info = localSubjects.get(id);
				if (!info?.path) continue;
				const displayName = this.extractDisplayNameFromPath(info.path);
				allLinks.push({ subjectId: id, link: `[[${info.path}|${displayName}]]` });
			}

			// 为每个条目检查是否缺少对组内其他条目的链接
			for (const id of componentIds) {
				const info = localSubjects.get(id);
				if (!info?.path) continue;

				const existingRelated = localRelationMap.get(id) || [];
				const existingSet = new Set(existingRelated);
				const missingLinks: string[] = [];

				for (const { subjectId: otherId, link } of allLinks) {
					if (otherId === id) continue;
					if (!existingSet.has(otherId)) {
						missingLinks.push(link);
					}
				}

				if (missingLinks.length > 0) {
					updatesByFile.set(info.path, { subjectId: id, links: missingLinks });
					console.debug(`[Bangumi Sync] ${info.name_cn || id}: 补充 ${missingLinks.length} 个链接`);
				} else {
					alreadyCorrect++;
				}
			}
		}

		result.skipped = alreadyCorrect;

		console.debug(`[Bangumi Sync] 扫描完成，需要更新 ${updatesByFile.size} 个文件`);

		// === 第四阶段：批量更新文件 ===

		for (const [path, update] of updatesByFile) {
			try {
				const { subjectId, links } = update;
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) {
					console.warn(`[Bangumi Sync] 文件不存在或非 TFile: ${path}`);
					result.failed++;
					continue;
				}
				const content = await this.app.vault.read(file);
				const updatedContent = this.incrementalSync.updateRelated(content, links);
				if (updatedContent !== content) {
					await this.documentService.processSubjectFile(file, subjectId, () => updatedContent);
					result.linked++;
					// 提取条目名（从文件路径或 frontmatter）
					const name = this.extractFrontmatterString(content, '中文名') || file.basename;
					// 提取新增链接的显示名称
					const addedNames = links.map(link => {
						const match = link.match(/\[\[.*?\|(.+?)\]\]/);
						return match ? match[1] : link;
					});
					result.details.push({ name, addedLinks: addedNames });
					console.debug(`[Bangumi Sync] 扫描关联更新: ${path} (+${links.length})`);
				} else {
					console.debug(`[Bangumi Sync] 文件无需更新（链接已存在）: ${path}`);
					result.skipped++;
				}
			} catch (error) {
				console.error(`[Bangumi Sync] 扫描关联更新失败: ${path}`, error);
				result.failed++;
			}
		}

		this.reportProgress({
			status: 'completed',
			message: `关联完成: 检查 ${result.checked} 个条目，更新 ${result.linked} 个，跳过 ${result.skipped} 个，失败 ${result.failed} 个`,
		});

		return result;
	}

	/**
	 * 从 frontmatter 提取封面值
	 */
	private extractCoverValue(content: string): string {
		const match = content.match(/^---\n[\s\S]*?\n封面:\s*"?([^"\n]+)"?/);
		return match ? match[1].trim() : '';
	}

	/**
	 * 从 frontmatter 提取字符串值
	 */
	private extractFrontmatterString(content: string, key: string): string {
		const regex = new RegExp(`^---\\n[\\s\\S]*?\\n${key}:\\s*"?([^"\\n]+)"?`);
		const match = content.match(regex);
		return match ? match[1].trim() : '';
	}

	/**
	 * 替换 frontmatter 中的封面值
	 */
	private replaceCoverInFrontmatter(content: string, localPath: string): string {
		const coverRegex = /^(---\n[\s\S]*?\n封面:\s*)"?[^"\n]+"?/m;
		return content.replace(coverRegex, `$1"${localPath}"`);
	}

	/**
	 * 替换正文中的封面图片链接
	 */
	private replaceCoverInBody(content: string, localPath: string): string {
		const imgRegex = /!\[cover\|[^\]]*\]\(https?:\/\/[^)]+\)/g;
		return content.replace(imgRegex, `![cover|400](${localPath})`);
	}
}
