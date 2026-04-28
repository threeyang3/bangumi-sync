/**
 * 单集功能类型定义
 */

/**
 * 单集状态类型
 * 0=未收藏, 1=想看, 2=看过, 3=抛弃
 */
export type EpisodeStatusType = 0 | 1 | 2 | 3;

/**
 * 本地存储的单集状态
 */
export interface LocalEpisodeStatus {
	episodeId: number;
	epNumber: number;
	status: EpisodeStatusType;
	updatedAt: number;
}

/**
 * 单集吐槽记录
 */
export interface EpisodeComment {
	episodeId: number;
	epNumber: number;
	content: string;
	createdAt: number;
	updatedAt: number;
}

/**
 * 条目的单集数据缓存
 */
export interface SubjectEpisodeData {
	subjectId: number;
	episodes: Map<number, LocalEpisodeStatus>;
	comments: EpisodeComment[];
}

/**
 * 状态文本映射
 */
export const EPISODE_STATUS_TEXT: Record<EpisodeStatusType, string> = {
	0: '未收藏',
	1: '想看',
	2: '看过',
	3: '抛弃',
};

/**
 * 获取状态文本
 */
export function getEpisodeStatusText(status: EpisodeStatusType): string {
	return EPISODE_STATUS_TEXT[status] || '未知';
}
