/**
 * 用户数据导出器
 *
 * 按条目类型导出用户自定义数据到 JSON 文件
 */

import { App, TFile, normalizePath } from 'obsidian';
import { SubjectType } from '../../common/api/types';
import { UserDataExtractor } from './userDataExtractor';
import { UserDataExport, SubjectUserData } from './types';

/**
 * 条目类型标签
 */
const SUBJECT_TYPE_LABELS: Record<number, string> = {
    [SubjectType.Anime]: 'anime',
    [SubjectType.Book]: 'novel',  // 小说和漫画需要区分
    [SubjectType.Music]: 'music',
    [SubjectType.Game]: 'game',
    [SubjectType.Real]: 'real',
};

/**
 * 用户数据导出器
 */
export class UserDataExporter {
    private app: App;
    private extractor: UserDataExtractor;

    constructor(app: App) {
        this.app = app;
        this.extractor = new UserDataExtractor(app);
    }

    /**
     * 按条目类型分别导出用户数据
     */
    async exportBySubjectType(
        folderPath: string,
        outputDir: string,
        onProgress?: (current: number, total: number) => void
    ): Promise<{ success: boolean; files: string[]; error?: string }> {
        try {
            // 提取所有用户数据
            const userDataMap = await this.extractor.extractFromFolder(folderPath, onProgress);

            if (userDataMap.size === 0) {
                return { success: false, files: [], error: 'No user data found' };
            }

            // 按条目类型分组
            const groupedData = this.groupBySubjectType(userDataMap);

            // 确保输出目录存在
            await this.ensureDirectory(outputDir);

            const files: string[] = [];

            // 导出每个类型
            for (const [typeLabel, items] of Object.entries(groupedData)) {
                if (Object.keys(items).length === 0) continue;

                const exportData: UserDataExport = {
                    version: '1.0',
                    exportTime: new Date().toISOString(),
                    subjectType: typeLabel,
                    totalCount: Object.keys(items).length,
                    items: items,
                };

                const fileName = `bangumi-user-data-${typeLabel}.json`;
                const filePath = normalizePath(`${outputDir}/${fileName}`);

                await this.saveFile(filePath, JSON.stringify(exportData, null, 2));
                files.push(filePath);
            }

            return { success: true, files };
        } catch (error) {
            return { success: false, files: [], error: String(error) };
        }
    }

    /**
     * 按条目类型分组
     */
    private groupBySubjectType(
        userDataMap: Map<number, SubjectUserData>
    ): Record<string, Record<number, SubjectUserData>> {
        const result: Record<string, Record<number, SubjectUserData>> = {
            'anime': {},
            'novel': {},
            'comic': {},
            'game': {},
            'music': {},
            'real': {},
        };

        for (const [id, userData] of userDataMap) {
            // 获取类型标签
            let typeLabel = SUBJECT_TYPE_LABELS[userData.type] || 'novel';

            if (userData.type === SubjectType.Book) {
                const workType = userData.workType?.toLowerCase();
                if (workType === 'comic') {
                    typeLabel = 'comic';
                } else if (workType === 'album') {
                    typeLabel = 'album';
                }
            }

            if (!result[typeLabel]) {
                result[typeLabel] = {};
            }
            result[typeLabel][id] = userData;
        }

        return result;
    }

    /**
     * 确保目录存在
     */
    private async ensureDirectory(path: string): Promise<void> {
        const normalizedPath = normalizePath(path);
        const exists = await this.app.vault.adapter.exists(normalizedPath);

        if (!exists) {
            await this.app.vault.createFolder(normalizedPath);
        }
    }

    /**
     * 保存文件
     */
    private async saveFile(path: string, content: string): Promise<void> {
        const normalizedPath = normalizePath(path);
        const existing = this.app.vault.getAbstractFileByPath(normalizedPath);

        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
        } else {
            await this.app.vault.create(normalizedPath, content);
        }
    }
}
