/**
 * 用户数据合并器
 *
 * 合并用户自定义数据到新生成的内容中，用于：
 * 1. 强制同步时保护用户数据
 * 2. 导入用户数据
 */

import { App, TFile } from 'obsidian';
import {
    SubjectUserData,
    RatingDetails,
    RATING_DETAIL_FIELDS,
    DataProtectionSettings,
    DEFAULT_DATA_PROTECTION_SETTINGS,
} from './types';

/**
 * 用户数据合并器
 */
export class UserDataMerger {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 合并用户数据到新内容中
     */
    mergeUserData(
        file: TFile,
        newContent: string,
        localUserData: SubjectUserData,
        settings: DataProtectionSettings = DEFAULT_DATA_PROTECTION_SETTINGS
    ): string {
        let result = newContent;

        // 1. 合并评分明细
        if (settings.preserveRatingDetails && localUserData.ratingDetails) {
            result = this.mergeRatingDetails(result, localUserData.ratingDetails, localUserData.type);
        }

        // 2. 合并自定义属性
        if (settings.preserveCustomProperties && localUserData.customProperties) {
            result = this.mergeCustomProperties(result, localUserData.customProperties);
        }

        // 3. 合并记录
        if (settings.preserveRecord && localUserData.recordContent) {
            result = this.updateSection(result, '记录', localUserData.recordContent);
        }

        // 4. 合并感想
        if (settings.preserveThoughts && localUserData.thoughtsContent) {
            result = this.updateSection(result, '感想', localUserData.thoughtsContent);
        }

        return result;
    }

    /**
     * 合并评分明细到内容
     */
    mergeRatingDetails(
        content: string,
        details: RatingDetails,
        subjectType: number
    ): string {
        // 获取该条目类型的评分明细字段配置
        const config = RATING_DETAIL_FIELDS[subjectType] || RATING_DETAIL_FIELDS['comic'];

        if (!config) return content;

        let result = content;
        for (const { key, frontmatterField } of config) {
            const value = details[key];
            if (value) {
                result = this.updateFrontmatterField(result, frontmatterField, value);
            }
        }

        return result;
    }

    /**
     * 合并自定义属性到内容
     * 不覆盖已存在的字段
     */
    mergeCustomProperties(
        content: string,
        customProperties: Record<string, unknown>
    ): string {
        let result = content;

        for (const [key, value] of Object.entries(customProperties)) {
            // 检查字段是否已存在
            if (this.hasFrontmatterField(result, key)) {
                // 字段已存在，不覆盖
                continue;
            }

            // 添加新字段
            result = this.addFrontmatterField(result, key, value);
        }

        return result;
    }

    /**
     * 更新 frontmatter 字段
     */
    updateFrontmatterField(content: string, field: string, value: string): string {
        const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
        if (!frontmatterMatch) return content;

        const prefix = frontmatterMatch[1];
        let frontmatter = frontmatterMatch[2];
        const suffix = frontmatterMatch[3];
        const restContent = content.substring(frontmatterMatch[0].length);

        // 构建字段值（需要引号包围）
        const formattedValue = this.formatFrontmatterValue(value);

        // 检查字段是否存在
        const fieldRegex = new RegExp(`^${field}:.*$`, 'm');
        if (fieldRegex.test(frontmatter)) {
            // 更新现有字段
            frontmatter = frontmatter.replace(fieldRegex, `${field}: ${formattedValue}`);
        } else {
            // 添加新字段（在 frontmatter 末尾）
            frontmatter = frontmatter + `\n${field}: ${formattedValue}`;
        }

        return prefix + frontmatter + suffix + restContent;
    }

    /**
     * 添加 frontmatter 字段（不覆盖）
     */
    addFrontmatterField(content: string, field: string, value: unknown): string {
        const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
        if (!frontmatterMatch) return content;

        const prefix = frontmatterMatch[1];
        const frontmatter = frontmatterMatch[2];
        const suffix = frontmatterMatch[3];
        const restContent = content.substring(frontmatterMatch[0].length);

        // 构建字段值
        const formattedValue = this.formatFrontmatterValue(value);

        // 在 frontmatter 末尾添加
        const newFrontmatter = frontmatter + `\n${field}: ${formattedValue}`;

        return prefix + newFrontmatter + suffix + restContent;
    }

    /**
     * 检查 frontmatter 是否包含指定字段
     */
    hasFrontmatterField(content: string, field: string): boolean {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) return false;

        const frontmatter = frontmatterMatch[1];
        const fieldRegex = new RegExp(`^${field}:`, 'm');
        return fieldRegex.test(frontmatter);
    }

    /**
     * 格式化 frontmatter 值
     */
    private formatFrontmatterValue(value: unknown): string {
        if (typeof value === 'string') {
            // 如果值包含特殊字符，用双引号包围
            if (value.includes(':') || value.includes('#') || value.includes('\n') ||
                value.includes('"') || value.includes("'") || value.includes('[') ||
                value.includes('{')) {
                // 转义双引号
                const escaped = value.replace(/"/g, '\\"');
                return `"${escaped}"`;
            }
            // 简单字符串，直接使用
            return value;
        }

        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }

        if (typeof value === 'number') {
            return String(value);
        }

        if (Array.isArray(value)) {
            // YAML 数组格式
            const items = value.map(item => `  - ${this.formatFrontmatterValue(item)}`);
            return `\n${items.join('\n')}`;
        }

        if (typeof value === 'object' && value !== null) {
            // YAML 对象格式（简化处理）
            return JSON.stringify(value);
        }

        return String(value);
    }

    /**
     * 更新章节内容
     */
    updateSection(content: string, sectionName: string, sectionContent: string): string {
        // 匹配章节
        const sectionRegex = new RegExp(
            `(^## ${sectionName}\\s*\\n)([\\s\\S]*?)(?=\\n## |$)`,
            'm'
        );

        if (sectionRegex.test(content)) {
            // 替换现有章节内容
            return content.replace(sectionRegex, `$1${sectionContent}\n`);
        } else {
            // 章节不存在，在文件末尾添加
            return content + `\n\n## ${sectionName}\n\n${sectionContent}\n`;
        }
    }

    /**
     * 获取 frontmatter 字段值
     */
    getFrontmatterValue(content: string, field: string): string | undefined {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) return undefined;

        const frontmatter = frontmatterMatch[1];
        const fieldRegex = new RegExp(`^${field}:\\s*(.*)$`, 'm');
        const match = frontmatter.match(fieldRegex);

        if (match) {
            let value = match[1].trim();
            // 移除引号
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            return value;
        }

        return undefined;
    }
}