/**
 * 章节解析器
 * 用于生成集数显示的 Markdown 内容
 */

import { Episode } from '../api/types';

/**
 * 章节类型辅助标签
 * 0=本篇, 1=SP, 2=OP, 3=ED
 */
const EPISODE_TYPE_LABEL: Record<number, string> = {
	0: '',
	1: 'SP',
	2: 'OP',
	3: 'ED',
};

/**
 * 章节类型对应的 CSS 类（空字符串表示本篇，复用默认 .ep-box 样式）
 */
const EPISODE_TYPE_CLASS: Record<number, string> = {
	0: '',
	1: 'ep-sp',
	2: 'ep-op',
	3: 'ep-ed',
};

/**
 * 生成单个集数框的 HTML
 * @param episode 章节信息
 * @param status 用户收藏状态（可选）：0=未收藏, 1=想看, 2=看过, 3=抛弃
 */
export function generateEpisodeBox(episode: Episode, status?: number): string {
	// 构建悬浮提示内容
	const titleParts: string[] = [];

	// 集数和标题
	const epNum = episode.ep || episode.sort;
	const typeLabel = EPISODE_TYPE_LABEL[episode.type] ?? '';
	const title = episode.name_cn || episode.name || (typeLabel ? `${typeLabel} ${epNum}` : `第${epNum}话`);
	const titleHead = typeLabel
		? `${typeLabel} ${epNum}：${title}`
		: `第${epNum}话：${title}`;
	titleParts.push(titleHead);

	// 放送日期
	if (episode.airdate) {
		titleParts.push(`放送：${episode.airdate}`);
	}

	// 时长
	if (episode.duration) {
		titleParts.push(`时长：${episode.duration}`);
	}

	const tooltip = titleParts.join('&#10;');  // HTML 换行实体

	// 根据状态添加 CSS 类
	const typeClass = EPISODE_TYPE_CLASS[episode.type] ?? '';
	const classNames = ['ep-box', typeClass].filter(Boolean);
	let cssClass = classNames.join(' ');
	if (status === 2) {  // 看过
		cssClass += ' watched';
	}

	// 集数框内显示文本：SP/OP/ED 用类型前缀方便区分，本篇直接显示集数
	const displayText = typeLabel ? `${typeLabel} ${epNum}` : `${epNum}`;

	// 生成 HTML span 元素
	return `<span class="${cssClass}" title="${tooltip}" data-ep="${epNum}" data-id="${episode.id}" data-type="${episode.type}" data-status="${status || 0}">${displayText}</span>`;
}

/**
 * 生成所有集数的显示内容
 * @param episodes 章节列表
 * @param userStatusMap 用户章节状态映射（章节ID -> 状态）
 */
export function parseEpisodes(
	episodes: Episode[],
	userStatusMap?: Map<number, number>
): string {
	if (episodes.length === 0) {
		return '';
	}

	// 按 sort 排序（同时保留本篇和 SP/OP/ED，避免 SP 被吞掉）
	const sortedEpisodes = [...episodes].sort((a, b) => (a.sort || 0) - (b.sort || 0));

	// 生成集数框
	const boxes: string[] = [];
	for (const episode of sortedEpisodes) {
		const status = userStatusMap?.get(episode.id);
		const box = generateEpisodeBox(episode, status);
		if (box) {
			boxes.push(box);
		}
	}

	// 用空格分隔
	return boxes.join(' ');
}

/**
 * 从用户章节收藏列表创建状态映射
 * @param userEpisodes 用户章节收藏列表
 */
export function createUserStatusMap(
	userEpisodes: Array<{ episode: Episode; type: number }>
): Map<number, number> {
	const map = new Map<number, number>();
	for (const item of userEpisodes) {
		map.set(item.episode.id, item.type);
	}
	return map;
}
