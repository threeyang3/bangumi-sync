/**
 * 章节解析器
 * 用于生成集数显示的 Markdown 内容
 */

import { Episode } from '../api/types';

/**
 * 生成单个集数框的 HTML
 * @param episode 章节信息
 * @param status 用户收藏状态（可选）：0=未收藏, 1=想看, 2=看过, 3=抛弃
 */
export function generateEpisodeBox(episode: Episode, status?: number): string {
	// 只处理本篇（type=0）
	if (episode.type !== 0) {
		return '';
	}

	// 构建悬浮提示内容
	const titleParts: string[] = [];

	// 集数和标题
	const epNum = episode.ep || episode.sort;
	const title = episode.name_cn || episode.name || `第${epNum}话`;
	titleParts.push(`第${epNum}话：${title}`);

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
	let cssClass = 'ep-box';
	if (status === 2) {  // 看过
		cssClass += ' watched';
	}

	// 生成 HTML span 元素
	return `<span class="${cssClass}" title="${tooltip}" data-ep="${epNum}" data-id="${episode.id}">${epNum}</span>`;
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
	// 过滤出本篇章节
	const mainEpisodes = episodes.filter(ep => ep.type === 0);

	if (mainEpisodes.length === 0) {
		return '';
	}

	// 按 sort 排序
	mainEpisodes.sort((a, b) => (a.sort || 0) - (b.sort || 0));

	// 生成集数框
	const boxes: string[] = [];
	for (const episode of mainEpisodes) {
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
 * 生成章节显示区域
 * @param episodes 章节列表
 * @param userStatusMap 用户章节状态映射
 * @param header 标题（默认"集数"）
 */
export function generateEpisodeSection(
	episodes: Episode[],
	userStatusMap?: Map<number, number>,
	header: string = '集数'
): string {
	const content = parseEpisodes(episodes, userStatusMap);

	if (!content) {
		return '';
	}

	return `## ${header}\n\n${content}\n`;
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
