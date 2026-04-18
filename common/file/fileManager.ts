/**
 * 文件管理器（共享版本）
 * 提供基础的文件操作功能
 */

import { App, TFile, normalizePath } from 'obsidian';

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
			const exists = await this.app.vault.adapter.exists(dirPath);

			if (!exists) {
				// 递归创建父目录
				await this.ensureDirectory(dirPath);
				try {
					await this.app.vault.createFolder(dirPath);
				} catch (error) {
					// 目录可能已存在（并发创建）
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

		// 确保目录存在
		await this.ensureDirectory(normalizedPath);

		// 创建文件
		const file = await this.app.vault.create(normalizedPath, content);
		return file;
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
			console.log(`[Bangumi Sync] 文件已存在，跳过: ${normalizedPath}`);
			return { file: existingFile, created: false };
		}

		// 创建新文件
		const file = await this.createFile(normalizedPath, content);
		return { file, created: true };
	}
}
