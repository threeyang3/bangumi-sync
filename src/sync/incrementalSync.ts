/**
 * 增量同步逻辑
 * 通过扫描本地文件夹来检验是否已经同步
 */

import { App, TFolder, normalizePath } from 'obsidian';

/**
 * 本地条目信息
 */
interface LocalSubjectInfo {
	id: number;
	path: string;
	name_cn: string;
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
		for (const file of targetFiles) {
			try {
				const content = await this.app.vault.read(file);
				const subjectId = this.extractSubjectId(content);

				if (subjectId) {
					const name_cn = this.extractNameCN(content);
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

		console.debug(`[Bangumi Sync] 扫描完成，发现 ${this.localSubjects.size} 个已同步条目`);
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
	 */
	addBatchSyncedItem(subjectId: number, path: string, name_cn: string): void {
		this.batchSyncedItems.set(subjectId, { id: subjectId, path, name_cn });
		// 同时添加到 localSubjects，以便后续条目能找到
		this.localSubjects.set(subjectId, { id: subjectId, path, name_cn });
		console.debug(`[Bangumi Sync] 本批次已同步: ${name_cn} (ID: ${subjectId}) -> ${path}`);
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
		// 匹配短评 callout
		const commentMatch = content.match(/> \[!abstract\]\+\s*\*\*短评\*\*\n((?:> .+\n?)+)/);
		if (commentMatch) {
			// 提取 > 后面的内容，合并为一行
			const lines = commentMatch[1].split('\n');
			const comment = lines
				.map(line => line.replace(/^> /, '').trim())
				.filter(line => line.length > 0)
				.join(' ');
			return comment || null;
		}
		return null;
	}

	/**
	 * 更新正文中的短评
	 * 如果短评不存在，在简介之前插入
	 */
	updateComment(content: string, newComment: string): string {
		const commentMatch = content.match(/> \[!abstract\]\+\s*\*\*短评\*\*\n((?:> .+\n?)+)/);

		// 构建新的短评 callout
		const newCommentLines = newComment.split('\n').map(line => `> ${line}`).join('\n');
		const newCommentBlock = `> [!abstract]+ **短评**\n${newCommentLines}`;

		if (commentMatch) {
			// 替换现有短评
			return content.replace(/> \[!abstract\]\+\s*\*\*短评\*\*\n((?:> .+\n?)+)/, newCommentBlock + '\n');
		} else {
			// 在简介之前插入短评
			const introMatch = content.match(/> \[!abstract\]\+\s*\*\*简介\*\*/);
			if (introMatch) {
				return content.replace(/> \[!abstract\]\+\s*\*\*简介\*\*/, newCommentBlock + '\n\n> [!abstract]+ **简介**');
			}
			// 如果没有简介，在 frontmatter 之后插入
			const frontmatterEnd = content.indexOf('---', 3);
			if (frontmatterEnd !== -1) {
				const afterFrontmatter = content.substring(frontmatterEnd + 3).trimStart();
				return content.substring(0, frontmatterEnd + 3) + '\n\n' + newCommentBlock + '\n\n' + afterFrontmatter;
			}
		}
		return content;
	}

	/**
	 * 删除正文中的短评 callout
	 */
	removeComment(content: string): string {
		return content.replace(/> \[!abstract\]\+\s*\*\*短评\*\*\n((?:> .+\n?)+)\n?/, '');
	}

	/**
	 * 从 frontmatter 中提取标签
	 * 支持两种格式：
	 * 1. YAML 数组格式: tags:\n  - tag1\n  - tag2
	 * 2. 逗号分隔格式: tags: tag1, tag2
	 */
	extractTags(content: string): string[] | null {
		// 匹配 frontmatter 中的 tags 字段
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) {
			return null;
		}

		const frontmatter = frontmatterMatch[1];

		// 方式1: YAML 数组格式
		const arrayMatch = frontmatter.match(/^tags:\s*\n((?:\s+- .+\n?)+)/m);
		if (arrayMatch) {
			const tags = arrayMatch[1]
				.split('\n')
				.map(line => line.replace(/^\s+- /, '').trim())
				.filter(line => line.length > 0);
			return tags.length > 0 ? tags : null;
		}

		// 方式2: 逗号分隔格式
		const inlineMatch = frontmatter.match(/^tags:\s*(.+)$/m);
		if (inlineMatch) {
			const tagStr = inlineMatch[1].trim();
			// 移除可能的引号
			const cleanStr = tagStr.replace(/^["']|["']$/g, '');
			const tags = cleanStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
			return tags.length > 0 ? tags : null;
		}

		return null;
	}

	/**
	 * 更新 frontmatter 中的标签
	 * 使用 YAML 数组格式
	 */
	updateTags(content: string, newTags: string[]): string {
		// 匹配 frontmatter
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
		if (!frontmatterMatch) {
			return content;
		}

		const prefix = frontmatterMatch[1];
		let frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];

		// 构建新的标签 YAML 数组
		const newTagsYaml = newTags.length > 0
			? `tags:\n${newTags.map(t => `  - ${t}`).join('\n')}`
			: 'tags:';

		// 检查是否已有 tags 字段
		const existingTagsMatch = frontmatter.match(/^tags:.*(\n\s+- .+)*/m);
		if (existingTagsMatch) {
			// 替换现有标签
			frontmatter = frontmatter.replace(/^tags:.*(\n\s+- .+)*/m, newTagsYaml);
		} else {
			// 在 frontmatter 末尾添加标签
			frontmatter = frontmatter + '\n' + newTagsYaml;
		}

		return prefix + frontmatter + suffix;
	}

	/**
	 * 删除 frontmatter 中的标签字段
	 */
	removeTags(content: string): string {
		// 匹配 frontmatter
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
		if (!frontmatterMatch) {
			return content;
		}

		const prefix = frontmatterMatch[1];
		let frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];

		// 移除 tags 字段（支持数组和内联格式）
		frontmatter = frontmatter.replace(/^tags:.*(\n\s+- .+)*/m, '').trim();

		return prefix + frontmatter + suffix;
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
				.filter(line => line.length > 0);
			return links.length > 0 ? links : null;
		}

		// 方式2: 逗号分隔格式
		const inlineMatch = frontmatter.match(/^相关:\s*(.+)$/m);
		if (inlineMatch) {
			const linkStr = inlineMatch[1].trim();
			// 移除可能的引号
			const cleanStr = linkStr.replace(/^["']|["']$/g, '');
			const links = cleanStr.split(',').map(l => l.trim()).filter(l => l.length > 0);
			return links.length > 0 ? links : null;
		}

		return null;
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
		// 匹配 frontmatter
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
		if (!frontmatterMatch) {
			return content;
		}

		const prefix = frontmatterMatch[1];
		let frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];

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

		return prefix + frontmatter + suffix;
	}
}

// 兼容旧版本的类型别名
export const IncrementalSyncV3 = IncrementalSync;
