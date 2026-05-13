/**
 * 用户数据导出器
 *
 * 按条目 category 导出用户自定义数据到单个 JSON 文件
 */

import { App, TFile, normalizePath } from 'obsidian';
import { UserDataExtractor } from './userDataExtractor';
import {
	UserDataCombinedExport,
	UserDataCategoryExport,
	SubjectUserData,
	SUBJECT_TYPE_LABELS,
	UserDataType,
} from './types';

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
	 * 按条目 category 导出用户数据到单个备份文件
	 */
	async exportByCategory(
		folderPath: string,
		outputDir: string,
		dataTypes: UserDataType[] = [UserDataType.ALL],
		onProgress?: (current: number, total: number) => void
	): Promise<{ success: boolean; files: string[]; error?: string }> {
        try {
            // 提取所有可回导用户数据
            const userDataMap = await this.extractor.extractForExportFromFolder(folderPath, dataTypes, onProgress);

			if (userDataMap.size === 0) {
				return { success: false, files: [], error: 'No user data found' };
			}

			// 按条目 category 分组
			const groupedData = this.groupByCategory(userDataMap);

			// 确保输出目录存在
			await this.ensureDirectory(outputDir);

			const exportData: UserDataCombinedExport = {
				version: '3.0',
				exportTime: new Date().toISOString(),
				totalCount: userDataMap.size,
				categories: groupedData,
			};
			const filePath = normalizePath(`${outputDir}/bangumi-user-data.json`);

			await this.saveFile(filePath, JSON.stringify(exportData, null, 2));

			return { success: true, files: [filePath] };
		} catch (error) {
			return { success: false, files: [], error: String(error) };
		}
	}

	/**
	 * 向后兼容旧接口
	 */
	async exportBySubjectType(
		folderPath: string,
		outputDir: string,
		dataTypes: UserDataType[] = [UserDataType.ALL],
		onProgress?: (current: number, total: number) => void
	): Promise<{ success: boolean; files: string[]; error?: string }> {
		return await this.exportByCategory(folderPath, outputDir, dataTypes, onProgress);
	}

	/**
	 * 按条目 category 分组
	 */
	private groupByCategory(
		userDataMap: Map<number, SubjectUserData>
	): Record<string, UserDataCategoryExport> {
		const result = new Map<string, UserDataCategoryExport>();

		for (const [id, userData] of userDataMap) {
			const category = this.resolveCategory(userData);
			const subjectType = SUBJECT_TYPE_LABELS[userData.identifier.type] || 'novel';
			const existing = result.get(category) ?? {
				category,
				subjectType,
				totalCount: 0,
				items: {},
			};

			existing.items[id] = userData;
			existing.totalCount = Object.keys(existing.items).length;
			result.set(category, existing);
		}

		return Array.from(result.entries())
			.sort((left, right) => left[0].localeCompare(right[0], 'zh-CN'))
			.reduce<Record<string, UserDataCategoryExport>>((acc, [category, data]) => {
				acc[category] = data;
				return acc;
			}, {});
	}

	private resolveCategory(userData: SubjectUserData): string {
		const explicitCategory = userData.category?.trim();
		if (explicitCategory) {
			return explicitCategory;
		}

		const workType = userData.identifier.workType?.trim();
		if (workType) {
			if (userData.identifier.type === 1) {
				const lowered = workType.toLowerCase();
				if (lowered === 'comic') return '漫画';
				if (lowered === 'album') return '画集';
			}
			return workType;
		}

		return SUBJECT_TYPE_LABELS[userData.identifier.type] || 'novel';
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
            await this.app.vault.process(existing, () => content);
        } else {
            await this.app.vault.create(normalizedPath, content);
        }
    }
}
