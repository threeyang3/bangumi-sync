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
import { safeStringify } from '../../common/utils/value';
import {
    SubjectUserData,
    RatingDetails,
    BANGUMI_FIELDS,
    RATING_DETAIL_FIELDS,
} from './types';

/**
 * 用户数据提取器
 */
export class UserDataExtractor {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 从单个文件提取用户数据
     */
    extractFromFile(file: TFile): SubjectUserData | null {
        const cache = this.app.metadataCache.getFileCache(file);
        return this.extractFromFrontmatter(file, getFrontmatterRecord(cache?.frontmatter));
    }

    /**
     * 从单个文件提取用户数据（异步版本，包含正文内容）
     */
    async extractFromFileAsync(file: TFile): Promise<SubjectUserData | null> {
        const cache = this.app.metadataCache.getFileCache(file);
        const result = this.extractFromFrontmatter(file, getFrontmatterRecord(cache?.frontmatter));
        if (!result) return null;

        // 提取正文内容
        const content = await this.app.vault.read(file);

        // 提取记录
        const recordContent = this.extractSection(content, '记录');
        if (recordContent) {
            result.recordContent = recordContent;
        }

        // 提取感想
        const thoughtsContent = this.extractSection(content, '感想');
        if (thoughtsContent) {
            result.thoughtsContent = thoughtsContent;
        }

        return result;
    }

    private extractFromFrontmatter(file: TFile, frontmatter: Record<string, unknown> | null): SubjectUserData | null {
        if (!frontmatter) return null;

        const id = this.extractId(frontmatter);
        if (!id) return null;

        const name_cn = getFrontmatterString(frontmatter, '中文名')
            || getFrontmatterString(frontmatter, 'name_cn')
            || file.basename;
        const type = this.determineSubjectType(frontmatter);

        const result: SubjectUserData = {
            id,
            name_cn,
            type,
            workType: this.extractWorkType(frontmatter),
        };

        const ratingDetails = this.extractRatingDetails(frontmatter, type);
        if (ratingDetails && Object.keys(ratingDetails).length > 0) {
            result.ratingDetails = ratingDetails;
        }

        const customProperties = this.extractCustomProperties(frontmatter);
        if (Object.keys(customProperties).length > 0) {
            result.customProperties = customProperties;
        }

        return result;
    }

    /**
     * 从文件夹批量提取用户数据
     */
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

        // 获取所有 markdown 文件
        const allFiles = this.app.vault.getMarkdownFiles();
        const targetFiles = allFiles.filter(file => file.path.startsWith(normalizedPath));

        console.debug(`[Bangumi Sync] 扫描 ${targetFiles.length} 个文件`);

        let processed = 0;
        for (const file of targetFiles) {
            try {
                const userData = await this.extractFromFileAsync(file);
                if (userData) {
                    result.set(userData.id, userData);
                }
            } catch (error) {
                console.error(`[Bangumi Sync] 提取用户数据失败: ${file.path}`, error);
            }

            processed++;
            onProgress?.(processed, targetFiles.length);
        }

        console.debug(`[Bangumi Sync] 提取完成，发现 ${result.size} 个条目的用户数据`);
        return result;
    }

    /**
     * 提取条目 ID
     */
    private extractId(frontmatter: Record<string, unknown>): number | null {
        const id = frontmatter['id'] ?? frontmatter['ID'];
        if (typeof id === 'number') return id;
        if (typeof id === 'string') {
            const parsed = parseInt(id, 10);
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    }

    /**
     * 提取自定义属性
     * 过滤掉所有可从 Bangumi 获取的字段
     */
    private extractCustomProperties(frontmatter: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(frontmatter)) {
            // 跳过 Bangumi 字段
            if (BANGUMI_FIELDS.has(key)) continue;

            // 跳过空值
            if (value === undefined || value === '' || value === null) continue;

            // 保留用户自定义字段
            result[key] = value;
        }

        return result;
    }

    /**
     * 提取评分明细
     */
    private extractRatingDetails(
        frontmatter: Record<string, unknown>,
        subjectType: number
    ): RatingDetails | undefined {
        const details: RatingDetails = {};

        // 获取该条目类型的评分明细字段配置
        const config = RATING_DETAIL_FIELDS[subjectType] || RATING_DETAIL_FIELDS['comic'];

        if (!config) return undefined;

        for (const { key, frontmatterField } of config) {
            const value = frontmatter[frontmatterField];
            if (value !== undefined && value !== '' && value !== null) {
                details[key] = safeStringify(value);
            }
        }

        return Object.keys(details).length > 0 ? details : undefined;
    }

    /**
     * 提取指定章节内容
     * 格式: ## 章节名\n内容\n## 下一个章节
     */
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

    /**
     * 判断条目类型
     */
    private determineSubjectType(frontmatter: Record<string, unknown>): number {
        const typeStr = frontmatter['作品大类'] ?? frontmatter['type'];

        // 如果已经是数字，直接返回
        if (typeof typeStr === 'number') return typeStr;

        // 字符串映射
        const typeMap: Record<string, number> = {
            'Anime': SubjectType.Anime,
            'Book': SubjectType.Book,
            'Novel': SubjectType.Book,  // 小说归类为 Book
            'Comic': SubjectType.Book,  // 漫画归类为 Book
            'Music': SubjectType.Music,
            'Game': SubjectType.Game,
            'Real': SubjectType.Real,
        };

        return typeMap[String(typeStr)] || SubjectType.Book;
    }

    /**
     * 提取作品大类，用于导出时区分 Book 下的细分类。
     */
    private extractWorkType(frontmatter: Record<string, unknown>): string | undefined {
        const typeStr = frontmatter['作品大类'] ?? frontmatter['type'];
        return typeof typeStr === 'string' && typeStr.trim() ? typeStr.trim() : undefined;
    }

    /**
     * 判断是否为漫画类型
     * 漫画和小说都是 Book 类型，需要通过 作品大类 区分
     */
    isComicType(frontmatter: Record<string, unknown>): boolean {
        const typeStr = frontmatter['作品大类'];
        return typeStr === 'Comic' || typeStr === 'comic';
    }
}
