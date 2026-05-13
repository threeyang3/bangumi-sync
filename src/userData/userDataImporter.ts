/**
 * 用户数据导入器
 *
 * 从备份文件导入用户自定义数据，并兼容旧版 legacy 导出结构。
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
	SubjectIdentifier,
	UserDataType,
	hasUserDataType,
	isCustomPropertyField,
	isUserPropertyField,
} from './types';
import { getFrontmatterNumber, getFrontmatterRecord } from '../../common/utils/frontmatter';
import { SubjectType } from '../../common/api/types';

interface NormalizedImportItem {
	identifier: SubjectIdentifier;
	frontmatter: Record<string, unknown>;
	bodySections?: {
		record?: string;
		thoughts?: string;
	};
}

interface CompareImportResult {
	autoImported: number;
	diffs: ImportItemDiff[];
	missingFields: MissingFieldDecision[];
	skipped: number;
	errors: Array<{ id: number; name_cn: string; error: string; }>;
}

interface ParsedImportFile {
	name: string;
	data: UserDataExport;
}

const PROPERTY_ALIAS_CANDIDATES: Record<string, string[]> = {
	'剧情评分': ['故事评分'],
	'故事评分': ['剧情评分'],
	'人设评分': ['角色评分'],
	'角色评分': ['人设评分'],
	'美术评分': ['作画评分', '画工评分', '制作评分', '插画评分'],
	'画工评分': ['美术评分', '作画评分'],
	'作画评分': ['美术评分', '画工评分'],
	'制作评分': ['美术评分'],
	'插画评分': ['美术评分'],
};

const LIST_LIKE_FIELDS = new Set([
	'tags', 'Tags',
	'版本', '格式', '平台', '存储', '渠道',
	'改编类别', '资源', '收藏来源',
]);

export class UserDataImporter {
	private app: App;
	private merger: UserDataMerger;

	constructor(app: App) {
		this.app = app;
		this.merger = new UserDataMerger(app);
	}

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

	async importFromText(
		fileName: string,
		content: string,
		options: ImportOptions,
		onProgress?: (current: number, total: number) => void
	): Promise<ImportResult> {
		return await this.importFromTexts([{ name: fileName, content }], options, onProgress);
	}

	async importFromFiles(
		filePaths: string[],
		options: ImportOptions,
		onProgress?: (current: number, total: number) => void
	): Promise<ImportResult> {
		const files: Array<{ name: string; content: string }> = [];

		for (const filePath of filePaths) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				throw new Error(`Import file not found: ${filePath}`);
			}
			files.push({
				name: filePath,
				content: await this.app.vault.read(file),
			});
		}

		return await this.importFromTexts(files, options, onProgress);
	}

	async importFromTexts(
		files: Array<{ name: string; content: string }>,
		options: ImportOptions,
		onProgress?: (current: number, total: number) => void
	): Promise<ImportResult> {
		const compareResult = await this.compareImportData(files, options, onProgress);
		const applied = await this.applyImportPlan(files, options);

		return {
			success: applied.success,
			skipped: Math.max(compareResult.skipped, applied.skipped),
			autoImported: compareResult.autoImported,
			errors: [...compareResult.errors, ...applied.errors],
			missingFields: compareResult.missingFields,
		};
	}

	collectAllPropertyNames(
		files: Array<{ name: string; content: string }>,
		options?: Pick<ImportOptions, 'dataTypes'>
	): Set<string> {
		const propertyNames = new Set<string>();

		for (const file of files) {
			try {
				const importData = JSON.parse(file.content) as UserDataExport;
				if (!importData.items) continue;

				for (const userData of Object.values(importData.items)) {
					const normalized = this.normalizeImportItem(userData, options);
					for (const key of Object.keys(normalized.frontmatter)) {
						if (isCustomPropertyField(key)) {
							propertyNames.add(key);
						}
					}
				}
			} catch {
				// Skip unparseable files.
			}
		}

		return propertyNames;
	}

	getSuggestedPropertyAliases(
		files: Array<{ name: string; content: string }>,
		options?: Pick<ImportOptions, 'dataTypes'>
	): Record<string, string> {
		const propertyNames = this.collectAllPropertyNames(files, options);
		const localPropertyNames = this.collectLocalFrontmatterNames();
		const suggestions: Record<string, string> = {};

		for (const propertyName of propertyNames) {
			if (localPropertyNames.has(propertyName)) continue;

			const candidates = PROPERTY_ALIAS_CANDIDATES[propertyName] ?? [];
			const matchedCandidates = candidates.filter(candidate => localPropertyNames.has(candidate));
			if (matchedCandidates.length === 1) {
				suggestions[propertyName] = matchedCandidates[0];
			}
		}

		return suggestions;
	}

	async compareImportData(
		files: Array<{ name: string; content: string }>,
		options: ImportOptions,
		onProgress?: (current: number, total: number) => void
	): Promise<CompareImportResult> {
		const parsedFiles = this.parseImportFiles(files);
		const result: CompareImportResult = {
			autoImported: 0,
			diffs: [],
			missingFields: [],
			skipped: 0,
			errors: parsedFiles.errors,
		};

		let totalItems = 0;
		for (const parsedFile of parsedFiles.files) {
			totalItems += Object.keys(parsedFile.data.items ?? {}).length;
		}

		let processed = 0;
		for (const parsedFile of parsedFiles.files) {
			for (const [id, rawUserData] of Object.entries(parsedFile.data.items ?? {})) {
				processed++;
				onProgress?.(processed, totalItems);

				const subjectId = parseInt(id, 10);
				if (Number.isNaN(subjectId)) {
					result.errors.push({
						id: 0,
						name_cn: rawUserData.identifier?.name_cn || id,
						error: 'Invalid subject id',
					});
					continue;
				}

				const localFile = this.findLocalFile(subjectId);
				if (!localFile) {
					result.skipped++;
					continue;
				}

				const normalized = this.normalizeImportItem(rawUserData, options);
				const compareItem = await this.compareSingleItem(localFile, normalized, options);
				result.autoImported += compareItem.autoImported;
				result.missingFields.push(...compareItem.missingFields);
				if (compareItem.diffs.length > 0) {
					result.diffs.push({
						subjectId,
						name_cn: normalized.identifier.name_cn,
						diffs: compareItem.diffs,
						hasDiff: true,
					});
				}
			}
		}

		return result;
	}

	async applyMissingFieldDecisions(decisions: MissingFieldDecision[]): Promise<void> {
		const grouped = new Map<number, MissingFieldDecision[]>();

		for (const decision of decisions) {
			if (decision.decision === null) continue;
			const existing = grouped.get(decision.subjectId) || [];
			existing.push(decision);
			grouped.set(decision.subjectId, existing);
		}

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
			}

			await this.app.vault.process(localFile, () => content);
		}
	}

	async applyImportDecisions(
		diffs: ImportItemDiff[],
		options: ImportOptions = {
			mergeStrategy: 'smart',
			dataTypes: [],
		}
	): Promise<number> {
		let applied = 0;

		for (const item of diffs) {
			const localFile = this.findLocalFile(item.subjectId);
			if (!localFile) continue;

			let content = await this.app.vault.read(localFile);
			let changed = false;

			for (const diff of item.diffs) {
				const decision = diff.decision ?? 'skip';
				if (decision === 'local' || decision === 'skip') continue;

				if (diff.fieldType === 'section') {
					const sectionName = diff.fieldName;
					const nextValue = decision === 'merge'
						? this.mergeSectionValues(
							this.getSectionContent(content, sectionName),
							asString(diff.importValue)
						)
						: asString(diff.importValue);
					if (nextValue && nextValue !== this.getSectionContent(content, sectionName)) {
						content = this.merger.updateSection(content, sectionName, nextValue);
						changed = true;
					}
					continue;
				}

				const nextValue = decision === 'merge'
					? this.smartMergeValues(
						this.getFrontmatterValueRaw(localFile, diff.fieldName),
						diff.importValue,
						diff.fieldName
					)
					: diff.importValue;
				if (nextValue !== undefined) {
					content = this.merger.updateFrontmatterField(content, diff.fieldName, nextValue);
					changed = true;
				}
			}

			if (changed) {
				await this.app.vault.process(localFile, () => content);
				applied++;
			}
		}

		void options;
		return applied;
	}

	async applyImportPlan(
		files: Array<{ name: string; content: string }>,
		options: ImportOptions,
		diffs: ImportItemDiff[] = [],
		missingFieldDecisions: MissingFieldDecision[] = [],
		onProgress?: (current: number, total: number) => void
	): Promise<ImportResult> {
		const parsedFiles = this.parseImportFiles(files);
		const diffDecisionMap = this.buildDiffDecisionMap(diffs);
		const missingDecisionMap = this.buildMissingFieldDecisionMap(missingFieldDecisions);
		const result: ImportResult = {
			success: 0,
			skipped: 0,
			autoImported: 0,
			errors: parsedFiles.errors,
			missingFields: [],
		};

		let totalItems = 0;
		for (const parsedFile of parsedFiles.files) {
			totalItems += Object.keys(parsedFile.data.items ?? {}).length;
		}

		let processed = 0;
		for (const parsedFile of parsedFiles.files) {
			for (const [id, rawUserData] of Object.entries(parsedFile.data.items ?? {})) {
				processed++;
				onProgress?.(processed, totalItems);

				const subjectId = parseInt(id, 10);
				if (Number.isNaN(subjectId)) {
					result.errors.push({
						id: 0,
						name_cn: rawUserData.identifier?.name_cn || id,
						error: 'Invalid subject id',
					});
					continue;
				}

				const localFile = this.findLocalFile(subjectId);
				if (!localFile) {
					result.skipped++;
					continue;
				}

				try {
					const normalized = this.normalizeImportItem(rawUserData, options);
					const changed = await this.applySingleItem(
						localFile,
						subjectId,
						normalized,
						options,
						diffDecisionMap.get(subjectId) ?? new Map(),
						missingDecisionMap.get(subjectId) ?? new Map()
					);
					if (changed) {
						result.success++;
					} else {
						result.skipped++;
					}
				} catch (error) {
					result.errors.push({
						id: subjectId,
						name_cn: rawUserData.identifier?.name_cn || String(subjectId),
						error: String(error),
					});
				}
			}
		}

		return result;
	}

	private parseImportFiles(files: Array<{ name: string; content: string }>): {
		files: ParsedImportFile[];
		errors: Array<{ id: number; name_cn: string; error: string; }>;
	} {
		const parsedFiles: ParsedImportFile[] = [];
		const errors: Array<{ id: number; name_cn: string; error: string; }> = [];

		for (const file of files) {
			try {
				const data = JSON.parse(file.content) as UserDataExport;
				if (!data.items || typeof data.items !== 'object') {
					throw new Error('Invalid import data: missing items');
				}
				parsedFiles.push({ name: file.name, data });
			} catch (error: unknown) {
				errors.push({
					id: 0,
					name_cn: file.name,
					error: `Failed to parse import file ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}

		return { files: parsedFiles, errors };
	}

	private async compareSingleItem(
		localFile: TFile,
		userData: NormalizedImportItem,
		options: ImportOptions
	): Promise<{
		autoImported: number;
		missingFields: MissingFieldDecision[];
		diffs: PropertyDiff[];
	}> {
		const content = await this.app.vault.read(localFile);
		const missingFields: MissingFieldDecision[] = [];
		const diffs: PropertyDiff[] = [];
		let autoImported = 0;

		for (const [rawKey, value] of Object.entries(userData.frontmatter)) {
			const fieldName = this.getEffectiveFieldName(rawKey, options);
			if (!fieldName) continue;

			if (!this.merger.hasFrontmatterField(content, fieldName)) {
				missingFields.push({
					subjectId: userData.identifier.id,
					subjectName: userData.identifier.name_cn,
					fieldName,
					fieldValue: value,
					decision: null,
				});
				continue;
			}

			const localValue = this.getFrontmatterValueRaw(localFile, fieldName);
			if (this.valuesEqual(localValue, value, fieldName)) {
				continue;
			}

			if (options.mergeStrategy === 'smart' && this.isEmptyValue(localValue) && !this.isEmptyValue(value)) {
				autoImported++;
				continue;
			}

			diffs.push({
				fieldName,
				localValue,
				importValue: value,
				fieldType: 'frontmatter',
				decision: null,
			});
		}

		if (hasUserDataType(options.dataTypes, UserDataType.BODY_CONTENT)) {
			const recordDiff = this.compareSection(
				content,
				'记录',
				userData.bodySections?.record,
				options
			);
			autoImported += recordDiff.autoImported;
			if (recordDiff.diff) diffs.push(recordDiff.diff);

			const thoughtsDiff = this.compareSection(
				content,
				'感想',
				userData.bodySections?.thoughts,
				options
			);
			autoImported += thoughtsDiff.autoImported;
			if (thoughtsDiff.diff) diffs.push(thoughtsDiff.diff);
		}

		return { autoImported, missingFields, diffs };
	}

	private compareSection(
		content: string,
		sectionName: '记录' | '感想',
		importValue: string | undefined,
		options: ImportOptions
	): { autoImported: number; diff?: PropertyDiff } {
		if (!importValue) {
			return { autoImported: 0 };
		}

		const localValue = this.getSectionContent(content, sectionName);
		if (!localValue) {
			return { autoImported: 1 };
		}

		if (localValue === importValue) {
			return { autoImported: 0 };
		}

		if (options.mergeStrategy === 'smart' && !localValue.trim()) {
			return { autoImported: 1 };
		}

		return {
			autoImported: 0,
			diff: {
				fieldName: sectionName,
				localValue,
				importValue,
				fieldType: 'section',
				decision: null,
			},
		};
	}

	private async applySingleItem(
		localFile: TFile,
		subjectId: number,
		userData: NormalizedImportItem,
		options: ImportOptions,
		diffDecisions: Map<string, PropertyDiff['decision']>,
		missingDecisions: Map<string, MissingFieldDecision['decision']>
	): Promise<boolean> {
		const originalContent = await this.app.vault.read(localFile);
		let updatedContent = originalContent;

		for (const [rawKey, value] of Object.entries(userData.frontmatter)) {
			const fieldName = this.getEffectiveFieldName(rawKey, options);
			if (!fieldName) continue;

			const hasField = this.merger.hasFrontmatterField(updatedContent, fieldName);
			if (!hasField) {
				const decision = missingDecisions.get(fieldName);
				if (decision === 'add') {
					updatedContent = this.merger.addFrontmatterField(updatedContent, fieldName, value);
				}
				continue;
			}

			const localValue = this.getFrontmatterValueRaw(localFile, fieldName);
			if (this.valuesEqual(localValue, value, fieldName)) {
				continue;
			}

			const decisionKey = this.buildDiffDecisionKey('frontmatter', fieldName);
			const explicitDecision = diffDecisions.get(decisionKey);
			const nextValue = this.resolveValueByStrategy(
				localValue,
				value,
				fieldName,
				options.mergeStrategy,
				explicitDecision
			);
			if (nextValue !== undefined && !this.valuesEqual(localValue, nextValue, fieldName)) {
				updatedContent = this.merger.updateFrontmatterField(updatedContent, fieldName, nextValue);
			}
		}

		if (hasUserDataType(options.dataTypes, UserDataType.BODY_CONTENT)) {
			updatedContent = this.applySectionChange(
				updatedContent,
				'记录',
				userData.bodySections?.record,
				options.mergeStrategy,
				diffDecisions.get(this.buildDiffDecisionKey('section', '记录'))
			);
			updatedContent = this.applySectionChange(
				updatedContent,
				'感想',
				userData.bodySections?.thoughts,
				options.mergeStrategy,
				diffDecisions.get(this.buildDiffDecisionKey('section', '感想'))
			);
		}

		if (updatedContent !== originalContent) {
			await this.app.vault.process(localFile, () => updatedContent);
			return true;
		}

		void subjectId;
		return false;
	}

	private applySectionChange(
		content: string,
		sectionName: '记录' | '感想',
		importValue: string | undefined,
		mergeStrategy: ImportOptions['mergeStrategy'],
		explicitDecision: PropertyDiff['decision'] | undefined
	): string {
		if (!importValue) return content;

		const localValue = this.getSectionContent(content, sectionName);
		if (!localValue) {
			return this.merger.updateSection(content, sectionName, importValue);
		}
		if (localValue === importValue) return content;

		if (explicitDecision === 'local' || explicitDecision === 'skip') {
			return content;
		}
		if (explicitDecision === 'import') {
			return this.merger.updateSection(content, sectionName, importValue);
		}
		if (explicitDecision === 'merge') {
			return this.merger.updateSection(
				content,
				sectionName,
				this.mergeSectionValues(localValue, importValue)
			);
		}

		switch (mergeStrategy) {
			case 'prefer_import':
				return this.merger.updateSection(content, sectionName, importValue);
			case 'smart':
				return this.merger.updateSection(
					content,
					sectionName,
					this.mergeSectionValues(localValue, importValue)
				);
			case 'prefer_local':
			default:
				return content;
		}
	}

	private normalizeImportItem(
		userData: SubjectUserData,
		options?: Pick<ImportOptions, 'dataTypes'>
	): NormalizedImportItem {
		const dataTypes = options?.dataTypes ?? [UserDataType.ALL];
		const frontmatter = this.filterImportFrontmatter(
			{ ...(userData.customProperties ?? {}) },
			dataTypes
		);

		if (userData.legacy) {
			this.mergeLegacyFields(frontmatter, userData, dataTypes);
		}

		return {
			identifier: userData.identifier,
			frontmatter,
			bodySections: hasUserDataType(dataTypes, UserDataType.BODY_CONTENT)
				? userData.bodySections
				: undefined,
		};
	}

	private mergeLegacyFields(
		frontmatter: Record<string, unknown>,
		userData: SubjectUserData,
		dataTypes: UserDataType[]
	): void {
		const legacy = userData.legacy;
		if (!legacy) return;

		if (
			hasUserDataType(dataTypes, UserDataType.CUSTOM_PROPERTIES)
			&& legacy.storage !== undefined
			&& legacy.storage !== null
			&& legacy.storage !== ''
		) {
			frontmatter['存储'] = legacy.storage;
		}

		if (!hasUserDataType(dataTypes, UserDataType.USER_PROPERTIES)) return;

		if (legacy.rate !== undefined && legacy.rate !== null) {
			frontmatter['评分'] = legacy.rate;
		}
		if (legacy.comment) {
			frontmatter['短评'] = legacy.comment;
		}
		if (legacy.tags && legacy.tags.length > 0) {
			frontmatter.tags = legacy.tags;
		}

		if (hasUserDataType(dataTypes, UserDataType.CUSTOM_PROPERTIES)) {
			for (const [ratingKey, ratingValue] of Object.entries(legacy.ratingDetails ?? {})) {
				const mappedKey = this.mapLegacyRatingField(userData.identifier, ratingKey);
				if (!mappedKey) continue;
				frontmatter[mappedKey] = ratingValue;
			}
		}
	}

	private filterImportFrontmatter(
		frontmatter: Record<string, unknown>,
		dataTypes: UserDataType[]
	): Record<string, unknown> {
		const includeAll = hasUserDataType(dataTypes, UserDataType.ALL);
		const includeUserProperties = includeAll || hasUserDataType(dataTypes, UserDataType.USER_PROPERTIES);
		const includeCustomProperties = includeAll || hasUserDataType(dataTypes, UserDataType.CUSTOM_PROPERTIES);
		const filtered: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(frontmatter)) {
			if (isUserPropertyField(key)) {
				if (includeUserProperties) {
					filtered[key] = value;
				}
				continue;
			}

			if (isCustomPropertyField(key)) {
				if (includeCustomProperties) {
					filtered[key] = value;
				}
				continue;
			}

			if (includeUserProperties && this.isImportManagedUserField(key)) {
				filtered[key] = value;
			}
		}

		return filtered;
	}

	private isImportManagedUserField(fieldName: string): boolean {
		return isUserPropertyField(fieldName);
	}

	private mapLegacyRatingField(identifier: SubjectIdentifier, legacyKey: string): string | null {
		const type = identifier.type;
		const workType = identifier.workType?.toLowerCase() ?? '';

		if (type === SubjectType.Anime) {
			return this.mapRatingFieldByTable(legacyKey, {
				music: '音乐评分',
				character: '人设评分',
				story: '剧情评分',
				art: '美术评分',
			});
		}

		if (type === SubjectType.Game) {
			return this.mapRatingFieldByTable(legacyKey, {
				story: '剧情评分',
				fun: '趣味评分',
				music: '音乐评分',
				art: '美术评分',
			});
		}

		if (type === SubjectType.Real) {
			return this.mapRatingFieldByTable(legacyKey, {
				story: '剧情评分',
				character: '演技评分',
				art: '制作评分',
			});
		}

		if (type === SubjectType.Book && workType === 'comic') {
			return this.mapRatingFieldByTable(legacyKey, {
				story: '剧情评分',
				drawing: '画工评分',
				character: '人设评分',
			});
		}

		if (type === SubjectType.Book && workType === 'album') {
			return this.mapRatingFieldByTable(legacyKey, {
				story: '剧情评分',
				drawing: '画工评分',
				character: '人设评分',
			});
		}

		return this.mapRatingFieldByTable(legacyKey, {
			story: '剧情评分',
			illustration: '插画评分',
			writing: '文笔评分',
			character: '人设评分',
		});
	}

	private mapRatingFieldByTable(legacyKey: string, table: Record<string, string>): string | null {
		if (table[legacyKey]) {
			return table[legacyKey];
		}

		const genericFallback = this.mapGenericRatingField(legacyKey);
		return genericFallback ? genericFallback : null;
	}

	private mapGenericRatingField(legacyKey: string): string | null {
		const genericMap: Record<string, string> = {
			music: '音乐评分',
			character: '人设评分',
			story: '剧情评分',
			art: '美术评分',
			illustration: '插画评分',
			writing: '文笔评分',
			drawing: '画工评分',
			fun: '趣味评分',
		};

		return genericMap[legacyKey] || null;
	}

	private getEffectiveFieldName(rawKey: string, options: ImportOptions): string | null {
		const manage = options.propertyManage?.[rawKey];
		if (manage?.ignore) return null;
		return manage?.aliasTo || rawKey;
	}

	private buildDiffDecisionMap(diffs: ImportItemDiff[]): Map<number, Map<string, PropertyDiff['decision']>> {
		const result = new Map<number, Map<string, PropertyDiff['decision']>>();

		for (const item of diffs) {
			const fieldMap = new Map<string, PropertyDiff['decision']>();
			for (const diff of item.diffs) {
				fieldMap.set(
					this.buildDiffDecisionKey(diff.fieldType ?? 'frontmatter', diff.fieldName),
					diff.decision
				);
			}
			result.set(item.subjectId, fieldMap);
		}

		return result;
	}

	private buildMissingFieldDecisionMap(
		decisions: MissingFieldDecision[]
	): Map<number, Map<string, MissingFieldDecision['decision']>> {
		const result = new Map<number, Map<string, MissingFieldDecision['decision']>>();

		for (const decision of decisions) {
			const fieldMap = result.get(decision.subjectId) ?? new Map<string, MissingFieldDecision['decision']>();
			fieldMap.set(decision.fieldName, decision.decision);
			result.set(decision.subjectId, fieldMap);
		}

		return result;
	}

	private buildDiffDecisionKey(fieldType: 'frontmatter' | 'section', fieldName: string): string {
		return `${fieldType}:${fieldName}`;
	}

	private resolveValueByStrategy(
		localValue: unknown,
		importValue: unknown,
		fieldName: string,
		mergeStrategy: ImportOptions['mergeStrategy'],
		explicitDecision?: PropertyDiff['decision']
	): unknown {
		switch (explicitDecision) {
			case 'local':
			case 'skip':
				return undefined;
			case 'import':
				return importValue;
			case 'merge':
				return this.smartMergeValues(localValue, importValue, fieldName);
			default:
				break;
		}

		switch (mergeStrategy) {
			case 'prefer_import':
				return importValue;
			case 'smart':
				return this.smartMergeValues(localValue, importValue, fieldName);
			case 'prefer_local':
			default:
				return undefined;
		}
	}

	private smartMergeValues(localValue: unknown, importValue: unknown, fieldName: string): unknown {
		if (this.isEmptyValue(localValue)) {
			return this.normalizeForWrite(importValue, fieldName);
		}
		if (this.isEmptyValue(importValue)) {
			return this.normalizeForWrite(localValue, fieldName);
		}

		const localArray = this.asArray(localValue, fieldName);
		const importArray = this.asArray(importValue, fieldName);
		if (localArray && importArray) {
			return Array.from(new Set([...localArray, ...importArray]));
		}

		if (fieldName === '短评' && typeof localValue === 'string' && typeof importValue === 'string') {
			return this.mergeSectionValues(localValue, importValue);
		}

		if (typeof localValue === 'object' && localValue && typeof importValue === 'object' && importValue) {
			return {
				...(localValue as Record<string, unknown>),
				...(importValue as Record<string, unknown>),
			};
		}

		return localValue;
	}

	private mergeSectionValues(localValue: string | undefined, importValue: string | undefined): string {
		const localText = (localValue ?? '').trim();
		const importText = (importValue ?? '').trim();
		if (!localText) return importText;
		if (!importText) return localText;
		if (localText === importText) return localText;
		if (localText.includes(importText)) return localText;
		if (importText.includes(localText)) return importText;
		return `${localText}\n\n---\n\n${importText}`;
	}

	private valuesEqual(left: unknown, right: unknown, fieldName?: string): boolean {
		return stableStringify(this.normalizeComparableValue(left, fieldName))
			=== stableStringify(this.normalizeComparableValue(right, fieldName));
	}

	private isEmptyValue(value: unknown): boolean {
		if (value === null || value === undefined) return true;
		if (typeof value === 'string') return value.trim() === '';
		if (Array.isArray(value)) return value.length === 0;
		if (typeof value === 'object') return Object.keys(value).length === 0;
		return false;
	}

	private asArray(value: unknown, fieldName?: string): string[] | null {
		if (Array.isArray(value)) {
			return normalizeListValues(value);
		}

		if (typeof value === 'string' && fieldName && this.isListLikeField(fieldName)) {
			const parsed = splitListString(value);
			return parsed.length > 0 ? parsed : null;
		}

		return null;
	}

	private normalizeComparableValue(value: unknown, fieldName?: string): unknown {
		const arrayValue = this.asArray(value, fieldName);
		if (arrayValue) {
			return Array.from(new Set(arrayValue)).sort((left, right) => left.localeCompare(right, 'zh-CN'));
		}

		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}

		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
				return String(Number(trimmed));
			}
			return trimmed.replace(/\r\n/g, '\n');
		}

		if (value && typeof value === 'object') {
			return stableNormalize(value);
		}

		return value;
	}

	private normalizeForWrite(value: unknown, fieldName: string): unknown {
		const arrayValue = this.asArray(value, fieldName);
		if (arrayValue) {
			return Array.from(new Set(arrayValue));
		}
		return value;
	}

	private isListLikeField(fieldName: string): boolean {
		return LIST_LIKE_FIELDS.has(fieldName);
	}

	private collectLocalFrontmatterNames(): Set<string> {
		const propertyNames = new Set<string>();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = getFrontmatterRecord(cache?.frontmatter);
			if (!frontmatter) continue;
			for (const key of Object.keys(frontmatter)) {
				propertyNames.add(key);
			}
		}

		return propertyNames;
	}

	private getFrontmatterValueRaw(file: TFile, fieldName: string): unknown {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = getFrontmatterRecord(cache?.frontmatter);
		return frontmatter?.[fieldName];
	}

	private getSectionContent(content: string, sectionName: string): string | undefined {
		const normalizedContent = content.replace(/\r\n/g, '\n');
		const lines = normalizedContent.split('\n');
		const heading = `## ${sectionName}`;
		const startIndex = lines.findIndex(line => line.trim() === heading);
		if (startIndex === -1) return undefined;

		let endIndex = lines.length;
		for (let i = startIndex + 1; i < lines.length; i++) {
			if (/^##\s+/.test(lines[i])) {
				endIndex = i;
				break;
			}
		}

		const text = lines.slice(startIndex + 1, endIndex).join('\n').trim();
		return text || undefined;
	}

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

function stableStringify(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) return JSON.stringify(value.map(item => stableNormalize(item)));
	if (typeof value === 'object') return JSON.stringify(stableNormalize(value));
	return String(value);
}

function stableNormalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(item => stableNormalize(item));
	}
	if (value && typeof value === 'object') {
		return Object.keys(value as Record<string, unknown>)
			.sort()
			.reduce<Record<string, unknown>>((acc, key) => {
				acc[key] = stableNormalize((value as Record<string, unknown>)[key]);
				return acc;
			}, {});
	}
	return value;
}

function normalizeListValues(values: unknown[]): string[] {
	return values
		.flatMap(item => typeof item === 'string' ? splitListString(item) : [String(item).trim()])
		.map(item => item.trim())
		.filter(Boolean);
}

function splitListString(value: string): string[] {
	return value
		.split(/[,\n，、；;｜|]/)
		.map(item => item.trim())
		.filter(Boolean);
}

function asString(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	return String(value);
}
