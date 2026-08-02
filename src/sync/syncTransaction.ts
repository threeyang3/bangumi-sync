import { App, TFile, normalizePath } from 'obsidian';
import { FileManager, FileWriteResult } from '../../common/file/fileManager';

export interface TransactionRename {
	subjectId: number;
	from: string;
	to: string;
}

export interface SyncRollbackResult {
	deleted: number;
	restored: number;
	failed: number;
}

interface ExecutedRename extends TransactionRename {
	file: TFile;
}

export class SyncTransaction {
	private readonly createdFiles: TFile[] = [];
	private readonly updatedContents = new Map<TFile, string>();
	private readonly renames: ExecutedRename[] = [];

	constructor(
		private readonly app: App,
		private readonly fileManager: FileManager,
	) {}

	hasChanges(): boolean {
		return this.createdFiles.length > 0 || this.updatedContents.size > 0 || this.renames.length > 0;
	}

	getRenameCount(): number {
		return this.renames.length;
	}

	async executeRenames(renames: TransactionRename[]): Promise<void> {
		if (renames.length === 0) return;
		const sources = new Map<string, { rename: TransactionRename; file: TFile }>();
		const targets = new Set<string>();

		for (const rename of renames) {
			const from = normalizePath(rename.from);
			const to = normalizePath(rename.to);
			if (targets.has(to.toLocaleLowerCase('en-US'))) {
				throw new Error(`Duplicate rename target: ${to}`);
			}
			const file = await this.fileManager.assertPathOwnership(from, rename.subjectId);
			if (!file) {
				throw new Error(`Rename source does not exist: ${from}`);
			}
			sources.set(from.toLocaleLowerCase('en-US'), { rename: { ...rename, from, to }, file });
			targets.add(to.toLocaleLowerCase('en-US'));
		}

		for (const { rename } of sources.values()) {
			const target = this.fileManager.getFile(rename.to);
			if (target && !sources.has(rename.to.toLocaleLowerCase('en-US'))) {
				throw new Error(`Rename target is occupied by an unplanned file: ${rename.to}`);
			}
		}

		const staged: Array<{ rename: TransactionRename; file: TFile; temporaryPath: string }> = [];
		try {
			let index = 0;
			for (const { rename, file } of sources.values()) {
				const temporaryPath = await this.findTemporaryPath(rename.from, rename.subjectId, index++);
				await this.app.fileManager.renameFile(file, temporaryPath);
				staged.push({ rename, file, temporaryPath });
			}
			for (const entry of staged) {
				await this.fileManager.ensureDirectory(entry.rename.to);
				await this.app.fileManager.renameFile(entry.file, entry.rename.to);
				this.renames.push({ ...entry.rename, file: entry.file });
			}
		} catch (error) {
			for (const entry of staged.reverse()) {
				try {
					await this.app.fileManager.renameFile(entry.file, entry.rename.from);
				} catch {
					// The original error remains the actionable failure.
				}
			}
			throw error;
		}
	}

	async createOrUpdateFile(
		path: string,
		content: string,
		options: { overwrite?: boolean; subjectId: number },
	): Promise<FileWriteResult> {
		const existing = await this.fileManager.assertPathOwnership(path, options.subjectId);
		if (existing && !this.updatedContents.has(existing)) {
			this.updatedContents.set(existing, await this.app.vault.read(existing));
		}

		const result = await this.fileManager.createOrUpdateFile(path, content, options);
		if (result.status === 'created') {
			this.createdFiles.push(result.file);
		}
		if (result.status !== 'updated' && existing) {
			this.updatedContents.delete(existing);
		}
		return result;
	}

	async rollback(): Promise<SyncRollbackResult> {
		const result: SyncRollbackResult = { deleted: 0, restored: 0, failed: 0 };
		for (const file of [...this.createdFiles].reverse()) {
			try {
				await this.app.fileManager.trashFile(file);
				result.deleted++;
			} catch {
				result.failed++;
			}
		}
		for (const [file, content] of this.updatedContents) {
			try {
				await this.app.vault.process(file, () => content);
				result.restored++;
			} catch {
				result.failed++;
			}
		}

		const staged: Array<{ rename: ExecutedRename; temporaryPath: string }> = [];
		for (let index = 0; index < this.renames.length; index++) {
			const rename = this.renames[index];
			try {
				const temporaryPath = await this.findTemporaryPath(rename.to, rename.subjectId, index);
				await this.app.fileManager.renameFile(rename.file, temporaryPath);
				staged.push({ rename, temporaryPath });
			} catch {
				result.failed++;
			}
		}
		for (const { rename } of staged.reverse()) {
			try {
				await this.fileManager.ensureDirectory(rename.from);
				await this.app.fileManager.renameFile(rename.file, rename.from);
				result.restored++;
			} catch {
				result.failed++;
			}
		}
		return result;
	}

	private async findTemporaryPath(sourcePath: string, subjectId: number, index: number): Promise<string> {
		const slash = sourcePath.lastIndexOf('/');
		const directory = slash >= 0 ? sourcePath.slice(0, slash + 1) : '';
		let attempt = 0;
		while (true) {
			const path = normalizePath(`${directory}.bangumi-sync-${subjectId}-${index}-${attempt}.tmp.md`);
			if (!await this.fileManager.fileExists(path)) {
				return path;
			}
			attempt++;
		}
	}
}
