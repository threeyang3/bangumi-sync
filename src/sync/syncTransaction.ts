import { App, TFile, normalizePath } from 'obsidian';
import { FileManager, FileWriteResult } from '../../common/file/fileManager';
import { normalizePathCollisionKey } from '../../common/file/pathUtils';

export interface TransactionRename {
	subjectId: number;
	from: string;
	to: string;
}

export interface RollbackFailure {
	operation: 'delete-created' | 'restore-content' | 'stage-path' | 'restore-path';
	path: string;
	message: string;
}

export interface SyncRollbackResult {
	deletedCreatedFiles: number;
	restoredContents: number;
	restoredPaths: number;
	failed: number;
	failures?: RollbackFailure[];
}

type RenamePhase = 'original' | 'temporary' | 'final';

interface StagedRename extends TransactionRename {
	file: TFile;
	temporaryPath?: string;
	phase: RenamePhase;
}

export type SyncTransactionState = 'active' | 'committed' | 'rolled-back' | 'rollback-failed';

export class SyncTransaction {
	private readonly createdFiles: TFile[] = [];
	private readonly updatedContents = new Map<TFile, string>();
	private readonly renames: StagedRename[] = [];
	private state: SyncTransactionState = 'active';

	constructor(
		private readonly app: App,
		private readonly fileManager: FileManager,
	) {}

	getState(): SyncTransactionState {
		return this.state;
	}

	hasChanges(): boolean {
		return this.state === 'active' && (
			this.createdFiles.length > 0
			|| this.updatedContents.size > 0
			|| this.renames.some(rename => rename.phase !== 'original')
		);
	}

	commit(): void {
		if (this.state !== 'active') return;
		this.state = 'committed';
		this.createdFiles.length = 0;
		this.updatedContents.clear();
		this.renames.length = 0;
	}

	getRenameCount(): number {
		return this.renames.filter(rename => rename.phase === 'final').length;
	}

	async executeRenames(renames: TransactionRename[]): Promise<void> {
		this.assertActive();
		if (renames.length === 0) return;
		const sources = new Map<string, StagedRename>();
		const targets = new Set<string>();

		for (const rename of renames) {
			const from = normalizePath(rename.from);
			const to = normalizePath(rename.to);
			const targetKey = normalizePathCollisionKey(to);
			if (targets.has(targetKey)) throw new Error(`Duplicate rename target: ${to}`);
			const file = await this.fileManager.assertPathOwnership(from, rename.subjectId);
			if (!file) throw new Error(`Rename source does not exist: ${from}`);
			const entry: StagedRename = { ...rename, from, to, file, phase: 'original' };
			sources.set(normalizePathCollisionKey(from), entry);
			targets.add(targetKey);
			this.renames.push(entry);
		}

		for (const rename of sources.values()) {
			const target = this.fileManager.getFile(rename.to);
			if (target && !sources.has(normalizePathCollisionKey(rename.to))) {
				throw new Error(`Rename target is occupied by an unplanned file: ${rename.to}`);
			}
		}

		let index = 0;
		for (const entry of sources.values()) {
			entry.temporaryPath = await this.findTemporaryPath(entry.from, entry.subjectId, index++);
			await this.app.fileManager.renameFile(entry.file, entry.temporaryPath);
			entry.phase = 'temporary';
		}
		for (const entry of sources.values()) {
			await this.fileManager.ensureDirectory(entry.to);
			await this.app.fileManager.renameFile(entry.file, entry.to);
			entry.phase = 'final';
		}
	}

	async createOrUpdateFile(
		path: string,
		content: string,
		options: { overwrite?: boolean; subjectId: number },
	): Promise<FileWriteResult> {
		this.assertActive();
		const existing = await this.fileManager.assertPathOwnership(path, options.subjectId);
		if (existing && !this.updatedContents.has(existing)) {
			this.updatedContents.set(existing, await this.app.vault.read(existing));
		}
		const result = await this.fileManager.createOrUpdateFile(path, content, options);
		if (result.status === 'created') this.createdFiles.push(result.file);
		if (result.status !== 'updated' && existing) this.updatedContents.delete(existing);
		return result;
	}

	async rollback(): Promise<SyncRollbackResult> {
		const result: SyncRollbackResult = {
			deletedCreatedFiles: 0, restoredContents: 0, restoredPaths: 0, failed: 0,
		};
		if (this.state !== 'active') return result;

		for (const file of [...this.createdFiles].reverse()) {
			try {
				await this.app.fileManager.trashFile(file);
				result.deletedCreatedFiles++;
			} catch (error) {
				this.recordRollbackFailure(result, 'delete-created', file.path, error);
			}
		}
		for (const [file, content] of this.updatedContents) {
			try {
				await this.app.vault.process(file, () => content);
				result.restoredContents++;
			} catch (error) {
				this.recordRollbackFailure(result, 'restore-content', file.path, error);
			}
		}

		let index = 0;
		for (const rename of this.renames) {
			if (rename.phase !== 'final') continue;
			try {
				rename.temporaryPath = await this.findTemporaryPath(rename.to, rename.subjectId, index++);
				await this.app.fileManager.renameFile(rename.file, rename.temporaryPath);
				rename.phase = 'temporary';
			} catch (error) {
				this.recordRollbackFailure(result, 'stage-path', rename.to, error);
			}
		}
		for (const rename of [...this.renames].reverse()) {
			if (rename.phase !== 'temporary') continue;
			try {
				await this.fileManager.ensureDirectory(rename.from);
				await this.app.fileManager.renameFile(rename.file, rename.from);
				rename.phase = 'original';
				result.restoredPaths++;
			} catch (error) {
				this.recordRollbackFailure(result, 'restore-path', rename.from, error);
			}
		}
		this.state = result.failed > 0 ? 'rollback-failed' : 'rolled-back';
		return result;
	}

	private recordRollbackFailure(
		result: SyncRollbackResult,
		operation: RollbackFailure['operation'],
		path: string,
		error: unknown,
	): void {
		result.failed++;
		result.failures = [...(result.failures ?? []), {
			operation, path, message: error instanceof Error ? error.message : String(error),
		}];
	}

	private assertActive(): void {
		if (this.state !== 'active') throw new Error(`Cannot use a ${this.state} sync transaction.`);
	}

	private async findTemporaryPath(sourcePath: string, subjectId: number, index: number): Promise<string> {
		const slash = sourcePath.lastIndexOf('/');
		const directory = slash >= 0 ? sourcePath.slice(0, slash + 1) : '';
		let attempt = 0;
		while (true) {
			const path = normalizePath(`${directory}.bangumi-sync-${subjectId}-${index}-${attempt}.tmp.md`);
			if (!await this.fileManager.fileExists(path)) return path;
			attempt++;
		}
	}
}
