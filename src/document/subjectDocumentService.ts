import { App, TFile } from 'obsidian';
import { CollectionType, SubjectType, getCollectionStatusLabel } from '../../common/api/types';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import { LocalEpisodeStatus } from '../episode/types';
import {
	extractShortComment,
	normalizeShortComment,
	removeShortComment,
	updateShortComment,
} from '../comment/shortComment';
import { isCompletedSerialState, supportsPlatformDataSync } from '../sync/statusSyncLogic';
import {
	addFrontmatterField,
	coerceFrontmatterDraftValue,
	extractFrontmatterRecord,
	formatFrontmatterDisplayValue,
	getFrontmatterValue,
	hasFrontmatterField,
	readNumberField,
	readTextField,
	removeYamlListField,
	upsertFrontmatterField,
	upsertQuotedTextField,
	upsertYamlListField,
} from './frontmatterAccess';
import { extractMarkdownSection, updateEpisodeMarkdownSection, updateMarkdownSection } from './markdownSection';
import {
	LocalPlatformSyncContext,
	LocalSubjectSnapshot,
	PlatformMetadataUpdate,
} from './types';

export class SubjectDocumentService {
	private app: App;
	private episodeStatusManager: EpisodeStatusManager | null;

	constructor(app: App, episodeStatusManager?: EpisodeStatusManager | null) {
		this.app = app;
		this.episodeStatusManager = episodeStatusManager ?? null;
	}

	async readSnapshot(file: TFile, subjectType: SubjectType): Promise<LocalSubjectSnapshot> {
		const content = await this.app.vault.read(file);
		return this.readSnapshotFromContent(content, subjectType, {
			file,
			path: file.path,
			mtime: file.stat.mtime,
		});
	}

	readSnapshotFromContent(
		content: string,
		subjectType: SubjectType,
		context: Partial<Pick<LocalSubjectSnapshot, 'file' | 'path' | 'mtime'>> = {},
	): LocalSubjectSnapshot {
		const statusFieldName = this.getStatusFieldName(subjectType);
		const platform = this.extractLocalPlatformSyncContext(content);
		const shouldLoadEpisodeStatus = Boolean(
			this.episodeStatusManager &&
			(subjectType === SubjectType.Anime || subjectType === SubjectType.Real)
		);

		return {
			file: context.file,
			path: context.path,
			mtime: context.mtime,
			content,
			user: {
				statusFieldName,
				rate: this.extractRate(content),
				comment: this.extractComment(content),
				tags: this.normalizeTags(this.extractTags(content)),
				status: this.extractStatus(content, statusFieldName),
			},
			platform,
			sections: {
				record: this.extractSection(content, '记录'),
				thoughts: this.extractSection(content, '感想'),
			},
			episodeStatusMap: this.episodeStatusManager
				? this.episodeStatusManager.getEpisodeStatusMapFromContent(content)
				: new Map<number, LocalEpisodeStatus>(),
			shouldLoadEpisodeStatus,
			shouldLoadPlatformData: supportsPlatformDataSync(subjectType),
		};
	}

	extractSection(content: string, sectionName: string): string | undefined {
		return extractMarkdownSection(content, sectionName);
	}

	updateSection(content: string, sectionName: string, sectionContent: string): string {
		return updateMarkdownSection(content, sectionName, sectionContent);
	}

	updateEpisodeSection(content: string, renderedEpisodes: string): string {
		return updateEpisodeMarkdownSection(content, renderedEpisodes);
	}

	extractComment(content: string): string | null {
		return extractShortComment(content);
	}

	updateComment(content: string, newComment: string): string {
		return updateShortComment(content, newComment);
	}

	removeComment(content: string): string {
		return removeShortComment(content);
	}

	normalizeComment(comment: string | null | undefined): string | null {
		return normalizeShortComment(comment);
	}

	extractTags(content: string): string[] | null {
		const inlineValue = getFrontmatterValue(content, 'tags');
		if (!inlineValue) {
			return null;
		}

		const tags = this.normalizeTags(
			inlineValue
				.split(',')
				.map(tag => tag.trim())
		);
		return tags.length > 0 ? tags : null;
	}

	updateTags(content: string, newTags: string[]): string {
		return upsertYamlListField(content, 'tags', this.normalizeTags(newTags));
	}

	removeTags(content: string): string {
		return removeYamlListField(content, 'tags');
	}

	hasFrontmatterField(content: string, field: string): boolean {
		return hasFrontmatterField(content, field);
	}

	getFrontmatterValue(content: string, field: string): string | undefined {
		return getFrontmatterValue(content, field);
	}

	updateFrontmatterField(content: string, field: string, value: unknown): string {
		return upsertFrontmatterField(content, field, value);
	}

	addFrontmatterField(content: string, field: string, value: unknown): string {
		return addFrontmatterField(content, field, value);
	}

	extractFrontmatterRecord(content: string): Record<string, unknown> {
		return extractFrontmatterRecord(content);
	}

	formatFrontmatterDisplayValue(value: unknown): string {
		return formatFrontmatterDisplayValue(value);
	}

	coerceFrontmatterDraftValue(value: string, originalValue: unknown): unknown {
		return coerceFrontmatterDraftValue(value, originalValue);
	}

	extractTextField(content: string, fieldNames: string | string[]): string | null {
		return readTextField(content, fieldNames);
	}

	extractNumberField(content: string, fieldNames: string | string[]): number | null {
		return readNumberField(content, fieldNames);
	}

	extractLocalPlatformSyncContext(content: string): LocalPlatformSyncContext {
		return {
			progress: this.extractTextField(content, '进度'),
			start: this.extractTextField(content, '开始'),
			end: this.extractTextField(content, '结束'),
			episodeCount: this.extractNumberField(content, '集数'),
			chapterCount: this.extractNumberField(content, '话数'),
			volumeCount: this.extractNumberField(content, ['卷数', '册数']),
		};
	}

	updateTextField(content: string, fieldName: string, value: string | number | null | undefined): string {
		return upsertQuotedTextField(content, fieldName, value);
	}

	updatePlatformMetadata(content: string, updates: PlatformMetadataUpdate): string {
		let nextContent = content;

		if (updates.progress !== undefined) {
			nextContent = this.updateTextField(nextContent, '进度', updates.progress);
		}
		if (updates.start !== undefined) {
			nextContent = this.updateTextField(nextContent, '开始', updates.start);
		}
		if (updates.end !== undefined) {
			nextContent = this.updateTextField(nextContent, '结束', updates.end);
		}
		if (updates.episodeCount !== undefined) {
			nextContent = this.updateTextField(nextContent, '集数', updates.episodeCount);
		}
		if (updates.chapterCount !== undefined) {
			nextContent = this.updateTextField(nextContent, '话数', updates.chapterCount);
		}
		if (updates.volumeCount !== undefined) {
			const hasVolumeField = this.extractTextField(nextContent, '卷数') !== null;
			const hasBookVolumeField = this.extractTextField(nextContent, '册数') !== null;
			if (hasVolumeField) {
				nextContent = this.updateTextField(nextContent, '卷数', updates.volumeCount);
			}
			if (hasBookVolumeField || !hasVolumeField) {
				nextContent = this.updateTextField(nextContent, '册数', updates.volumeCount);
			}
		}

		return nextContent;
	}

	normalizeTags(tags: string[] | null | undefined): string[] {
		if (!tags) {
			return [];
		}

		return Array.from(new Set(
			tags
				.map(tag => tag.trim())
				.filter(tag => this.isValidTagValue(tag))
		));
	}

	getStatusFieldName(subjectType: SubjectType): string {
		switch (subjectType) {
			case SubjectType.Book:
				return '阅读状态';
			case SubjectType.Anime:
			case SubjectType.Real:
				return '观看状态';
			case SubjectType.Music:
				return '收藏状态';
			case SubjectType.Game:
				return '游玩状态';
			default:
				return '观看状态';
		}
	}

	extractRate(content: string): number | null {
		const value = this.extractTextField(content, '评分');
		if (!value) {
			return null;
		}

		const parsed = parseInt(value, 10);
		return parsed >= 1 && parsed <= 10 ? parsed : null;
	}

	extractStatus(content: string, statusFieldName: string): number | null {
		const value = this.extractTextField(content, statusFieldName);
		if (!value) {
			return null;
		}

		return this.parseStatusText(value);
	}

	updateRate(content: string, newRate: number | null): string {
		if (newRate === null || newRate < 1 || newRate > 10) {
			return content;
		}
		return upsertFrontmatterField(content, '评分', newRate);
	}

	updateStatus(content: string, newStatus: CollectionType, statusFieldName: string): string {
		const statusText = getCollectionStatusLabel(newStatus, this.getSubjectTypeFromStatusFieldName(statusFieldName), true);
		return upsertFrontmatterField(content, statusFieldName, statusText);
	}

	isPlatformDataCandidate(context: LocalPlatformSyncContext): boolean {
		void context;
		return true;
	}

	isCompletedSerialState(value: string | null | undefined): boolean {
		return isCompletedSerialState(value);
	}

	private isValidTagValue(value: string): boolean {
		const normalized = value.trim();
		if (normalized.length === 0) {
			return false;
		}

		if (/^[^,[\]]+:\s*.+$/.test(normalized)) {
			return false;
		}

		return true;
	}

	private parseStatusText(text: string): number | null {
		const normalizedText = text
			.trim()
			.replace(/🕒|✅|▶️|⏸️|❌|\uFE0F|\s/gu, '');
		const statusMap: Record<string, number> = {
			'想看': CollectionType.Wish,
			'想读': CollectionType.Wish,
			'想玩': CollectionType.Wish,
			'想听': CollectionType.Wish,
			'已看': CollectionType.Done,
			'已读': CollectionType.Done,
			'已玩': CollectionType.Done,
			'已听': CollectionType.Done,
			'看过': CollectionType.Done,
			'读过': CollectionType.Done,
			'玩过': CollectionType.Done,
			'听过': CollectionType.Done,
			'在看': CollectionType.Doing,
			'在读': CollectionType.Doing,
			'在玩': CollectionType.Doing,
			'在听': CollectionType.Doing,
			'搁置': CollectionType.OnHold,
			'抛弃': CollectionType.Dropped,
			'放弃': CollectionType.Dropped,
		};
		return statusMap[normalizedText] ?? statusMap[text.trim()] ?? null;
	}

	private getSubjectTypeFromStatusFieldName(statusFieldName: string): SubjectType | undefined {
		switch (statusFieldName) {
			case '阅读状态':
				return SubjectType.Book;
			case '游玩状态':
				return SubjectType.Game;
			case '收藏状态':
				return SubjectType.Music;
			case '观看状态':
				return SubjectType.Anime;
			default:
				return undefined;
		}
	}
}
