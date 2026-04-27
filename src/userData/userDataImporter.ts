/**
 * 用户数据导入器
 *
 * 从备份文件导入用户自定义数据
 */

import { App, TFile } from 'obsidian';
import { UserDataMerger } from './userDataMerger';
import {
    UserDataExport,
    SubjectUserData,
    ImportOptions,
    ImportResult,
    MissingFieldDecision,
} from './types';

/**
 * 用户数据导入器
 */
export class UserDataImporter {
    private app: App;
    private merger: UserDataMerger;

    constructor(app: App) {
        this.app = app;
        this.merger = new UserDataMerger(app);
    }

    /**
     * 从文件导入用户数据
     */
    async importFromFile(
        filePath: string,
        options: ImportOptions,
        onProgress?: (current: number, total: number) => void
    ): Promise<ImportResult> {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                throw new Error('Import file not found');
            }

            const content = await this.app.vault.read(file);
            return await this.importFromText(filePath, content, options, onProgress);
        } catch (error) {
            throw new Error(`Failed to parse import file: ${error}`);
        }
    }

    /**
     * 从 JSON 文本导入用户数据。
     */
    async importFromText(
        fileName: string,
        content: string,
        options: ImportOptions,
        onProgress?: (current: number, total: number) => void
    ): Promise<ImportResult> {
        try {
            const importData = JSON.parse(content) as UserDataExport;
            return await this.importParsedData(importData, options, onProgress);
        } catch (error) {
            throw new Error(`Failed to parse import file ${fileName}: ${error}`);
        }
    }

    /**
     * 从多个文件导入用户数据
     */
    async importFromFiles(
        filePaths: string[],
        options: ImportOptions,
        onProgress?: (current: number, total: number) => void
    ): Promise<ImportResult> {
        const combinedResult: ImportResult = {
            success: 0,
            skipped: 0,
            errors: [],
            missingFields: [],
        };

        let processed = 0;
        const total = filePaths.length;

        for (const filePath of filePaths) {
            try {
                const result = await this.importFromFile(filePath, options);
                combinedResult.success += result.success;
                combinedResult.skipped += result.skipped;
                combinedResult.errors.push(...result.errors);
                combinedResult.missingFields.push(...result.missingFields);
            } catch (error) {
                combinedResult.errors.push({
                    id: 0,
                    name_cn: filePath,
                    error: String(error),
                });
            }

            processed++;
            onProgress?.(processed, total);
        }

        return combinedResult;
    }

    /**
     * 从多个 JSON 文本导入用户数据。
     */
    async importFromTexts(
        files: Array<{ name: string; content: string }>,
        options: ImportOptions,
        onProgress?: (current: number, total: number) => void
    ): Promise<ImportResult> {
        const combinedResult: ImportResult = {
            success: 0,
            skipped: 0,
            errors: [],
            missingFields: [],
        };

        let processed = 0;
        const total = files.length;

        for (const file of files) {
            try {
                const result = await this.importFromText(file.name, file.content, options);
                combinedResult.success += result.success;
                combinedResult.skipped += result.skipped;
                combinedResult.errors.push(...result.errors);
                combinedResult.missingFields.push(...result.missingFields);
            } catch (error) {
                combinedResult.errors.push({
                    id: 0,
                    name_cn: file.name,
                    error: String(error),
                });
            }

            processed++;
            onProgress?.(processed, total);
        }

        return combinedResult;
    }

    private async importParsedData(
        importData: UserDataExport,
        options: ImportOptions,
        onProgress?: (current: number, total: number) => void
    ): Promise<ImportResult> {
        const result: ImportResult = {
            success: 0,
            skipped: 0,
            errors: [],
            missingFields: [],
        };

        if (!importData.items || typeof importData.items !== 'object') {
            throw new Error('Invalid import data: missing items');
        }

        const items = Object.entries(importData.items);
        const total = items.length;

        for (let i = 0; i < items.length; i++) {
            const [id, userData] = items[i];
            const subjectId = parseInt(id, 10);

            onProgress?.(i + 1, total);

            if (Number.isNaN(subjectId)) {
                result.errors.push({
                    id: 0,
                    name_cn: userData.name_cn || id,
                    error: 'Invalid subject id',
                });
                continue;
            }

            try {
                const importResult = await this.importSingleItem(subjectId, userData, options);

                if (importResult.imported) {
                    result.success++;
                } else {
                    result.skipped++;
                }

                if (importResult.missingFields) {
                    result.missingFields.push(...importResult.missingFields);
                }
            } catch (error) {
                result.errors.push({
                    id: subjectId,
                    name_cn: userData.name_cn,
                    error: String(error),
                });
            }
        }

        return result;
    }

    /**
     * 导入单个条目的用户数据
     */
    private async importSingleItem(
        subjectId: number,
        userData: SubjectUserData,
        options: ImportOptions
    ): Promise<{
        imported: boolean;
        missingFields?: MissingFieldDecision[];
    }> {
        // 查找本地文件
        const localFile = this.findLocalFile(subjectId);

        if (!localFile) {
            return { imported: false };
        }

        const content = await this.app.vault.read(localFile);
        const missingFields: MissingFieldDecision[] = [];
        let updatedContent = content;

        // 合并评分明细
        if (userData.ratingDetails) {
            updatedContent = this.merger.mergeRatingDetails(
                updatedContent,
                userData.ratingDetails,
                userData.type
            );
        }

        // 合并自定义属性
        if (userData.customProperties) {
            for (const [key, value] of Object.entries(userData.customProperties)) {
                if (this.merger.hasFrontmatterField(updatedContent, key)) {
                    // 字段已存在，根据策略处理
                    if (options.mergeStrategy === 'prefer_import') {
                        updatedContent = this.merger.updateFrontmatterField(
                            updatedContent,
                            key,
                            typeof value === 'object' ? JSON.stringify(value) : String(value)
                        );
                    } else if (options.mergeStrategy === 'smart') {
                        const localValue = this.merger.getFrontmatterValue(updatedContent, key);
                        if (!localValue && value !== undefined && value !== null && value !== '') {
                            updatedContent = this.merger.updateFrontmatterField(
                                updatedContent,
                                key,
                                typeof value === 'object' ? JSON.stringify(value) : String(value)
                            );
                        }
                    }
                    // prefer_local: 不覆盖
                    // smart: 比较值，选择非空的
                } else {
                    // 字段不存在，记录为缺失字段
                    missingFields.push({
                        subjectId,
                        subjectName: userData.name_cn,
                        fieldName: key,
                        fieldValue: value,
                        decision: null,
                    });
                }
            }
        }

        // 合并记录
        if (userData.recordContent) {
            updatedContent = this.merger.updateSection(
                updatedContent,
                '记录',
                userData.recordContent
            );
        }

        // 合并感想
        if (userData.thoughtsContent) {
            updatedContent = this.merger.updateSection(
                updatedContent,
                '感想',
                userData.thoughtsContent
            );
        }

        // 保存文件
        if (updatedContent !== content) {
            await this.app.vault.modify(localFile, updatedContent);
            return { imported: true, missingFields };
        }

        return { imported: false, missingFields };
    }

    /**
     * 应用缺失字段决策
     */
    async applyMissingFieldDecisions(
        decisions: MissingFieldDecision[]
    ): Promise<void> {
        // 按条目 ID 分组
        const grouped = new Map<number, MissingFieldDecision[]>();

        for (const decision of decisions) {
            if (decision.decision === null) continue;

            const existing = grouped.get(decision.subjectId) || [];
            existing.push(decision);
            grouped.set(decision.subjectId, existing);
        }

        // 应用决策
        for (const [subjectId, fieldDecisions] of grouped) {
            const localFile = this.findLocalFile(subjectId);
            if (!localFile) continue;

            let content = await this.app.vault.read(localFile);

            for (const decision of fieldDecisions) {
                if (decision.decision === 'add') {
                    content = this.merger.addFrontmatterField(
                        content,
                        decision.fieldName,
                        decision.fieldValue
                    );
                }
                // 'skip' 不做任何操作
            }

            await this.app.vault.modify(localFile, content);
        }
    }

    /**
     * 查找本地文件
     */
    private findLocalFile(subjectId: number): TFile | null {
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const id = cache?.frontmatter?.id || cache?.frontmatter?.ID;

            if (id === subjectId || parseInt(String(id), 10) === subjectId) {
                return file;
            }
        }

        return null;
    }
}
