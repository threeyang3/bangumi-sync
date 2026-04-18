/**
 * V2 增量同步逻辑
 * 通过扫描本地文件夹来检验是否已经同步
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';

/**
 * 本地条目信息
 */
interface LocalSubjectInfo {
	id: number;
	path: string;
	name_cn: string;
}

/**
 * 增量同步 V2
 * 通过扫描本地文件夹检测已同步的条目
 */
export class IncrementalSyncV2 {
	private app: App;
	private localSubjects: Map<number, LocalSubjectInfo> = new Map();
	private lastScanPath: string = '';

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
		console.log(`[Bangumi Sync V2] 扫描本地文件夹: ${folderPath}`);
		this.localSubjects.clear();
		this.lastScanPath = folderPath;

		const normalizedPath = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (!(folder instanceof TFolder)) {
			console.log(`[Bangumi Sync V2] 文件夹不存在: ${folderPath}`);
			return 0;
		}

		// 获取所有 markdown 文件
		const allFiles = this.app.vault.getMarkdownFiles();
		const targetFiles = allFiles.filter(file => file.path.startsWith(normalizedPath));

		console.log(`[Bangumi Sync V2] 找到 ${targetFiles.length} 个文件`);

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
					console.log(`[Bangumi Sync V2] 发现已同步条目: ${name_cn} (ID: ${subjectId})`);
				}
			} catch (error) {
				console.error(`[Bangumi Sync V2] 读取文件失败: ${file.path}`, error);
			}

			processed++;
			if (onProgress) {
				onProgress(processed, targetFiles.length);
			}
		}

		console.log(`[Bangumi Sync V2] 扫描完成，发现 ${this.localSubjects.size} 个已同步条目`);
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
		console.log(`[Bangumi Sync V2] 计算同步差异，远程条目: ${remoteCollections.length}，本地条目: ${this.localSubjects.size}`);

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

		console.log(`[Bangumi Sync V2] 已存在: ${existing.length}，未同步: ${notExisting.length}`);

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

		console.log(`[Bangumi Sync V2] 需要新增: ${toAdd.length}，跳过: ${toSkip.length}`);

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
}
