/**
 * 用户数据合并器
 */

import { App, TFile } from 'obsidian';
import {
	SubjectUserData,
	DataProtectionSettings,
	DEFAULT_DATA_PROTECTION_SETTINGS,
} from './types';

export class UserDataMerger {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	mergeUserData(
		file: TFile,
		newContent: string,
		localUserData: SubjectUserData,
		settings: DataProtectionSettings = DEFAULT_DATA_PROTECTION_SETTINGS
	): string {
		void file;
		let result = newContent;

		const shouldPreserveCustomProperties =
			settings.preserveCustomProperties || settings.preserveRatingDetails;
		if (shouldPreserveCustomProperties && localUserData.customProperties) {
			result = this.mergeCustomProperties(result, localUserData.customProperties);
		}

		const shouldPreserveBodyContent =
			settings.preserveRecord || settings.preserveThoughts;
		if (shouldPreserveBodyContent && localUserData.bodySections) {
			if (settings.preserveRecord && localUserData.bodySections.record) {
				result = this.updateSection(result, '记录', localUserData.bodySections.record);
			}
			if (settings.preserveThoughts && localUserData.bodySections.thoughts) {
				result = this.updateSection(result, '感想', localUserData.bodySections.thoughts);
			}
		}

		return result;
	}

	mergeCustomProperties(
		content: string,
		customProperties: Record<string, unknown>
	): string {
		let result = content;

		for (const [key, value] of Object.entries(customProperties)) {
			if (this.hasFrontmatterField(result, key)) {
				continue;
			}
			result = this.addFrontmatterField(result, key, value);
		}

		return result;
	}

	updateFrontmatterField(content: string, field: string, value: unknown): string {
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
		if (!frontmatterMatch) return content;

		const prefix = frontmatterMatch[1];
		const frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];
		const restContent = content.substring(frontmatterMatch[0].length);
		const nextFrontmatter = this.upsertFrontmatterField(frontmatter, field, value);
		return prefix + nextFrontmatter + suffix + restContent;
	}

	addFrontmatterField(content: string, field: string, value: unknown): string {
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
		if (!frontmatterMatch) return content;

		const prefix = frontmatterMatch[1];
		const frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];
		const restContent = content.substring(frontmatterMatch[0].length);
		const entry = this.serializeFrontmatterField(field, value).join('\n');
		const newFrontmatter = `${frontmatter}\n${entry}`;

		return prefix + newFrontmatter + suffix + restContent;
	}

	hasFrontmatterField(content: string, field: string): boolean {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) return false;

		const frontmatter = frontmatterMatch[1];
		const fieldRegex = new RegExp(`^${escapeRegExp(field)}:`, 'm');
		return fieldRegex.test(frontmatter);
	}

	getFrontmatterValue(content: string, field: string): string | undefined {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) return undefined;

		const lines = frontmatterMatch[1].split('\n');
		const fieldPrefix = `${field}:`;
		const startIndex = lines.findIndex(line => line.startsWith(fieldPrefix));
		if (startIndex === -1) {
			return undefined;
		}

		const inlineValue = lines[startIndex].slice(fieldPrefix.length).trim();
		if (inlineValue) {
			return stripQuotedValue(inlineValue);
		}

		const listItems: string[] = [];
		for (let i = startIndex + 1; i < lines.length; i++) {
			const line = lines[i];
			if (/^[^-\s][^:]*:/.test(line)) {
				break;
			}
			const listMatch = line.match(/^\s*-\s*(.*)$/);
			if (listMatch) {
				listItems.push(stripQuotedValue(listMatch[1].trim()));
				continue;
			}
			if (line.trim() && !/^\s/.test(line)) {
				break;
			}
		}

		return listItems.length > 0 ? listItems.join(', ') : '';
	}

	updateSection(content: string, sectionName: string, sectionContent: string): string {
		const normalizedContent = content.replace(/\r\n/g, '\n');
		const lines = normalizedContent.split('\n');
		const heading = `## ${sectionName}`;
		const startIndex = lines.findIndex(line => line.trim() === heading);

		if (startIndex !== -1) {
			let endIndex = lines.length;
			for (let i = startIndex + 1; i < lines.length; i++) {
				if (/^##\s+/.test(lines[i])) {
					endIndex = i;
					break;
				}
			}

			const replacement = [heading, '', sectionContent.trim()];
			const nextLines = [
				...lines.slice(0, startIndex),
				...replacement,
				...lines.slice(endIndex),
			];
			return nextLines.join('\n').replace(/\n+$/, '\n');
		}

		return normalizedContent.replace(/\n*$/, '') + `\n\n## ${sectionName}\n\n${sectionContent.trim()}\n`;
	}

	private formatFrontmatterValue(value: unknown): string {
		if (typeof value === 'string') {
			if (value.includes('\n')) {
				return `|-\n${value.split('\n').map(line => `  ${line}`).join('\n')}`;
			}
			if (
				value.includes(':') || value.includes('#') ||
				value.includes('"') || value.includes("'") || value.includes('[') || value.includes('{')
			) {
				return `"${value.replace(/"/g, '\\"')}"`;
			}
			return value;
		}

		if (typeof value === 'boolean') {
			return value ? 'true' : 'false';
		}

		if (typeof value === 'number') {
			return String(value);
		}

		if (Array.isArray(value)) {
			return `\n${value.map(item => `  - ${this.formatFrontmatterValue(item)}`).join('\n')}`;
		}

		if (typeof value === 'object' && value !== null) {
			return JSON.stringify(value);
		}

		return String(value);
	}

	private upsertFrontmatterField(frontmatter: string, field: string, value: unknown): string {
		const lines = frontmatter.split('\n');
		const startIndex = lines.findIndex(line => line.startsWith(`${field}:`));
		const fieldLines = this.serializeFrontmatterField(field, value);

		if (startIndex === -1) {
			return `${frontmatter}\n${fieldLines.join('\n')}`;
		}

		let endIndex = lines.length;
		for (let i = startIndex + 1; i < lines.length; i++) {
			if (isTopLevelFrontmatterLine(lines[i])) {
				endIndex = i;
				break;
			}
		}

		const nextLines = [
			...lines.slice(0, startIndex),
			...fieldLines,
			...lines.slice(endIndex),
		];
		return nextLines.join('\n');
	}

	private serializeFrontmatterField(field: string, value: unknown): string[] {
		const formattedValue = this.formatFrontmatterValue(value);
		if (formattedValue.startsWith('|-\n')) {
			const [firstLine, ...restLines] = formattedValue.split('\n');
			return [`${field}: ${firstLine}`, ...restLines];
		}
		if (formattedValue.startsWith('\n')) {
			return [`${field}:`, ...formattedValue.slice(1).split('\n')];
		}
		return [`${field}: ${formattedValue}`];
	}
}

function buildFrontmatterFieldRegex(field: string): RegExp {
	return new RegExp(`^${escapeRegExp(field)}:\\s*.*(?:\\n  - .*?)*$`, 'm');
}

function isTopLevelFrontmatterLine(line: string): boolean {
	return /^[^\s-][^:]*:\s*/.test(line);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripQuotedValue(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}
