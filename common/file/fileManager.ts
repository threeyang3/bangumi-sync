/**
 * 文件管理器
 * 处理 Obsidian 中文件的创建和更新
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { isDescendantPath } from './pathUtils';
import { SubjectDocumentService } from '../../src/document/subjectDocumentService';

export type FileWriteStatus = 'created' | 'updated' | 'unchanged';

export interface FileWriteResult {
	status: FileWriteStatus;
	file: TFile;
}

export class SubjectPathCollisionError extends Error {
	constructor(
		readonly path: string,
		readonly requestedSubjectId: number,
		readonly existingSubjectId: number | null,
	) {
		super(`Cannot write subject ${requestedSubjectId} to ${path}; the path belongs to ${existingSubjectId ?? 'an unknown subject'}.`);
		this.name = 'SubjectPathCollisionError';
	}
}

export class FileManager {
	private app: App;
	private documentService: SubjectDocumentService;

	constructor(app: App, documentService = new SubjectDocumentService(app)) {
		this.app = app;
		this.documentService = documentService;
	}

	/**
	 * 确保目录存在（递归创建）
	 */
	async ensureDirectory(path: string): Promise<void> {
		const normalizedPath = normalizePath(path);
		const lastSlash = normalizedPath.lastIndexOf('/');
		const dirPath = lastSlash > 0 ? normalizedPath.substring(0, lastSlash) : '';

		if (dirPath) {
			console.debug(`[Bangumi Sync] 检查目录: ${dirPath}`);
			const exists = await this.app.vault.adapter.exists(dirPath);

			if (!exists) {
				console.debug(`[Bangumi Sync] 创建目录: ${dirPath}`);
				// 递归创建父目录
				await this.ensureDirectory(dirPath);
				try {
					await this.app.vault.createFolder(dirPath);
				} catch (error: unknown) {
					// 目录可能已存在（并发创建）
					const errorMessage = error instanceof Error ? error.message : String(error);
					console.debug(`[Bangumi Sync] 创建目录失败（可能已存在）: ${errorMessage}`);
				}
			}
		}
	}

	/**
	 * 检查文件是否存在
	 */
	async fileExists(path: string): Promise<boolean> {
		const normalizedPath = normalizePath(path);
		return this.app.vault.adapter.exists(normalizedPath);
	}

	/**
	 * 获取文件
	 */
	getFile(path: string): TFile | null {
		const normalizedPath = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (file instanceof TFile) {
			return file;
		}
		return null;
	}

	async assertPathOwnership(path: string, subjectId: number): Promise<TFile | null> {
		const normalizedPath = normalizePath(path);
		const file = this.getFile(normalizedPath);
		if (!file) {
			return null;
		}

		const identity = await this.documentService.getSubjectIdentity(file);
		if (identity.conflicts?.length || identity.subjectId !== subjectId) {
			throw new SubjectPathCollisionError(normalizedPath, subjectId, identity.subjectId);
		}
		return file;
	}

	/**
	 * 创建文件
	 */
	async createFile(path: string, content: string): Promise<TFile> {
		const normalizedPath = normalizePath(path);
		console.debug(`[Bangumi Sync] 创建文件: ${normalizedPath}`);

		// 确保目录存在
		await this.ensureDirectory(normalizedPath);

		// 创建文件
		try {
			const file = await this.app.vault.create(normalizedPath, content);
			console.debug(`[Bangumi Sync] 文件创建成功: ${normalizedPath}`);
			return file;
		} catch (error) {
			console.error(`[Bangumi Sync] 创建文件失败: ${normalizedPath}`, error);
			throw error;
		}
	}

	/**
	 * 更新文件
	 */
	async updateFile(file: TFile, content: string): Promise<void> {
		await this.app.vault.process(file, () => content);
	}

	/**
	 * 创建或更新文件
	 */
	async createOrUpdateFile(
		path: string,
		content: string,
		options?: {
			overwrite?: boolean;
			subjectId?: number;
		}
	): Promise<FileWriteResult> {
		const normalizedPath = normalizePath(path);
		const existingFile = this.getFile(normalizedPath);

		if (existingFile) {
			if (options?.subjectId !== undefined) {
				await this.assertPathOwnership(normalizedPath, options.subjectId);
			}
			// 文件已存在
			if (options?.overwrite) {
				// 强制覆盖
				const currentContent = await this.app.vault.read(existingFile);
				if (currentContent === content) {
					return { file: existingFile, status: 'unchanged' };
				}
				await this.updateFile(existingFile, content);
				return { file: existingFile, status: 'updated' };
			}

			// 默认不更新已存在的文件
			console.debug(`[Bangumi Sync] 文件已存在，跳过: ${normalizedPath}`);
			return { file: existingFile, status: 'unchanged' };
		}

		// 创建新文件
		const file = await this.createFile(normalizedPath, content);
		return { file, status: 'created' };
	}

	/**
	 * 获取文件夹中的所有 Markdown 文件
	 */
	getMarkdownFiles(folderPath: string): TFile[] {
		const normalizedPath = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (!(folder instanceof TFolder)) {
			return [];
		}

		const files: TFile[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isDescendantPath(file.path, normalizedPath)) {
				files.push(file);
			}
		}

		return files;
	}
}
