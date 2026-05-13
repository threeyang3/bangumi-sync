/**
 * 用户数据提取器
 *
 * 从本地文件提取用户自定义数据，用于：
 * 1. 强制同步时保护用户数据
 * 2. 导出用户数据
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { SubjectType } from '../../common/api/types';
import { getFrontmatterRecord, getFrontmatterString } from '../../common/utils/frontmatter';
import {
	SubjectUserData,
	IDENTIFIER_FIELDS,
	isCustomPropertyField,
	isUserPropertyField,
	UserDataType,
	hasUserDataType,
} from './types';

export class UserDataExtractor {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	extractFromFile(file: TFile): SubjectUserData | null {
		const cache = this.app.metadataCache.getFileCache(file);
		return this.extractFromFrontmatter(file, getFrontmatterRecord(cache?.frontmatter));
	}

	async extractFromFileAsync(file: TFile): Promise<SubjectUserData | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		const result = this.extractFromFrontmatter(file, getFrontmatterRecord(cache?.frontmatter));
		if (!result) return null;

		const content = await this.app.vault.read(file);
		const record = this.extractSection(content, '记录');
		const thoughts = this.extractSection(content, '感想');
		if (record || thoughts) {
			result.bodySections = {
				record,
				thoughts,
			};
		}

		return result;
	}

	async extractForExportAsync(
		file: TFile,
		dataTypes: UserDataType[] = [UserDataType.ALL]
	): Promise<SubjectUserData | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = getFrontmatterRecord(cache?.frontmatter);
		if (!frontmatter) return null;

		const base = this.extractFromFrontmatter(file, frontmatter);
		if (!base) return null;

		const content = await this.app.vault.read(file);
		const record = this.extractSection(content, '记录');
		const thoughts = this.extractSection(content, '感想');
		const shortComment = this.extractComment(content);
		if (hasUserDataType(dataTypes, UserDataType.BODY_CONTENT) && (record || thoughts)) {
			base.bodySections = {
				record,
				thoughts,
			};
		}

		const exportProperties = this.extractExportProperties(frontmatter, dataTypes, shortComment);
		base.customProperties = Object.keys(exportProperties).length > 0 ? exportProperties : undefined;
		if (!base.customProperties && !base.bodySections) {
			return null;
		}
		return base;
	}

	private extractFromFrontmatter(file: TFile, frontmatter: Record<string, unknown> | null): SubjectUserData | null {
		if (!frontmatter) return null;

		const id = this.extractId(frontmatter);
		if (!id) return null;

		const name_cn = getFrontmatterString(frontmatter, '中文名')
			|| getFrontmatterString(frontmatter, 'name_cn')
			|| file.basename;
		const type = this.determineSubjectType(frontmatter);
		const customProperties = this.extractCustomProperties(frontmatter);

		return {
			identifier: {
				id,
				name_cn,
				type,
				workType: this.extractWorkType(frontmatter),
			},
			category: this.extractCategory(frontmatter),
			customProperties: Object.keys(customProperties).length > 0 ? customProperties : undefined,
		};
	}

	async extractFromFolder(
		folderPath: string,
		onProgress?: (current: number, total: number) => void
	): Promise<Map<number, SubjectUserData>> {
		const result = new Map<number, SubjectUserData>();
		const normalizedPath = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (!(folder instanceof TFolder)) {
			console.debug(`[Bangumi Sync] 文件夹不存在: ${folderPath}`);
			return result;
		}

		const allFiles = this.app.vault.getMarkdownFiles();
		const targetFiles = allFiles.filter(file => file.path.startsWith(normalizedPath));

		let processed = 0;
		for (const file of targetFiles) {
			try {
				const userData = await this.extractFromFileAsync(file);
				if (userData) {
					result.set(userData.identifier.id, userData);
				}
			} catch (error) {
				console.error(`[Bangumi Sync] 提取用户数据失败: ${file.path}`, error);
			}

			processed++;
			onProgress?.(processed, targetFiles.length);
		}

		return result;
	}

	async extractForExportFromFolder(
		folderPath: string,
		dataTypes: UserDataType[] = [UserDataType.ALL],
		onProgress?: (current: number, total: number) => void
	): Promise<Map<number, SubjectUserData>> {
		const result = new Map<number, SubjectUserData>();
		const normalizedPath = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (!(folder instanceof TFolder)) {
			console.debug(`[Bangumi Sync] 文件夹不存在: ${folderPath}`);
			return result;
		}

		const allFiles = this.app.vault.getMarkdownFiles();
		const targetFiles = allFiles.filter(file => file.path.startsWith(normalizedPath));

		let processed = 0;
		for (const file of targetFiles) {
			try {
				const userData = await this.extractForExportAsync(file, dataTypes);
				if (userData) {
					result.set(userData.identifier.id, userData);
				}
			} catch (error) {
				console.error(`[Bangumi Sync] 导出用户数据提取失败: ${file.path}`, error);
			}

			processed++;
			onProgress?.(processed, targetFiles.length);
		}

		return result;
	}

	private extractId(frontmatter: Record<string, unknown>): number | null {
		const id = frontmatter['id'] ?? frontmatter['ID'];
		if (typeof id === 'number') return id;
		if (typeof id === 'string') {
			const parsed = parseInt(id, 10);
			return isNaN(parsed) ? null : parsed;
		}
		return null;
	}

	private extractCustomProperties(frontmatter: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(frontmatter)) {
			if (!isCustomPropertyField(key)) continue;
			if (value === undefined || value === '' || value === null) continue;
			result[key] = value;
		}

		return result;
	}

	private extractExportProperties(
		frontmatter: Record<string, unknown>,
		dataTypes: UserDataType[],
		shortComment?: string | null
	): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		const includeUserProperties = hasUserDataType(dataTypes, UserDataType.USER_PROPERTIES);
		const includeCustomProperties = hasUserDataType(dataTypes, UserDataType.CUSTOM_PROPERTIES);

		for (const [key, value] of Object.entries(frontmatter)) {
			if (value === undefined || value === '' || value === null) continue;
			if (IDENTIFIER_FIELDS.has(key)) continue;

			if (isUserPropertyField(key)) {
				if (includeUserProperties) {
					result[key] = value;
				}
				continue;
			}

			if (isCustomPropertyField(key)) {
				if (includeCustomProperties) {
					result[key] = value;
				}
			}
		}

		if (includeUserProperties && shortComment) {
			result['短评'] = shortComment;
		}

		return result;
	}

	extractSection(content: string, sectionName: string): string | undefined {
		const normalizedContent = content.replace(/\r\n/g, '\n');
		const lines = normalizedContent.split('\n');
		const heading = `## ${sectionName}`;
		const startIndex = lines.findIndex(line => line.trim() === heading);
		if (startIndex === -1) {
			return undefined;
		}

		let endIndex = lines.length;
		for (let i = startIndex + 1; i < lines.length; i++) {
			if (/^##\s+/.test(lines[i])) {
				endIndex = i;
				break;
			}
		}

		const sectionContent = lines.slice(startIndex + 1, endIndex).join('\n').trim();
		return sectionContent || undefined;
	}

	private determineSubjectType(frontmatter: Record<string, unknown>): number {
		const typeStr = frontmatter['作品大类'] ?? frontmatter['type'];
		if (typeof typeStr === 'number') return typeStr;

		const typeMap: Record<string, number> = {
			'Anime': SubjectType.Anime,
			'Book': SubjectType.Book,
			'Novel': SubjectType.Book,
			'Comic': SubjectType.Book,
			'Album': SubjectType.Book,
			'Music': SubjectType.Music,
			'Game': SubjectType.Game,
			'Real': SubjectType.Real,
		};

		return typeMap[String(typeStr)] || SubjectType.Book;
	}

	private extractCategory(frontmatter: Record<string, unknown>): string | undefined {
		const category = this.getString(frontmatter, '具体类型')
			|| this.getString(frontmatter, 'category')
			|| this.getString(frontmatter, '平台');

		if (category) {
			return category;
		}

		const workType = this.extractWorkType(frontmatter);
		if (workType) {
			return workType;
		}

		return undefined;
	}

	private extractWorkType(frontmatter: Record<string, unknown>): string | undefined {
		const typeStr = frontmatter['作品大类'] ?? frontmatter['type'];
		return typeof typeStr === 'string' && typeStr.trim() ? typeStr.trim() : undefined;
	}

	private getString(frontmatter: Record<string, unknown>, key: string): string | undefined {
		const value = frontmatter[key];
		return typeof value === 'string' && value.trim() ? value.trim() : undefined;
	}

	private extractComment(content: string): string | null {
		const normalizedContent = content.replace(/\r\n?/g, '\n');
		const lines = normalizedContent.split('\n');
		const headerIndex = lines.findIndex(line => /^> \[!abstract\]\+\s*\*\*短评\*\*\s*$/.test(line));
		if (headerIndex === -1) {
			return null;
		}

		const commentLines: string[] = [];
		for (let i = headerIndex + 1; i < lines.length; i++) {
			const line = lines[i];
			if (/^> \[!/.test(line) || /^##\s+/.test(line)) {
				break;
			}
			if (line.startsWith('> ')) {
				commentLines.push(line.slice(2));
			} else if (line.trim() === '>') {
				commentLines.push('');
			} else if (line.trim() === '') {
				commentLines.push('');
			} else {
				break;
			}
		}

		const comment = commentLines.join('\n').trim();
		return comment || null;
	}
}
