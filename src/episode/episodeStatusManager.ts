/**
 * 单集状态管理器
 * 负责本地存储和云端同步
 */

import { App, TFile } from 'obsidian';
import { BangumiClient } from '../api/client';
import { LocalEpisodeStatus, EpisodeStatusType, getEpisodeStatusText } from './types';
import { delay } from '../../common/utils/timing';
import { assertWriteOperationAllowed, withWriteOperation, WriteOperationLease } from '../sync/writeOperationGate';
import { extractFrontmatterRecord, removeFrontmatterField } from '../document/frontmatterAccess';
import { SubjectDocumentService } from '../document/subjectDocumentService';

/**
 * 单集状态管理器
 */
export class EpisodeStatusManager {
	private app: App;
	private client: BangumiClient;
	private readonly documentService: SubjectDocumentService;

	constructor(app: App, client: BangumiClient) {
		this.app = app;
		this.client = client;
		this.documentService = new SubjectDocumentService(app);
	}

	private async processKnownSubjectFile(file: TFile, updater: (content: string) => string): Promise<void> {
		await withWriteOperation('episode-status', async () => {
			const identity = await this.documentService.getSubjectIdentity(file);
			if (identity.subjectId === null || identity.conflicts?.length) throw new Error(`Cannot safely write episode status to ${file.path}: subject ID is missing or conflicting.`);
			await this.documentService.processSubjectFile(file, identity.subjectId, updater);
		});
	}

	/**
	 * 从文件中读取单集状态映射
	 * 存储位置：frontmatter 中的 ep_statuses 字段
	 */
	async getEpisodeStatusMap(file: TFile): Promise<Map<number, LocalEpisodeStatus>> {
		const content = await this.app.vault.read(file);
		return this.getEpisodeStatusMapFromContent(content);
	}

	getEpisodeStatusMapFromContent(content: string): Map<number, LocalEpisodeStatus> {
		const statusMap = this.extractEpisodeStatusMapFromFrontmatter(content);
		const contentStatusMap = this.extractEpisodeStatusMapFromEpisodeBoxes(content);

		for (const [episodeId, entry] of contentStatusMap) {
			statusMap.set(episodeId, entry);
		}

		return statusMap;
	}

	/**
	 * 获取云端单集状态映射
	 */
	async getCloudEpisodeStatusMap(subjectId: number): Promise<Map<number, LocalEpisodeStatus>> {
		const userEpisodes = await this.client.getUserEpisodeStatus(subjectId);
		const statusMap = new Map<number, LocalEpisodeStatus>();

		for (const userEp of userEpisodes) {
			if (!userEp.type || !userEp.episode) {
				continue;
			}

			const epNumber = userEp.episode.ep || userEp.episode.sort || 0;
			statusMap.set(userEp.episode.id, {
				episodeId: userEp.episode.id,
				epNumber,
				status: userEp.type as EpisodeStatusType,
				updatedAt: Date.now(),
			});
		}

		return statusMap;
	}

	serializeEpisodeStatuses(statusMap: Map<number, LocalEpisodeStatus>): string {
		return Array.from(statusMap.values())
			.filter(entry => entry.status !== 0)
			.sort((a, b) => a.episodeId - b.episodeId)
			.map(entry => `${entry.episodeId}:${entry.epNumber}:${entry.status}`)
			.join('|');
	}

	summarizeEpisodeStatuses(statusMap: Map<number, LocalEpisodeStatus>): string | null {
		const entries = Array.from(statusMap.values())
			.filter(entry => entry.status !== 0)
			.sort((a, b) => a.epNumber - b.epNumber || a.episodeId - b.episodeId);

		if (entries.length === 0) {
			return null;
		}

		const preview = entries
			.slice(0, 8)
			.map(entry => `${entry.epNumber}:${getEpisodeStatusText(entry.status)}`)
			.join(', ');
		const suffix = entries.length > 8 ? ` 等${entries.length}集` : ` 共${entries.length}集`;

		return `${preview}${suffix}`;
	}

	/**
	 * 获取单个集数的状态
	 */
	async getEpisodeStatus(file: TFile, episodeId: number): Promise<EpisodeStatusType> {
		const statusMap = await this.getEpisodeStatusMap(file);
		return statusMap.get(episodeId)?.status ?? 0;
	}

	/**
	 * 更新本地文件中的单集状态
	 */
	async updateLocalStatus(
		file: TFile,
		episodeId: number,
		epNumber: number,
		status: EpisodeStatusType
	): Promise<void> {
		await this.patchEpisodeStatuses(file, [{ episodeId, epNumber, status }]);
	}

	/** Partial updates preserve every unselected episode. */
	async patchEpisodeStatuses(file: TFile, episodes: Array<{ episodeId: number; epNumber: number; status: EpisodeStatusType }>): Promise<void> {
		assertWriteOperationAllowed('episode-status');
		await this.processKnownSubjectFile(file, content => {
			const merged = this.getEpisodeStatusMapFromContent(content);
			for (const ep of episodes) merged.set(ep.episodeId, this.createLocalEpisodeStatus(ep.episodeId, ep.epNumber, ep.status));
			return this.applyEpisodeStatusUpdates(content, Array.from(merged.values()));
		});
	}

	async updateMultipleStatuses(file: TFile, episodes: Array<{ episodeId: number; epNumber: number; status: EpisodeStatusType }>): Promise<void> {
		await this.patchEpisodeStatuses(file, episodes);
	}

	/** Only callers holding a complete snapshot may replace all statuses. */
	async replaceAllEpisodeStatuses(file: TFile, expectedSubjectId: number, episodes: Array<{ episodeId: number; epNumber: number; status: EpisodeStatusType }>, expectedContent: string): Promise<void> {
		return withWriteOperation('episode-status', async () => {
			await this.documentService.processSubjectFile(file, expectedSubjectId, content => {
				if (content !== expectedContent) throw new Error('Note changed during synchronization. Refresh and retry.');
				return this.applyEpisodeStatusUpdates(content, episodes);
			});
		});
	}

	private applyEpisodeStatusUpdates(
		content: string,
		episodes: Array<{ episodeId: number; epNumber: number; status: EpisodeStatusType }>
	): string {
		const updates = new Map(episodes.map(ep => [ep.episodeId, ep]));
		const cleared = this.clearEpisodeStatusArtifacts(content);
		const withUpdatedBoxes = cleared.replace(/<span\b[^>]*class="[^"]*\bep-box\b[^"]*"[^>]*>.*?<\/span>/g, tag => {
			const attrs = this.parseEpisodeBox(tag);
			const ep = attrs && updates.get(attrs.episodeId);
			return ep ? this.updateEpisodeBoxStatusInContent(tag, ep.episodeId, ep.epNumber, ep.status) : tag;
		});
		return this.writeEpisodeStatusesToFrontmatter(withUpdatedBoxes, episodes);
	}

	private writeEpisodeStatusesToFrontmatter(
		content: string,
		episodes: Array<{ episodeId: number; epNumber: number; status: EpisodeStatusType }>
	): string {
		const validEntries = episodes
			.filter(ep => ep.status !== 0)
			.sort((a, b) => a.episodeId - b.episodeId);

		if (validEntries.length === 0) {
			return content;
		}

		const frontmatterMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)([\s\S]*)$/);
		if (!frontmatterMatch) {
			return content;
		}

		const prefix = frontmatterMatch[1];
		const frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];
		const bodyContent = frontmatterMatch[4];

		const statusLines = validEntries
			.map(ep => `  - ${ep.episodeId}:${ep.epNumber}:${ep.status}`)
			.join('\n');

		const updatedFrontmatter = `${frontmatter}\nep_statuses:\n${statusLines}`;

		return prefix + updatedFrontmatter + suffix + bodyContent;
	}

	private createLocalEpisodeStatus(episodeId: number, epNumber: number, status: EpisodeStatusType): LocalEpisodeStatus {
		return {
			episodeId,
			epNumber,
			status,
			updatedAt: Date.now(),
		};
	}

	private extractEpisodeStatusMapFromFrontmatter(content: string): Map<number, LocalEpisodeStatus> {
		const statusMap = new Map<number, LocalEpisodeStatus>();
		const entries: unknown = extractFrontmatterRecord(content).ep_statuses;
		if (entries === undefined) return statusMap;
		if (!Array.isArray(entries)) throw new Error('Invalid local episode statuses. Repair ep_statuses before syncing.');
		for (const entry of entries) {
			const match = typeof entry === 'string' ? entry.match(/^(\d+):(\d+(?:\.\d+)?):([0-3])$/) : null;
			if (!match) throw new Error('Invalid local episode status. Repair ep_statuses before syncing.');

			const episodeId = parseInt(match[1], 10);
			const epNumber = parseFloat(match[2]);
			const status = parseInt(match[3], 10) as EpisodeStatusType;
			if (!Number.isSafeInteger(episodeId) || episodeId <= 0 || !Number.isFinite(epNumber) || statusMap.has(episodeId)) {
				throw new Error('Invalid or duplicate local episode ID. Repair ep_statuses before syncing.');
			}

			statusMap.set(episodeId, this.createLocalEpisodeStatus(episodeId, epNumber, status));
		}

		return statusMap;
	}

	private extractEpisodeStatusMapFromEpisodeBoxes(content: string): Map<number, LocalEpisodeStatus> {
		const statusMap = new Map<number, LocalEpisodeStatus>();
		const episodeBoxRegex = /<span\b[^>]*class="[^"]*\bep-box\b[^"]*"[^>]*>.*?<\/span>/g;

		let match: RegExpExecArray | null;
		while ((match = episodeBoxRegex.exec(content)) !== null) {
			const attrs = this.parseEpisodeBox(match[0]);
			if (!attrs) {
				continue;
			}

			statusMap.set(attrs.episodeId, this.createLocalEpisodeStatus(attrs.episodeId, attrs.epNumber, attrs.status));
		}

		return statusMap;
	}

	private updateEpisodeBoxStatusInContent(
		content: string,
		episodeId: number,
		epNumber: number,
		status: EpisodeStatusType
	): string {
		const episodeBoxRegex = /<span\b[^>]*class="[^"]*\bep-box\b[^"]*"[^>]*>.*?<\/span>/g;

		return content.replace(episodeBoxRegex, (fullMatch) => {
			const attrs = this.parseEpisodeBox(fullMatch);
			if (!attrs || attrs.episodeId !== episodeId) {
				return fullMatch;
			}

			const classSet = new Set(attrs.className.split(/\s+/).filter(Boolean));
			if (status === 2) {
				classSet.add('watched');
			} else {
				classSet.delete('watched');
			}

			const nextClassName = Array.from(classSet).join(' ');
			const nextEpNumber = String(epNumber || attrs.epNumber);

			let updatedTag = fullMatch.replace(/class="[^"]*"/, `class="${nextClassName}"`);
			if (/data-status="[^"]*"/.test(updatedTag)) {
				updatedTag = updatedTag.replace(/data-status="[^"]*"/, `data-status="${status}"`);
			} else {
				updatedTag = updatedTag.replace('<span', `<span data-status="${status}"`);
			}

			if (/data-ep="[^"]*"/.test(updatedTag)) {
				updatedTag = updatedTag.replace(/data-ep="[^"]*"/, `data-ep="${nextEpNumber}"`);
			}

			return updatedTag;
		});
	}

	private clearEpisodeStatusArtifacts(content: string): string {
		const withoutFrontmatterStatuses = removeFrontmatterField(content, 'ep_statuses');
		const episodeBoxRegex = /<span\b[^>]*class="[^"]*\bep-box\b[^"]*"[^>]*>.*?<\/span>/g;

		return withoutFrontmatterStatuses.replace(episodeBoxRegex, (fullMatch) => {
			const attrs = this.parseEpisodeBox(fullMatch);
			if (!attrs) {
				return fullMatch;
			}

			const classSet = new Set(attrs.className.split(/\s+/).filter(Boolean));
			classSet.delete('watched');
			let updatedTag = fullMatch.replace(/class="[^"]*"/, `class="${Array.from(classSet).join(' ')}"`);
			if (/data-status="[^"]*"/.test(updatedTag)) {
				updatedTag = updatedTag.replace(/data-status="[^"]*"/, 'data-status="0"');
			} else {
				updatedTag = updatedTag.replace('<span', '<span data-status="0"');
			}
			return updatedTag;
		});
	}

	private parseEpisodeBox(tag: string): { episodeId: number; epNumber: number; status: EpisodeStatusType; className: string } | null {
		const classMatch = tag.match(/\bclass="([^"]*\bep-box\b[^"]*)"/);
		const idMatch = tag.match(/\bdata-id="(\d+)"/);
		const epMatch = tag.match(/\bdata-ep="(\d+(?:\.\d+)?)"/);
		const statusMatch = tag.match(/\bdata-status="(\d+)"/);

		if (!classMatch || !idMatch || !epMatch) {
			return null;
		}

		const className = classMatch[1];
		const episodeId = parseInt(idMatch[1], 10);
		const epNumber = parseFloat(epMatch[1]);
		const status = statusMatch
			? parseInt(statusMatch[1], 10) as EpisodeStatusType
			: (/\bwatched\b/.test(className) ? 2 : 0);

		return {
			episodeId,
			epNumber,
			status,
			className,
		};
	}

	/**
	 * 同步本地状态到云端
	 */
	async syncStatusToCloud(
		file: TFile,
		progressCallback?: (current: number, total: number, message: string) => void,
		expectedSubjectId?: number,
		expectedContent?: string,
		lease?: WriteOperationLease
	): Promise<{ success: number; failed: number }> {
		return withWriteOperation('episode-status', owned => this.syncStatusToCloudWithLease(file, progressCallback, expectedSubjectId, expectedContent, owned), lease);
	}

	private async syncStatusToCloudWithLease(
		file: TFile,
		progressCallback?: (current: number, total: number, message: string) => void,
		expectedSubjectId?: number,
		expectedContent?: string,
		lease?: WriteOperationLease
	): Promise<{ success: number; failed: number }> {
		assertWriteOperationAllowed('episode-status', lease);
		const baseline = expectedContent ?? await this.app.vault.read(file);
		const identity = this.documentService.getSubjectIdentityFromContent(baseline);
		const subjectId = expectedSubjectId ?? identity.subjectId;
		if (subjectId === null) throw new Error('Missing subject ID');
		this.documentService.assertContentSubjectId(baseline, subjectId, file.path);
		const statusMap = this.getEpisodeStatusMapFromContent(baseline);
		const cloud = await this.client.getUserEpisodeStatus(subjectId);
		const currentSnapshot = await this.app.vault.read(file);
		this.documentService.assertContentSubjectId(currentSnapshot, subjectId, file.path);
		if (currentSnapshot !== baseline) throw new Error('Note changed during synchronization. Refresh and retry.');
		const cloudIds = new Set(cloud.map(entry => entry.episode.id));
		if (Array.from(statusMap.values()).some(entry => entry.status !== 0 && !cloudIds.has(entry.episodeId))) throw new Error('Local episode is absent from the complete cloud snapshot.');
		const entries = cloud.map(entry => ({ episodeId: entry.episode.id, epNumber: entry.episode.ep ?? entry.episode.sort, status: statusMap.get(entry.episode.id)?.status ?? 0, cloudStatus: entry.type }))
			.filter(entry => entry.status !== entry.cloudStatus);
		const ownerWindow = this.app.workspace.containerEl.ownerDocument.defaultView;

		let success = 0;
		let failed = 0;

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];

			if (progressCallback) {
				progressCallback(i + 1, entries.length, `正在同步第${entry.epNumber}集...`);
			}

			const current = await this.app.vault.read(file);
			this.documentService.assertContentSubjectId(current, subjectId, file.path);
			if (current !== baseline) throw new Error('Note changed during synchronization. Refresh and retry.');
			try {
				await this.client.updateEpisodeStatus(entry.episodeId, entry.status);
				success++;
			} catch (error) {
				console.error(`[Bangumi Sync] 同步第${entry.epNumber}集失败:`, error);
				failed++;
			}

			// 避免 API 限流
			await delay(100, ownerWindow);
		}

		return { success, failed };
	}

	/**
	 * 从云端拉取状态到本地
	 */
	async syncStatusFromCloud(file: TFile, subjectId: number, expectedContent?: string, lease?: WriteOperationLease): Promise<boolean> {
		try {
			await this.pullStatusFromCloud(file, subjectId, expectedContent, lease);
			return true;
		} catch (error) {
			console.error('[Bangumi Sync] 从云端同步状态失败:', error);
			return false;
		}
	}

	/** Returns exactly the committed content, never a later user edit. */
	async pullStatusFromCloud(file: TFile, subjectId: number, expectedContent?: string, lease?: WriteOperationLease): Promise<string> {
		return withWriteOperation('episode-status', async () => {
			const baseline = expectedContent ?? await this.app.vault.read(file);
			this.documentService.assertContentSubjectId(baseline, subjectId, file.path);
			const userEpisodes = await this.client.getUserEpisodeStatus(subjectId);
			const episodes = userEpisodes.filter(ep => ep.type !== 0).map(ep => ({
				episodeId: ep.episode.id, epNumber: ep.episode.ep ?? ep.episode.sort ?? 0, status: ep.type as EpisodeStatusType,
			}));
			let committed = baseline;
			await this.documentService.processSubjectFile(file, subjectId, content => {
				if (content !== baseline) throw new Error('Note changed during synchronization. Refresh and retry.');
				committed = this.applyEpisodeStatusUpdates(content, episodes);
				return committed;
			});
			return committed;
		}, lease);
	}

	/**
	 * 获取所有需要同步的单集状态
	 */
	async getSyncableEpisodes(file: TFile): Promise<LocalEpisodeStatus[]> {
		const statusMap = await this.getEpisodeStatusMap(file);
		return Array.from(statusMap.values()).filter(s => s.status !== 0);
	}

	/**
	 * 清除所有单集状态
	 */
	async clearAllStatuses(file: TFile): Promise<void> {
		assertWriteOperationAllowed('episode-status');
		await this.processKnownSubjectFile(file, content => this.clearEpisodeStatusArtifacts(content));
	}
}
