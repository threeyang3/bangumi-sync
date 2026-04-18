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
	 * 确保目录存在
	 */
	async ensureDirectory(path: string): Promise<void> {
		const normalizedPath = normalizePath(path);
		const lastSlash = normalizedPath.lastIndexOf('/');
		const dirPath = lastSlash > 0 ? normalizedPath.substring(0, lastSlash) : '';

		if (dirPath) {
			console.log(`[Bangumi Sync] 检查目录: ${dirPath}`);
			const exists = await this.app.vault.adapter.exists(dirPath);
			console.log(`[Bangumi Sync] 目录存在: ${exists}`);

			if (!exists) {
				console.log(`[Bangumi Sync] 创建目录: ${dirPath}`);
				// 递归创建父目录
				await this.ensureDirectory(dirPath);
				try {
					await this.app.vault.createFolder(dirPath);
				} catch (error) {
					// 目录可能已存在（并发创建）
					console.log(`[Bangumi Sync] 创建目录失败（可能已存在）: ${error}`);
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
		console.log(`[Bangumi Sync] 创建文件: ${normalizedPath}`);
		console.log(`[Bangumi Sync] 内容长度: ${content.length}`);

		// 确保目录存在
		await this.ensureDirectory(normalizedPath);

		// 创建文件
		try {
			const file = await this.app.vault.create(normalizedPath, content);
			console.log(`[Bangumi Sync] 文件创建成功: ${normalizedPath}`);
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
			mergeFrontmatter?: boolean;
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

			if (options?.mergeFrontmatter) {
				// 合并 frontmatter
				const existingContent = await this.app.vault.read(existingFile);
				const mergedContent = this.mergeFrontmatter(existingContent, content);
				await this.updateFile(existingFile, mergedContent);
				return { file: existingFile, created: false };
			}

			// 默认不更新已存在的文件
			return { file: existingFile, created: false };
		}

		// 创建新文件
		const file = await this.createFile(normalizedPath, content);
		return { file, created: true };
	}

	/**
	 * 合并 frontmatter
	 * 将新内容的 frontmatter 合并到现有内容中
	 */
	private mergeFrontmatter(existingContent: string, newContent: string): string {
		// 解析现有内容的 frontmatter
		const existingFm = this.parseFrontmatter(existingContent);
		const existingBody = this.extractBody(existingContent);

		// 解析新内容的 frontmatter
		const newFm = this.parseFrontmatter(newContent);

		// 合并 frontmatter（新值覆盖旧值）
		const mergedFm = { ...existingFm, ...newFm };

		// 生成合并后的内容
		const fmStr = this.stringifyFrontmatter(mergedFm);
		return `${fmStr}\n${existingBody}`;
	}

	/**
	 * 解析 frontmatter
	 */
	private parseFrontmatter(content: string): Record<string, unknown> {
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (!match) {
			return {};
		}

		const fm: Record<string, unknown> = {};
		const lines = match[1].split('\n');

		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex > 0) {
				const key = line.substring(0, colonIndex).trim();
				const value = line.substring(colonIndex + 1).trim();
				fm[key] = this.parseYamlValue(value);
			}
		}

		return fm;
	}

	/**
	 * 解析 YAML 值
	 */
	private parseYamlValue(value: string): unknown {
		// 简单解析，不处理复杂嵌套
		if (value === 'true') return true;
		if (value === 'false') return false;
		if (value === 'null') return null;
		if (/^\d+$/.test(value)) return parseInt(value, 10);
		if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
		if (value.startsWith('"') && value.endsWith('"')) {
			return value.slice(1, -1);
		}
		if (value.startsWith("'") && value.endsWith("'")) {
			return value.slice(1, -1);
		}
		return value;
	}

	/**
	 * 提取 body（不含 frontmatter）
	 */
	private extractBody(content: string): string {
		const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
		if (match) {
			return match[1];
		}
		return content;
	}

	/**
	 * 将 frontmatter 对象转换为 YAML 字符串
	 */
	private stringifyFrontmatter(fm: Record<string, unknown>): string {
		const lines: string[] = ['---'];

		for (const [key, value] of Object.entries(fm)) {
			if (value === undefined) continue;
			if (typeof value === 'string') {
				lines.push(`${key}: "${value}"`);
			} else if (typeof value === 'number' || typeof value === 'boolean') {
				lines.push(`${key}: ${value}`);
			} else if (value === null) {
				lines.push(`${key}: null`);
			} else if (Array.isArray(value)) {
				lines.push(`${key}:`);
				for (const item of value) {
					lines.push(`  - ${item}`);
				}
			} else if (typeof value === 'object') {
				lines.push(`${key}:`);
				for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
					lines.push(`  ${k}: ${v}`);
				}
			}
		}

		lines.push('---');
		return lines.join('\n');
	}

	/**
	 * 获取文件夹中的所有 Markdown 文件
	 */
	async getMarkdownFiles(folderPath: string): Promise<TFile[]> {
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

	/**
	 * 从文件路径提取条目 ID（假设文件名包含 ID）
	 */
	extractIdFromPath(path: string): number | null {
		const match = path.match(/(\d+)_cover\.(jpg|png|webp)/);
		if (match) {
			return parseInt(match[1], 10);
		}
		return null;
	}
}
