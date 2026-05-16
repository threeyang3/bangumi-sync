/**
 * 用户数据合并器
 */

import { App, TFile } from 'obsidian';
import { SubjectDocumentService } from '../document/subjectDocumentService';
import {
	SubjectUserData,
	DataProtectionSettings,
	DEFAULT_DATA_PROTECTION_SETTINGS,
} from './types';

export class UserDataMerger {
	private app: App;
	private documentService: SubjectDocumentService;

	constructor(app: App) {
		this.app = app;
		this.documentService = new SubjectDocumentService(app);
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
		return this.documentService.updateFrontmatterField(content, field, value);
	}

	addFrontmatterField(content: string, field: string, value: unknown): string {
		return this.documentService.addFrontmatterField(content, field, value);
	}

	hasFrontmatterField(content: string, field: string): boolean {
		return this.documentService.hasFrontmatterField(content, field);
	}

	getFrontmatterValue(content: string, field: string): string | undefined {
		return this.documentService.getFrontmatterValue(content, field);
	}

	updateSection(content: string, sectionName: string, sectionContent: string): string {
		return this.documentService.updateSection(content, sectionName, sectionContent);
	}
}
