/**
 * 文件管理器
 * 处理 Obsidian 中文件的创建和更新
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';

export class FileManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
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
				} catch (error) {
					// 目录可能已存在（并发创建）
					console.debug(`[Bangumi Sync] 创建目录失败（可能已存在）: ${error}`);
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
		await this.app.vault.modify(file, content);
	}

	/**
	 * 创建或更新文件
	 */
	async createOrUpdateFile(
		path: string,
		content: string,
		options?: {
			overwrite?: boolean;
		}
	): Promise<{ file: TFile; created: boolean }> {
		const normalizedPath = normalizePath(path);
		const existingFile = this.getFile(normalizedPath);

		if (existingFile) {
			// 文件已存在
			if (options?.overwrite) {
				// 强制覆盖
				await this.updateFile(existingFile, content);
				return { file: existingFile, created: false };
			}

			// 默认不更新已存在的文件
			console.debug(`[Bangumi Sync] 文件已存在，跳过: ${normalizedPath}`);
			return { file: existingFile, created: false };
		}

		// 创建新文件
		const file = await this.createFile(normalizedPath, content);
		return { file, created: true };
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
			if (file.path.startsWith(normalizedPath)) {
				files.push(file);
			}
		}

		return files;
	}
}

// 兼容旧版本的类型别名
export const FileManagerV3 = FileManager;
