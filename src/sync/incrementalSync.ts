/**
 * 增量同步逻辑
 * 通过扫描本地文件夹来检验是否已经同步
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { SubjectType, CollectionType, getCollectionStatusLabel } from '../../common/api/types';
import { BatchSyncedFile } from './syncStatus';

/**
 * 本地条目信息
 */
interface LocalSubjectInfo {
	id: number;
	path: string;
	name_cn: string;
	wasNewlyCreated?: boolean;
}

/**
 * 增量同步
 * 通过扫描本地文件夹检测已同步的条目
 */
export class IncrementalSync {
	private app: App;
	private localSubjects: Map<number, LocalSubjectInfo> = new Map();
	private lastScanPath: string = '';
	// 本批次同步的条目（用于同批次内的相关条目关联）
	private batchSyncedItems: Map<number, LocalSubjectInfo> = new Map();

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 扫描本地文件夹，获取已同步的条目
	 * 优化：优先使用 metadataCache 获取 ID，避免不必要的文件读取
	 * @param folderPath 要扫描的文件夹路径
	 * @param onProgress 进度回调
	 */
	async scanLocalFolder(
		folderPath: string,
		onProgress?: (current: number, total: number) => void
	): Promise<number> {
		console.debug(`[Bangumi Sync] 扫描本地文件夹: ${folderPath}`);
		this.localSubjects.clear();
		this.lastScanPath = folderPath;

		const normalizedPath = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (!(folder instanceof TFolder)) {
			console.debug(`[Bangumi Sync] 文件夹不存在: ${folderPath}`);
			return 0;
		}

		// 获取所有 markdown 文件
		const allFiles = this.app.vault.getMarkdownFiles();
		const targetFiles = allFiles.filter(file => file.path.startsWith(normalizedPath));

		console.debug(`[Bangumi Sync] 找到 ${targetFiles.length} 个文件`);

		let processed = 0;
		let cacheHits = 0;
		let fileReads = 0;

		for (const file of targetFiles) {
			try {
				let subjectId: number | null = null;
				let name_cn = '';

				// 优先从 metadataCache 获取 frontmatter 信息
				const cache = this.app.metadataCache.getFileCache(file);
				const frontmatter = cache?.frontmatter;

				if (frontmatter) {
					// 尝试从 frontmatter 的 id 字段获取
					const frontmatterId: unknown = frontmatter.id;
					if (frontmatterId !== undefined && frontmatterId !== null) {
						const numericId = typeof frontmatterId === 'number'
							? frontmatterId
							: typeof frontmatterId === 'string' && /^\d+$/.test(frontmatterId)
								? parseInt(frontmatterId, 10)
								: null;
						if (numericId !== null && numericId > 0) {
							subjectId = numericId;
							cacheHits++;
						}
					}

					// 尝试从 frontmatter 的 BangumiID 字段获取
					if (subjectId === null) {
						const bgmId: unknown = frontmatter.BangumiID;
						if (bgmId !== undefined && bgmId !== null) {
							const numericId = typeof bgmId === 'number'
								? bgmId
								: typeof bgmId === 'string' && /^\d+$/.test(bgmId)
									? parseInt(bgmId, 10)
									: null;
							if (numericId !== null && numericId > 0) {
								subjectId = numericId;
								cacheHits++;
							}
						}
					}

					// 从 frontmatter 获取中文名
					if (frontmatter.中文名) {
						name_cn = String(frontmatter.中文名).trim();
					}
				}

				// 如果 metadataCache 没有找到 ID，则读取文件内容
				if (subjectId === null) {
					const content = await this.app.vault.read(file);
					subjectId = this.extractSubjectId(content);
					fileReads++;

					if (subjectId && !name_cn) {
						name_cn = this.extractNameCN(content);
					}
				}

				if (subjectId) {
					this.localSubjects.set(subjectId, {
						id: subjectId,
						path: file.path,
						name_cn: name_cn,
					});
					console.debug(`[Bangumi Sync] 发现已同步条目: ${name_cn} (ID: ${subjectId})`);
				}
			} catch (error) {
				console.error(`[Bangumi Sync] 读取文件失败: ${file.path}`, error);
			}

			processed++;
			if (onProgress) {
				onProgress(processed, targetFiles.length);
			}
		}

		console.debug(`[Bangumi Sync] 扫描完成，发现 ${this.localSubjects.size} 个已同步条目 (缓存命中: ${cacheHits}, 文件读取: ${fileReads})`);
		return this.localSubjects.size;
	}

	/**
	 * 从文件内容中提取条目 ID
	 * 通过查找 frontmatter 中的 Bangumi ID 或从封面图片路径提取
	 */
	private extractSubjectId(content: string): number | null {
		// 方法1: 从 frontmatter 中查找 id 字段（可能是第一个字段或后续字段）
		// 匹配 --- 后紧跟的 id: 或换行后的 id:
		const idMatch = content.match(/^---\n(?:id:\s*"?(\d+)"?|[\s\S]*?\nid:\s*"?(\d+)"?)/);
		if (idMatch) {
			return parseInt(idMatch[1] || idMatch[2], 10);
		}

		// 方法2: 从 frontmatter 中查找 BangumiID 字段
		const bgmIdMatch = content.match(/^---\n[\s\S]*?\nBangumiID:\s*"?(\d+)"?/);
		if (bgmIdMatch) {
			return parseInt(bgmIdMatch[1], 10);
		}

		// 方法3: 从封面图片路径提取 (格式如: assets/123456_cover.jpg 或 ACGN/assets/123456_cover.jpg)
		const coverMatch = content.match(/(\d+)_cover\.(jpg|png|webp)/);
		if (coverMatch) {
			return parseInt(coverMatch[1], 10);
		}

		// 方法4: 从官方网站链接提取 (格式如: https://bgm.tv/subject/123456)
		const bgmMatch = content.match(/bgm\.tv\/subject\/(\d+)/);
		if (bgmMatch) {
			return parseInt(bgmMatch[1], 10);
		}

		return null;
	}

	/**
	 * 从文件内容中提取中文名
	 */
	private extractNameCN(content: string): string {
		const nameMatch = content.match(/^---\n[\s\S]*?\n中文名:\s*"?([^"\n]+)"?/);
		if (nameMatch) {
			return nameMatch[1].trim();
		}
		return '';
	}

	/**
	 * 检查条目是否已同步
	 */
	isSynced(subjectId: number): boolean {
		return this.localSubjects.has(subjectId);
	}

	/**
	 * 获取已同步条目的信息
	 */
	getLocalSubject(subjectId: number): LocalSubjectInfo | undefined {
		return this.localSubjects.get(subjectId);
	}

	/**
	 * 获取所有已同步的条目 ID
	 */
	getSyncedIds(): Set<number> {
		return new Set(this.localSubjects.keys());
	}

	/**
	 * 获取所有本地条目信息
	 */
	getLocalSubjects(): Map<number, LocalSubjectInfo> {
		return this.localSubjects;
	}

	/**
	 * 计算需要同步的条目
	 * @param remoteCollections 远程收藏列表
	 * @param limit 用户请求的同步数量限制（0 表示不限制）
	 * @param force 是否强制同步（忽略已存在的）
	 * @returns toAdd: 需要新增的条目; toSkip: 本地已存在的条目
	 */
	computeDiff<T extends { subject_id: number; subject: { name_cn?: string; name?: string } }>(
		remoteCollections: T[],
		options: {
			limit: number;
			force: boolean;
		}
	): {
		toAdd: T[];
		toSkip: T[];
	} {
		console.debug(`[Bangumi Sync] 计算同步差异，远程条目: ${remoteCollections.length}，本地条目: ${this.localSubjects.size}`);

		// 分离已存在和未存在的条目
		const existing: T[] = [];
		const notExisting: T[] = [];

		for (const collection of remoteCollections) {
			const subjectId = collection.subject_id;
			const isLocal = this.localSubjects.has(subjectId);

			if (isLocal) {
				existing.push(collection);
			} else {
				notExisting.push(collection);
			}
		}

		console.debug(`[Bangumi Sync] 已存在: ${existing.length}，未同步: ${notExisting.length}`);

		let toAdd: T[];
		let toSkip: T[];

		if (options.force) {
			// 强制同步：所有条目都要处理，但受数量限制
			toAdd = options.limit > 0 ? remoteCollections.slice(0, options.limit) : remoteCollections;
			toSkip = [];
		} else {
			// 正常同步：只同步未存在的条目
			// 用户设置的 limit 是指"同步 N 个新条目"
			toAdd = options.limit > 0 ? notExisting.slice(0, options.limit) : notExisting;
			toSkip = existing;
		}

		console.debug(`[Bangumi Sync] 需要新增: ${toAdd.length}，跳过: ${toSkip.length}`);

		return {
			toAdd,
			toSkip,
		};
	}

	/**
	 * 清除缓存
	 */
	clear(): void {
		this.localSubjects.clear();
		this.lastScanPath = '';
	}

	/**
	 * 开始新的同步批次
	 * 清空本批次已同步的条目记录
	 */
	startBatch(): void {
		this.batchSyncedItems.clear();
		console.debug(`[Bangumi Sync] 开始新的同步批次`);
	}

	/**
	 * 添加本批次已同步的条目
	 * @param subjectId 条目 ID
	 * @param path 本地文件路径
	 * @param name_cn 中文名
	 * @param wasNewlyCreated 是否为新创建的文件（用于回滚判断）
	 */
	addBatchSyncedItem(subjectId: number, path: string, name_cn: string, wasNewlyCreated = false): void {
		this.batchSyncedItems.set(subjectId, { id: subjectId, path, name_cn, wasNewlyCreated });
		// 同时添加到 localSubjects，以便后续条目能找到
		this.localSubjects.set(subjectId, { id: subjectId, path, name_cn });
		console.debug(`[Bangumi Sync] 本批次已同步: ${name_cn} (ID: ${subjectId}) -> ${path}`);
	}

	/**
	 * 获取本批次已同步的文件列表（用于回滚）
	 */
	getBatchSyncedFiles(): BatchSyncedFile[] {
		const files: BatchSyncedFile[] = [];
		for (const [subjectId, info] of this.batchSyncedItems) {
			files.push({
				subjectId,
				filePath: info.path,
				name_cn: info.name_cn,
				wasNewlyCreated: info.wasNewlyCreated ?? false,
			});
		}
		return files;
	}

	/**
	 * 回滚本批次同步：删除新创建的文件
	 * 只删除 wasNewlyCreated=true 的文件，覆盖更新的文件不处理
	 */
	async rollbackBatch(): Promise<{ deleted: number; failed: number }> {
		const result = { deleted: 0, failed: 0 };
		for (const [subjectId, info] of this.batchSyncedItems) {
			if (!info.wasNewlyCreated) continue;
			try {
				const file = this.app.vault.getAbstractFileByPath(info.path);
				if (file instanceof TFile) {
					await this.app.fileManager.trashFile(file);
					this.localSubjects.delete(subjectId);
					result.deleted++;
					console.debug(`[Bangumi Sync] 回滚删除: ${info.name_cn} -> ${info.path}`);
				}
			} catch (error) {
				console.error(`[Bangumi Sync] 回滚失败: ${info.path}`, error);
				result.failed++;
			}
		}
		this.batchSyncedItems.clear();
		return result;
	}

	/**
	 * 检查条目是否已同步（包括本批次同步的）
	 */
	isSyncedIncludingBatch(subjectId: number): boolean {
		return this.localSubjects.has(subjectId) || this.batchSyncedItems.has(subjectId);
	}

	/**
	 * 获取本地条目路径（包括本批次同步的）
	 */
	getLocalPath(subjectId: number): string | undefined {
		// 先检查本批次同步的
		const batchItem = this.batchSyncedItems.get(subjectId);
		if (batchItem) {
			return batchItem.path;
		}
		// 再检查之前同步的
		const info = this.localSubjects.get(subjectId);
		return info?.path;
	}

	/**
	 * 通过 metadataCache 解析条目 ID 对应的本地路径
	 * 用于在缓存未命中时快速查找，避免读取文件内容
	 * @param subjectId 条目 ID
	 * @param scanRoot 扫描根路径（可选，用于过滤文件范围）
	 * @returns 找到的路径，同时会将结果添加到缓存中
	 */
	resolvePathByMetadataCache(subjectId: number, scanRoot?: string): string | undefined {
		const normalizedRoot = scanRoot ? normalizePath(scanRoot) : '';
		const allFiles = this.app.vault.getMarkdownFiles();

		for (const file of allFiles) {
			// 如果指定了扫描根路径，只扫描该路径下的文件
			if (normalizedRoot && !file.path.startsWith(normalizedRoot)) {
				continue;
			}

			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;

			if (!frontmatter) {
				continue;
			}

			// 检查 id 字段
			const frontmatterId: unknown = frontmatter.id;
			if (frontmatterId !== undefined && frontmatterId !== null) {
				const numericId = typeof frontmatterId === 'number'
					? frontmatterId
					: typeof frontmatterId === 'string' && /^\d+$/.test(frontmatterId)
						? parseInt(frontmatterId, 10)
						: null;
				if (numericId === subjectId) {
					// 找到了，添加到缓存
					const name_cn = frontmatter.中文名 ? String(frontmatter.中文名).trim() : '';
					this.addBatchSyncedItem(subjectId, file.path, name_cn || file.basename, false);
					return file.path;
				}
			}

			// 检查 BangumiID 字段
			const bgmId: unknown = frontmatter.BangumiID;
			if (bgmId !== undefined && bgmId !== null) {
				const numericId = typeof bgmId === 'number'
					? bgmId
					: typeof bgmId === 'string' && /^\d+$/.test(bgmId)
						? parseInt(bgmId, 10)
						: null;
				if (numericId === subjectId) {
					// 找到了，添加到缓存
					const name_cn = frontmatter.中文名 ? String(frontmatter.中文名).trim() : '';
					this.addBatchSyncedItem(subjectId, file.path, name_cn || file.basename, false);
					return file.path;
				}
			}
		}

		return undefined;
	}

	/**
	 * 获取本地条目信息（包括本批次同步的）
	 */
	getLocalSubjectIncludingBatch(subjectId: number): LocalSubjectInfo | undefined {
		// 先检查本批次同步的
		const batchItem = this.batchSyncedItems.get(subjectId);
		if (batchItem) {
			return batchItem;
		}
		// 再检查之前同步的
		return this.localSubjects.get(subjectId);
	}

	/**
	 * 从正文内容中提取短评
	 * 短评格式: > [!abstract]+ **短评**\n> {comment}
	 */
	extractComment(content: string): string | null {
		const block = this.findCommentBlock(content);
		if (!block) {
			return null;
		}

		const bodyLines = block.lines.slice(1).map(line => {
			if (/^>\s?/.test(line)) {
				return line.replace(/^>\s?/, '');
			}
			return line.trim();
		});

		return this.normalizeComment(bodyLines.join('\n'));
	}

	/**
	 * 更新正文中的短评
	 * 如果短评不存在，在简介之前插入
	 */
	updateComment(content: string, newComment: string): string {
		const normalizedComment = this.normalizeComment(newComment);
		if (!normalizedComment) {
			return this.removeComment(content);
		}

		const newCommentLines = normalizedComment
			.split('\n')
			.map(line => line.length > 0 ? `> ${line}` : '>');
		const newCommentBlock = ['> [!abstract]+ **短评**', ...newCommentLines].join('\n');
		const block = this.findCommentBlock(content);

		if (block) {
			return content.slice(0, block.start) + newCommentBlock + content.slice(block.end);
		}

		const introMatch = content.match(/^> \[!abstract\]\+\s*\*\*简介\*\*/m);
		if (introMatch && introMatch.index !== undefined) {
			return content.slice(0, introMatch.index) + newCommentBlock + '\n\n' + content.slice(introMatch.index);
		}

		const frontmatterEnd = content.indexOf('---', 3);
		if (frontmatterEnd !== -1) {
			const afterFrontmatter = content.substring(frontmatterEnd + 3).trimStart();
			return content.substring(0, frontmatterEnd + 3) + '\n\n' + newCommentBlock + '\n\n' + afterFrontmatter;
		}

		return `${newCommentBlock}\n\n${content}`;
	}

	/**
	 * 删除正文中的短评 callout
	 */
	removeComment(content: string): string {
		const block = this.findCommentBlock(content);
		if (!block) {
			return content;
		}

		let updated = content.slice(0, block.start) + content.slice(block.end);
		updated = updated.replace(/\n{3,}/g, '\n\n');
		return updated;
	}

	normalizeComment(comment: string | null | undefined): string | null {
		if (!comment) {
			return null;
		}

		const normalized = comment
			.replace(/\r\n?/g, '\n')
			.replace(/\u00a0/g, ' ')
			.split('\n')
			.map(line => line.replace(/\s+$/g, '').trim())
			.join('\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim();

		return normalized.length > 0 ? normalized : null;
	}

	private findCommentBlock(content: string): { start: number; end: number; lines: string[] } | null {
		const normalizedContent = content.replace(/\r\n?/g, '\n');
		const lines = normalizedContent.split('\n');
		const headerIndex = lines.findIndex(line => /^> \[!abstract\]\+\s*\*\*短评\*\*\s*$/.test(line));

		if (headerIndex === -1) {
			return null;
		}

		let endIndex = headerIndex + 1;
		while (endIndex < lines.length && /^> ?/.test(lines[endIndex])) {
			endIndex++;
		}

		const start = lines.slice(0, headerIndex).join('\n').length + (headerIndex > 0 ? 1 : 0);
		const end = lines.slice(0, endIndex).join('\n').length + (endIndex < lines.length ? 1 : 0);

		return {
			start,
			end,
			lines: lines.slice(headerIndex, endIndex),
		};
	}

	/**
	 * 从 frontmatter 中提取标签
	 * 支持两种格式：
	 * 1. YAML 数组格式: tags:\n  - tag1\n  - tag2
	 * 2. 逗号分隔格式: tags: tag1, tag2
	 */
	extractTags(content: string): string[] | null {
		const frontmatter = this.extractFrontmatter(content);
		if (!frontmatter) {
			return null;
		}

		const lines = frontmatter.split('\n');
		const tagBlock = this.findYamlListBlock(lines, 'tags');

		if (tagBlock) {
			const tags = this.normalizeTags(lines
				.slice(tagBlock.start + 1, tagBlock.end)
				.map(line => line.replace(/^\s*-\s*/, '').trim())
			);
			return tags.length > 0 ? tags : null;
		}

		const inlineLine = lines.find(line => /^tags:\s*\S/.test(line));
		if (inlineLine) {
			const tagStr = inlineLine.replace(/^tags:\s*/, '').trim();
			const cleanStr = tagStr.replace(/^["']|["']$/g, '');
			const tags = this.normalizeTags(cleanStr
				.split(',')
				.map(t => t.trim())
			);
			return tags.length > 0 ? tags : null;
		}

		return null;
	}

	/**
	 * 更新 frontmatter 中的标签
	 * 使用 YAML 数组格式
	 */
	updateTags(content: string, newTags: string[]): string {
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
		if (!frontmatterMatch) {
			return content;
		}

		const prefix = frontmatterMatch[1];
		const frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];
		const bodyContent = frontmatterMatch[4];

		const lines = frontmatter.split('\n');
		const filteredTags = this.normalizeTags(newTags);
		const newTagLines = ['tags:', ...filteredTags.map(tag => `  - ${tag}`)];
		const updatedFrontmatter = this.replaceYamlBlock(lines, 'tags', newTagLines).join('\n');

		return prefix + updatedFrontmatter + suffix + bodyContent;
	}

	/**
	 * 删除 frontmatter 中的标签字段
	 */
	removeTags(content: string): string {
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
		if (!frontmatterMatch) {
			return content;
		}

		const prefix = frontmatterMatch[1];
		const frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];
		const bodyContent = frontmatterMatch[4];

		const lines = frontmatter.split('\n');
		const updatedFrontmatter = this.removeYamlBlock(lines, 'tags').join('\n').trim();

		return prefix + updatedFrontmatter + suffix + bodyContent;
	}

	private extractFrontmatter(content: string): string | null {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		return frontmatterMatch ? frontmatterMatch[1] : null;
	}

	private findYamlListBlock(lines: string[], key: string): { start: number; end: number } | null {
		const start = lines.findIndex(line => new RegExp(`^${key}:\\s*$`).test(line));
		if (start === -1) {
			return null;
		}

		let end = start + 1;
		while (end < lines.length && /^\s*-\s+/.test(lines[end])) {
			end++;
		}

		return { start, end };
	}

	private replaceYamlBlock(lines: string[], key: string, replacement: string[]): string[] {
		const block = this.findYamlListBlock(lines, key);
		const inlineIndex = lines.findIndex(line => new RegExp(`^${key}:\\s*.*$`).test(line));

		if (block) {
			return [...lines.slice(0, block.start), ...replacement, ...lines.slice(block.end)];
		}

		if (inlineIndex !== -1) {
			return [...lines.slice(0, inlineIndex), ...replacement, ...lines.slice(inlineIndex + 1)];
		}

		return [...lines, ...replacement];
	}

	private removeYamlBlock(lines: string[], key: string): string[] {
		const block = this.findYamlListBlock(lines, key);
		if (block) {
			return [...lines.slice(0, block.start), ...lines.slice(block.end)];
		}

		const inlineIndex = lines.findIndex(line => new RegExp(`^${key}:\\s*.*$`).test(line));
		if (inlineIndex !== -1) {
			return [...lines.slice(0, inlineIndex), ...lines.slice(inlineIndex + 1)];
		}

		return lines;
	}

	normalizeTags(tags: string[] | null | undefined): string[] {
		if (!tags) {
			return [];
		}

		return Array.from(new Set(
			tags
				.map(tag => tag.trim())
				.filter(tag => this.isValidTagValue(tag))
		));
	}

	private isValidTagValue(value: string): boolean {
		const normalized = value.trim();
		if (normalized.length === 0) {
			return false;
		}

		// 忽略明显是旧损坏 frontmatter 中混入的键值对，例如“评分: 9”
		if (/^[^,[\]]+:\s*.+$/.test(normalized)) {
			return false;
		}

		return true;
	}

	/**
	 * 从 frontmatter 中提取相关链接
	 * 支持两种格式：
	 * 1. YAML 数组格式: 相关:\n  - "[[link1]]"\n  - "[[link2]]"
	 * 2. 逗号分隔格式: 相关: [[link1]], [[link2]]
	 */
	extractRelated(content: string): string[] | null {
		// 匹配 frontmatter 中的 相关 字段
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) {
			return null;
		}

		const frontmatter = frontmatterMatch[1];

		// 方式1: YAML 数组格式
		const arrayMatch = frontmatter.match(/^相关:\s*\n((?:\s+- .+\n?)+)/m);
		if (arrayMatch) {
			const links = arrayMatch[1]
				.split('\n')
				.map(line => {
					// 提取链接，移除引号
					const match = line.match(/^\s+- ["']?(.+?)["']?$/);
					return match ? match[1].trim() : '';
				})
				.filter(line => this.isRelatedLink(line));
			return links.length > 0 ? links : null;
		}

		// 方式2: 逗号分隔格式
		const inlineMatch = frontmatter.match(/^相关:\s*(.+)$/m);
		if (inlineMatch) {
			const linkStr = inlineMatch[1].trim();
			// 移除可能的引号
			const cleanStr = linkStr.replace(/^["']|["']$/g, '');
			const links = cleanStr.split(',').map(l => l.trim()).filter(l => this.isRelatedLink(l));
			return links.length > 0 ? links : null;
		}

		return null;
	}

	private isRelatedLink(value: string): boolean {
		return value.includes('[[') && value.includes(']]');
	}

	/**
	 * 规范化链接格式，用于去重比较
	 * 移除引号，确保格式一致
	 */
	private normalizeLink(link: string): string {
		// 移除首尾引号
		return link.replace(/^["']|["']$/g, '').trim();
	}

	/**
	 * 更新 frontmatter 中的相关链接
	 * 使用 YAML 数组格式，合并现有链接和新链接
	 * 链接值用双引号包围以正确处理特殊字符
	 * 自动去重，避免重复添加相同链接
	 */
	updateRelated(content: string, newLinks: string[]): string {
		// 匹配 frontmatter 和后续内容
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
		if (!frontmatterMatch) {
			return content;
		}

		const prefix = frontmatterMatch[1];
		let frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];
		const bodyContent = frontmatterMatch[4]; // 保留 frontmatter 之后的正文内容

		// 获取现有链接并规范化
		const existingLinks = (this.extractRelated(content) || []).map(l => this.normalizeLink(l));

		// 规范化新链接
		const normalizedNewLinks = newLinks.map(l => this.normalizeLink(l));

		// 合并链接，使用规范化格式去重
		const allLinksSet = new Set<string>();
		const allLinks: string[] = [];

		// 先添加现有链接
		for (const link of existingLinks) {
			if (!allLinksSet.has(link)) {
				allLinksSet.add(link);
				allLinks.push(link);
			}
		}

		// 再添加新链接（仅添加不存在的）
		for (const link of normalizedNewLinks) {
			if (!allLinksSet.has(link)) {
				allLinksSet.add(link);
				allLinks.push(link);
				console.debug(`[Bangumi Sync] 添加新相关链接: ${link}`);
			} else {
				console.debug(`[Bangumi Sync] 跳过重复链接: ${link}`);
			}
		}

		// 如果没有变化，直接返回原内容
		if (allLinks.length === existingLinks.length && normalizedNewLinks.every(l => allLinksSet.has(l))) {
			// 检查是否真的没有新增
			const hasNew = normalizedNewLinks.some(l => !existingLinks.includes(l));
			if (!hasNew) {
				return content;
			}
		}

		// 构建新的相关链接 YAML 数组（用双引号包围链接）
		const newLinksYaml = allLinks.length > 0
			? `相关:\n${allLinks.map(l => `  - "${l}"`).join('\n')}`
			: '相关:';

		// 检查是否已有 相关 字段
		const existingRelatedMatch = frontmatter.match(/^相关:.*(\n\s+- .+)*/m);
		if (existingRelatedMatch) {
			// 替换现有相关链接
			frontmatter = frontmatter.replace(/^相关:.*(\n\s+- .+)*/m, newLinksYaml);
		} else {
			// 在 frontmatter 末尾添加相关链接
			frontmatter = frontmatter + '\n' + newLinksYaml;
		}

		// 返回完整内容：frontmatter + 正文
		return prefix + frontmatter + suffix + bodyContent;
	}

	// ==================== 评分和状态提取/更新方法 ====================

	/**
	 * 根据条目类型获取状态字段名
	 */
	getStatusFieldName(subjectType: SubjectType): string {
		switch (subjectType) {
			case SubjectType.Book:
				return '阅读状态';
			case SubjectType.Anime:
			case SubjectType.Real:
				return '观看状态';
			case SubjectType.Music:
				return '收藏状态';
			case SubjectType.Game:
				return '游玩状态';
			default:
				return '观看状态';
		}
	}

	/**
	 * 从 frontmatter 中提取用户评分
	 * 字段名: 评分 (范围 1-10)
	 */
	extractRate(content: string): number | null {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) return null;

		const frontmatter = frontmatterMatch[1];
		const rateMatch = frontmatter.match(/^评分:\s*"?(\d+)"?/m);

		if (rateMatch) {
			const rate = parseInt(rateMatch[1], 10);
			return (rate >= 1 && rate <= 10) ? rate : null;
		}
		return null;
	}

	/**
	 * 从 frontmatter 中提取收藏状态
	 */
	extractStatus(content: string, statusFieldName: string): number | null {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) return null;

		const frontmatter = frontmatterMatch[1];
		const statusRegex = new RegExp(`^${statusFieldName}:\\s*"?([^"\\n]+)"?`, 'm');
		const statusMatch = frontmatter.match(statusRegex);

		if (statusMatch) {
			const statusText = statusMatch[1].trim();
			return this.parseStatusText(statusText);
		}
		return null;
	}

	/**
	 * 将状态文本转换为 CollectionType 数字
	 */
	private parseStatusText(text: string): number | null {
		const normalizedText = text
			.trim()
			.replace(/🕒|✅|▶️|⏸️|❌|\uFE0F|\s/gu, '');
		const statusMap: Record<string, number> = {
			'想看': CollectionType.Wish,
			'想读': CollectionType.Wish,
			'想玩': CollectionType.Wish,
			'想听': CollectionType.Wish,
			'已看': CollectionType.Done,
			'已读': CollectionType.Done,
			'已玩': CollectionType.Done,
			'已听': CollectionType.Done,
			'看过': CollectionType.Done,
			'读过': CollectionType.Done,
			'玩过': CollectionType.Done,
			'听过': CollectionType.Done,
			'在看': CollectionType.Doing,
			'在读': CollectionType.Doing,
			'在玩': CollectionType.Doing,
			'在听': CollectionType.Doing,
			'搁置': CollectionType.OnHold,
			'抛弃': CollectionType.Dropped,
			'放弃': CollectionType.Dropped,
		};
		return statusMap[normalizedText] ?? statusMap[text.trim()] ?? null;
	}

	/**
	 * 将 CollectionType 数字转换为状态文本
	 */
	private getStatusText(type: CollectionType, statusFieldName: string): string {
		return getCollectionStatusLabel(type, this.getSubjectTypeFromStatusFieldName(statusFieldName), true);
	}

	private getSubjectTypeFromStatusFieldName(statusFieldName: string): SubjectType | undefined {
		switch (statusFieldName) {
			case '阅读状态':
				return SubjectType.Book;
			case '游玩状态':
				return SubjectType.Game;
			case '收藏状态':
				return SubjectType.Music;
			case '观看状态':
				return SubjectType.Anime;
			default:
				return undefined;
		}
	}

	/**
	 * 更新 frontmatter 中的评分
	 */
	updateRate(content: string, newRate: number | null): string {
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
		if (!frontmatterMatch) return content;

		const prefix = frontmatterMatch[1];
		let frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];
		const bodyContent = frontmatterMatch[4];

		if (newRate !== null && newRate >= 1 && newRate <= 10) {
			const newRateStr = `评分: ${newRate}`;
			const rateRegex = /^评分:\s*"?(\d+)"?/m;
			if (rateRegex.test(frontmatter)) {
				frontmatter = frontmatter.replace(rateRegex, newRateStr);
			} else {
				frontmatter = frontmatter + '\n' + newRateStr;
			}
		}

		return prefix + frontmatter + suffix + bodyContent;
	}

	/**
	 * 更新 frontmatter 中的状态
	 */
	updateStatus(content: string, newStatus: CollectionType, statusFieldName: string): string {
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
		if (!frontmatterMatch) return content;

		const prefix = frontmatterMatch[1];
		let frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];
		const bodyContent = frontmatterMatch[4];

		const statusText = this.getStatusText(newStatus, statusFieldName);
		const newStatusStr = `${statusFieldName}: ${statusText}`;

		const statusRegex = new RegExp(`^${statusFieldName}:.*$`, 'm');
		if (statusRegex.test(frontmatter)) {
			frontmatter = frontmatter.replace(statusRegex, newStatusStr);
		} else {
			frontmatter = frontmatter + '\n' + newStatusStr;
		}

		return prefix + frontmatter + suffix + bodyContent;
	}
}

// 兼容旧版本的类型别名
