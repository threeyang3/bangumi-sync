/**
 * 单集状态管理器
 * 负责本地存储和云端同步
 */

import { App, TFile } from 'obsidian';
import { BangumiClient } from '../api/client';
import { LocalEpisodeStatus, EpisodeStatusType, getEpisodeStatusText } from './types';
import { delay } from '../../common/utils/timing';

/**
 * 单集状态管理器
 */
export class EpisodeStatusManager {
	private app: App;
	private client: BangumiClient;

	constructor(app: App, client: BangumiClient) {
		this.app = app;
		this.client = client;
	}

	/**
	 * 从文件中读取单集状态映射
	 * 存储位置：frontmatter 中的 ep_statuses 字段
	 */
	async getEpisodeStatusMap(file: TFile): Promise<Map<number, LocalEpisodeStatus>> {
		const content = await this.app.vault.read(file);
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
		await this.app.vault.process(file, (content) => {
			return this.applyEpisodeStatusUpdates(content, [{ episodeId, epNumber, status }]);
		});
	}

	/**
	 * 批量更新多个单集状态
	 */
	async updateMultipleStatuses(
		file: TFile,
		episodes: Array<{ episodeId: number; epNumber: number; status: EpisodeStatusType }>
	): Promise<void> {
		await this.app.vault.process(file, (content) => {
			return this.applyEpisodeStatusUpdates(content, episodes);
		});
	}

	/**
	 * 在内容中更新单集状态
	 */
	private updateEpStatusInContent(
		content: string,
		episodeId: number,
		epNumber: number,
		status: EpisodeStatusType
	): string {
		// 匹配 frontmatter
		const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
		if (!frontmatterMatch) return content;

		const prefix = frontmatterMatch[1];
		let frontmatter = frontmatterMatch[2];
		const suffix = frontmatterMatch[3];
		const bodyContent = frontmatterMatch[4];

		// 如果状态为 0（未收藏），则移除该条目
		if (status === 0) {
			const statusLineRegex = new RegExp(`^\\s+- ${episodeId}:\\d+:\\d+\\n?`, 'm');
			frontmatter = frontmatter.replace(statusLineRegex, '');

			// 如果 ep_statuses 为空，移除整个字段
			if (frontmatter.includes('ep_statuses:\n') && !frontmatter.match(/ep_statuses:\n\s+- /)) {
				frontmatter = frontmatter.replace(/ep_statuses:\n/, '');
			}
		} else {
			// 构建新的状态条目
			const statusEntry = `${episodeId}:${epNumber}:${status}`;

			// 检查是否已有 ep_statuses 字段
			const existingStatusesMatch = frontmatter.match(/^ep_statuses:\s*\n((?:\s+- .+\n?)+)/m);

			if (existingStatusesMatch) {
				// 检查是否已有该集数的状态
				const statusLineRegex = new RegExp(`^\\s+- ${episodeId}:\\d+:\\d+$`, 'm');
				if (statusLineRegex.test(frontmatter)) {
					// 更新现有状态
					frontmatter = frontmatter.replace(
						new RegExp(`^\\s+- ${episodeId}:\\d+:\\d+$`, 'm'),
						`  - ${statusEntry}`
					);
				} else {
					// 添加新状态
					frontmatter = frontmatter.replace(
						/^ep_statuses:\s*\n/,
						`ep_statuses:\n  - ${statusEntry}\n`
					);
				}
			} else {
				// 添加新的 ep_statuses 字段
				frontmatter += `\nep_statuses:\n  - ${statusEntry}`;
			}
		}

		const updatedContent = prefix + frontmatter + suffix + bodyContent;
		return this.updateEpisodeBoxStatusInContent(updatedContent, episodeId, epNumber, status);
	}

	private applyEpisodeStatusUpdates(
		content: string,
		episodes: Array<{ episodeId: number; epNumber: number; status: EpisodeStatusType }>
	): string {
		const withoutOldStatuses = this.clearEpisodeStatusArtifacts(content);
		return episodes.reduce(
			(updatedContent, ep) => this.updateEpisodeBoxStatusInContent(updatedContent, ep.episodeId, ep.epNumber, ep.status),
			withoutOldStatuses
		);
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
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) {
			return statusMap;
		}

		const frontmatter = frontmatterMatch[1];
		const epStatusesMatch = frontmatter.match(/^ep_statuses:\s*\n((?:\s+- .+\n?)+)/m);
		if (!epStatusesMatch) {
			return statusMap;
		}

		const lines = epStatusesMatch[1].split('\n');
		for (const line of lines) {
			const match = line.match(/^\s+- (\d+):(\d+):(\d+)/);
			if (!match) {
				continue;
			}

			const episodeId = parseInt(match[1], 10);
			const epNumber = parseInt(match[2], 10);
			const status = parseInt(match[3], 10) as EpisodeStatusType;

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
		const withoutFrontmatterStatuses = content.replace(/^ep_statuses:\s*\n(?:\s+- .+\n?)+/m, '').replace(/\n{3,}/g, '\n\n');
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
		const epMatch = tag.match(/\bdata-ep="(\d+)"/);
		const statusMatch = tag.match(/\bdata-status="(\d+)"/);

		if (!classMatch || !idMatch || !epMatch) {
			return null;
		}

		const className = classMatch[1];
		const episodeId = parseInt(idMatch[1], 10);
		const epNumber = parseInt(epMatch[1], 10);
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
		progressCallback?: (current: number, total: number, message: string) => void
	): Promise<{ success: number; failed: number }> {
		const statusMap = await this.getEpisodeStatusMap(file);
		const entries = Array.from(statusMap.values()).filter(s => s.status !== 0);
		const ownerWindow = this.app.workspace.containerEl.ownerDocument.defaultView;

		let success = 0;
		let failed = 0;

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];

			if (progressCallback) {
				progressCallback(i + 1, entries.length, `正在同步第${entry.epNumber}集...`);
			}

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
	async syncStatusFromCloud(
		file: TFile,
		subjectId: number
	): Promise<boolean> {
		try {
			const userEpisodes = await this.client.getUserEpisodeStatus(subjectId);

			// 更新本地文件
			await this.app.vault.process(file, (content) => {
				const episodes = userEpisodes
					.filter(userEp => userEp.type !== 0)
					.map(userEp => ({
						episodeId: userEp.episode.id,
						epNumber: userEp.episode.ep || userEp.episode.sort || 0,
						status: userEp.type as EpisodeStatusType,
					}));

				return this.applyEpisodeStatusUpdates(content, episodes);
			});

			return true;
		} catch (error) {
			console.error('[Bangumi Sync] 从云端同步状态失败:', error);
			return false;
		}
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
		await this.app.vault.process(file, (content) => {
			const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
			if (!frontmatterMatch) return content;

			let frontmatter = frontmatterMatch[2];
			// 移除 ep_statuses 字段及其内容
			frontmatter = frontmatter.replace(/^ep_statuses:\s*\n(?:\s+- .+\n?)+/m, '');

			return frontmatterMatch[1] + frontmatter + frontmatterMatch[3] + frontmatterMatch[4];
		});
	}
}
