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
    PropertyDiff,
    ImportItemDiff,
    BANGUMI_FIELDS,
} from './types';
import { getFrontmatterNumber, getFrontmatterRecord } from '../../common/utils/frontmatter';

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
        } catch (error: unknown) {
            throw new Error(`Failed to parse import file: ${error instanceof Error ? error.message : String(error)}`);
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
        } catch (error: unknown) {
            throw new Error(`Failed to parse import file ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
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
            autoImported: 0,
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
                combinedResult.autoImported += result.autoImported;
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
            autoImported: 0,
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
                combinedResult.autoImported += result.autoImported;
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
            autoImported: 0,
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
                    name_cn: userData.identifier?.name_cn || id,
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
                    name_cn: userData.identifier.name_cn,
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

        // 合并自定义属性
        if (userData.customProperties) {
            const propertyManage = options.propertyManage;
            for (const [key, value] of Object.entries(userData.customProperties)) {
                // 应用忽略
                const manage = propertyManage?.[key];
                if (manage?.ignore) continue;

                // 应用别名
                const effectiveKey = manage?.aliasTo || key;

                if (this.merger.hasFrontmatterField(updatedContent, effectiveKey)) {
                    // 字段已存在，根据策略处理
                    if (options.mergeStrategy === 'prefer_import') {
                        updatedContent = this.merger.updateFrontmatterField(
                            updatedContent,
                            effectiveKey,
                            value
                        );
                    } else if (options.mergeStrategy === 'smart') {
                        const localValue = this.merger.getFrontmatterValue(updatedContent, effectiveKey);
                        if (!localValue && value !== undefined && value !== null && value !== '') {
                            updatedContent = this.merger.updateFrontmatterField(
                                updatedContent,
                                effectiveKey,
                                value
                            );
                        }
                    }
                    // prefer_local: 不覆盖
                } else {
                    // 字段不存在，记录为缺失字段
                    missingFields.push({
                        subjectId,
                        subjectName: userData.identifier.name_cn,
                        fieldName: effectiveKey,
                        fieldValue: value,
                        decision: null,
                    });
                }
            }
        }

        if (userData.bodySections?.record) {
            updatedContent = this.merger.updateSection(
                updatedContent,
                '记录',
                userData.bodySections.record
            );
        }

        if (userData.bodySections?.thoughts) {
            updatedContent = this.merger.updateSection(
                updatedContent,
                '感想',
                userData.bodySections.thoughts
            );
        }

        // 保存文件
        if (updatedContent !== content) {
            await this.app.vault.process(localFile, () => updatedContent);
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

            await this.app.vault.process(localFile, () => content);
        }
    }

    /**
     * 扫描所有导入文件，收集自定义属性名
     */
    collectAllPropertyNames(files: Array<{ name: string; content: string }>): Set<string> {
        const propertyNames = new Set<string>();

        for (const file of files) {
            try {
                const importData = JSON.parse(file.content) as UserDataExport;
                if (!importData.items) continue;

                for (const userData of Object.values(importData.items)) {
                    if (userData.customProperties) {
                        for (const key of Object.keys(userData.customProperties)) {
                            if (!BANGUMI_FIELDS.has(key)) {
                                propertyNames.add(key);
                            }
                        }
                    }
                }
            } catch {
                // skip unparseable files
            }
        }

        return propertyNames;
    }

    /**
     * 对比导入数据与本地数据，返回自动导入数和差异列表
     *
     * 自动导入规则：本地为空 + 导入不为空 → 直接写入
     * 其余有差异的情况 → 收集到 ImportItemDiff 供用户决策
     */
    async compareImportData(
        files: Array<{ name: string; content: string }>,
        options: ImportOptions,
        onProgress?: (current: number, total: number) => void
    ): Promise<{ autoImported: number; diffs: ImportItemDiff[] }> {
        const propertyManage = options.propertyManage;
        let autoImported = 0;
        const diffs: ImportItemDiff[] = [];

        let processed = 0;
        let totalItems = 0;

        // First count total items
        for (const file of files) {
            try {
                const importData = JSON.parse(file.content) as UserDataExport;
                if (importData.items) {
                    totalItems += Object.keys(importData.items).length;
                }
            } catch {
                // skip
            }
        }

        for (const file of files) {
            let importData: UserDataExport;
            try {
                importData = JSON.parse(file.content) as UserDataExport;
            } catch {
                continue;
            }
            if (!importData.items) continue;

            for (const [id, userData] of Object.entries(importData.items)) {
                const subjectId = parseInt(id, 10);
                if (Number.isNaN(subjectId)) {
                    processed++;
                    continue;
                }

                onProgress?.(processed + 1, totalItems);
                processed++;

                const localFile = this.findLocalFile(subjectId);
                if (!localFile) continue;

                const content = await this.app.vault.read(localFile);
                const itemDiffs: PropertyDiff[] = [];

                if (userData.customProperties) {
                    for (const [key, value] of Object.entries(userData.customProperties)) {
                        // Apply ignore
                        const manage = propertyManage?.[key];
                        if (manage?.ignore) continue;

                        // Apply alias
                        const effectiveKey = manage?.aliasTo || key;

                        if (!this.merger.hasFrontmatterField(content, effectiveKey)) {
                            // Field doesn't exist locally — treat as "local empty"
                            if (value !== undefined && value !== null && value !== '') {
                                // Auto-import: local empty + import non-empty
                                const newContent = this.merger.addFrontmatterField(content, effectiveKey, value);
                                await this.app.vault.process(localFile, () => newContent);
                                autoImported++;
                            }
                        } else {
                            // Field exists locally — compare values
                            const localValue = this.merger.getFrontmatterValue(content, effectiveKey);
                            const localStr = localValue ?? '';
                            const importStr = valueToString(value);

                            if (localStr !== importStr) {
                                itemDiffs.push({
                                    fieldName: effectiveKey,
                                    localValue: localStr,
                                    importValue: importStr,
                                    decision: null,
                                });
                            }
                        }
                    }
                }

                if (itemDiffs.length > 0) {
                    diffs.push({
                        subjectId,
                        name_cn: userData.identifier.name_cn,
                        diffs: itemDiffs,
                        hasDiff: true,
                    });
                }
            }
        }

        return { autoImported, diffs };
    }

    /**
     * 应用用户在对比弹窗中的决策
     */
    async applyImportDecisions(diffs: ImportItemDiff[]): Promise<number> {
        let applied = 0;

        for (const item of diffs) {
            const localFile = this.findLocalFile(item.subjectId);
            if (!localFile) continue;

            let content = await this.app.vault.read(localFile);
            let changed = false;

            for (const diff of item.diffs) {
                if (diff.decision === 'import') {
                    content = this.merger.updateFrontmatterField(
                        content,
                        diff.fieldName,
                        diff.importValue
                    );
                    changed = true;
                }
                // 'local' and 'skip' do nothing
            }

            if (changed) {
                await this.app.vault.process(localFile, () => content);
                applied++;
            }
        }

        return applied;
    }

    /**
     * 查找本地文件
     */
    private findLocalFile(subjectId: number): TFile | null {
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = getFrontmatterRecord(cache?.frontmatter);
            const id = getFrontmatterNumber(frontmatter, 'id') ?? getFrontmatterNumber(frontmatter, 'ID');

            if (id === subjectId) {
                return file;
            }
        }

        return null;
    }
}

function valueToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}
